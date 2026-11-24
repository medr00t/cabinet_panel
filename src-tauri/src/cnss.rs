// CNSS dental care sheet ("Feuille de soins dentaires"): the filled form is stored as JSON in the patient's
// dossier. The frontend owns the shape of the JSON; the backend only checks it is valid and not huge.

use std::collections::HashMap;

use mysql::prelude::*;
use serde::{Deserialize, Serialize};

use crate::get_connection_with_retry;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CnssSheet {
    pub id: Option<i64>,
    pub patient_id: i64,
    pub label: String,
    /// the filled form, as a JSON document
    pub data: String,
    pub created_by: i64,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

const SETTINGS: [&str; 3] = ["cnss_inp", "cnss_city", "dentist_name"];
const MAX_DATA: usize = 200_000;

fn db(context: &str, e: mysql::Error) -> String {
    format!("{}: {}", context, e)
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_cnss_sheets(patient_id: i64, db_url: String) -> Result<Vec<CnssSheet>, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_map(
        "SELECT id, patient_id, label, data, created_by, created_at, updated_at FROM cnss_sheets WHERE patient_id = ? ORDER BY id DESC",
        (patient_id,),
        |(id, patient_id, label, data, created_by, created_at, updated_at)| CnssSheet {
            id: Some(id), patient_id, label, data, created_by, created_at, updated_at,
        },
    )
    .map_err(|e| db("Lecture des feuilles CNSS", e))
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn save_cnss_sheet(sheet: CnssSheet, db_url: String) -> Result<i64, String> {
    if sheet.data.len() > MAX_DATA {
        return Err("Feuille CNSS trop volumineuse".to_string());
    }
    serde_json::from_str::<serde_json::Value>(&sheet.data).map_err(|_| "Données de la feuille CNSS invalides".to_string())?;
    if sheet.label.chars().count() > 120 {
        return Err("Libellé trop long".to_string());
    }
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    match sheet.id {
        Some(id) => {
            conn.exec_drop(
                "UPDATE cnss_sheets SET label = ?, data = ?, updated_at = NOW() WHERE id = ? AND patient_id = ?",
                (&sheet.label, &sheet.data, id, sheet.patient_id),
            )
            .map_err(|e| db("Modification de la feuille CNSS", e))?;
            Ok(id)
        }
        None => {
            conn.exec_drop(
                "INSERT INTO cnss_sheets (patient_id, label, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
                (sheet.patient_id, &sheet.label, &sheet.data, sheet.created_by),
            )
            .map_err(|e| db("Enregistrement de la feuille CNSS", e))?;
            Ok(conn.last_insert_id() as i64)
        }
    }
}

// Doctor only: the reception MySQL account has no DELETE privilege on this table.
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn delete_cnss_sheet(id: i64, db_url: String) -> Result<(), String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop("DELETE FROM cnss_sheets WHERE id = ?", (id,)).map_err(|e| db("Suppression de la feuille CNSS", e))
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_settings(db_url: String) -> Result<HashMap<String, String>, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    let rows: Vec<(String, Option<String>)> = conn.query("SELECT name, value FROM settings").map_err(|e| db("Lecture des paramètres", e))?;
    Ok(rows.into_iter().map(|(k, v)| (k, v.unwrap_or_default())).collect())
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn set_setting(name: String, value: String, db_url: String) -> Result<(), String> {
    if !SETTINGS.contains(&name.as_str()) {
        return Err("Paramètre inconnu".to_string());
    }
    if value.chars().count() > 200 {
        return Err("Valeur trop longue".to_string());
    }
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop(
        "INSERT INTO settings (name, value, updated_at) VALUES (?, ?, NOW()) AS new
         ON DUPLICATE KEY UPDATE value = new.value, updated_at = new.updated_at",
        (name, value.trim()),
    )
    .map_err(|e| db("Enregistrement du paramètre", e))
}
