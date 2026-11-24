// Radiology images and documents attached to a patient's file.
// The bytes live in a folder on the server; the database row (table patient_files) says whose they are.
// Removing a file only marks the row: the file stays on disk.

use std::path::PathBuf;

use mysql::prelude::*;
use mysql::*;
use serde::Serialize;

use crate::config;

pub const MAX_BYTES: usize = 30 * 1024 * 1024;

#[derive(Debug, Serialize, Clone)]
pub struct PatientFile {
    pub id: i64,
    pub patient_id: i64,
    pub title: String,
    pub original_name: String,
    pub mime: String,
    pub size_bytes: i64,
    pub taken_on: Option<String>,
    pub created_by: i64,
    pub created_at: String,
}

pub fn files_dir() -> PathBuf {
    if let Ok(d) = std::env::var("CABINET_FILES_DIR") { if !d.trim().is_empty() { return PathBuf::from(d); } }
    config::dir().unwrap_or_else(|| PathBuf::from(".")).join("radiologie")
}

fn conn(db_url: &str) -> Result<Conn, String> {
    Conn::new(Opts::from_url(db_url).map_err(|e| e.to_string())?).map_err(|e| format!("Erreur de connexion à la base de données: {}", e))
}

/// What the bytes really are (never trust the browser's claim): (mime type, extension).
pub fn sniff(b: &[u8]) -> Option<(&'static str, &'static str)> {
    if b.starts_with(&[0xFF, 0xD8, 0xFF]) { Some(("image/jpeg", "jpg")) }
    else if b.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) { Some(("image/png", "png")) }
    else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") { Some(("image/gif", "gif")) }
    else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" { Some(("image/webp", "webp")) }
    else if b.starts_with(b"BM") { Some(("image/bmp", "bmp")) }
    else if b.starts_with(b"%PDF-") { Some(("application/pdf", "pdf")) }
    else { None }
}

fn clean(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(max).collect()
}

pub fn add(db_url: &str, user_id: i64, patient_id: i64, title: &str, original_name: &str, taken_on: &str, bytes: &[u8]) -> Result<i64, String> {
    if bytes.is_empty() { return Err("Le fichier est vide".to_string()); }
    if bytes.len() > MAX_BYTES { return Err("Fichier trop volumineux (30 Mo au plus)".to_string()); }
    let (mime, ext) = sniff(bytes).ok_or_else(|| "Format non pris en charge (images JPG, PNG, WEBP, GIF, BMP ou PDF)".to_string())?;
    let taken = clean(taken_on, 10);
    if !taken.is_empty() && chrono::NaiveDate::parse_from_str(&taken, "%Y-%m-%d").is_err() { return Err("Date invalide".to_string()); }
    let mut c = conn(db_url)?;
    let exists: Option<i64> = c.exec_first("SELECT id FROM patients WHERE id = ?", (patient_id,)).map_err(|e| e.to_string())?;
    if exists.is_none() { return Err("Patient introuvable".to_string()); }
    let mut rnd = [0u8; 8];
    getrandom::fill(&mut rnd).map_err(|e| e.to_string())?;
    let stored = format!("{}_{}.{}", patient_id, rnd.iter().map(|x| format!("{:02x}", x)).collect::<String>(), ext);
    let dir = files_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Dossier des images: {}", e))?;
    std::fs::write(dir.join(&stored), bytes).map_err(|e| format!("Enregistrement du fichier: {}", e))?;
    let original = { let n = clean(original_name, 200); if n.is_empty() { format!("image.{}", ext) } else { n } };
    c.exec_drop(
        "INSERT INTO patient_files (patient_id, title, original_name, stored_name, mime, size_bytes, taken_on, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
        (patient_id, clean(title, 160), original, &stored, mime, bytes.len() as i64, if taken.is_empty() { None } else { Some(taken) }, user_id),
    ).map_err(|e| format!("Enregistrement du fichier: {}", e))?;
    Ok(c.last_insert_id() as i64)
}

pub fn list(db_url: &str, patient_id: i64) -> Result<Vec<PatientFile>, String> {
    let mut c = conn(db_url)?;
    let rows: Vec<(i64, i64, String, String, String, i64, Option<String>, i64, String)> = c.exec(
        "SELECT id, patient_id, title, original_name, mime, size_bytes, taken_on, created_by, CAST(created_at AS CHAR) \
         FROM patient_files WHERE patient_id = ? AND deleted_at IS NULL ORDER BY COALESCE(NULLIF(taken_on, ''), CAST(created_at AS CHAR)) DESC, id DESC",
        (patient_id,),
    ).map_err(|e| format!("Lecture des fichiers: {}", e))?;
    Ok(rows.into_iter().map(|(id, patient_id, title, original_name, mime, size_bytes, taken_on, created_by, created_at)|
        PatientFile { id, patient_id, title, original_name, mime, size_bytes, taken_on, created_by, created_at }).collect())
}

/// (path on disk, mime, original name) of a file that was not removed.
pub fn locate(db_url: &str, id: i64) -> Result<(PathBuf, String, String), String> {
    let mut c = conn(db_url)?;
    let row: Option<(String, String, String)> = c.exec_first(
        "SELECT stored_name, mime, original_name FROM patient_files WHERE id = ? AND deleted_at IS NULL", (id,),
    ).map_err(|e| format!("Lecture du fichier: {}", e))?;
    let (stored, mime, name) = row.ok_or_else(|| "Fichier introuvable".to_string())?;
    if stored.contains('/') || stored.contains('\\') || stored.contains("..") { return Err("Fichier invalide".to_string()); }
    Ok((files_dir().join(stored), mime, name))
}

/// Doctor only. Soft removal: the row is marked, the file stays on disk.
pub fn remove(db_url: &str, id: i64) -> Result<(), String> {
    crate::backup::require_doctor(db_url)?;
    let mut c = conn(db_url)?;
    c.exec_drop("UPDATE patient_files SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL", (id,))
        .map_err(|e| format!("Suppression du fichier: {}", e))
}
