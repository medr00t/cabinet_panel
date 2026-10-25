// Excel backup run on the doctor's machine after each login.
//
// One workbook per month (`cabinet_AAAA-MM.xlsx`):
//   Résumé            totals of the month and one line per day
//   Nouveaux patients every patient registered during the month, all on one sheet
//   JJ-MM ...         one sheet per day that had activity: appointments, acts, payments, new patients
//   Tous les patients / Dents   the complete current state (so one file alone is a usable backup)
// The current month's workbook is rewritten from the database at each backup, so today's sheet is always
// up to date and the earlier days stay; when the month ends a new workbook starts and the old one is kept.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::{Datelike, Local, NaiveDate};
use mysql::prelude::*;
use mysql::*;
use rust_xlsxwriter::{Color, Format, FormatAlign, Workbook, Worksheet, XlsxError};
use serde::Serialize;

use crate::{config, teeth_label};

#[derive(Debug, Serialize, Clone)]
pub struct BackupResult {
    /// the current month's workbook
    pub path: String,
    /// how many workbooks were (re)written this time
    pub files: usize,
    pub patients: usize,
    pub new_patients: usize,
    pub treatments: usize,
    pub payments: usize,
    pub appointments: usize,
    pub tooth_marks: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BackupMode {
    /// after a login: this month and last month, plus any month that has data but no file yet
    Auto,
    /// every month that has data (the manual button)
    Full,
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

#[derive(Clone)]
enum Cell { T(String), N(f64) }
use Cell::{N, T};

struct Styles { head: Format, money: Format, text: Format, title: Format, section: Format, bold_money: Format }

fn styles() -> Styles {
    Styles {
        head: Format::new().set_bold().set_font_color(Color::White).set_background_color(Color::RGB(0x12335B)).set_align(FormatAlign::Left),
        money: Format::new().set_num_format("#,##0.00"),
        text: Format::new(),
        title: Format::new().set_bold().set_font_size(15).set_font_color(Color::RGB(0x12335B)),
        section: Format::new().set_bold().set_font_size(12).set_background_color(Color::RGB(0xE8F1FB)).set_font_color(Color::RGB(0x184F8A)),
        bold_money: Format::new().set_bold().set_num_format("#,##0.00"),
    }
}

/// A sheet written top to bottom: titles, tables, totals.
struct Page<'a> { ws: &'a mut Worksheet, row: u32, st: &'a Styles }

impl<'a> Page<'a> {
    fn title(&mut self, t: &str) -> Result<(), String> {
        self.ws.write_string_with_format(self.row, 0, t, &self.st.title).map_err(xl)?;
        self.row += 2;
        Ok(())
    }
    fn section(&mut self, t: &str, cols: u16) -> Result<(), String> {
        for c in 0..cols { self.ws.write_string_with_format(self.row, c, if c == 0 { t } else { "" }, &self.st.section).map_err(xl)?; }
        self.row += 1;
        Ok(())
    }
    fn table(&mut self, headers: &[&str], money_cols: &[u16], rows: &[Vec<Cell>]) -> Result<(), String> {
        for (c, h) in headers.iter().enumerate() { self.ws.write_string_with_format(self.row, c as u16, *h, &self.st.head).map_err(xl)?; }
        self.row += 1;
        for r in rows {
            for (c, cell) in r.iter().enumerate() {
                let c = c as u16;
                match cell {
                    T(s) => { self.ws.write_string_with_format(self.row, c, s, &self.st.text).map_err(xl)?; }
                    N(v) => { self.ws.write_number_with_format(self.row, c, *v, if money_cols.contains(&c) { &self.st.money } else { &self.st.text }).map_err(xl)?; }
                }
            }
            self.row += 1;
        }
        Ok(())
    }
    fn total(&mut self, label: &str, value: f64) -> Result<(), String> {
        // label in the "Mode" column, amount right under "Montant"
        self.ws.write_string_with_format(self.row, 3, label, &self.st.section).map_err(xl)?;
        self.ws.write_number_with_format(self.row, 4, value, &self.st.bold_money).map_err(xl)?;
        self.row += 1;
        Ok(())
    }
    fn gap(&mut self) { self.row += 1; }
}

fn widths(ws: &mut Worksheet, w: &[f64]) -> Result<(), String> {
    for (c, x) in w.iter().enumerate() { ws.set_column_width(c as u16, *x).map_err(xl)?; }
    Ok(())
}

/// Plain table sheet (header row, frozen, filter): used for the complete lists.
fn table_sheet(wb: &mut Workbook, name: &str, headers: &[&str], w: &[f64], money_cols: &[u16], rows: &[Vec<Cell>], st: &Styles) -> Result<(), String> {
    let ws = wb.add_worksheet();
    ws.set_name(name).map_err(xl)?;
    widths(ws, w)?;
    let mut page = Page { ws, row: 0, st };
    page.table(headers, money_cols, rows)?;
    let n = rows.len();
    page.ws.set_freeze_panes(1, 0).map_err(xl)?;
    if n > 0 { page.ws.autofilter(0, 0, n as u32, (headers.len() - 1) as u16).map_err(xl)?; }
    Ok(())
}

const DAYS: [&str; 7] = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS: [&str; 12] = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

fn day_title(d: NaiveDate) -> String {
    let w = DAYS[d.weekday().num_days_from_monday() as usize];
    let mut t = format!("{} {} {} {}", w, d.day(), MONTHS[d.month0() as usize], d.year());
    t[..1].make_ascii_uppercase();
    t
}

fn month_title(year: i32, month: u32) -> String {
    let mut t = format!("{} {}", MONTHS[(month - 1) as usize], year);
    t[..1].make_ascii_uppercase();
    t
}

#[derive(Default)]
struct DayData {
    appts: Vec<Vec<Cell>>,
    acts: Vec<Vec<Cell>>,
    pays: Vec<Vec<Cell>>,
    new_patients: Vec<Vec<Cell>>,
    quote: f64,
    collected: f64,
    by_method: BTreeMap<String, f64>,
    done: usize,
}

/// Data shared by every monthly workbook: the complete lists.
struct Global { patients: Vec<Vec<Cell>>, marks: Vec<Vec<Cell>> }

const PATIENT_HEAD: [&str; 19] = ["N° billet", "Nom", "Prénom", "Sexe", "Date de naissance", "Téléphone", "Adresse", "Couverture médicale", "E-mail", "Allergies",
    "Médicaments", "R.C.", "Devis / plan", "Personne à prévenir", "Tél. urgence", "Créé le", "Total devis", "Total payé", "Reste à payer"];
const PATIENT_W: [f64; 19] = [10.0, 20.0, 18.0, 6.0, 15.0, 15.0, 28.0, 18.0, 24.0, 20.0, 20.0, 30.0, 30.0, 20.0, 15.0, 19.0, 13.0, 13.0, 14.0];

const PATIENT_SQL: &str = "SELECT p.billet_number, p.last_name, p.first_name, p.gender, p.date_of_birth, p.phone, p.address, p.insurance, p.email,
        p.allergies, p.medications, p.medical_history, p.notes, p.emergency_contact, p.emergency_phone, p.created_at,
        COALESCE(t.q, 0), COALESCE(t.paid, 0)
    FROM patients p
    LEFT JOIN (SELECT t.patient_id, SUM(t.quote) AS q,
                      SUM(COALESCE((SELECT SUM(x.amount) FROM payments x WHERE x.treatment_id = t.id), 0)) AS paid
               FROM treatments t GROUP BY t.patient_id) t ON t.patient_id = p.id";

fn patient_cells(r: &mut Row) -> Vec<Cell> {
    let (q, paid) = (num(r, 16), num(r, 17));
    let gender = match text(r, 3).as_str() { "female" => "F", "male" => "H", "" => "", _ => "?" }.to_string();
    vec![
        T(text(r, 0)), T(text(r, 1)), T(text(r, 2)), T(gender), T(text(r, 4)), T(text(r, 5)), T(text(r, 6)), T(text(r, 7)), T(text(r, 8)),
        T(text(r, 9)), T(text(r, 10)), T(text(r, 11)), T(text(r, 12)), T(text(r, 13)), T(text(r, 14)), T(text(r, 15)), N(q), N(paid), N(q - paid),
    ]
}

fn load_global(conn: &mut PooledConn) -> Result<Global, String> {
    let q = |e: mysql::Error| format!("Lecture de la base de données: {}", e);
    let patients: Vec<Row> = conn.query(format!("{} ORDER BY p.last_name, p.first_name", PATIENT_SQL)).map_err(q)?;
    let marks: Vec<Row> = conn.query(
        "SELECT p.billet_number, CONCAT(p.last_name, ' ', p.first_name), m.tooth, m.status, m.note, m.updated_at
         FROM tooth_marks m LEFT JOIN patients p ON p.id = m.patient_id
         WHERE m.status <> '' OR m.note IS NOT NULL ORDER BY p.last_name, m.tooth",
    ).map_err(q)?;
    Ok(Global {
        patients: patients.into_iter().map(|mut r| patient_cells(&mut r)).collect(),
        marks: marks.into_iter().map(|mut r| {
            let status = teeth_label(&text(&mut r, 3));
            vec![T(text(&mut r, 0)), T(text(&mut r, 1)), T(text(&mut r, 2)), T(status), T(text(&mut r, 4)), T(text(&mut r, 5))]
        }).collect(),
    })
}

/// "2026-10" for every month that has any activity or any new patient.
fn months_with_data(conn: &mut PooledConn) -> Result<Vec<String>, String> {
    let rows: Vec<Option<String>> = conn.query(
        "SELECT DISTINCT SUBSTR(d, 1, 7) FROM (
            SELECT treatment_date AS d FROM treatments UNION SELECT payment_date FROM payments
            UNION SELECT date FROM appointments UNION SELECT SUBSTR(created_at, 1, 10) FROM patients) x",
    ).map_err(|e| format!("Lecture de la base de données: {}", e))?;
    let mut months: Vec<String> = rows.into_iter().flatten().filter(|m| m.len() == 7 && m.as_bytes()[4] == b'-' && m[..4].chars().all(|c| c.is_ascii_digit()) && m[5..].chars().all(|c| c.is_ascii_digit())).collect();
    months.sort();
    Ok(months)
}

struct MonthStats { new_patients: usize, treatments: usize, payments: usize, appointments: usize }

/// Builds and saves one month's workbook. Returns the file and the month's counts.
fn write_month(conn: &mut PooledConn, dir: &Path, month: &str, today: NaiveDate, global: &Global, staff: &[(i64, String)], st: &Styles) -> Result<(PathBuf, MonthStats), String> {
    let q = |e: mysql::Error| format!("Lecture de la base de données: {}", e);
    let staff_name = |id: i64| staff.iter().find(|(i, _)| *i == id).map(|(_, n)| n.clone()).unwrap_or_else(|| format!("Utilisateur {}", id));
    let like = format!("{}%", month);
    let (year, mon): (i32, u32) = (month[..4].parse().map_err(|_| "mois invalide")?, month[5..].parse().map_err(|_| "mois invalide")?);
    let mut days: BTreeMap<String, DayData> = BTreeMap::new();
    let is_current = today.year() == year && today.month() == mon;
    if is_current { days.entry(today.format("%Y-%m-%d").to_string()).or_default(); }

    let new_patients: Vec<Row> = conn.exec(format!("{} WHERE p.created_at LIKE ? ORDER BY p.created_at", PATIENT_SQL), (&like,)).map_err(q)?;
    let mut new_rows = Vec::new();
    for mut r in new_patients {
        let created = text(&mut r, 15);
        let cells = patient_cells(&mut r);
        if created.len() >= 10 { days.entry(created[..10].to_string()).or_default().new_patients.push(cells.clone()); }
        new_rows.push(cells);
    }

    let acts: Vec<Row> = conn.exec(
        "SELECT t.treatment_date, p.billet_number, CONCAT(p.last_name, ' ', p.first_name), t.tooth, t.act, t.quote,
                COALESCE((SELECT SUM(x.amount) FROM payments x WHERE x.treatment_id = t.id), 0), t.notes
         FROM treatments t LEFT JOIN patients p ON p.id = t.patient_id WHERE t.treatment_date LIKE ? ORDER BY t.treatment_date, t.id", (&like,)).map_err(q)?;
    let n_acts = acts.len();
    for mut r in acts {
        let (date, quote, paid) = (text(&mut r, 0), num(&mut r, 5), num(&mut r, 6));
        let d = days.entry(date).or_default();
        d.quote += quote;
        d.acts.push(vec![T(text(&mut r, 1)), T(text(&mut r, 2)), T(text(&mut r, 3)), T(text(&mut r, 4)), N(quote), N(paid), N(quote - paid), T(text(&mut r, 7))]);
    }

    let pays: Vec<Row> = conn.exec(
        "SELECT x.payment_date, p.billet_number, CONCAT(p.last_name, ' ', p.first_name), t.act, x.payment_method, x.amount, x.collected_by
         FROM payments x LEFT JOIN patients p ON p.id = x.patient_id LEFT JOIN treatments t ON t.id = x.treatment_id
         WHERE x.payment_date LIKE ? ORDER BY x.payment_date, x.id", (&like,)).map_err(q)?;
    let n_pays = pays.len();
    for mut r in pays {
        let (date, method, amount) = (text(&mut r, 0), text(&mut r, 4), num(&mut r, 5));
        let by = r.take::<Option<i64>, _>(6).flatten().unwrap_or(0);
        let d = days.entry(date).or_default();
        d.collected += amount;
        *d.by_method.entry(method.clone()).or_insert(0.0) += amount;
        d.pays.push(vec![T(text(&mut r, 1)), T(text(&mut r, 2)), T(text(&mut r, 3)), T(method), N(amount), T(staff_name(by))]);
    }

    let appts: Vec<Row> = conn.exec(
        "SELECT a.date, a.time, CONCAT(p.last_name, ' ', p.first_name), p.phone, a.treatment_type, a.status, a.notes
         FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.date LIKE ? ORDER BY a.date, a.time", (&like,)).map_err(q)?;
    let n_appts = appts.len();
    for mut r in appts {
        let date = text(&mut r, 0);
        let status = text(&mut r, 5);
        let d = days.entry(date).or_default();
        if status == "terminé" { d.done += 1; }
        d.appts.push(vec![T(text(&mut r, 1)), T(text(&mut r, 2)), T(text(&mut r, 3)), T(text(&mut r, 4)), T(status), T(text(&mut r, 6))]);
    }
    // only dates of this month (a stray malformed date must not create a sheet)
    days.retain(|d, _| d.starts_with(month) && NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok());

    let mut wb = Workbook::new();

    // --- Résumé
    {
        let ws = wb.add_worksheet();
        ws.set_name("Résumé").map_err(xl)?;
        widths(ws, &[26.0, 14.0, 14.0, 14.0, 16.0, 16.0, 16.0])?;
        let mut p = Page { ws, row: 0, st };
        p.title(&format!("Centre Dentaire Riad El Ansari — {}", month_title(year, mon)))?;
        let total_collected: f64 = days.values().map(|d| d.collected).sum();
        let total_quote: f64 = days.values().map(|d| d.quote).sum();
        p.section("Le mois", 7)?;
        p.table(&["", "Nombre", "Montant"], &[2], &[
            vec![T("Nouveaux patients".into()), N(new_rows.len() as f64), T(String::new())],
            vec![T("Actes (devis)".into()), N(n_acts as f64), N(total_quote)],
            vec![T("Paiements encaissés".into()), N(n_pays as f64), N(total_collected)],
            vec![T("Rendez-vous".into()), N(n_appts as f64), T(String::new())],
        ])?;
        p.gap();
        p.section("Jour par jour (une feuille par jour)", 7)?;
        let rows: Vec<Vec<Cell>> = days.iter().map(|(d, v)| vec![
            T(NaiveDate::parse_from_str(d, "%Y-%m-%d").map(|x| x.format("%d/%m/%Y").to_string()).unwrap_or_default()),
            N(v.appts.len() as f64), N(v.acts.len() as f64), N(v.new_patients.len() as f64), N(v.quote), N(v.collected),
        ]).collect();
        p.table(&["Date", "Rendez-vous", "Actes", "Nouveaux patients", "Devis du jour", "Encaissé"], &[4, 5], &rows)?;
        p.ws.set_freeze_panes(0, 0).map_err(xl)?;
    }

    // --- Nouveaux patients (the whole month on one sheet)
    table_sheet(&mut wb, "Nouveaux patients", &PATIENT_HEAD, &PATIENT_W, &[16, 17, 18], &new_rows, st)?;

    // --- one sheet per day
    for (date, d) in &days {
        let nd = NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "date invalide")?;
        let ws = wb.add_worksheet();
        ws.set_name(nd.format("%d-%m").to_string()).map_err(xl)?;
        widths(ws, &[12.0, 28.0, 20.0, 28.0, 14.0, 22.0, 16.0, 30.0])?;
        let mut p = Page { ws, row: 0, st };
        p.title(&day_title(nd))?;
        if !d.appts.is_empty() {
            p.section(&format!("Rendez-vous ({}, dont {} terminé{})", d.appts.len(), d.done, if d.done > 1 { "s" } else { "" }), 8)?;
            p.table(&["Heure", "Patient", "Téléphone", "Motif", "Statut", "Notes"], &[], &d.appts)?;
            p.gap();
        }
        if !d.acts.is_empty() {
            p.section(&format!("Actes ({})", d.acts.len()), 8)?;
            p.table(&["N° billet", "Patient", "Dents", "Acte médical", "Devis", "Payé (à ce jour)", "Reste", "Remarque"], &[4, 5, 6], &d.acts)?;
            p.gap();
        }
        if !d.pays.is_empty() {
            p.section(&format!("Paiements ({})", d.pays.len()), 8)?;
            p.table(&["N° billet", "Patient", "Acte", "Mode", "Montant", "Encaissé par"], &[4], &d.pays)?;
            p.gap();
            for (method, v) in &d.by_method { p.total(&format!("Total {}", method), *v)?; }
            p.total("TOTAL ENCAISSÉ", d.collected)?;
            p.gap();
        }
        if !d.new_patients.is_empty() {
            p.section(&format!("Nouveaux patients ({})", d.new_patients.len()), 8)?;
            let slim: Vec<Vec<Cell>> = d.new_patients.iter().map(|r| vec![r[0].clone(), r[1].clone(), r[2].clone(), r[5].clone(), r[7].clone()]).collect();
            p.table(&["N° billet", "Nom", "Prénom", "Téléphone", "Couverture"], &[], &slim)?;
        }
        if d.appts.is_empty() && d.acts.is_empty() && d.pays.is_empty() && d.new_patients.is_empty() {
            p.ws.write_string(2, 0, "Aucune activité enregistrée ce jour.").map_err(xl)?;
        }
    }

    // --- complete lists: a single month's file is already a usable backup
    table_sheet(&mut wb, "Tous les patients", &PATIENT_HEAD, &PATIENT_W, &[16, 17, 18], &global.patients, st)?;
    table_sheet(&mut wb, "Dents", &["N° billet", "Patient", "Dent", "État", "Remarque", "Modifié le"], &[10.0, 26.0, 8.0, 14.0, 48.0, 19.0], &[], &global.marks, st)?;

    std::fs::create_dir_all(dir).map_err(|e| format!("Dossier de sauvegarde ({}): {}", dir.display(), e))?;
    let target = dir.join(format!("cabinet_{}.xlsx", month));
    let tmp = dir.join(format!("cabinet_{}.xlsx.tmp", month));
    wb.save(&tmp).map_err(xl)?;
    // replacing the file fails on Windows while Excel has it open: keep a timestamped copy instead
    let path = match std::fs::rename(&tmp, &target) {
        Ok(()) => target,
        Err(_) => {
            let alt = dir.join(format!("cabinet_{}_{}.xlsx", month, Local::now().format("%H-%M-%S")));
            std::fs::rename(&tmp, &alt).map_err(|e| format!("Enregistrement du fichier: {}", e))?;
            alt
        }
    };
    Ok((path, MonthStats { new_patients: new_rows.len(), treatments: n_acts, payments: n_pays, appointments: n_appts }))
}

/// Reads the database and writes the monthly workbooks to `dir`.
pub fn write_backup(dir: &Path, db_url: &str, staff: &[(i64, String)], mode: BackupMode) -> Result<BackupResult, String> {
    let pool = Pool::new(db_url).map_err(|e| format!("Connexion à la base de données: {}", e))?;
    let mut conn = pool.get_conn().map_err(|e| format!("Connexion à la base de données: {}", e))?;
    let today = Local::now().date_naive();
    let current = today.format("%Y-%m").to_string();
    let previous = (today.with_day(1).unwrap() - chrono::Duration::days(1)).format("%Y-%m").to_string();

    let with_data = months_with_data(&mut conn)?;
    let mut todo: Vec<String> = match mode {
        BackupMode::Full => with_data.clone(),
        BackupMode::Auto => with_data.iter().filter(|m| **m == current || **m == previous || !dir.join(format!("cabinet_{}.xlsx", m)).exists()).cloned().collect(),
    };
    if !todo.contains(&current) { todo.push(current.clone()); }
    todo.sort();

    let global = load_global(&mut conn)?;
    let st = styles();
    let mut written = 0;
    let mut now = None;
    for month in &todo {
        let (path, stats) = write_month(&mut conn, dir, month, today, &global, staff, &st)?;
        written += 1;
        if *month == current { now = Some((path, stats)); }
    }
    let (path, stats) = now.ok_or_else(|| "Sauvegarde du mois en cours impossible".to_string())?;
    Ok(BackupResult {
        path: path.display().to_string(), files: written, patients: global.patients.len(), new_patients: stats.new_patients,
        treatments: stats.treatments, payments: stats.payments, appointments: stats.appointments, tooth_marks: global.marks.len(),
    })
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

// Doctor only: called after a doctor logs in (automatic) and by the "Sauvegarde Excel" button (full).
#[tauri::command]
pub async fn export_backup(app: tauri::AppHandle, db_url: String, full: Option<bool>) -> Result<BackupResult, String> {
    use tauri::Manager;
    let cfg = config::get()?;
    let doctor = cfg.users.iter().find(|u| u.role == "doctor").ok_or_else(|| "Aucun compte docteur".to_string())?;
    if !db_url.starts_with(&format!("mysql://{}:", doctor.mysql_user)) {
        return Err("La sauvegarde Excel est réservée au docteur".to_string());
    }
    let dir = backup_dir(app.path().document_dir().ok());
    let staff: Vec<(i64, String)> = cfg.users.iter().map(|u| (u.id, u.name.clone())).collect();
    let mode = if full.unwrap_or(false) { BackupMode::Full } else { BackupMode::Auto };
    tokio::task::spawn_blocking(move || write_backup(&dir, &db_url, &staff, mode))
        .await
        .map_err(|e| format!("Sauvegarde interrompue: {}", e))?
}
