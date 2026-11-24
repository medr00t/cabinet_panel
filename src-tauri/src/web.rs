// Web server: the same commands the desktop app has, exposed over HTTP for browsers.
// Login creates a server-side session (cookie); the database URL never leaves the server.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use std::net::{IpAddr, SocketAddr, UdpSocket};

use axum::extract::{ConnectInfo, DefaultBodyLimit, Path, Query, Request, State};
use axum::middleware::{self, Next};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;

use crate::{access, backup, cnss, config, dbserver, files, ledger};

const COOKIE: &str = "cabinet_session";
const SESSION_TTL: Duration = Duration::from_secs(12 * 3600);

struct Session { db_url: String, user_id: i64, name: String, role: String, last: Instant }

#[derive(Clone)]
struct AppState { sessions: Arc<Mutex<HashMap<String, Session>>>, db_host: String, documents: Option<PathBuf> }

fn err(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({ "error": msg }))).into_response()
}

fn token() -> Result<String, String> {
    let mut b = [0u8; 32];
    getrandom::fill(&mut b).map_err(|e| e.to_string())?;
    Ok(b.iter().map(|x| format!("{:02x}", x)).collect())
}

fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').filter_map(|p| p.trim().strip_prefix(&format!("{}=", COOKIE)).map(|v| v.to_string())).next()
}

/// (db_url, user id, name, role) of the logged-in session; refreshes its idle timer.
fn session_of(state: &AppState, headers: &HeaderMap) -> Option<(String, i64, String, String)> {
    let tok = cookie_token(headers)?;
    let mut map = state.sessions.lock().unwrap_or_else(|e| e.into_inner());
    map.retain(|_, s| s.last.elapsed() < SESSION_TTL);
    let s = map.get_mut(&tok)?;
    s.last = Instant::now();
    Some((s.db_url.clone(), s.user_id, s.name.clone(), s.role.clone()))
}

/// Is this address the server laptop itself? (loopback, one of its own addresses, or listed in CABINET_DOCTOR_IPS.)
/// The doctor account only works from such an address; reception laptops come from other addresses.
fn is_server_machine(ip: IpAddr) -> bool {
    if std::env::var("CABINET_DOCTOR_LOCAL_ONLY").map(|v| v == "0").unwrap_or(false) { return true; } // restriction switched off (Docker)
    let ip = ip.to_canonical();
    if ip.is_loopback() { return true; }
    if std::env::var("CABINET_DOCTOR_IPS").unwrap_or_default().split(',').any(|a| a.trim().parse::<IpAddr>().map(|x| x == ip).unwrap_or(false)) { return true; }
    // binding a socket to an address only works for the machine's own addresses
    UdpSocket::bind(SocketAddr::new(ip, 0)).is_ok()
}

/// A doctor session is refused from any other laptop, even with a stolen cookie.
async fn doctor_on_server_only(State(state): State<AppState>, ConnectInfo(peer): ConnectInfo<SocketAddr>, req: Request, next: Next) -> Response {
    if !is_server_machine(peer.ip()) {
        if let Some(tok) = cookie_token(req.headers()) {
            let doctor = state.sessions.lock().unwrap_or_else(|e| e.into_inner()).get(&tok).map(|s| s.role == "doctor").unwrap_or(false);
            if doctor { return err(StatusCode::UNAUTHORIZED, "Le compte docteur n'est utilisable que sur le poste du serveur."); }
        }
    }
    next.run(req).await
}

fn user_json(id: i64, name: &str, role: &str) -> Value { json!({ "id": id, "name": name, "role": role }) }

/// A code that belongs to a reception account created by the doctor (table `staff`).
async fn staff_login(state: &AppState, code: &str) -> Option<(i64, String, String)> {
    let cfg = config::get().ok()?;
    let entry = cfg.users.iter().find(|u| u.role == "reception")?.clone();
    let url = crate::get_dynamic_url(&entry.mysql_user, &entry.mysql_password, &state.db_host);
    let (u, c) = (url.clone(), code.to_string());
    let found = tokio::task::spawn_blocking(move || access::find_staff_by_code(&u, &c)).await.ok()?.ok()??;
    let _ = tokio::task::spawn_blocking(move || access::refresh_staff_names(&url)).await;
    Some((found.0, found.1, crate::get_dynamic_url(&entry.mysql_user, &entry.mysql_password, &state.db_host)))
}

