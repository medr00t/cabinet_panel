// First-run setup: what this laptop is (database laptop or connected laptop), its codes, the database itself,
// and existing backups to restore. Everything the clinic would otherwise do by hand (config file, MySQL, SQL).

use std::path::{Path, PathBuf};

use calamine::{open_workbook_auto, Reader};
use mysql::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

use crate::{backup, config, dbserver};

/// One shared "mot de passe du cabinet" is typed on every laptop; the two database passwords are derived from
/// it, so laptops agree without copying any file. Slow on purpose (20 000 rounds) against guessing.
fn derive(passphrase: &str, role: &str) -> String {
    let mut h = Sha256::digest(format!("cabinet-v1|{}|{}", role, passphrase).as_bytes());
    for _ in 0..20_000 { h = Sha256::digest(h); }
    const A: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    h.iter().take(28).map(|b| A[*b as usize % A.len()] as char).collect()
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| format!("Dossier de configuration: {}", e))
}

#[derive(Debug, Serialize)]
pub struct SetupStatus {
    pub config_exists: bool,
    pub server_installed: bool,
    pub server_running: bool,
    /// something else already listens on the database port of this laptop
    pub port_busy: bool,
    pub platform: String,
}

#[tauri::command]
pub async fn setup_status(app: AppHandle) -> Result<SetupStatus, String> {
    let installed = dbserver::is_installed();
    let running = installed && dbserver::read_state().map(|s| dbserver::port_open(s.port)).unwrap_or(false);
    Ok(SetupStatus {
        config_exists: config::exists(&config_dir(&app)?),
        server_installed: installed,
        server_running: running,
        port_busy: !installed && dbserver::port_open(dbserver::port()),
        platform: std::env::consts::OS.to_string(),
    })
}

#[derive(Debug, Deserialize)]
pub struct SetupInput {
    /// "reception" or "doctor": who uses this laptop
    pub role: String,
    pub passphrase: String,
    /// the 4-digit login code of this laptop's user
    pub code: String,
    pub name: Option<String>,
    /// doctor only
    pub answer: Option<String>,
}

fn check_input(i: &SetupInput) -> Result<(), String> {
    if i.role != "reception" && i.role != "doctor" { return Err("Rôle inconnu".to_string()); }
    if i.passphrase.chars().count() < 8 { return Err("Le mot de passe du cabinet doit faire au moins 8 caractères".to_string()); }
    if i.code.len() != 4 || !i.code.chars().all(|c| c.is_ascii_digit()) { return Err("Le code doit contenir 4 chiffres".to_string()); }
    Ok(())
}

/// Writes this laptop's `cabinet_config.json`: only its own user, with the derived database password.
#[tauri::command]
pub async fn setup_save_config(app: AppHandle, input: SetupInput, force: Option<bool>) -> Result<(), String> {
    check_input(&input)?;
    let dir = config_dir(&app)?;
    if config::exists(&dir) && !force.unwrap_or(false) {
        return Err("Ce poste est déjà configuré.".to_string());
    }
    let doctor = input.role == "doctor";
    let user = config::UserEntry {
        id: if doctor { 1 } else { 2 },
        name: input.name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| if doctor { "Dr. El Ansari".to_string() } else { "Réception Principale".to_string() }),
        code: input.code.clone(),
        role: input.role.clone(),
        mysql_user: if doctor { "guestx".to_string() } else { "reception".to_string() },
        mysql_password: derive(&input.passphrase, &input.role),
    };
    config::save(&dir, &config::AppConfig { users: vec![user], doctor_security_answer: String::new(), backup_dir: None })
}

#[derive(Debug, Serialize)]
pub struct ServerInfo { pub version: String, pub port: u16, pub address: Option<String> }

fn local_address() -> Option<String> {
    use std::net::{IpAddr, SocketAddr, UdpSocket};
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect(SocketAddr::from(([192, 168, 1, 1], 9))).ok()?;
    match sock.local_addr().ok()?.ip() { IpAddr::V4(ip) if ip.is_private() => Some(ip.to_string()), _ => None }
}

/// Installs and starts the database on this laptop. Progress is sent as `server-progress` events.
#[tauri::command]
pub async fn server_install(app: AppHandle, passphrase: String) -> Result<ServerInfo, String> {
    if passphrase.chars().count() < 8 { return Err("Le mot de passe du cabinet doit faire au moins 8 caractères".to_string()); }
    if dbserver::is_installed() {
        // already installed here: the cabinet password typed now becomes the one of the database accounts
        let (d, r) = (derive(&passphrase, "doctor"), derive(&passphrase, "reception"));
        tokio::task::spawn_blocking(move || dbserver::set_passwords(&d, &r)).await.map_err(|e| format!("Interrompu: {}", e))??;
        let s = dbserver::read_state()?;
        return Ok(ServerInfo { version: s.version, port: s.port, address: local_address() });
    }
    let req = dbserver::InstallRequest {
        doctor_password: derive(&passphrase, "doctor"),
        reception_password: derive(&passphrase, "reception"),
        archive: None,
    };
    let emitter = app.clone();
    let result = tokio::task::spawn_blocking(move || dbserver::install(&req, &|p| { let _ = emitter.emit("server-progress", p); }))
        .await
        .map_err(|e| format!("Installation interrompue: {}", e))??;
    Ok(ServerInfo { version: result.version, port: result.port, address: local_address() })
}

