// Web server: the same commands the desktop app has, exposed over HTTP for browsers.
// Login creates a server-side session (cookie); the database URL never leaves the server.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tower_http::services::{ServeDir, ServeFile};

use crate::{access, backup, cnss, config, dbserver, ledger};

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

fn user_json(id: i64, name: &str, role: &str) -> Value { json!({ "id": id, "name": name, "role": role }) }

async fn login(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let code = body.get("code").and_then(|c| c.as_str()).unwrap_or("").to_string();
    match crate::authenticate_user(code, Some(state.db_host.clone())).await {
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

        "get_reception_code" => out(access::get_reception_code(db).await),
        "set_reception_code" => out(access::set_reception_code(arg(a, "code")?, db).await),
        "change_doctor_login" => out(access::change_doctor_login(arg(a, "currentCode")?, arg(a, "newCode")?, arg(a, "newAnswer")?, db).await),

        "list_backups" => out(backup::list_backups_in(state.documents.clone(), db).await),
        "export_backup" => out(backup::export_backup_in(state.documents.clone(), db, arg(a, "full")?).await),
        "restore_backup" => out(backup::restore_backup_in(state.documents.clone(), db, arg(a, "file")?).await),
        _ => Err(format!("Commande inconnue: {}", cmd)),
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

pub async fn serve() -> Result<(), String> {
    let dir = default_config_dir();
    config::load(dir.clone());
    config::get().map_err(|e| format!("{}\n(dossier de configuration: {})", e, dir.display()))?;

    // the cabinet database of this laptop comes up with the server (no-op when it is not managed here)
    std::thread::spawn(|| match dbserver::start_if_needed() {
        Ok(true) => println!("Base de données démarrée."),
        Ok(false) => {}
        Err(e) => eprintln!("Base de données: {}", e),
    });

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
        .fallback_service(ServeDir::new(&web).fallback(ServeFile::new(web.join("index.html"))))
        .with_state(state);

    let port: u16 = std::env::var("CABINET_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await
        .map_err(|e| format!("Port {} indisponible: {}", port, e))?;
    println!("Cabinet — serveur web prêt sur le port {} (dossier: {})", port, web.display());
    println!("Ouvrez  http://<adresse de ce poste>:{}  dans Chrome.", port);
    axum::serve(listener, app).await.map_err(|e| e.to_string())
}