async fn login(State(state): State<AppState>, ConnectInfo(peer): ConnectInfo<SocketAddr>, Json(body): Json<Value>) -> Response {
    let code = body.get("code").and_then(|c| c.as_str()).unwrap_or("").to_string();
    if let Some((id, name, db_url)) = staff_login(&state, &code).await {
        let tok = match token() { Ok(t) => t, Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e) };
        state.sessions.lock().unwrap_or_else(|e| e.into_inner())
            .insert(tok.clone(), Session { db_url, user_id: id, name: name.clone(), role: "reception".into(), last: Instant::now() });
        let cookie = format!("{}={}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200", COOKIE, tok);
        return ([(header::SET_COOKIE, cookie)], Json(json!({ "user": user_json(id, &name, "reception") }))).into_response();
    }
    match crate::authenticate_user(code, Some(state.db_host.clone())).await {
        // the doctor code is only accepted on the server laptop; elsewhere it looks exactly like a wrong code
        Ok(res) if res.user.role == "doctor" && !is_server_machine(peer.ip()) => {
            tokio::time::sleep(Duration::from_millis(700)).await;
            println!("Connexion docteur refusée depuis {} (réservée au poste du serveur)", peer.ip());
            err(StatusCode::UNAUTHORIZED, "Code invalide ou utilisateur inactif")
        }
        Ok(res) => {
            let tok = match token() { Ok(t) => t, Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e) };
            let (id, name, role) = (res.user.id.unwrap_or(0), res.user.name.clone(), res.user.role.clone());
            state.sessions.lock().unwrap_or_else(|e| e.into_inner())
                .insert(tok.clone(), Session { db_url: res.db_url, user_id: id, name: name.clone(), role: role.clone(), last: Instant::now() });
            let cookie = format!("{}={}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200", COOKIE, tok);
            ([(header::SET_COOKIE, cookie)], Json(json!({ "user": user_json(id, &name, &role) }))).into_response()
        }
        Err(e) => {
            tokio::time::sleep(Duration::from_millis(700)).await; // slows down code guessing
            err(StatusCode::UNAUTHORIZED, &e)
        }
    }
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(t) = cookie_token(&headers) { state.sessions.lock().unwrap_or_else(|e| e.into_inner()).remove(&t); }
    let cookie = format!("{}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0", COOKIE);
    ([(header::SET_COOKIE, cookie)], Json(json!({ "ok": true }))).into_response()
}

async fn me(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match session_of(&state, &headers) {
        Some((_, id, name, role)) => Json(json!({ "user": user_json(id, &name, &role) })).into_response(),
        None => err(StatusCode::UNAUTHORIZED, "Session expirée. Veuillez vous reconnecter."),
    }
}

fn arg<T: DeserializeOwned>(a: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(a.get(key).cloned().unwrap_or(Value::Null)).map_err(|e| format!("Paramètre « {} » invalide: {}", key, e))
}

fn out<T: serde::Serialize>(r: Result<T, String>) -> Result<Value, String> {
    r.and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
}

async fn call(State(state): State<AppState>, headers: HeaderMap, Path(cmd): Path<String>, Json(a): Json<Value>) -> Response {
    let Some((db, uid, _name, _role)) = session_of(&state, &headers) else {
        return err(StatusCode::UNAUTHORIZED, "Session expirée. Veuillez vous reconnecter.");
    };
    match dispatch(&state, &cmd, &a, db, uid).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, &e),
    }
}

