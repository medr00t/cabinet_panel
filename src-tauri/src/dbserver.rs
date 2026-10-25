// A database the app installs and runs by itself, so the clinic needs no Docker and no manual MySQL setup.
//
// On the laptop that holds the data, the first-run wizard calls `install`: it downloads the official MySQL
// Community Server archive once, unpacks it under the user's profile, initialises a data folder, starts the
// server, creates the `cabinet` database with its tables and the two accounts, and arranges for the server to be
// started again whenever Windows starts. Everything lives in one folder (`home()`), nothing is installed system-wide.

use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use mysql::prelude::*;
use mysql::*;
use serde::{Deserialize, Serialize};

pub const DEFAULT_PORT: u16 = 3306;
const DOCTOR_USER: &str = "guestx";
const RECEPTION_USER: &str = "reception";

/// The port the managed server listens on (3306; tests and side-by-side setups can override it).
pub fn port() -> u16 {
    std::env::var("CABINET_DB_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(DEFAULT_PORT)
}

/// Folder holding the database program, its data, its log and its state.
pub fn home() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("CABINET_DB_HOME") {
        if !p.trim().is_empty() { return Ok(PathBuf::from(p)); }
    }
    #[cfg(target_os = "windows")]
    let base = std::env::var("LOCALAPPDATA").map(PathBuf::from).map_err(|_| "Dossier utilisateur introuvable".to_string())?;
    #[cfg(not(target_os = "windows"))]
    let base = std::env::var("HOME").map(|h| PathBuf::from(h).join(".local").join("share")).map_err(|_| "Dossier utilisateur introuvable".to_string())?;
    Ok(base.join("CentreDentaire").join("database"))
}

struct Layout { root: PathBuf, mysql: PathBuf, data: PathBuf, ini: PathBuf, log: PathBuf, state: PathBuf, download: PathBuf, tmp: PathBuf }

fn layout() -> Result<Layout, String> {
    let root = home()?;
    Ok(Layout {
        mysql: root.join("mysql"), data: root.join("data"), ini: root.join("my.ini"), log: root.join("mysqld.log"),
        state: root.join("state.json"), download: root.join("download"), tmp: root.join("extract"), root,
    })
}

fn mysqld_in(dir: &Path) -> PathBuf {
    dir.join("bin").join(if cfg!(windows) { "mysqld.exe" } else { "mysqld" })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerState {
    pub version: String,
    pub port: u16,
    pub root_password: String,
    pub installed_at: String,
}

pub fn read_state() -> Result<ServerState, String> {
    let l = layout()?;
    let text = std::fs::read_to_string(&l.state).map_err(|_| "La base de données n'est pas installée sur ce poste".to_string())?;
    serde_json::from_str(&text).map_err(|e| format!("État de la base illisible: {}", e))
}

pub fn is_installed() -> bool {
    layout().map(|l| l.state.is_file() && mysqld_in(&l.mysql).is_file()).unwrap_or(false)
}

pub fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(400)).is_ok()
}

#[derive(Debug, Serialize, Clone)]
pub struct Progress { pub step: String, pub percent: Option<u8>, pub message: String }

fn say(emit: &dyn Fn(Progress), step: &str, percent: Option<u8>, message: &str) {
    emit(Progress { step: step.to_string(), percent, message: message.to_string() });
}

fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.stdin(Stdio::null())
}

// ---------------------------------------------------------------- download

/// (url, size in bytes, version) of the newest MySQL 8.4 archive for this platform on the official MySQL CDN.
/// Old releases are removed from the CDN, so the newest candidates are tried in turn.
fn find_archive() -> Result<(String, u64, String), String> {
    for patch in (9..=30).rev() {
        let version = format!("8.4.{}", patch);
        let file = if cfg!(windows) { format!("mysql-{}-winx64.zip", version) } else { format!("mysql-{}-linux-glibc2.28-x86_64-minimal.tar.xz", version) };
        let url = format!("https://cdn.mysql.com//Downloads/MySQL-8.4/{}", file);
        let out = quiet(Command::new("curl").args(["-sIL", "--max-time", "25", "-A", "Mozilla/5.0", &url])).output()
            .map_err(|e| format!("curl est introuvable ({}). Windows 10/11 le fournit normalement.", e))?;
        let head = String::from_utf8_lossy(&out.stdout).to_string();
        let status = head.lines().filter(|l| l.starts_with("HTTP/")).last().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("");
        let len = head.lines().filter_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().to_string())).last().and_then(|v| v.parse::<u64>().ok());
        if status == "200" {
            if let Some(len) = len { return Ok((url, len, version)); }
        }
    }
    Err("Impossible de trouver MySQL sur le site officiel. Vérifiez la connexion internet de ce poste.".to_string())
}

