// Excel backup run on the doctor's machine after each login. Every workbook is also a complete, restorable
// copy of the database: the `data_*` sheets hold the raw tables with their ids, and `restore_backup` rebuilds an
// empty database from them.
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
use calamine::{open_workbook_auto, Data, Reader};
use rust_xlsxwriter::{Color, Format, FormatAlign, Workbook, Worksheet, XlsxError};
use serde::Serialize;

use crate::{config, teeth_label};

// ---------------------------------------------------------------- raw tables

#[derive(Clone, Copy, PartialEq)]
enum Kind { Int, Dec, Text }
use Kind::{Dec, Int, Text};

struct Col { name: &'static str, kind: Kind, nullable: bool }
const fn col(name: &'static str, kind: Kind, nullable: bool) -> Col { Col { name, kind, nullable } }
struct TableSpec { name: &'static str, order: &'static str, required: bool, cols: &'static [Col] }

/// Same columns as database/schema.sql, in the order the tables are restored.
const TABLES: [TableSpec; 7] = [
    TableSpec { name: "patients", order: "id", required: true, cols: &[
        col("id", Int, false), col("first_name", Text, false), col("last_name", Text, false), col("phone", Text, false),
        col("billet_number", Text, true), col("insurance", Text, true), col("email", Text, true), col("date_of_birth", Text, true),
        col("gender", Text, true), col("address", Text, true), col("allergies", Text, true), col("medical_history", Text, true),
        col("medications", Text, true), col("emergency_contact", Text, true), col("emergency_phone", Text, true),
        col("notes", Text, true), col("created_at", Text, true)] },
    TableSpec { name: "appointments", order: "id", required: true, cols: &[
        col("id", Int, false), col("patient_id", Int, false), col("date", Text, false), col("time", Text, false),
        col("treatment_type", Text, false), col("notes", Text, true), col("status", Text, false), col("created_at", Text, true)] },
    TableSpec { name: "treatments", order: "id", required: true, cols: &[
        col("id", Int, false), col("patient_id", Int, false), col("treatment_date", Text, false), col("tooth", Text, false),
        col("act", Text, false), col("quote", Dec, false), col("notes", Text, true), col("created_by", Int, false), col("created_at", Text, true)] },
    TableSpec { name: "payments", order: "id", required: true, cols: &[
        col("id", Int, false), col("appointment_id", Int, true), col("treatment_id", Int, true), col("patient_id", Int, false),
        col("amount", Dec, false), col("payment_method", Text, false), col("collected_by", Int, false), col("notes", Text, true),
        col("payment_date", Text, false), col("created_at", Text, true)] },
    TableSpec { name: "tooth_marks", order: "patient_id, tooth", required: false, cols: &[
        col("patient_id", Int, false), col("tooth", Text, false), col("status", Text, false), col("note", Text, true),
        col("updated_by", Int, false), col("updated_at", Text, true)] },
    TableSpec { name: "cnss_sheets", order: "id", required: false, cols: &[
        col("id", Int, false), col("patient_id", Int, false), col("label", Text, false), col("data", Text, false),
        col("created_by", Int, false), col("created_at", Text, true), col("updated_at", Text, true)] },
    TableSpec { name: "settings", order: "name", required: false, cols: &[
        col("name", Text, false), col("value", Text, true), col("updated_at", Text, true)] },
];

type RawRows = Vec<Vec<Value>>;

/// Excel cells hold at most 32 767 characters.
const CELL_MAX: usize = 32_000;

fn load_raw(conn: &mut PooledConn) -> Result<Vec<RawRows>, String> {
    let mut all = Vec::new();
    for t in TABLES.iter() {
        let names: Vec<&str> = t.cols.iter().map(|c| c.name).collect();
        let sql = format!("SELECT {} FROM {} ORDER BY {}", names.join(", "), t.name, t.order);
        match conn.query::<Row, _>(sql) {
            Ok(rows) => all.push(rows.into_iter().map(|r| r.unwrap()).collect()),
            // tables added by later migrations may not exist yet on an old database
            Err(_) if !t.required => all.push(Vec::new()),
            Err(e) => return Err(format!("Lecture de la base de données: {}", e)),
        }
    }
    Ok(all)
}

fn raw_sheet(wb: &mut Workbook, spec: &TableSpec, rows: &RawRows, st: &Styles) -> Result<(), String> {
    let ws = wb.add_worksheet();
    ws.set_name(format!("data_{}", spec.name)).map_err(xl)?;
    ws.set_tab_color(Color::RGB(0x94A3B8));
    for (c, col) in spec.cols.iter().enumerate() {
        ws.write_string_with_format(0, c as u16, col.name, &st.head).map_err(xl)?;
        ws.set_column_width(c as u16, 16.0).map_err(xl)?;
    }
    ws.set_freeze_panes(1, 0).map_err(xl)?;
    for (r, row) in rows.iter().enumerate() {
        for (c, (v, col)) in row.iter().zip(spec.cols.iter()).enumerate() {
            let (r, c) = ((r + 1) as u32, c as u16);
            match v {
                Value::NULL => {}
                Value::Int(i) => { ws.write_number(r, c, *i as f64).map_err(xl)?; }
                Value::UInt(u) => { ws.write_number(r, c, *u as f64).map_err(xl)?; }
                Value::Float(f) => { ws.write_number(r, c, *f as f64).map_err(xl)?; }
                Value::Double(d) => { ws.write_number(r, c, *d).map_err(xl)?; }
                Value::Bytes(b) => {
                    let t = String::from_utf8_lossy(b);
                    match (col.kind, t.trim().parse::<f64>()) {
                        (Dec, Ok(n)) | (Int, Ok(n)) => { ws.write_number(r, c, n).map_err(xl)?; }
                        _ => { ws.write_string(r, c, t.chars().take(CELL_MAX).collect::<String>()).map_err(xl)?; }
                    }
                }
                other => { ws.write_string(r, c, format!("{:?}", other)).map_err(xl)?; }
            }
        }
    }
    Ok(())
}

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
struct Global { patients: Vec<Vec<Cell>>, marks: Vec<Vec<Cell>>, raw: Vec<RawRows> }

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
        raw: load_raw(conn)?,
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
        p.ws.write_string(1, 0, "Sauvegarde complète : les feuilles data_* (en gris, à la fin) contiennent toutes les données et servent à restaurer la base. Ne pas les modifier.").map_err(xl)?;
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
    // raw tables, identical to the database: this is what makes the file a restorable backup
    for (spec, rows) in TABLES.iter().zip(global.raw.iter()) { raw_sheet(&mut wb, spec, rows, st)?; }

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

pub fn require_doctor(db_url: &str) -> Result<std::sync::Arc<config::AppConfig>, String> {
    let cfg = config::get()?;
    let doctor = cfg.users.iter().find(|u| u.role == "doctor").ok_or_else(|| "Aucun compte docteur".to_string())?;
    if !db_url.starts_with(&format!("mysql://{}:", doctor.mysql_user)) {
        return Err("Cette fonction est réservée au docteur".to_string());
    }
    Ok(cfg)
}

// Doctor only: called after a doctor logs in (automatic) and by the "Sauvegarde Excel" button (full).
#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn export_backup(app: tauri::AppHandle, db_url: String, full: Option<bool>) -> Result<BackupResult, String> {
    use tauri::Manager;
    export_backup_in(app.path().document_dir().ok(), db_url, full).await
}

pub async fn export_backup_in(documents: Option<PathBuf>, db_url: String, full: Option<bool>) -> Result<BackupResult, String> {
    let cfg = require_doctor(&db_url)?;
    let dir = backup_dir(documents);
    let _ = &cfg;
    let staff: Vec<(i64, String)> = config::staff_names();
    let mode = if full.unwrap_or(false) { BackupMode::Full } else { BackupMode::Auto };
    tokio::task::spawn_blocking(move || write_backup(&dir, &db_url, &staff, mode))
        .await
        .map_err(|e| format!("Sauvegarde interrompue: {}", e))?
}

// ---------------------------------------------------------------- restore

#[derive(Debug, Serialize, Clone, Default, PartialEq)]
pub struct RestoreResult {
    pub patients: usize,
    pub appointments: usize,
    pub treatments: usize,
    pub payments: usize,
    pub tooth_marks: usize,
    pub cnss_sheets: usize,
    pub settings: usize,
}

const SCHEMA: &str = include_str!("../../database/schema.sql");

/// The CREATE TABLE statements of database/schema.sql, each flattened onto one line.
fn schema_statements() -> Vec<String> {
    let no_comments: String = SCHEMA.lines().map(|l| l.split("--").next().unwrap_or("")).collect::<Vec<_>>().join("\n");
    no_comments.split(';').map(|s| s.split_whitespace().collect::<Vec<_>>().join(" ")).filter(|s| {
        let up = s.to_uppercase();
        !s.is_empty() && !up.starts_with("CREATE DATABASE") && !up.starts_with("USE ")
    }).collect()
}

/// Creates the tables if they are missing (a brand new server, or a database that was lost).
pub fn ensure_schema(conn: &mut Conn) -> Result<(), String> {
    for stmt in schema_statements() {
        conn.query_drop(&stmt).map_err(|e| format!("Création des tables: {}", e))?;
    }
    Ok(())
}

fn require_empty(conn: &mut Conn) -> Result<(), String> {
    let existing: Option<i64> = conn.query_first(
        "SELECT (SELECT COUNT(*) FROM patients) + (SELECT COUNT(*) FROM appointments) + (SELECT COUNT(*) FROM treatments)
              + (SELECT COUNT(*) FROM payments) + (SELECT COUNT(*) FROM tooth_marks) + (SELECT COUNT(*) FROM cnss_sheets)",
    ).map_err(|e| format!("Lecture de la base de données: {}", e))?;
    if existing.unwrap_or(0) > 0 {
        return Err("La base de données contient déjà des données : la restauration ne remplace jamais des données existantes. Elle sert uniquement après une perte de la base ou sur un nouveau serveur vide.".to_string());
    }
    Ok(())
}

fn cell_text(d: &Data) -> Option<String> {
    match d {
        Data::Empty => None,
        Data::String(s) => Some(s.clone()),
        Data::Float(f) if f.fract() == 0.0 && f.abs() < 1e15 => Some(format!("{}", *f as i64)),
        Data::Float(f) => Some(format!("{}", f)),
        Data::Int(i) => Some(i.to_string()),
        other => Some(other.to_string()),
    }
}

/// Parses every `data_*` sheet before touching the database, so a bad file fails without side effects.
fn read_workbook(path: &Path) -> Result<Vec<RawRows>, String> {
    let mut book = open_workbook_auto(path).map_err(|e| format!("Fichier Excel illisible: {}", e))?;
    let mut tables = Vec::new();
    for spec in TABLES.iter() {
        let sheet = format!("data_{}", spec.name);
        let range = match book.worksheet_range(&sheet) {
            Ok(r) => r,
            Err(_) if !spec.required => { tables.push(Vec::new()); continue; }
            Err(_) => return Err(format!("Ce fichier n'est pas une sauvegarde complète : la feuille « {} » est absente. Utilisez un fichier cabinet_AAAA-MM.xlsx récent.", sheet)),
        };
        let mut rows = range.rows();
        let header: Vec<String> = rows.next().map(|r| r.iter().map(|c| c.to_string()).collect()).unwrap_or_default();
        let at: Vec<Option<usize>> = spec.cols.iter().map(|c| header.iter().position(|h| h == c.name)).collect();
        if let Some(missing) = spec.cols.iter().zip(&at).find(|(c, i)| !c.nullable && i.is_none()) {
            return Err(format!("Feuille « {} » : colonne « {} » manquante", sheet, missing.0.name));
        }
        let mut out = Vec::new();
        for (n, row) in rows.enumerate() {
            if row.iter().all(|c| matches!(c, Data::Empty)) { continue; }
            let mut vals = Vec::with_capacity(spec.cols.len());
            for (ci, c) in spec.cols.iter().enumerate() {
                let cell = at[ci].and_then(|i| row.get(i)).and_then(cell_text);
                let here = || format!("feuille « {} », ligne {}, colonne « {} »", sheet, n + 2, c.name);
                vals.push(match (cell, c.kind) {
                    (None, _) if c.nullable => Value::NULL,
                    (None, Text) => Value::Bytes(Vec::new()),
                    (None, Int) => Value::Int(0),
                    (None, Dec) => Value::Bytes(b"0.00".to_vec()),
                    (Some(t), Int) => Value::Int(t.trim().parse::<i64>().or_else(|_| t.trim().parse::<f64>().map(|f| f as i64)).map_err(|_| format!("Nombre invalide ({})", here()))?),
                    (Some(t), Dec) => Value::Bytes(format!("{:.2}", t.trim().replace(',', ".").parse::<f64>().map_err(|_| format!("Montant invalide ({})", here()))?).into_bytes()),
                    (Some(t), Text) => Value::Bytes(t.into_bytes()),
                });
            }
            out.push(vals);
        }
        tables.push(out);
    }
    Ok(tables)
}

/// Rebuilds the database from a backup workbook. Never overwrites: the database must be empty.
pub fn restore_from_workbook(conn: &mut Conn, path: &Path) -> Result<RestoreResult, String> {
    let tables = read_workbook(path)?;
    ensure_schema(conn)?;
    require_empty(conn)?;
    let mut tx = conn.start_transaction(TxOpts::default()).map_err(|e| format!("Transaction: {}", e))?;
    for (spec, rows) in TABLES.iter().zip(tables.iter()) {
        if rows.is_empty() { continue; }
        let names: Vec<&str> = spec.cols.iter().map(|c| c.name).collect();
        let sql = format!("INSERT INTO {} ({}) VALUES ({})", spec.name, names.join(", "), vec!["?"; names.len()].join(", "));
        tx.exec_batch(sql, rows.iter().map(|r| Params::Positional(r.clone())))
            .map_err(|e| format!("Restauration de « {} » : {}", spec.name, e))?;
    }
    tx.commit().map_err(|e| format!("Validation: {}", e))?;
    let n = |i: usize| tables[i].len();
    Ok(RestoreResult { patients: n(0), appointments: n(1), treatments: n(2), payments: n(3), tooth_marks: n(4), cnss_sheets: n(5), settings: n(6) })
}

#[derive(Debug, Serialize, Clone)]
pub struct BackupFile { pub name: String, pub size: u64, pub modified: String }

#[derive(Debug, Serialize, Clone)]
pub struct BackupList { pub dir: String, pub files: Vec<BackupFile> }

pub fn list_backup_files(dir: &Path) -> Vec<BackupFile> {
    let mut files: Vec<BackupFile> = std::fs::read_dir(dir).into_iter().flatten().flatten().filter_map(|e| {
        let name = e.file_name().to_string_lossy().to_string();
        if !(name.starts_with("cabinet_") && name.ends_with(".xlsx")) { return None; }
        let meta = e.metadata().ok()?;
        let modified = meta.modified().ok().map(|t| chrono::DateTime::<Local>::from(t).format("%d/%m/%Y %H:%M").to_string()).unwrap_or_default();
        Some(BackupFile { name, size: meta.len(), modified })
    }).collect();
    files.sort_by(|a, b| b.name.cmp(&a.name));
    files
}

/// A backup file name chosen in the app: a plain file name inside the backup folder, nothing else.
pub fn backup_path(dir: &Path, file: &str) -> Result<PathBuf, String> {
    if file.contains('/') || file.contains('\\') || file.contains("..") || !file.starts_with("cabinet_") || !file.ends_with(".xlsx") {
        return Err("Nom de fichier de sauvegarde invalide".to_string());
    }
    let path = dir.join(file);
    if path.is_file() { Ok(path) } else { Err("Fichier de sauvegarde introuvable".to_string()) }
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_backups(app: tauri::AppHandle, db_url: String) -> Result<BackupList, String> {
    use tauri::Manager;
    list_backups_in(app.path().document_dir().ok(), db_url).await
}

pub async fn list_backups_in(documents: Option<PathBuf>, db_url: String) -> Result<BackupList, String> {
    require_doctor(&db_url)?;
    let dir = backup_dir(documents);
    Ok(BackupList { files: list_backup_files(&dir), dir: dir.display().to_string() })
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn restore_backup(app: tauri::AppHandle, db_url: String, file: String) -> Result<RestoreResult, String> {
    use tauri::Manager;
    restore_backup_in(app.path().document_dir().ok(), db_url, file).await
}

pub async fn restore_backup_in(documents: Option<PathBuf>, db_url: String, file: String) -> Result<RestoreResult, String> {
    require_doctor(&db_url)?;
    let path = backup_path(&backup_dir(documents), &file)?;
    tokio::task::spawn_blocking(move || {
        let mut conn = Conn::new(db_url.as_str()).map_err(|e| format!("Connexion à la base de données: {}", e))?;
        restore_from_workbook(&mut conn, &path)
    })
    .await
    .map_err(|e| format!("Restauration interrompue: {}", e))?
}