async fn dispatch(state: &AppState, cmd: &str, a: &Value, db: String, uid: i64) -> Result<Value, String> {
    match cmd {
        "get_patients" => out(crate::get_patients(db).await),
        "add_patient" => out(crate::add_patient(arg(a, "patient")?, db).await),
        "update_patient" => out(crate::update_patient(arg(a, "id")?, arg(a, "patient")?, db).await),
        "delete_patient" => out(crate::delete_patient(arg(a, "id")?, db).await),
        "get_next_billet_number" => out(ledger::get_next_billet_number(db).await),

        "get_appointments" => out(crate::get_appointments(db).await),
        "get_patient_appointments" => out(crate::get_patient_appointments(arg(a, "patientId")?, db).await),
        "add_appointment" => out(crate::add_appointment(arg(a, "appointment")?, db).await),
        "update_appointment" => out(crate::update_appointment(arg(a, "id")?, arg(a, "appointment")?, db).await),
        "update_appointment_status" => out(crate::update_appointment_status(arg(a, "id")?, arg(a, "status")?, db).await),
        "delete_appointment" => out(crate::delete_appointment(arg(a, "id")?, db).await),

        "get_payments_by_date" => out(crate::get_payments_by_date(arg(a, "date")?, db).await),
        "get_daily_summary_by_staff" => out(crate::get_daily_summary_by_staff(arg(a, "date")?, arg(a, "staffId")?, db).await),
        "get_daily_summary_all_staff" => out(crate::get_daily_summary_all_staff(arg(a, "date")?, db).await),

        "add_treatment" => out(ledger::add_treatment(arg(a, "treatment")?, arg(a, "paidNow")?, arg(a, "paymentMethod")?, db).await),
        "update_treatment" => out(ledger::update_treatment(arg(a, "treatment")?, db).await),
        "delete_treatment" => out(ledger::delete_treatment(arg(a, "id")?, db).await),
        "get_patient_treatments" => out(ledger::get_patient_treatments(arg(a, "patientId")?, db).await),
        // the collector is always the logged-in user, whatever the browser says
        "add_treatment_payment" => out(ledger::add_treatment_payment(
            arg(a, "treatmentId")?, arg(a, "amount")?, arg(a, "paymentMethod")?, arg(a, "paymentDate")?, uid, db).await),
        "get_treatment_payments" => out(ledger::get_treatment_payments(arg(a, "treatmentId")?, db).await),
        "delete_payment" => out(ledger::delete_payment(arg(a, "id")?, db).await),
        "get_patient_balances" => out(ledger::get_patient_balances(db).await),
        "get_tooth_marks" => out(ledger::get_tooth_marks(arg(a, "patientId")?, db).await),
        "set_tooth_mark" => out(ledger::set_tooth_mark(arg(a, "mark")?, db).await),

        "get_cnss_sheets" => out(cnss::get_cnss_sheets(arg(a, "patientId")?, db).await),
        "save_cnss_sheet" => out(cnss::save_cnss_sheet(arg(a, "sheet")?, db).await),
        "delete_cnss_sheet" => out(cnss::delete_cnss_sheet(arg(a, "id")?, db).await),
        "get_settings" => out(cnss::get_settings(db).await),
        "set_setting" => out(cnss::set_setting(arg(a, "name")?, arg(a, "value")?, db).await),

        "list_staff" => out(access::list_staff(db).await),
        "add_staff" => out(access::add_staff(arg(a, "name")?, arg(a, "code")?, db).await),
        "remove_staff" => out(access::remove_staff(arg(a, "id")?, db).await),
        "get_patient_files" => { let pid = arg_i64(a, "patientId")?; out(blocking(move || files::list(&db, pid)).await) }
        "remove_patient_file" => { let id = arg_i64(a, "id")?; out(blocking(move || files::remove(&db, id)).await) }
        "get_reception_code" => out(access::get_reception_code(db).await),
        "set_reception_code" => out(access::set_reception_code(arg(a, "code")?, db).await),
        "change_doctor_login" => out(access::change_doctor_login(arg(a, "currentCode")?, arg(a, "newCode")?, arg(a, "newAnswer")?, db).await),

        "list_backups" => out(backup::list_backups_in(state.documents.clone(), db).await),
        "export_backup" => out(backup::export_backup_in(state.documents.clone(), db, arg(a, "full")?).await),
        "restore_backup" => out(backup::restore_backup_in(state.documents.clone(), db, arg(a, "file")?).await),
        _ => Err(format!("Commande inconnue: {}", cmd)),
    }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tokio::task::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

fn arg_i64(a: &Value, key: &str) -> Result<i64, String> { arg::<i64>(a, key) }

/// Attaches an image or PDF to a patient's file. The body is the raw file; name/title/date come in the query string.
async fn upload_patient_file(State(state): State<AppState>, headers: HeaderMap, Path(patient_id): Path<i64>,
                             Query(q): Query<HashMap<String, String>>, body: axum::body::Bytes) -> Response {
    let Some((db, uid, ..)) = session_of(&state, &headers) else { return err(StatusCode::UNAUTHORIZED, "Session expirée. Veuillez vous reconnecter."); };
    let get = |k: &str| q.get(k).cloned().unwrap_or_default();
    let (title, name, taken) = (get("title"), get("name"), get("taken_on"));
    match blocking(move || files::add(&db, uid, patient_id, &title, &name, &taken, &body)).await {
        Ok(id) => Json(json!({ "id": id })).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, &e),
    }
}