/// Makes sure the database of this laptop is running (the wizard and the login screen call it).
#[tauri::command]
pub async fn server_start() -> Result<bool, String> {
    tokio::task::spawn_blocking(dbserver::start_if_needed).await.map_err(|e| format!("Démarrage interrompu: {}", e))?
}

// ---------------------------------------------------------------- existing backups

#[derive(Debug, Serialize, Clone)]
pub struct FoundBackup {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub size: u64,
    pub modified: String,
    pub modified_ts: u64,
    /// the workbook holds the data_* sheets, so it can rebuild a database
    pub restorable: bool,
}

fn drive_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(windows)]
    for letter in b'D'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\", letter as char));
        if root.exists() { out.push(root.join("Sauvegardes Cabinet")); out.push(root); }
    }
    #[cfg(not(windows))]
    if let Ok(user) = std::env::var("USER") {
        for base in [format!("/media/{}", user), format!("/run/media/{}", user)] {
            for e in std::fs::read_dir(base).into_iter().flatten().flatten() { out.push(e.path()); }
        }
    }
    out
}

fn find_backups(app: &AppHandle) -> Vec<FoundBackup> {
    let mut dirs: Vec<PathBuf> = vec![backup::backup_dir(app.path().document_dir().ok())];
    let pa = app.path();
    for d in [pa.document_dir(), pa.desktop_dir(), pa.download_dir()].into_iter().flatten() { dirs.push(d); }
    dirs.extend(drive_roots());
    let mut seen = std::collections::HashSet::new();
    let mut found = Vec::new();
    for dir in dirs {
        for entry in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !(name.starts_with("cabinet_") && name.ends_with(".xlsx")) { continue; }
            let path = entry.path();
            let key = std::fs::canonicalize(&path).unwrap_or(path.clone());
            if !seen.insert(key) { continue; }
            let Ok(meta) = entry.metadata() else { continue };
            let modified = meta.modified().ok();
            let ts = modified.and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
            let restorable = open_workbook_auto(&path).map(|b| b.sheet_names().iter().any(|n| n == "data_patients")).unwrap_or(false);
            found.push(FoundBackup {
                path: path.display().to_string(), name, folder: dir.display().to_string(), size: meta.len(), restorable, modified_ts: ts,
                modified: modified.map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%d/%m/%Y %H:%M").to_string()).unwrap_or_default(),
            });
        }
    }
    found.sort_by(|a, b| b.modified_ts.cmp(&a.modified_ts));
    found.truncate(30);
    found
}

/// Looks for backup workbooks in the usual places (Documents, Desktop, Downloads, USB drives).
#[tauri::command]
pub async fn setup_find_backups(app: AppHandle) -> Result<Vec<FoundBackup>, String> {
    tokio::task::spawn_blocking(move || find_backups(&app)).await.map_err(|e| format!("Recherche interrompue: {}", e))
}

/// Restores a backup found by `setup_find_backups` into the database of this laptop.
#[tauri::command]
pub async fn setup_restore(app: AppHandle, path: String) -> Result<backup::RestoreResult, String> {
    tokio::task::spawn_blocking(move || {
        let wanted = std::fs::canonicalize(&path).map_err(|_| "Fichier de sauvegarde introuvable".to_string())?;
        let known = find_backups(&app).into_iter().any(|f| f.restorable && std::fs::canonicalize(&f.path).map_or(false, |p| p == wanted));
        if !known { return Err("Ce fichier n'est pas une sauvegarde du cabinet reconnue.".to_string()); }
        let mut conn = Conn::new(dbserver::root_url()?.as_str()).map_err(|e| format!("Connexion à la base de données: {}", e))?;
        backup::restore_from_workbook(&mut conn, Path::new(&wanted))
    }).await.map_err(|e| format!("Restauration interrompue: {}", e))?
}

// ---------------------------------------------------------------- connected laptops

#[derive(Debug, Serialize)]
pub struct ClientCheck { pub ok: bool, pub host: Option<String>, pub message: String }

/// "Does this laptop reach the cabinet's database with this shared password?" Used by the wizard of a connected laptop.
#[tauri::command]
pub async fn client_check(passphrase: String, role: String) -> Result<ClientCheck, String> {
    if role != "reception" && role != "doctor" { return Err("Rôle inconnu".to_string()); }
    let Some(host) = crate::discover_server(None).await? else {
        return Ok(ClientCheck { ok: false, host: None, message: "Aucun serveur trouvé sur le réseau. Vérifiez que le poste de la base de données est allumé et sur le même réseau.".to_string() });
    };
    let (user, password) = (if role == "doctor" { "guestx" } else { "reception" }, derive(&passphrase, &role));
    let h = host.clone();
    let tried = tokio::task::spawn_blocking(move || {
        Conn::new(OptsBuilder::new().ip_or_hostname(Some(h)).tcp_port(dbserver::DEFAULT_PORT).user(Some(user)).pass(Some(password)).db_name(Some("cabinet")))
            .map(|_| ()).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?;
    Ok(match tried {
        Ok(()) => ClientCheck { ok: true, message: format!("Serveur trouvé ({})", if host == "localhost" { "ce poste".to_string() } else { host.clone() }), host: Some(host) },
        Err(e) if e.contains("1045") || e.to_lowercase().contains("access denied") =>
            ClientCheck { ok: false, host: Some(host), message: "Le serveur est là, mais le mot de passe du cabinet est incorrect.".to_string() },
        Err(e) => ClientCheck { ok: false, host: Some(host), message: format!("Connexion impossible : {}", e) },
    })
}