fn download(url: &str, total: u64, dest: &Path, emit: &dyn Fn(Progress)) -> Result<(), String> {
    if let Some(dir) = dest.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    let mut child = quiet(Command::new("curl").args(["-L", "--fail", "--silent", "--show-error", "-C", "-", "--retry", "3", "-o"]).arg(dest).arg(url))
        .stderr(Stdio::piped()).spawn().map_err(|e| format!("Téléchargement impossible: {}", e))?;
    loop {
        std::thread::sleep(Duration::from_millis(400));
        let size = std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
        say(emit, "download", Some((size * 100 / total.max(1)).min(100) as u8), &format!("Téléchargement de MySQL : {} Mo sur {} Mo", size / 1_048_576, total / 1_048_576));
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                if !status.success() {
                    let mut err = String::new();
                    if let Some(mut e) = child.stderr.take() { use std::io::Read; let _ = e.read_to_string(&mut err); }
                    return Err(format!("Téléchargement interrompu ({}). Vérifiez la connexion internet puis réessayez.", err.trim()));
                }
                break;
            }
            None => {}
        }
    }
    let size = std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
    if size != total { return Err(format!("Téléchargement incomplet ({} sur {} octets). Réessayez.", size, total)); }
    Ok(())
}

// ---------------------------------------------------------------- unpack