/// Shows one attached file (any logged-in user).
async fn show_patient_file(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<i64>) -> Response {
    let Some((db, ..)) = session_of(&state, &headers) else { return err(StatusCode::UNAUTHORIZED, "Session expirée. Veuillez vous reconnecter."); };
    let found = blocking(move || files::locate(&db, id)).await;
    let (path, mime, name) = match found { Ok(f) => f, Err(e) => return err(StatusCode::NOT_FOUND, &e) };
    match tokio::fs::read(&path).await {
        Ok(bytes) => ([
            (header::CONTENT_TYPE, mime),
            (header::CONTENT_DISPOSITION, format!("inline; filename=\"{}\"", name.replace('"', "'"))),
            (header::CACHE_CONTROL, "private, max-age=3600".to_string()),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_string()),
        ], bytes).into_response(),
        Err(_) => err(StatusCode::NOT_FOUND, "Le fichier n'est plus sur le serveur"),
    }
}

/// Doctor only: downloads one Excel backup from the server's backup folder.
async fn download_backup(State(state): State<AppState>, headers: HeaderMap, Path(file): Path<String>) -> Response {
    let Some((db, ..)) = session_of(&state, &headers) else { return err(StatusCode::UNAUTHORIZED, "Session expirée. Veuillez vous reconnecter."); };
    if let Err(e) = backup::require_doctor(&db) { return err(StatusCode::FORBIDDEN, &e); }
    let path = match backup::backup_path(&backup::backup_dir(state.documents.clone()), &file) { Ok(p) => p, Err(e) => return err(StatusCode::NOT_FOUND, &e) };
    match tokio::fs::read(&path).await {
        Ok(bytes) => ([
            (header::CONTENT_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", file)),
        ], bytes).into_response(),
        Err(e) => err(StatusCode::NOT_FOUND, &e.to_string()),
    }
}

fn default_config_dir() -> PathBuf {
    const ID: &str = "com.centre-dentaire.riad-el-ansari";
    if let Ok(d) = std::env::var("CABINET_CONFIG_DIR") { return PathBuf::from(d); }
    if let Ok(appdata) = std::env::var("APPDATA") { return PathBuf::from(appdata).join(ID); }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") { return PathBuf::from(xdg).join(ID); }
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into())).join(".config").join(ID)
}

fn web_dir() -> PathBuf {
    if let Ok(d) = std::env::var("CABINET_WEB_DIR") { return PathBuf::from(d); }
    let beside_exe = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join("dist")));
    match beside_exe { Some(d) if d.join("index.html").is_file() => d, _ => PathBuf::from("dist") }
}

