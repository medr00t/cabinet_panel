// The paper ledger, digitised: one `treatments` row per line (Date | Désignation | Acte | Devis),
// and the "Payer" column is the sum of `payments` rows attached to it. Reste = devis - payé.

use mysql::prelude::*;
use mysql::*;
use serde::{Deserialize, Serialize};

use crate::get_connection_with_retry;

const METHODS: [&str; 4] = ["espèces", "carte", "chèque", "virement"];
const EPS: f64 = 0.005;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Treatment {
    pub id: Option<i64>,
    pub patient_id: i64,
    pub treatment_date: String,
    pub tooth: String,
    pub act: String,
    pub quote: f64,
    pub notes: Option<String>,
    pub created_by: i64,
    #[serde(default)]
    pub total_paid: f64,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TreatmentPayment {
    pub id: i64,
    pub treatment_id: i64,
    pub amount: f64,
    pub payment_method: String,
    pub payment_date: String,
    pub collected_by: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PatientBalance {
    pub patient_id: i64,
    pub total_quote: f64,
    pub total_paid: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToothMark {
    pub patient_id: i64,
    pub tooth: String,
    pub status: String,
    pub note: Option<String>,
    pub updated_by: i64,
    #[serde(default)]
    pub updated_at: Option<String>,
}

const TOOTH_STATUSES: [&str; 7] = ["", "carie", "soigne", "devitalise", "couronne", "implant", "absente"];

/// FDI numbering: permanent 11-18, 21-28, 31-38, 41-48; deciduous 51-55, 61-65, 71-75, 81-85.
pub fn valid_tooth(t: &str) -> bool {
    let b = t.as_bytes();
    if b.len() != 2 || !b.iter().all(|c| c.is_ascii_digit()) {
        return false;
    }
    let (quadrant, n) = (b[0] - b'0', b[1] - b'0');
    match quadrant {
        1..=4 => (1..=8).contains(&n),
        5..=8 => (1..=5).contains(&n),
        _ => false,
    }
}

pub fn blank_to_none(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

pub fn friendly_db_error(context: &str, e: &mysql::Error) -> String {
    let text = e.to_string();
    if text.contains("Duplicate entry") && text.contains("uq_patients_billet") {
        "Ce numéro de billet existe déjà".to_string()
    } else {
        format!("{}: {}", context, text)
    }
}

fn valid_date(d: &str) -> bool {
    chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok()
}

fn check_amount(label: &str, amount: f64) -> Result<(), String> {
    if !amount.is_finite() || amount < 0.0 || amount > 10_000_000.0 {
        return Err(format!("{} invalide", label));
    }
    Ok(())
}

fn check_method(method: &str) -> Result<(), String> {
    if METHODS.contains(&method) { Ok(()) } else { Err("Mode de paiement invalide".to_string()) }
}

fn validate_treatment(t: &Treatment) -> Result<(), String> {
    if t.act.trim().is_empty() {
        return Err("L'acte médical est obligatoire".to_string());
    }
    if !valid_date(&t.treatment_date) {
        return Err("Date invalide".to_string());
    }
    if t.tooth.chars().count() > 120 {
        return Err("Trop de dents sélectionnées".to_string());
    }
    check_amount("Devis", t.quote)
}

fn db_err(context: &str, e: mysql::Error) -> String {
    format!("{}: {}", context, e)
}

// `FOR UPDATE` serialises concurrent payments on the same line so two laptops can't overpay it.
fn locked_quote_and_paid(tx: &mut Transaction, treatment_id: i64) -> Result<(i64, f64, f64), String> {
    let row: Option<(i64, f64)> = tx
        .exec_first("SELECT patient_id, quote FROM treatments WHERE id = ? FOR UPDATE", (treatment_id,))
        .map_err(|e| db_err("Lecture de l'acte", e))?;
    let (patient_id, quote) = row.ok_or_else(|| "Acte introuvable".to_string())?;
    let paid: Option<f64> = tx
        .exec_first("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE treatment_id = ?", (treatment_id,))
        .map_err(|e| db_err("Lecture des paiements", e))?;
    Ok((patient_id, quote, paid.unwrap_or(0.0)))
}

fn insert_payment(
    tx: &mut Transaction, treatment_id: i64, patient_id: i64, amount: f64, method: &str, date: &str, by: i64,
) -> Result<i64, String> {
    tx.exec_drop(
        "INSERT INTO payments (treatment_id, patient_id, amount, payment_method, collected_by, payment_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())",
        (treatment_id, patient_id, amount, method, by, date),
    )
    .map_err(|e| db_err("Enregistrement du paiement", e))?;
    Ok(tx.last_insert_id().unwrap_or(0) as i64)
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn add_treatment(
    treatment: Treatment, paid_now: f64, payment_method: String, db_url: String,
) -> Result<i64, String> {
    validate_treatment(&treatment)?;
    check_amount("Montant payé", paid_now)?;
    if paid_now > treatment.quote + EPS {
        return Err("Le montant payé dépasse le devis".to_string());
    }
    if paid_now > EPS {
        check_method(&payment_method)?;
    }

    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    let mut tx = conn.start_transaction(TxOpts::default()).map_err(|e| db_err("Transaction", e))?;
    tx.exec_drop(
        "INSERT INTO treatments (patient_id, treatment_date, tooth, act, quote, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
        (
            treatment.patient_id, &treatment.treatment_date, treatment.tooth.trim(), treatment.act.trim(),
            treatment.quote, blank_to_none(treatment.notes), treatment.created_by,
        ),
    )
    .map_err(|e| db_err("Enregistrement de l'acte", e))?;
    let id = tx.last_insert_id().unwrap_or(0) as i64;
    if paid_now > EPS {
        insert_payment(
            &mut tx, id, treatment.patient_id, paid_now, &payment_method, &treatment.treatment_date,
            treatment.created_by,
        )?;
    }
    tx.commit().map_err(|e| db_err("Validation", e))?;
    Ok(id)
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn update_treatment(treatment: Treatment, db_url: String) -> Result<(), String> {
    validate_treatment(&treatment)?;
    let id = treatment.id.ok_or_else(|| "Acte inconnu".to_string())?;
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    let mut tx = conn.start_transaction(TxOpts::default()).map_err(|e| db_err("Transaction", e))?;
    let (_, _, paid) = locked_quote_and_paid(&mut tx, id)?;
    if treatment.quote + EPS < paid {
        return Err(format!("Le devis ne peut pas être inférieur au montant déjà payé ({:.2})", paid));
    }
    tx.exec_drop(
        "UPDATE treatments SET treatment_date = ?, tooth = ?, act = ?, quote = ?, notes = ? WHERE id = ?",
        (
            &treatment.treatment_date, treatment.tooth.trim(), treatment.act.trim(), treatment.quote,
            blank_to_none(treatment.notes), id,
        ),
    )
    .map_err(|e| db_err("Modification de l'acte", e))?;
    tx.commit().map_err(|e| db_err("Validation", e))
}

// Doctor only: the reception MySQL account has no DELETE privilege on these tables.
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn delete_treatment(id: i64, db_url: String) -> Result<(), String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    let mut tx = conn.start_transaction(TxOpts::default()).map_err(|e| db_err("Transaction", e))?;
    tx.exec_drop("DELETE FROM payments WHERE treatment_id = ?", (id,))
        .map_err(|e| db_err("Suppression des paiements", e))?;
    tx.exec_drop("DELETE FROM treatments WHERE id = ?", (id,))
        .map_err(|e| db_err("Suppression de l'acte", e))?;
    tx.commit().map_err(|e| db_err("Validation", e))
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_patient_treatments(patient_id: i64, db_url: String) -> Result<Vec<Treatment>, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_map(
        r"SELECT t.id, t.patient_id, t.treatment_date, t.tooth, t.act, t.quote, t.notes, t.created_by, t.created_at,
                 COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.treatment_id = t.id), 0) AS total_paid
          FROM treatments t WHERE t.patient_id = ? ORDER BY t.treatment_date, t.id",
        (patient_id,),
        |mut row: mysql::Row| Treatment {
            id: Some(row.take::<i64, _>("id").unwrap_or(0)),
            patient_id: row.take::<i64, _>("patient_id").unwrap_or(0),
            treatment_date: row.take::<String, _>("treatment_date").unwrap_or_default(),
            tooth: row.take::<String, _>("tooth").unwrap_or_default(),
            act: row.take::<String, _>("act").unwrap_or_default(),
            quote: row.take::<f64, _>("quote").unwrap_or(0.0),
            notes: row.take::<Option<String>, _>("notes").unwrap_or(None),
            created_by: row.take::<i64, _>("created_by").unwrap_or(0),
            total_paid: row.take::<f64, _>("total_paid").unwrap_or(0.0),
            created_at: row.take::<Option<String>, _>("created_at").unwrap_or(None),
        },
    )
    .map_err(|e| db_err("Lecture des actes", e))
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn add_treatment_payment(
    treatment_id: i64, amount: f64, payment_method: String, payment_date: String, collected_by: i64,
    db_url: String,
) -> Result<i64, String> {
    check_amount("Montant", amount)?;
    if amount <= EPS {
        return Err("Le montant doit être supérieur à zéro".to_string());
    }
    check_method(&payment_method)?;
    if !valid_date(&payment_date) {
        return Err("Date invalide".to_string());
    }
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    let mut tx = conn.start_transaction(TxOpts::default()).map_err(|e| db_err("Transaction", e))?;
    let (patient_id, quote, paid) = locked_quote_and_paid(&mut tx, treatment_id)?;
    if paid + amount > quote + EPS {
        return Err(format!("Le paiement dépasse le reste à payer ({:.2})", (quote - paid).max(0.0)));
    }
    let id = insert_payment(&mut tx, treatment_id, patient_id, amount, &payment_method, &payment_date, collected_by)?;
    tx.commit().map_err(|e| db_err("Validation", e))?;
    Ok(id)
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_treatment_payments(treatment_id: i64, db_url: String) -> Result<Vec<TreatmentPayment>, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_map(
        "SELECT id, treatment_id, amount, payment_method, payment_date, collected_by
         FROM payments WHERE treatment_id = ? ORDER BY payment_date, id",
        (treatment_id,),
        |(id, treatment_id, amount, payment_method, payment_date, collected_by)| TreatmentPayment {
            id, treatment_id, amount, payment_method, payment_date, collected_by,
        },
    )
    .map_err(|e| db_err("Lecture des paiements", e))
}

// Doctor only (reception has no DELETE on payments): used to correct a mistaken entry.
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn delete_payment(id: i64, db_url: String) -> Result<(), String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop("DELETE FROM payments WHERE id = ?", (id,))
        .map_err(|e| db_err("Suppression du paiement", e))
}

// Totals per patient, for the "Reste à payer" column of the patient list and the dashboard.
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_patient_balances(db_url: String) -> Result<Vec<PatientBalance>, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.query_map(
        r"SELECT t.patient_id, SUM(t.quote) AS total_quote,
                 COALESCE(SUM((SELECT SUM(p.amount) FROM payments p WHERE p.treatment_id = t.id)), 0) AS total_paid
          FROM treatments t GROUP BY t.patient_id",
        |(patient_id, total_quote, total_paid)| PatientBalance { patient_id, total_quote, total_paid },
    )
    .map_err(|e| db_err("Lecture des soldes", e))
}

// Next free N° Billet: highest numeric billet + 1 (non-numeric billets are ignored).
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_next_billet_number(db_url: String) -> Result<String, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    // MAX() is NULL on an empty table, hence the inner Option.
    let max: Option<Option<i64>> = conn
        .query_first("SELECT MAX(CAST(billet_number AS UNSIGNED)) FROM patients WHERE billet_number REGEXP '^[0-9]+$'")
        .map_err(|e| db_err("Lecture des billets", e))?;
    Ok((max.flatten().unwrap_or(0) + 1).to_string())
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn get_tooth_marks(patient_id: i64, db_url: String) -> Result<Vec<ToothMark>, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_map(
        "SELECT patient_id, tooth, status, note, updated_by, updated_at FROM tooth_marks WHERE patient_id = ? ORDER BY tooth",
        (patient_id,),
        |(patient_id, tooth, status, note, updated_by, updated_at)| ToothMark { patient_id, tooth, status, note, updated_by, updated_at },
    )
    .map_err(|e| db_err("Lecture des dents", e))
}

// Upsert only (no DELETE): clearing a tooth means status '' and no note, so reception can do it too.
#[cfg_attr(feature = "desktop", tauri::command)]
pub async fn set_tooth_mark(mark: ToothMark, db_url: String) -> Result<(), String> {
    if !valid_tooth(&mark.tooth) {
        return Err("Numéro de dent invalide".to_string());
    }
    if !TOOTH_STATUSES.contains(&mark.status.as_str()) {
        return Err("Statut de dent invalide".to_string());
    }
    let note = blank_to_none(mark.note);
    if note.as_deref().map_or(0, |n| n.chars().count()) > 2000 {
        return Err("Remarque trop longue".to_string());
    }
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop(
        "INSERT INTO tooth_marks (patient_id, tooth, status, note, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW()) AS new
         ON DUPLICATE KEY UPDATE status = new.status, note = new.note, updated_by = new.updated_by, updated_at = new.updated_at",
        (mark.patient_id, mark.tooth, mark.status, note, mark.updated_by),
    )
    .map_err(|e| db_err("Enregistrement de la dent", e))
}