fn extract(archive: &Path, l: &Layout) -> Result<(), String> {
    let _ = std::fs::remove_dir_all(&l.tmp);
    std::fs::create_dir_all(&l.tmp).map_err(|e| e.to_string())?;
    let mut cmd;
    if cfg!(windows) {
        // the system tar (bsdtar) reads zip files; debug symbols and developer files are skipped (about 1 GB less)
        let sys = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        cmd = Command::new(format!("{}\\System32\\tar.exe", sys));
        cmd.arg("-xf").arg(archive).arg("-C").arg(&l.tmp)
            .args(["--exclude=*.pdb", "--exclude=*.lib", "--exclude=*/debug/*", "--exclude=*/docs/*", "--exclude=*/include/*", "--exclude=*/lib/mecab/*"]);
    } else {
        cmd = Command::new("tar");
        cmd.arg("-xJf").arg(archive).arg("-C").arg(&l.tmp);
    }
    let out = quiet(&mut cmd).output().map_err(|e| format!("Décompression impossible: {}", e))?;
    if !out.status.success() {
        return Err(format!("Décompression échouée: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let top = std::fs::read_dir(&l.tmp).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).find(|p| mysqld_in(p).is_file())
        .ok_or_else(|| "L'archive MySQL ne contient pas le serveur attendu".to_string())?;
    let _ = std::fs::remove_dir_all(&l.mysql);
    std::fs::rename(&top, &l.mysql).map_err(|e| format!("Installation des fichiers: {}", e))?;
    let _ = std::fs::remove_dir_all(&l.tmp);
    Ok(())
}

fn forward(p: &Path) -> String { p.to_string_lossy().replace('\\', "/") }

fn write_ini(l: &Layout, port: u16) -> Result<(), String> {
    let mut ini = format!(
        "[mysqld]\nbasedir={}\ndatadir={}\nport={}\nbind-address=0.0.0.0\nmysqlx=OFF\nskip-log-bin\n\
         character-set-server=utf8mb4\ninnodb_buffer_pool_size=128M\nmax_connections=60\nlog-error={}\npid-file={}\n",
        forward(&l.mysql), forward(&l.data), port, forward(&l.log), forward(&l.root.join("mysqld.pid")));
    if !cfg!(windows) { ini.push_str(&format!("socket={}\n", forward(&l.root.join("mysql.sock")))); }
    std::fs::write(&l.ini, ini).map_err(|e| format!("Configuration de la base: {}", e))
}

fn log_tail(l: &Layout) -> String {
    let text = std::fs::read_to_string(&l.log).unwrap_or_default();
    let tail: String = text.chars().rev().take(1500).collect::<Vec<_>>().into_iter().rev().collect();
    if tail.trim().is_empty() { String::new() } else { format!("\n--- journal du serveur ---\n{}", tail.trim()) }
}

// ---------------------------------------------------------------- run

/// Starts the server without waiting for it; it keeps running after the app closes.
fn spawn_server(l: &Layout) -> Result<(), String> {
    let mut cmd = Command::new(mysqld_in(&l.mysql));
    cmd.arg(format!("--defaults-file={}", l.ini.display())).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    { use std::os::windows::process::CommandExt; cmd.creation_flags(0x0800_0000 | 0x0000_0200); } // hidden console, own process group (survives the app)
    #[cfg(unix)]
    { use std::os::unix::process::CommandExt; cmd.process_group(0); }
    cmd.spawn().map(|_| ()).map_err(|e| format!("Démarrage de la base impossible: {}", e))
}

fn opts(port: u16, password: Option<&str>, db: Option<&str>) -> Opts {
    OptsBuilder::new().ip_or_hostname(Some("127.0.0.1")).tcp_port(port).user(Some("root")).pass(password).db_name(db).into()
}

fn wait_ready(l: &Layout, port: u16, password: Option<&str>, timeout: Duration) -> Result<(), String> {
    let start = Instant::now();
    let mut last = String::new();
    loop {
        match Conn::new(opts(port, password, None)) {
            Ok(mut c) => match c.query_drop("SELECT 1") { Ok(()) => return Ok(()), Err(e) => last = e.to_string() },
            Err(e) => last = e.to_string(),
        }
        if start.elapsed() > timeout {
            return Err(format!("La base de données ne démarre pas ({}).{}", last, log_tail(l)));
        }
        std::thread::sleep(Duration::from_millis(700));
    }
}

/// Starts the managed server if it is installed and not already running. Returns true when it was started now.
pub fn start_if_needed() -> Result<bool, String> {
    // the app start and the login screen both call this: only one may launch the server
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if !is_installed() { return Ok(false); }
    let state = read_state()?;
    if port_open(state.port) { return Ok(false); }
    let l = layout()?;
    spawn_server(&l)?;
    wait_ready(&l, state.port, Some(&state.root_password), Duration::from_secs(120))?;
    Ok(true)
}

/// URL of the managed server as root, for maintenance (restoring a backup).
pub fn root_url() -> Result<String, String> {
    let s = read_state()?;
    Ok(format!("mysql://root:{}@127.0.0.1:{}/cabinet", s.root_password, s.port))
}

/// Stops the managed server (used by tests).
pub fn stop() -> Result<(), String> {
    let s = read_state()?;
    let mut c = Conn::new(opts(s.port, Some(&s.root_password), None)).map_err(|e| e.to_string())?;
    let _ = c.query_drop("SHUTDOWN");
    Ok(())
}

fn random_password() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|e| format!("Génération du mot de passe: {}", e))?;
    const A: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    Ok(bytes.iter().map(|b| A[*b as usize % A.len()] as char).collect())
}

pub struct InstallRequest { pub doctor_password: String, pub reception_password: String, /// a local archive to use instead of downloading (tests)
    pub archive: Option<PathBuf> }

#[derive(Debug, Serialize, Clone)]
pub struct InstallResult { pub version: String, pub port: u16, pub home: String }

fn alnum(p: &str) -> Result<(), String> {
    if p.len() >= 8 && p.chars().all(|c| c.is_ascii_alphanumeric()) { Ok(()) } else { Err("Mot de passe de base de données invalide".to_string()) }
}

/// Everything, in order: download, unpack, initialise, start, create the database and accounts, start with Windows.
pub fn install(req: &InstallRequest, emit: &dyn Fn(Progress)) -> Result<InstallResult, String> {
    alnum(&req.doctor_password)?;
    alnum(&req.reception_password)?;
    if is_installed() { return Err("La base de données est déjà installée sur ce poste.".to_string()); }
    let l = layout()?;
    let port = port();
    if port_open(port) {
        return Err(format!("Un autre serveur de base de données utilise déjà le port {} sur ce poste. Fermez-le (ou utilisez-le comme serveur) puis réessayez.", port));
    }
    std::fs::create_dir_all(&l.root).map_err(|e| format!("Dossier de la base ({}): {}", l.root.display(), e))?;

    // 1. the program
    let (archive, version) = match &req.archive {
        Some(path) => (path.clone(), "local".to_string()),
        None => {
            say(emit, "download", Some(0), "Recherche de MySQL sur le site officiel…");
            let (url, size, version) = find_archive()?;
            let name = url.rsplit('/').next().unwrap_or("mysql-archive").to_string();
            let dest = l.download.join(name);
            download(&url, size, &dest, emit)?;
            (dest, version)
        }
    };
    say(emit, "extract", None, "Installation des fichiers de la base de données (une minute)…");
    extract(&archive, &l)?;
    if req.archive.is_none() { let _ = std::fs::remove_dir_all(&l.download); }

    // 2. the data folder (a half-finished earlier attempt is wiped: it is our own folder)
    say(emit, "initialize", None, "Préparation de la base de données…");
    let _ = std::fs::remove_dir_all(&l.data);
    write_ini(&l, port)?;
    let init = quiet(Command::new(mysqld_in(&l.mysql)).arg(format!("--defaults-file={}", l.ini.display())).arg("--initialize-insecure")).output()
        .map_err(|e| format!("Préparation de la base impossible: {}", e))?;
    if !init.status.success() {
        return Err(format!("Préparation de la base échouée: {}{}", String::from_utf8_lossy(&init.stderr).trim(), log_tail(&l)));
    }

    // 3. start it
    say(emit, "start", None, "Démarrage de la base de données…");
    spawn_server(&l)?;
    wait_ready(&l, port, None, Duration::from_secs(180))?;

    // 4. database, tables, accounts (root has no password yet: it is set last and kept for maintenance)
    say(emit, "configure", None, "Création des tables et des comptes…");
    let mut root = Conn::new(opts(port, None, None)).map_err(|e| format!("Connexion à la base: {}", e))?;
    let sql = |e: mysql::Error| format!("Configuration de la base: {}", e);
    root.query_drop("CREATE DATABASE IF NOT EXISTS cabinet CHARACTER SET utf8mb4").map_err(sql)?;
    let mut db = Conn::new(opts(port, None, Some("cabinet"))).map_err(|e| format!("Connexion à la base: {}", e))?;
    crate::backup::ensure_schema(&mut db)?;
    for (user, pw) in [(DOCTOR_USER, &req.doctor_password), (RECEPTION_USER, &req.reception_password)] {
        root.query_drop(format!("CREATE USER IF NOT EXISTS '{u}'@'%' IDENTIFIED BY '{p}'", u = user, p = pw)).map_err(sql)?;
        root.query_drop(format!("ALTER USER '{u}'@'%' IDENTIFIED BY '{p}'", u = user, p = pw)).map_err(sql)?;
    }
    root.query_drop(format!("GRANT ALL PRIVILEGES ON cabinet.* TO '{}'@'%'", DOCTOR_USER)).map_err(sql)?;
    root.query_drop(format!("GRANT SELECT, INSERT, UPDATE ON cabinet.* TO '{}'@'%'", RECEPTION_USER)).map_err(sql)?;
    root.query_drop(format!("GRANT DELETE ON cabinet.appointments TO '{}'@'%'", RECEPTION_USER)).map_err(sql)?;
    let root_pw = random_password()?;
    root.query_drop(format!("ALTER USER 'root'@'localhost' IDENTIFIED BY '{}'", root_pw)).map_err(sql)?;
    root.query_drop("FLUSH PRIVILEGES").map_err(sql)?;
    let state = ServerState { version: version.clone(), port, root_password: root_pw, installed_at: chrono::Local::now().format("%Y-%m-%d %H:%M").to_string() };
    std::fs::write(&l.state, serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?).map_err(|e| format!("État de la base: {}", e))?;

    // 5. come back by itself when Windows starts (best effort: the app also starts it when it opens)
    say(emit, "finish", None, "Dernières vérifications…");
    register_autostart();
    open_firewall(port);
    say(emit, "finish", Some(100), "La base de données est prête.");
    Ok(InstallResult { version, port, home: l.root.display().to_string() })
}

#[cfg(windows)]
fn register_autostart() {
    if let Ok(exe) = std::env::current_exe() {
        let value = format!("\"{}\" --db-only", exe.display());
        let _ = quiet(Command::new("reg").args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "CentreDentaireBase", "/t", "REG_SZ", "/d", &value, "/f"])).output();
    }
}
#[cfg(not(windows))]
fn register_autostart() {}