/// First start in Docker: writes the config file from environment variables (never overwrites an existing one,
/// because the doctor can change the codes from the app).
fn bootstrap_config(dir: &std::path::Path) -> Result<(), String> {
    if config::exists(dir) { return Ok(()); }
    let var = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
    let (Some(doctor_code), Some(reception_code), Some(doctor_pw), Some(reception_pw)) =
        (var("DOCTOR_CODE"), var("RECEPTION_CODE"), var("DOCTOR_DB_PASSWORD"), var("RECEPTION_DB_PASSWORD")) else { return Ok(()); };
    for (what, code) in [("DOCTOR_CODE", &doctor_code), ("RECEPTION_CODE", &reception_code)] {
        if code.len() != 4 || !code.chars().all(|c| c.is_ascii_digit()) { return Err(format!("{} doit contenir exactement 4 chiffres", what)); }
    }
    let cfg = config::AppConfig {
        users: vec![
            config::UserEntry { id: 1, name: var("DOCTOR_NAME").unwrap_or_else(|| "Docteur".into()), code: doctor_code, role: "doctor".into(),
                mysql_user: var("DOCTOR_DB_USER").unwrap_or_else(|| "guestx".into()), mysql_password: doctor_pw },
            config::UserEntry { id: 2, name: "Réception".into(), code: reception_code, role: "reception".into(),
                mysql_user: var("RECEPTION_DB_USER").unwrap_or_else(|| "reception".into()), mysql_password: reception_pw },
        ],
        doctor_security_answer: String::new(),
        backup_dir: None,
    };
    config::save(dir, &cfg)?;
    println!("Configuration créée dans {}", dir.display());
    Ok(())
}

/// A config written by the old per-laptop wizard holds only ONE account. The web server serves everybody, so when the
/// reception account is missing it is created here: a fresh database password for the existing 'reception' database
/// account and a random code, until the doctor chooses the real reception code in "Codes de connexion".
fn ensure_reception_account() -> Result<(), String> {
    use mysql::prelude::*;
    let cfg = config::get()?;
    if cfg.users.iter().any(|u| u.role == "reception") || !dbserver::is_installed() { return Ok(()); }
    let mut bytes = [0u8; 40];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    const A: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let password: String = bytes[..24].iter().map(|b| A[*b as usize % A.len()] as char).collect();
    let code: String = bytes[24..28].iter().map(|b| char::from(b'0' + (b % 10))).collect();
    let mut conn = mysql::Conn::new(dbserver::root_url()?.as_str()).map_err(|e| format!("Connexion root: {}", e))?;
    conn.query_drop(format!("ALTER USER 'reception'@'%' IDENTIFIED BY '{}'", password)).map_err(|e| format!("Compte réception: {}", e))?;
    conn.query_drop("FLUSH PRIVILEGES").map_err(|e| e.to_string())?;
    let mut next = (*cfg).clone();
    next.users.push(config::UserEntry { id: 2, name: "Réception".into(), code, role: "reception".into(), mysql_user: "reception".into(), mysql_password: password });
    config::save_active(&next)?;
    println!("Compte réception créé. Le docteur choisit son code dans « Codes de connexion ».");
    Ok(())
}

/// Applies the SQL files of database/updates/ that were not applied yet (once each, in name order), so an update
/// that changes the database needs nothing more than a restart. Waits for the database to come up.
fn apply_updates(db_url: &str, dir: &std::path::Path) -> Result<Vec<String>, String> {
    use mysql::prelude::*;
    let mut files: Vec<_> = match std::fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().map(|x| x == "sql").unwrap_or(false)).collect(),
        Err(_) => return Ok(vec![]),
    };
    files.sort();
    let mut conn = mysql::Conn::new(db_url).map_err(|e| format!("Connexion à la base de données: {}", e))?;
    conn.query_drop("CREATE TABLE IF NOT EXISTS schema_updates (name VARCHAR(120) PRIMARY KEY, applied_at DATETIME NOT NULL)")
        .map_err(|e| format!("Table des mises à jour: {}", e))?;
    let mut done = vec![];
    for path in files {
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let known: Option<String> = conn.exec_first("SELECT name FROM schema_updates WHERE name = ?", (&name,)).map_err(|e| e.to_string())?;
        if known.is_some() { continue; }
        let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {}", name, e))?;
        let sql: String = text.lines().filter(|l| !l.trim_start().starts_with("--")).collect::<Vec<_>>().join("\n");
        for stmt in sql.split(';').map(str::trim).filter(|s| !s.is_empty()) {
            conn.query_drop(stmt).map_err(|e| format!("Mise à jour {}: {}", name, e))?;
        }
        conn.exec_drop("INSERT INTO schema_updates (name, applied_at) VALUES (?, NOW())", (&name,)).map_err(|e| e.to_string())?;
        done.push(name);
    }
    Ok(done)
}

