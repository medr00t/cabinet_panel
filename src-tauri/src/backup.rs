// Automatic Excel backup, run on the doctor's machine after each login: one workbook per day with the
// patients, the acts (with what was paid), the payments, the appointments and the tooth remarks.

use std::path::{Path, PathBuf};

use mysql::prelude::*;
use mysql::*;
use rust_xlsxwriter::{Color, Format, FormatAlign, Workbook, Worksheet, XlsxError};
use serde::Serialize;

use crate::{config, teeth_label};

#[derive(Debug, Serialize, Clone)]
pub struct BackupResult {
    pub path: String,
    pub patients: usize,
    pub treatments: usize,
    pub payments: usize,
    pub appointments: usize,
    pub tooth_marks: usize,
}

fn xl(e: XlsxError) -> String {
    format!("Excel: {}", e)
}

fn text(row: &mut Row, i: usize) -> String {
    row.take::<Option<String>, _>(i).flatten().unwrap_or_default()
}

fn num(row: &mut Row, i: usize) -> f64 {
    row.take::<Option<f64>, _>(i).flatten().unwrap_or(0.0)
}

struct Styles { head: Format, money: Format, text: Format }

fn write_sheet(
    wb: &mut Workbook, name: &str, headers: &[&str], widths: &[f64], money_cols: &[u16], rows: Vec<Vec<Cell>>, st: &Styles,
) -> Result<(), String> {
    let ws: &mut Worksheet = wb.add_worksheet();
    ws.set_name(name).map_err(xl)?;
    for (c, h) in headers.iter().enumerate() {
        ws.write_string_with_format(0, c as u16, *h, &st.head).map_err(xl)?;
        ws.set_column_width(c as u16, widths.get(c).copied().unwrap_or(16.0)).map_err(xl)?;
    }
    ws.set_row_height(0, 22).map_err(xl)?;
    ws.set_freeze_panes(1, 0).map_err(xl)?;
    let n = rows.len();
    for (r, row) in rows.into_iter().enumerate() {
        for (c, cell) in row.into_iter().enumerate() {
            let (r, c) = ((r + 1) as u32, c as u16);
            match cell {
                Cell::T(s) => { ws.write_string_with_format(r, c, s, &st.text).map_err(xl)?; }
                Cell::N(v) => { ws.write_number_with_format(r, c, v, if money_cols.contains(&c) { &st.money } else { &st.text }).map_err(xl)?; }
            }
        }
    }
    if n > 0 {
        ws.autofilter(0, 0, n as u32, (headers.len() - 1) as u16).map_err(xl)?;
    }
    Ok(())
}

enum Cell { T(String), N(f64) }
use Cell::{N, T};

