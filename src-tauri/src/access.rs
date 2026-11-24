// Doctor's settings: change the doctor's own code / security answer, and see or change the reception code.
// The reception code is kept in the shared database (settings.reception_code) so the doctor can manage it from
// any laptop; the reception laptop checks it at every login.

use mysql::prelude::*;
use mysql::*;

use crate::config;

const KEY: &str = "reception_code";

fn valid_code(code: &str) -> Result<(), String> {
    if code.len() == 4 && code.chars().all(|c| c.is_ascii_digit()) { Ok(()) } else { Err("Le code doit contenir exactement 4 chiffres".to_string()) }
}

fn only_doctor(db_url: &str) -> Result<(), String> {
    crate::backup::require_doctor(db_url).map(|_| ())
}

/// The reception code stored in the database, if the doctor (or a first reception login) has set one.
pub fn read_reception_code(db_url: &str) -> Result<Option<String>, String> {
    let mut conn = Conn::new(Opts::from_url(db_url).map_err(|e| e.to_string())?).map_err(|e| format!("Erreur de connexion à la base de données: {}", e))?;
    let v: Option<Option<String>> = conn.exec_first("SELECT value FROM settings WHERE name = ?", (KEY,)).map_err(|e| format!("Lecture du code: {}", e))?;
    Ok(v.flatten().filter(|c| !c.is_empty()))
}

pub fn write_reception_code(db_url: &str, code: &str) -> Result<(), String> {
    let mut conn = Conn::new(Opts::from_url(db_url).map_err(|e| e.to_string())?).map_err(|e| format!("Erreur de connexion à la base de données: {}", e))?;
    conn.exec_drop(
        "INSERT INTO settings (name, value, updated_at) VALUES (?, ?, NOW()) AS new ON DUPLICATE KEY UPDATE value = new.value, updated_at = new.updated_at",
        (KEY, code),
    ).map_err(|e| format!("Enregistrement du code: {}", e))
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_reception_code(db_url: String) -> Result<Option<String>, String> {
    only_doctor(&db_url)?;
    tokio::task::spawn_blocking(move || read_reception_code(&db_url)).await.map_err(|e| e.to_string())?
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn set_reception_code(code: String, db_url: String) -> Result<(), String> {
    only_doctor(&db_url)?;
    valid_code(&code)?;
    tokio::task::spawn_blocking(move || write_reception_code(&db_url, &code)).await.map_err(|e| e.to_string())?
}

/// Changes the doctor's login code and/or security answer on this laptop; the current code is asked again.
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn change_doctor_login(current_code: String, new_code: Option<String>, new_answer: Option<String>, db_url: String) -> Result<(), String> {
    only_doctor(&db_url)?;
    let mut cfg = (*config::get()?).clone();
    let doctor = cfg.users.iter_mut().find(|u| u.role == "doctor").ok_or_else(|| "Aucun compte docteur".to_string())?;
    if doctor.code != current_code { return Err("Le code actuel est incorrect".to_string()); }
    let new_code = new_code.filter(|c| !c.is_empty());
    let new_answer = new_answer.map(|a| a.trim().to_string()).filter(|a| !a.is_empty());
    if new_code.is_none() && new_answer.is_none() { return Err("Rien à modifier".to_string()); }
    if let Some(c) = new_code { valid_code(&c)?; doctor.code = c; }
    if let Some(a) = new_answer { cfg.doctor_security_answer = a; }
    config::save_active(&cfg)
}

// ---------------------------------------------------------------- reception accounts (doctor creates them)

/// A reception account's user id is STAFF_ID_BASE + its row id in `staff` (ids below are the config-file accounts).
pub const STAFF_ID_BASE: i64 = 100;

#[derive(Debug, serde::Serialize, Clone)]
pub struct StaffMember { pub id: i64, pub name: String, pub code: String }

fn staff_conn(db_url: &str) -> Result<Conn, String> {
    Conn::new(Opts::from_url(db_url).map_err(|e| e.to_string())?).map_err(|e| format!("Erreur de connexion à la base de données: {}", e))
}

/// Remembers every account name (removed ones too, they still appear on old payments).
pub fn refresh_staff_names(db_url: &str) -> Result<(), String> {
    let mut conn = staff_conn(db_url)?;
    let rows: Vec<(i64, String)> = conn.query("SELECT id, name FROM staff").map_err(|e| format!("Comptes: {}", e))?;
    config::set_extra_staff(rows.into_iter().map(|(id, n)| (STAFF_ID_BASE + id, n)).collect());
    Ok(())
}

/// Login by a reception account's own code: (user id, name) when the code belongs to an active account.
pub fn find_staff_by_code(db_url: &str, code: &str) -> Result<Option<(i64, String)>, String> {
    let mut conn = staff_conn(db_url)?;
    let row: Option<(i64, String)> = conn
        .exec_first("SELECT id, name FROM staff WHERE code = ? AND deleted_at IS NULL ORDER BY id LIMIT 1", (code,))
        .map_err(|e| format!("Comptes: {}", e))?;
    Ok(row.map(|(id, n)| (STAFF_ID_BASE + id, n)))
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn list_staff(db_url: String) -> Result<Vec<StaffMember>, String> {
    only_doctor(&db_url)?;
    tokio::task::spawn_blocking(move || {
        let mut conn = staff_conn(&db_url)?;
        let rows: Vec<(i64, String, String)> = conn.query("SELECT id, name, code FROM staff WHERE deleted_at IS NULL ORDER BY id").map_err(|e| format!("Comptes: {}", e))?;
        Ok(rows.into_iter().map(|(id, name, code)| StaffMember { id, name, code }).collect())
    }).await.map_err(|e| e.to_string())?
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn add_staff(name: String, code: String, db_url: String) -> Result<i64, String> {
    only_doctor(&db_url)?;
    valid_code(&code)?;
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 60 { return Err("Le nom est obligatoire (60 caractères au plus)".to_string()); }
    let cfg = config::get()?;
    if cfg.users.iter().any(|u| u.code == code) { return Err("Ce code est déjà utilisé".to_string()); }
    tokio::task::spawn_blocking(move || {
        let mut conn = staff_conn(&db_url)?;
        if read_reception_code(&db_url)?.as_deref() == Some(code.as_str()) { return Err("Ce code est déjà utilisé".to_string()); }
        let used: Option<i64> = conn.exec_first("SELECT id FROM staff WHERE code = ? AND deleted_at IS NULL", (&code,)).map_err(|e| format!("Comptes: {}", e))?;
        if used.is_some() { return Err("Ce code est déjà utilisé".to_string()); }
        conn.exec_drop("INSERT INTO staff (name, code, created_at) VALUES (?, ?, NOW())", (&name, &code)).map_err(|e| format!("Création du compte: {}", e))?;
        let id = conn.last_insert_id() as i64;
        let _ = refresh_staff_names(&db_url);
        Ok(STAFF_ID_BASE + id)
    }).await.map_err(|e| e.to_string())?
}

/// Removes an account the soft way: it can no longer log in, but the row (and the payments it collected) stay.
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn remove_staff(id: i64, db_url: String) -> Result<(), String> {
    only_doctor(&db_url)?;
    tokio::task::spawn_blocking(move || {
        let mut conn = staff_conn(&db_url)?;
        conn.exec_drop("UPDATE staff SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL", (id,)).map_err(|e| format!("Suppression du compte: {}", e))
    }).await.map_err(|e| e.to_string())?
}