pub async fn serve() -> Result<(), String> {
    let dir = default_config_dir();
    bootstrap_config(&dir)?;
    config::load(dir.clone());
    config::get().map_err(|e| format!("{}\n(dossier de configuration: {})", e, dir.display()))?;

    // the cabinet database of this laptop comes up with the server (no-op when it is not managed here)
    std::thread::spawn(|| match dbserver::start_if_needed() {
        Ok(true) => println!("Base de données démarrée."),
        Ok(false) => {}
        Err(e) => eprintln!("Base de données: {}", e),
    });
    // (separate thread: waits for the database, then adds the reception account if the old config lacks it)
    std::thread::spawn(|| {
        for attempt in 1..=40 {
            match ensure_reception_account() {
                Ok(()) => return,
                Err(e) if attempt < 40 => { if attempt == 1 { println!("Compte réception: en attente de la base ({})", e); } std::thread::sleep(Duration::from_secs(3)); }
                Err(e) => eprintln!("Compte réception: {}", e),
            }
        }
    });

    // database updates shipped with a new version (Docker: /app/updates; elsewhere: database/updates next to the program)
    if let Some(updates) = std::env::var("CABINET_UPDATES_DIR").ok().map(PathBuf::from).or_else(|| Some(PathBuf::from("database/updates"))) {
        let host = std::env::var("CABINET_DB_HOST").unwrap_or_else(|_| "localhost".into());
        if let Some(doctor) = config::get().ok().and_then(|c| c.users.iter().find(|u| u.role == "doctor").cloned()) {
            let url = crate::get_dynamic_url(&doctor.mysql_user, &doctor.mysql_password, &host);
            std::thread::spawn(move || {
                for attempt in 1..=40 {
                    match apply_updates(&url, &updates) {
                        Ok(done) => { for n in done { println!("Mise à jour de la base appliquée: {}", n); } return; }
                        Err(e) if attempt < 40 => { if attempt == 1 { println!("Base de données pas encore prête ({}). Nouvel essai…", e); } std::thread::sleep(Duration::from_secs(3)); }
                        Err(e) => eprintln!("Mises à jour de la base: {}", e),
                    }
                }
            });
        }
    }

    let web = web_dir();
    if !web.join("index.html").is_file() {
        return Err(format!("Dossier de l'application introuvable: {} (index.html manquant)", web.display()));
    }
    let state = AppState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        db_host: std::env::var("CABINET_DB_HOST").unwrap_or_else(|_| "localhost".into()),
        documents: None,
    };
    let app = Router::new()
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/call/{cmd}", post(call))
        .route("/api/backup/{file}", get(download_backup))
        .route("/api/patient-files/{patient_id}", post(upload_patient_file).layer(DefaultBodyLimit::max(files::MAX_BYTES + 1024)))
        .route("/api/patient-file/{id}", get(show_patient_file))
        .fallback_service(ServeDir::new(&web).fallback(ServeFile::new(web.join("index.html"))))
        // always re-check the page after an update, so no laptop keeps running an old version
        .layer(SetResponseHeaderLayer::if_not_present(header::CACHE_CONTROL, header::HeaderValue::from_static("no-cache")))
        .layer(middleware::from_fn_with_state(state.clone(), doctor_on_server_only))
        .with_state(state);

    let port: u16 = std::env::var("CABINET_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await
        .map_err(|e| format!("Port {} indisponible: {}", port, e))?;
    println!("Cabinet — serveur web prêt sur le port {} (dossier: {})", port, web.display());
    println!("Ouvrez  http://<adresse de ce poste>:{}  dans Chrome.", port);
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.map_err(|e| e.to_string())
}