/// Reads the whole database and writes the workbook to `dir`. Returns the file path and row counts.
pub fn write_backup(dir: &Path, db_url: &str, staff: &[(i64, String)]) -> Result<BackupResult, String> {
    let pool = Pool::new(db_url).map_err(|e| format!("Connexion à la base de données: {}", e))?;
    let mut conn = pool.get_conn().map_err(|e| format!("Connexion à la base de données: {}", e))?;
    let q = |e: mysql::Error| format!("Lecture de la base de données: {}", e);
    let staff_name = |id: i64| staff.iter().find(|(i, _)| *i == id).map(|(_, n)| n.clone()).unwrap_or_else(|| format!("Utilisateur {}", id));

    let patients: Vec<Row> = conn.query(
        "SELECT p.billet_number, p.last_name, p.first_name, p.gender, p.date_of_birth, p.phone, p.address, p.insurance, p.email,
                p.allergies, p.medications, p.medical_history, p.notes, p.emergency_contact, p.emergency_phone, p.created_at,
                COALESCE(t.q, 0), COALESCE(t.paid, 0)
         FROM patients p
         LEFT JOIN (SELECT t.patient_id, SUM(t.quote) AS q,
                           SUM(COALESCE((SELECT SUM(x.amount) FROM payments x WHERE x.treatment_id = t.id), 0)) AS paid
                    FROM treatments t GROUP BY t.patient_id) t ON t.patient_id = p.id
         ORDER BY p.last_name, p.first_name",
    ).map_err(q)?;
    let treatments: Vec<Row> = conn.query(
        "SELECT t.treatment_date, p.billet_number, CONCAT(p.last_name, ' ', p.first_name), t.tooth, t.act, t.quote,
                COALESCE((SELECT SUM(x.amount) FROM payments x WHERE x.treatment_id = t.id), 0), t.notes
         FROM treatments t LEFT JOIN patients p ON p.id = t.patient_id ORDER BY t.treatment_date, t.id",
    ).map_err(q)?;
    let payments: Vec<Row> = conn.query(
        "SELECT x.payment_date, p.billet_number, CONCAT(p.last_name, ' ', p.first_name), t.act, x.payment_method, x.amount, x.collected_by
         FROM payments x LEFT JOIN patients p ON p.id = x.patient_id LEFT JOIN treatments t ON t.id = x.treatment_id
         ORDER BY x.payment_date, x.id",
    ).map_err(q)?;
    let appointments: Vec<Row> = conn.query(
        "SELECT a.date, a.time, CONCAT(p.last_name, ' ', p.first_name), p.phone, a.treatment_type, a.status, a.notes
         FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id ORDER BY a.date, a.time",
    ).map_err(q)?;
    let marks: Vec<Row> = conn.query(
        "SELECT p.billet_number, CONCAT(p.last_name, ' ', p.first_name), m.tooth, m.status, m.note, m.updated_at
         FROM tooth_marks m LEFT JOIN patients p ON p.id = m.patient_id
         WHERE m.status <> '' OR m.note IS NOT NULL ORDER BY p.last_name, m.tooth",
    ).map_err(q)?;

    let st = Styles {
        head: Format::new().set_bold().set_font_color(Color::White).set_background_color(Color::RGB(0x12335B)).set_align(FormatAlign::Left),
        money: Format::new().set_num_format("#,##0.00"),
        text: Format::new(),
    };
    let mut wb = Workbook::new();
    let (np, nt, ny, na, nm) = (patients.len(), treatments.len(), payments.len(), appointments.len(), marks.len());

    // summary first, so the file opens on something readable
    {
        let ws = wb.add_worksheet();
        ws.set_name("Résumé").map_err(xl)?;
        ws.set_column_width(0, 26).map_err(xl)?;
        ws.set_column_width(1, 34).map_err(xl)?;
        let bold = Format::new().set_bold();
        ws.write_string_with_format(0, 0, "Centre Dentaire Riad El Ansari", &bold).map_err(xl)?;
        let lines: [(&str, String); 6] = [
            ("Sauvegarde du", chrono::Local::now().format("%d/%m/%Y à %H:%M").to_string()),
            ("Patients", np.to_string()), ("Actes", nt.to_string()), ("Paiements", ny.to_string()),
            ("Rendez-vous", na.to_string()), ("Dents annotées", nm.to_string()),
        ];
        for (i, (k, v)) in lines.iter().enumerate() {
            ws.write_string((i + 2) as u32, 0, *k).map_err(xl)?;
            ws.write_string((i + 2) as u32, 1, v).map_err(xl)?;
        }
    }

    let mut rows = Vec::with_capacity(np);
    for mut r in patients {
        let (q, paid) = (num(&mut r, 16), num(&mut r, 17));
        let gender = match text(&mut r, 3).as_str() { "female" => "F", "male" => "H", other => if other.is_empty() { "" } else { "?" } }.to_string();
        rows.push(vec![
            T(text(&mut r, 0)), T(text(&mut r, 1)), T(text(&mut r, 2)), T(gender), T(text(&mut r, 4)), T(text(&mut r, 5)), T(text(&mut r, 6)),
            T(text(&mut r, 7)), T(text(&mut r, 8)), T(text(&mut r, 9)), T(text(&mut r, 10)), T(text(&mut r, 11)), T(text(&mut r, 12)),
            T(text(&mut r, 13)), T(text(&mut r, 14)), T(text(&mut r, 15)), N(q), N(paid), N(q - paid),
        ]);
    }
    write_sheet(&mut wb, "Patients",
        &["N° billet", "Nom", "Prénom", "Sexe", "Date de naissance", "Téléphone", "Adresse", "Couverture médicale", "E-mail", "Allergies",
          "Médicaments", "R.C.", "Devis / plan", "Personne à prévenir", "Tél. urgence", "Créé le", "Total devis", "Total payé", "Reste à payer"],
        &[10.0, 20.0, 18.0, 6.0, 15.0, 15.0, 28.0, 18.0, 24.0, 20.0, 20.0, 30.0, 30.0, 20.0, 15.0, 19.0, 13.0, 13.0, 14.0],
        &[16, 17, 18], rows, &st)?;

    let mut rows = Vec::with_capacity(nt);
    for mut r in treatments {
        let (quote, paid) = (num(&mut r, 5), num(&mut r, 6));
        rows.push(vec![T(text(&mut r, 0)), T(text(&mut r, 1)), T(text(&mut r, 2)), T(text(&mut r, 3)), T(text(&mut r, 4)), N(quote), N(paid), N(quote - paid), T(text(&mut r, 7))]);
    }
    write_sheet(&mut wb, "Actes", &["Date", "N° billet", "Patient", "Dents", "Acte médical", "Devis", "Payé", "Reste", "Remarque"],
        &[12.0, 10.0, 26.0, 14.0, 28.0, 12.0, 12.0, 12.0, 36.0], &[5, 6, 7], rows, &st)?;

    let mut rows = Vec::with_capacity(ny);
    for mut r in payments {
        let by = r.take::<Option<i64>, _>(6).flatten().unwrap_or(0);
        rows.push(vec![T(text(&mut r, 0)), T(text(&mut r, 1)), T(text(&mut r, 2)), T(text(&mut r, 3)), T(text(&mut r, 4)), N(num(&mut r, 5)), T(staff_name(by))]);
    }
    write_sheet(&mut wb, "Paiements", &["Date", "N° billet", "Patient", "Acte", "Mode", "Montant", "Encaissé par"],
        &[12.0, 10.0, 26.0, 28.0, 12.0, 13.0, 22.0], &[5], rows, &st)?;

    let mut rows = Vec::with_capacity(na);
    for mut r in appointments {
        rows.push(vec![T(text(&mut r, 0)), T(text(&mut r, 1)), T(text(&mut r, 2)), T(text(&mut r, 3)), T(text(&mut r, 4)), T(text(&mut r, 5)), T(text(&mut r, 6))]);
    }
    write_sheet(&mut wb, "Rendez-vous", &["Date", "Heure", "Patient", "Téléphone", "Motif", "Statut", "Notes"],
        &[12.0, 8.0, 26.0, 16.0, 28.0, 12.0, 36.0], &[], rows, &st)?;

    let mut rows = Vec::with_capacity(nm);
    for mut r in marks {
        let status = teeth_label(&text(&mut r, 3));
        rows.push(vec![T(text(&mut r, 0)), T(text(&mut r, 1)), T(text(&mut r, 2)), T(status), T(text(&mut r, 4)), T(text(&mut r, 5))]);
    }
    write_sheet(&mut wb, "Dents", &["N° billet", "Patient", "Dent", "État", "Remarque", "Modifié le"],
        &[10.0, 26.0, 8.0, 14.0, 48.0, 19.0], &[], rows, &st)?;

    std::fs::create_dir_all(dir).map_err(|e| format!("Dossier de sauvegarde ({}): {}", dir.display(), e))?;
    let day = chrono::Local::now().format("%Y-%m-%d").to_string();
    let target = dir.join(format!("cabinet_{}.xlsx", day));
    let tmp = dir.join(format!("cabinet_{}.xlsx.tmp", day));
    wb.save(&tmp).map_err(xl)?;
    // overwriting today's file fails on Windows while Excel has it open: keep a timestamped copy instead
    let path = match std::fs::rename(&tmp, &target) {
        Ok(()) => target,
        Err(_) => {
            let alt = dir.join(format!("cabinet_{}.xlsx", chrono::Local::now().format("%Y-%m-%d_%H-%M-%S")));
            std::fs::rename(&tmp, &alt).map_err(|e| format!("Enregistrement du fichier: {}", e))?;
            alt
        }
    };
    Ok(BackupResult { path: path.display().to_string(), patients: np, treatments: nt, payments: ny, appointments: na, tooth_marks: nm })
}