/// Lets the other laptops reach the database. Needs administrator rights, so Windows shows its own
/// confirmation; if it is declined, Windows still asks the first time another laptop connects.
#[cfg(windows)]
fn open_firewall(port: u16) {
    let args = format!(
        "advfirewall firewall add rule name=\"Centre Dentaire - base de donnees\" dir=in action=allow protocol=TCP localport={} profile=private,domain", port);
    let _ = quiet(Command::new("powershell").args(["-NoProfile", "-WindowStyle", "Hidden", "-Command",
        &format!("Start-Process netsh -ArgumentList '{}' -Verb RunAs -WindowStyle Hidden", args)])).output();
}
#[cfg(not(windows))]
fn open_firewall(_port: u16) {}

// Needs a MySQL archive on disk (the Linux "minimal" tarball): CABINET_TEST_ARCHIVE=/path/mysql-minimal.tar.xz
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn managed_server_install_start_stop() {
        let Ok(archive) = std::env::var("CABINET_TEST_ARCHIVE") else { return }; // needs a local MySQL archive
        let archive = PathBuf::from(archive);
        let home = std::env::temp_dir().join(format!("cabinet_db_test_{}", std::process::id()));
        std::env::set_var("CABINET_DB_HOME", &home);
        std::env::set_var("CABINET_DB_PORT", "3399");
        let _ = std::fs::remove_dir_all(&home);

        assert!(!is_installed());
        let req = InstallRequest { doctor_password: "DoctorPass123".into(), reception_password: "ReceptionPass123".into(), archive: Some(archive) };
        let r = install(&req, &|p| println!("[{}] {:?} {}", p.step, p.percent, p.message)).expect("install");
        assert_eq!(r.port, 3399);
        assert!(is_installed() && port_open(3399));
        assert_eq!(install(&req, &|_| {}).unwrap_err().contains("déjà"), true);

        // accounts and privileges
        let url = |u: &str, p: &str| format!("mysql://{}:{}@127.0.0.1:3399/cabinet", u, p);
        let mut doctor = Conn::new(Opts::from_url(&url("guestx", "DoctorPass123")).unwrap()).expect("doctor login");
        let mut rec = Conn::new(Opts::from_url(&url("reception", "ReceptionPass123")).unwrap()).expect("reception login");
        let tables: Vec<String> = doctor.query("SHOW TABLES").unwrap();
        assert!(tables.iter().any(|t| t == "patients") && tables.iter().any(|t| t == "treatments"), "{:?}", tables);
        rec.query_drop("SELECT COUNT(*) FROM patients").expect("reception reads");
        assert!(rec.query_drop("DELETE FROM patients").is_err(), "reception must not delete patients");
        assert!(rec.query_drop("DROP TABLE patients").is_err());
        assert!(Conn::new(Opts::from_url(&url("reception", "wrong")).unwrap()).is_err());

        // restart: stop, then start_if_needed brings it back with data kept
        doctor.query_drop("INSERT INTO settings (`key`, value) VALUES ('probe', '1') ON DUPLICATE KEY UPDATE value = '1'").ok();
        drop(doctor); drop(rec);
        stop().expect("stop");
        let t = Instant::now();
        while port_open(3399) && t.elapsed() < Duration::from_secs(60) { std::thread::sleep(Duration::from_millis(300)); }
        assert!(!port_open(3399));
        assert_eq!(start_if_needed().expect("restart"), true);
        assert!(port_open(3399));
        assert_eq!(start_if_needed().unwrap(), false, "already running");
        let mut root = Conn::new(Opts::from_url(&root_url().unwrap()).unwrap()).expect("root login");
        let n: Option<i64> = root.query_first("SELECT COUNT(*) FROM patients").unwrap();
        assert_eq!(n, Some(0));
        drop(root);
        stop().ok();
        let t = Instant::now();
        while port_open(3399) && t.elapsed() < Duration::from_secs(60) { std::thread::sleep(Duration::from_millis(300)); }
        let _ = std::fs::remove_dir_all(&home);
    }
}
