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

#[tauri::command]
pub async fn get_reception_code(db_url: String) -> Result<Option<String>, String> {
    only_doctor(&db_url)?;
    tokio::task::spawn_blocking(move || read_reception_code(&db_url)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_reception_code(code: String, db_url: String) -> Result<(), String> {
    only_doctor(&db_url)?;
    valid_code(&code)?;
    tokio::task::spawn_blocking(move || write_reception_code(&db_url, &code)).await.map_err(|e| e.to_string())?
}

/// Changes the doctor's login code and/or security answer on this laptop; the current code is asked again.
#[tauri::command]
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