/// Where the backups go: $CABINET_BACKUP_DIR, then `backup_dir` in cabinet_config.json, then Documents.
pub fn backup_dir(documents: Option<PathBuf>) -> PathBuf {
    if let Ok(dir) = std::env::var("CABINET_BACKUP_DIR") {
        if !dir.trim().is_empty() { return PathBuf::from(dir); }
    }
    if let Some(dir) = config::get().ok().and_then(|c| c.backup_dir.clone()).filter(|d| !d.trim().is_empty()) {
        return PathBuf::from(dir);
    }
    documents.or_else(|| std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from(".")).join("Sauvegardes Cabinet")
}

// Doctor only: the app calls this after a doctor logs in, and from the "Sauvegarde Excel" button.
#[tauri::command]
pub async fn export_backup(app: tauri::AppHandle, db_url: String) -> Result<BackupResult, String> {
    use tauri::Manager;
    let cfg = config::get()?;
    let doctor = cfg.users.iter().find(|u| u.role == "doctor").ok_or_else(|| "Aucun compte docteur".to_string())?;
    if !db_url.starts_with(&format!("mysql://{}:", doctor.mysql_user)) {
        return Err("La sauvegarde Excel est réservée au docteur".to_string());
    }
    let dir = backup_dir(app.path().document_dir().ok());
    let staff: Vec<(i64, String)> = cfg.users.iter().map(|u| (u.id, u.name.clone())).collect();
    tokio::task::spawn_blocking(move || write_backup(&dir, &db_url, &staff))
        .await
        .map_err(|e| format!("Sauvegarde interrompue: {}", e))?
}
