mod backup;
mod cnss;
mod config;
mod ledger;

use serde::{Deserialize, Serialize};
use mysql::*;
use mysql::prelude::*;

// ----------------------------------------------------------------------------------------------------------------------
// MYSQL CONNECTION & CREDENTIAL CONSTANTS
// ----------------------------------------------------------------------------------------------------------------------

// Connection & Credential Constants
// Default MySQL host; clients on the LAN pass the doctor/server machine's IP at login.
const DEFAULT_SERVER_HOST: &str = "localhost";
const DB_NAME: &str = "cabinet";

// Accepts a hostname or IPv4 address with an optional :port; rejects anything that
// could alter the structure of the connection URL.
fn resolve_host(host: Option<String>) -> Result<String, String> {
    let host = host.map(|h| h.trim().to_string()).filter(|h| !h.is_empty())
        .unwrap_or_else(|| DEFAULT_SERVER_HOST.to_string());
    let valid = host.len() <= 255
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':');
    if valid { Ok(host) } else { Err("Adresse du serveur invalide".to_string()) }
}

fn get_dynamic_url(username: &str, password: &str, host: &str) -> String {
    format!("mysql://{}:{}@{}/{}", username, password, host, DB_NAME)
}

// Test database connection
async fn test_connection(db_url: &str) -> Result<(), String> {
    
    let pool = Pool::new(db_url)
        .map_err(|e| format!("Failed to create connection pool: {}", e))?;
    
    let mut conn = pool.get_conn()
        .map_err(|e| format!("Failed to connect to database: {}", e))?;
    
    // Test with a simple query
    let _: Vec<mysql::Row> = conn.query("SELECT 1 as test")
        .map_err(|e| format!("Failed to execute test query: {}", e))?;
    
    println!("[DEBUG] Database connection test successful");
    Ok(())
}

// Get connection with auto-retry
async fn get_connection_with_retry(db_url: &str, max_retries: u32) -> Result<PooledConn, String> {
    let pool = Pool::new(db_url)
        .map_err(|e| format!("Failed to create connection pool: {}", e))?;
    
    for attempt in 1..=max_retries {
        match pool.get_conn() {
            Ok(conn) => {
                println!("[DEBUG] Connected to database on attempt {}", attempt);
                return Ok(conn);
            }
            Err(e) => {
                println!("[DEBUG] Connection attempt {} failed: {}", attempt, e);
                if attempt == max_retries {
                    return Err(format!("Failed to connect after {} attempts: {}", max_retries, e));
                }
                // Wait a bit before retrying
                tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
            }
        }
    }
    
    Err("Failed to connect to database".to_string())
}

// Data structures
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Patient {
    pub id: Option<i64>,
    pub first_name: String,
    pub last_name: String,
    pub phone: String,
    #[serde(default)]
    pub billet_number: Option<String>,
    #[serde(default)]
    pub insurance: Option<String>,
    pub email: Option<String>,
    pub date_of_birth: String,
    pub gender: String,
    pub address: Option<String>,
    pub allergies: Option<String>,
    pub medical_history: Option<String>,
    pub medications: Option<String>,
    pub emergency_contact: Option<String>,
    pub emergency_phone: Option<String>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Appointment {
    pub id: Option<i64>,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub patient_phone: Option<String>,
    pub date: String,
    pub time: String,
    pub treatment_type: String,
    pub notes: Option<String>,
    pub status: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: Option<i64>,
    pub name: String,
    pub code: String,
    pub role: String,
    pub is_active: bool,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Payment {
    pub id: Option<i64>,
    pub patient_id: i64,
    pub appointment_id: Option<i64>,
    #[serde(default)]
    pub treatment_id: Option<i64>,
    #[serde(default)]
    pub patient_name: Option<String>,
    #[serde(default)]
    pub treatment_act: Option<String>,
    pub amount: f64,
    pub payment_method: String,
    pub notes: Option<String>,
    pub collected_by: i64,
    pub payment_date: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DailySummary {
    pub date: String,
    pub staff_id: i64,
    pub staff_name: String,
    pub total_cash: f64,
    pub total_card: f64,
    pub total_check: f64,
    pub total_transfer: f64,
    pub total_collected: f64,
    pub number_of_payments: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthResult {
    pub user: User,
    pub db_url: String,
}

// ----------------------------------------------------------------------------------------------------------------------
// TAURI COMMANDS - ALL USE DYNAMIC MYSQL CONNECTIONS
// ----------------------------------------------------------------------------------------------------------------------

#[tauri::command]
async fn authenticate_user(code: String, host: Option<String>) -> Result<AuthResult, String> {
    let host = resolve_host(host)?;
    let config = config::get()?;

    let entry = config.users.iter()
        .find(|u| u.code == code)
        .ok_or_else(|| "Code invalide ou utilisateur inactif".to_string())?;

    let user = User {
        id: Some(entry.id),
        name: entry.name.clone(),
        code: String::new(), // never send the code back to the frontend
        role: entry.role.clone(),
        is_active: true,
        created_at: None,
    };

    let dynamic_url = get_dynamic_url(&entry.mysql_user, &entry.mysql_password, &host);

    // Test the database connection before returning
    match test_connection(&dynamic_url).await {
        Ok(_) => {
            println!("[DEBUG] User authenticated successfully: {} ({})", user.name, user.role);
            Ok(AuthResult {
                user,
                db_url: dynamic_url,
            })
        }
        Err(e) => {
            println!("[ERROR] Database connection test failed: {}", e);
            Err(format!("Erreur de connexion à la base de données: {}", e))
        }
    }
}

#[tauri::command]
async fn add_patient(patient: Patient, db_url: String) -> Result<i64, String> {
    println!("[DEBUG] Adding patient to MySQL: {:?}", patient);
    
    // Validate required fields
    if patient.first_name.trim().is_empty() {
        return Err("Le prénom est obligatoire".to_string());
    }
    if patient.last_name.trim().is_empty() {
        return Err("Le nom est obligatoire".to_string());
    }
    if patient.phone.trim().is_empty() {
        return Err("Le numéro de téléphone est obligatoire".to_string());
    }
    
    // Connect to MySQL with auto-retry
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    
    // Insert patient into MySQL
    let query = r"
        INSERT INTO patients 
        (first_name, last_name, phone, billet_number, insurance, email, date_of_birth, gender, address, allergies, medical_history, medications, emergency_contact, emergency_phone, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ";
    
    // Build parameter values
    let mut params: Vec<mysql::Value> = Vec::new();
    params.push(patient.first_name.into());
    params.push(patient.last_name.into());
    params.push(patient.phone.into());
    params.push(ledger::blank_to_none(patient.billet_number).into());
    params.push(ledger::blank_to_none(patient.insurance).into());
    params.push(patient.email.into());
    params.push(patient.date_of_birth.into());
    params.push(patient.gender.into());
    params.push(patient.address.into());
    params.push(patient.allergies.into());
    params.push(patient.medical_history.into());
    params.push(patient.medications.into());
    params.push(patient.emergency_contact.into());
    params.push(patient.emergency_phone.into());
    params.push(patient.notes.into());
    
    let result = conn.exec_drop(query, params);
    
    match result {
        Ok(_) => {
            let patient_id = conn.last_insert_id() as i64;
            println!("[DEBUG] Patient added to MySQL with ID: {}", patient_id);
            Ok(patient_id)
        }
        Err(e) => {
            let error_msg = ledger::friendly_db_error("Erreur lors de l'insertion en base de données", &e);
            println!("[ERROR] {}", error_msg);
            Err(error_msg)
        }
    }
}

#[tauri::command]
async fn get_patients(db_url: String) -> Result<Vec<Patient>, String> {
    println!("[DEBUG] Fetching patients from MySQL database...");
    
    // Connect to MySQL with auto-retry
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    
    // Query patients from MySQL
    let query = "SELECT id, first_name, last_name, phone, billet_number, insurance, email, date_of_birth, gender, address, allergies, medical_history, medications, emergency_contact, emergency_phone, notes, created_at FROM patients ORDER BY created_at DESC";
    
    let patients_result: Result<Vec<Patient>, mysql::Error> = conn.query_map(query, |mut row: mysql::Row| {
        Patient {
            id: Some(row.take::<i64, _>("id").unwrap_or(0)),
            first_name: row.take::<String, _>("first_name").unwrap_or_default(),
            last_name: row.take::<String, _>("last_name").unwrap_or_default(),
            phone: row.take::<String, _>("phone").unwrap_or_default(),
            billet_number: row.take::<Option<String>, _>("billet_number").unwrap_or(None),
            insurance: row.take::<Option<String>, _>("insurance").unwrap_or(None),
            email: row.take::<Option<String>, _>("email").unwrap_or(None),
            date_of_birth: row.take::<String, _>("date_of_birth").unwrap_or_default(),
            gender: row.take::<String, _>("gender").unwrap_or_default(),
            address: row.take::<Option<String>, _>("address").unwrap_or(None),
            allergies: row.take::<Option<String>, _>("allergies").unwrap_or(None),
            medical_history: row.take::<Option<String>, _>("medical_history").unwrap_or(None),
            medications: row.take::<Option<String>, _>("medications").unwrap_or(None),
            emergency_contact: row.take::<Option<String>, _>("emergency_contact").unwrap_or(None),
            emergency_phone: row.take::<Option<String>, _>("emergency_phone").unwrap_or(None),
            notes: row.take::<Option<String>, _>("notes").unwrap_or(None),
            created_at: row.take::<Option<String>, _>("created_at").unwrap_or(None),
        }
    });
    
    match patients_result {
        Ok(patients) => {
            println!("[DEBUG] Found {} patients", patients.len());
            Ok(patients)
        }
        Err(e) => {
            let error_msg = format!("Erreur lors de la récupération des patients: {}", e);
            println!("[ERROR] {}", error_msg);
            Err(error_msg)
        }
    }
}

#[tauri::command]
async fn update_patient(id: i64, patient: Patient, db_url: String) -> Result<(), String> {
    if patient.first_name.trim().is_empty() || patient.last_name.trim().is_empty() || patient.phone.trim().is_empty() {
        return Err("Le prénom, le nom et le téléphone sont obligatoires".to_string());
    }
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop(
        r"UPDATE patients SET first_name = ?, last_name = ?, phone = ?, billet_number = ?, insurance = ?, email = ?, date_of_birth = ?, gender = ?,
          address = ?, allergies = ?, medical_history = ?, medications = ?, emergency_contact = ?,
          emergency_phone = ?, notes = ? WHERE id = ?",
        Params::Positional(vec![
            patient.first_name.into(), patient.last_name.into(), patient.phone.into(),
            ledger::blank_to_none(patient.billet_number).into(), ledger::blank_to_none(patient.insurance).into(),
            patient.email.into(), patient.date_of_birth.into(), patient.gender.into(), patient.address.into(), patient.allergies.into(),
            patient.medical_history.into(), patient.medications.into(), patient.emergency_contact.into(),
            patient.emergency_phone.into(), patient.notes.into(), id.into(),
        ]),
    ).map_err(|e| ledger::friendly_db_error("Erreur lors de la modification du patient", &e))
}

#[tauri::command]
async fn delete_patient(id: i64, db_url: String) -> Result<(), String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    let mut tx = conn.start_transaction(TxOpts::default()).map_err(|e| format!("Transaction: {}", e))?;
    // A patient with acts or payments keeps its financial history: refuse instead of orphaning it.
    let ledger_rows: Option<i64> = tx
        .exec_first(
            "SELECT (SELECT COUNT(*) FROM treatments WHERE patient_id = ?) + (SELECT COUNT(*) FROM payments WHERE patient_id = ?)",
            (id, id),
        )
        .map_err(|e| format!("Erreur lors de la suppression du patient: {}", e))?;
    if ledger_rows.unwrap_or(0) > 0 {
        return Err("Ce patient a des actes ou des paiements enregistrés : suppression impossible".to_string());
    }
    tx.exec_drop("DELETE FROM appointments WHERE patient_id = ?", (id,))
        .map_err(|e| format!("Erreur lors de la suppression du patient: {}", e))?;
    tx.exec_drop("DELETE FROM patients WHERE id = ?", (id,))
        .map_err(|e| format!("Erreur lors de la suppression du patient: {}", e))?;
    tx.commit().map_err(|e| format!("Erreur lors de la suppression du patient: {}", e))
}

#[tauri::command]
async fn add_appointment(appointment: Appointment, db_url: String) -> Result<i64, String> {
    println!("[DEBUG] Adding appointment to MySQL: {:?}", appointment);
    
    // Connect to MySQL with auto-retry  
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    
    // Insert appointment into MySQL
    let query = r"
        INSERT INTO appointments 
        (patient_id, date, time, treatment_type, notes, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
    ";
    
    // Build parameter values
    let mut params: Vec<mysql::Value> = Vec::new();
    params.push(appointment.patient_id.into());
    params.push(appointment.date.into());
    params.push(appointment.time.into());
    params.push(appointment.treatment_type.into());
    params.push(appointment.notes.into());
    params.push(appointment.status.into());
    
    let result = conn.exec_drop(query, params);
    
    match result {
        Ok(_) => {
            let appointment_id = conn.last_insert_id() as i64;
            println!("[DEBUG] Appointment added to MySQL with ID: {}", appointment_id);
            Ok(appointment_id)
        }
        Err(e) => {
            let error_msg = format!("Erreur lors de l'ajout du rendez-vous: {}", e);
            println!("[ERROR] {}", error_msg);
            Err(error_msg)
        }
    }
}

#[tauri::command]
async fn get_appointments(db_url: String) -> Result<Vec<Appointment>, String> {
    println!("[DEBUG] Fetching appointments from MySQL database...");
    
    // Try to connect to MySQL and fetch appointments
    match get_connection_with_retry(&db_url, 3).await {
        Ok(mut conn) => {
            // Query appointments from MySQL with patient info
            let query = r"
                SELECT 
                    a.id, 
                    a.patient_id, 
                    CONCAT(p.first_name, ' ', p.last_name) as patient_name,
                    p.phone as patient_phone,
                    a.date, 
                    a.time, 
                    a.treatment_type, 
                    a.notes, 
                    a.status, 
                    a.created_at
                FROM appointments a 
                LEFT JOIN patients p ON a.patient_id = p.id 
                ORDER BY a.date DESC, a.time DESC
            ";
            
            let appointments_result: Result<Vec<Appointment>, mysql::Error> = conn.query_map(query, |mut row: mysql::Row| {
                Appointment {
                    id: Some(row.take::<i64, _>("id").unwrap_or(0)),
                    patient_id: row.take::<i64, _>("patient_id").unwrap_or(0),
                    patient_name: row.take::<Option<String>, _>("patient_name").unwrap_or(None),
                    patient_phone: row.take::<Option<String>, _>("patient_phone").unwrap_or(None),
                    date: row.take::<String, _>("date").unwrap_or_default(),
                    time: row.take::<String, _>("time").unwrap_or_default(),
                    treatment_type: row.take::<String, _>("treatment_type").unwrap_or_default(),
                    notes: row.take::<Option<String>, _>("notes").unwrap_or(None),
                    status: row.take::<String, _>("status").unwrap_or_default(),
                    created_at: row.take::<Option<String>, _>("created_at").unwrap_or(None),
                }
            });
            
            match appointments_result {
                Ok(appointments) => {
                    println!("[DEBUG] Found {} appointments", appointments.len());
                    Ok(appointments)
                }
                Err(e) => {
                    println!("[DEBUG] Database query failed, returning empty list: {}", e);
                    Ok(Vec::new())
                }
            }
        }
        Err(e) => {
            println!("[DEBUG] Database connection failed, returning empty list: {}", e);
            Ok(Vec::new())
        }
    }
}

#[tauri::command]
async fn get_patient_appointments(patient_id: i64, db_url: String) -> Result<Vec<Appointment>, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    let appointments: Vec<Appointment> = conn.exec_map(
        r"SELECT a.id, a.patient_id, CONCAT(p.first_name, ' ', p.last_name) as patient_name,
                 p.phone as patient_phone, a.date, a.time, a.treatment_type, a.notes, a.status, a.created_at
          FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id
          WHERE a.patient_id = ? ORDER BY a.date DESC, a.time DESC",
        (patient_id,),
        |mut row: mysql::Row| Appointment {
            id: Some(row.take::<i64, _>("id").unwrap_or(0)),
            patient_id: row.take::<i64, _>("patient_id").unwrap_or(0),
            patient_name: row.take::<Option<String>, _>("patient_name").unwrap_or(None),
            patient_phone: row.take::<Option<String>, _>("patient_phone").unwrap_or(None),
            date: row.take::<String, _>("date").unwrap_or_default(),
            time: row.take::<String, _>("time").unwrap_or_default(),
            treatment_type: row.take::<String, _>("treatment_type").unwrap_or_default(),
            notes: row.take::<Option<String>, _>("notes").unwrap_or(None),
            status: row.take::<String, _>("status").unwrap_or_default(),
            created_at: row.take::<Option<String>, _>("created_at").unwrap_or(None),
        },
    ).map_err(|e| format!("Erreur lors de la lecture des rendez-vous: {}", e))?;
    Ok(appointments)
}

#[tauri::command]
async fn update_appointment(id: i64, appointment: Appointment, db_url: String) -> Result<(), String> {
    if appointment.treatment_type.trim().is_empty() {
        return Err("Le type de soin est obligatoire".to_string());
    }
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop(
        "UPDATE appointments SET patient_id = ?, date = ?, time = ?, treatment_type = ?, notes = ?, status = ? WHERE id = ?",
        (
            appointment.patient_id, appointment.date, appointment.time, appointment.treatment_type,
            ledger::blank_to_none(appointment.notes), appointment.status, id,
        ),
    )
    .map_err(|e| format!("Erreur lors de la modification du rendez-vous: {}", e))
}

#[tauri::command]
async fn update_appointment_status(id: i64, status: String, db_url: String) -> Result<(), String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop("UPDATE appointments SET status = ? WHERE id = ?", (status, id))
        .map_err(|e| format!("Erreur lors de la mise à jour du rendez-vous: {}", e))
}

#[tauri::command]
async fn delete_appointment(id: i64, db_url: String) -> Result<(), String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop("DELETE FROM appointments WHERE id = ?", (id,))
        .map_err(|e| format!("Erreur lors de la suppression du rendez-vous: {}", e))
}

#[tauri::command]
async fn add_payment(payment: Payment, db_url: String) -> Result<i64, String> {
    println!("[DEBUG] Adding payment to MySQL: {:?}", payment);
    
    // Connect to MySQL with auto-retry
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    
    // Insert payment into MySQL
    let query = r"
        INSERT INTO payments 
        (appointment_id, treatment_id, patient_id, amount, payment_method, collected_by, notes, payment_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ";
    
    // Build parameter values
    let mut params: Vec<mysql::Value> = Vec::new();
    params.push(payment.appointment_id.into());
    params.push(payment.treatment_id.into());
    params.push(payment.patient_id.into());
    params.push(payment.amount.into());
    params.push(payment.payment_method.into());
    params.push(payment.collected_by.into());
    params.push(payment.notes.into());
    params.push(payment.payment_date.into());
    
    let result = conn.exec_drop(query, params);
    
    match result {
        Ok(_) => {
            let payment_id = conn.last_insert_id() as i64;
            println!("[DEBUG] Payment added to MySQL with ID: {}", payment_id);
            Ok(payment_id)
        }
        Err(e) => {
            let error_msg = format!("Erreur lors de l'ajout du paiement: {}", e);
            println!("[ERROR] {}", error_msg);
            Err(error_msg)
        }
    }
}

#[tauri::command]
async fn get_payments_by_date(date: String, db_url: String) -> Result<Vec<Payment>, String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_map(
        r"SELECT p.id, p.appointment_id, p.treatment_id, p.patient_id,
                 CONCAT(pt.first_name, ' ', pt.last_name) AS patient_name, t.act AS treatment_act,
                 p.amount, p.payment_method, p.collected_by, p.notes, p.payment_date, p.created_at
          FROM payments p LEFT JOIN patients pt ON pt.id = p.patient_id
               LEFT JOIN treatments t ON t.id = p.treatment_id
          WHERE p.payment_date = ? ORDER BY p.id DESC",
        (date,),
        |mut row: mysql::Row| Payment {
            id: Some(row.take::<i64, _>("id").unwrap_or(0)),
            appointment_id: row.take::<Option<i64>, _>("appointment_id").unwrap_or(None),
            treatment_id: row.take::<Option<i64>, _>("treatment_id").unwrap_or(None),
            patient_id: row.take::<i64, _>("patient_id").unwrap_or(0),
            patient_name: row.take::<Option<String>, _>("patient_name").unwrap_or(None),
            treatment_act: row.take::<Option<String>, _>("treatment_act").unwrap_or(None),
            amount: row.take::<f64, _>("amount").unwrap_or(0.0),
            payment_method: row.take::<String, _>("payment_method").unwrap_or_default(),
            collected_by: row.take::<i64, _>("collected_by").unwrap_or(0),
            notes: row.take::<Option<String>, _>("notes").unwrap_or(None),
            payment_date: row.take::<String, _>("payment_date").unwrap_or_default(),
            created_at: row.take::<Option<String>, _>("created_at").unwrap_or(None),
        },
    ).map_err(|e| format!("Erreur lors de la lecture des paiements: {}", e))
}

fn staff_name(id: i64) -> String {
    config::get().ok()
        .and_then(|c| c.users.iter().find(|u| u.id == id))
        .map(|u| u.name.clone())
        .unwrap_or_else(|| format!("Utilisateur {}", id))
}

// One summary per collector for the day, grouped by payment method.
fn daily_summaries(db_url: &str, date: &str, only_staff: Option<i64>) -> Result<Vec<DailySummary>, String> {
    let pool = Pool::new(db_url).map_err(|e| format!("Failed to create connection pool: {}", e))?;
    let mut conn = pool.get_conn().map_err(|e| format!("Failed to connect to database: {}", e))?;

    let rows: Vec<(i64, String, f64, i64)> = conn.exec(
        "SELECT collected_by, payment_method, SUM(amount), COUNT(*) FROM payments \
         WHERE payment_date = ? GROUP BY collected_by, payment_method",
        (date,),
    ).map_err(|e| format!("Failed to query payments: {}", e))?;

    let mut summaries: Vec<DailySummary> = Vec::new();
    for (staff_id, method, total, count) in rows {
        if only_staff.map_or(false, |id| id != staff_id) {
            continue;
        }
        let idx = match summaries.iter().position(|s| s.staff_id == staff_id) {
            Some(i) => i,
            None => {
                summaries.push(DailySummary {
                    date: date.to_string(),
                    staff_id,
                    staff_name: staff_name(staff_id),
                    ..Default::default()
                });
                summaries.len() - 1
            }
        };
        let s = &mut summaries[idx];
        match method.as_str() {
            "espèces" => s.total_cash += total,
            "carte" => s.total_card += total,
            "chèque" => s.total_check += total,
            "virement" => s.total_transfer += total,
            _ => {}
        }
        s.total_collected += total;
        s.number_of_payments += count;
    }
    Ok(summaries)
}

#[tauri::command]
async fn get_daily_summary_by_staff(date: String, staff_id: i64, db_url: String) -> Result<DailySummary, String> {
    let mut found = daily_summaries(&db_url, &date, Some(staff_id))?;
    Ok(found.pop().unwrap_or_else(|| DailySummary {
        date,
        staff_id,
        staff_name: staff_name(staff_id),
        ..Default::default()
    }))
}

#[tauri::command]
async fn get_daily_summary_all_staff(date: String, db_url: String) -> Result<Vec<DailySummary>, String> {
    daily_summaries(&db_url, &date, None)
}

#[tauri::command]
fn verify_doctor_answer(answer: String) -> Result<bool, String> {
    let expected = &config::get()?.doctor_security_answer;
    Ok(answer.trim().to_lowercase() == expected.trim().to_lowercase())
}

/// French label of a tooth state (as shown on the chart), for exports.
pub fn teeth_label(status: &str) -> String {
    match status {
        "carie" => "À traiter", "soigne" => "Soignée", "devitalise" => "Dévitalisée",
        "couronne" => "Couronne", "implant" => "Implant", "absente" => "Absente", _ => "",
    }.to_string()
}

async fn mysql_port_open(host: String) -> Option<String> {
    use std::time::Duration;
    let addr = format!("{}:3306", host);
    match tokio::time::timeout(Duration::from_millis(400), tokio::net::TcpStream::connect(&addr)).await {
        Ok(Ok(_)) => Some(host),
        _ => None,
    }
}

// Probes every address of a /24 (except `skip`) for an open MySQL port, all at once.
async fn scan_subnet(prefix: [u8; 3], skip: u8) -> Option<String> {
    let probes: Vec<_> = (1..=254u8)
        .filter(|last| *last != skip)
        .map(|last| tokio::spawn(mysql_port_open(format!("{}.{}.{}.{}", prefix[0], prefix[1], prefix[2], last))))
        .collect();
    for probe in probes {
        if let Ok(Some(host)) = probe.await {
            return Some(host);
        }
    }
    None
}

// Finds the MySQL server on the local network so reception laptops need no manual IP:
// tries the remembered host, then localhost, then every address of this machine's /24.
#[tauri::command]
async fn discover_server(saved_host: Option<String>) -> Result<Option<String>, String> {
    use std::net::{IpAddr, SocketAddr, UdpSocket};

    let mut candidates: Vec<String> = Vec::new();
    if let Some(h) = saved_host.map(|h| h.trim().to_string()).filter(|h| !h.is_empty()) {
        candidates.push(h);
    }
    candidates.push("localhost".to_string());
    for host in candidates {
        if resolve_host(Some(host.clone())).is_ok() {
            if let Some(found) = mysql_port_open(host).await {
                return Ok(Some(found));
            }
        }
    }

    // Local IPv4 address: connecting a UDP socket sends nothing, it only picks the route.
    let local = UdpSocket::bind("0.0.0.0:0").ok()
        .and_then(|sock| { sock.connect(SocketAddr::from(([192, 168, 1, 1], 9))).ok()?; sock.local_addr().ok() })
        .map(|a| a.ip());
    match local {
        Some(IpAddr::V4(ip)) if ip.is_private() => {
            let o = ip.octets();
            Ok(scan_subnet([o[0], o[1], o[2]], o[3]).await)
        }
        _ => Ok(None),
    }
}

#[tauri::command]
async fn test_database_connection(db_url: String) -> Result<String, String> {
    match test_connection(&db_url).await {
        Ok(_) => Ok("Connexion réussie à la base de données".to_string()),
        Err(e) => Err(format!("Erreur de connexion: {}", e))
    }
}

#[tauri::command]
async fn reconnect_database(code: String, host: Option<String>) -> Result<AuthResult, String> {
    println!("[DEBUG] Attempting to reconnect with code: {}", code);
    
    // Re-authenticate to get fresh connection
    authenticate_user(code, host).await
}

// App configuration  
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            config::load(app.path().app_config_dir()?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            authenticate_user,
            add_patient,
            get_patients,
            update_patient,
            delete_patient,
            add_appointment,
            get_appointments,
            get_patient_appointments,
            update_appointment,
            update_appointment_status,
            delete_appointment,
            add_payment,
            get_payments_by_date,
            test_database_connection,
            reconnect_database,
            get_daily_summary_by_staff,
            get_daily_summary_all_staff,
            verify_doctor_answer,
            discover_server,
            ledger::add_treatment,
            ledger::update_treatment,
            ledger::delete_treatment,
            ledger::get_patient_treatments,
            ledger::add_treatment_payment,
            ledger::get_treatment_payments,
            ledger::delete_payment,
            ledger::get_patient_balances,
            ledger::get_next_billet_number,
            ledger::get_tooth_marks,
            ledger::set_tooth_mark,
            backup::export_backup,
            cnss::get_cnss_sheets,
            cnss::save_cnss_sheet,
            cnss::delete_cnss_sheet,
            cnss::get_settings,
            cnss::set_setting
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
// Integration tests against a real MySQL (see server/docker-compose.yml):
//   cd server && docker compose up -d
//   cd src-tauri && cargo test -- --ignored --test-threads=1
#[cfg(test)]
mod tests {
    use super::*;

    fn load_config() {
        let home = std::env::var("HOME").expect("HOME");
        config::load(std::path::PathBuf::from(format!("{}/.config/com.centre-dentaire.riad-el-ansari", home)));
    }

    fn patient(tag: &str) -> Patient {
        Patient {
            id: None,
            first_name: format!("Test{}", tag),
            last_name: "Patient".into(),
            phone: "0600000000".into(),
            billet_number: None,
            insurance: None,
            email: None,
            date_of_birth: "1990-05-17".into(),
            gender: "F".into(),
            address: None,
            allergies: Some("pénicilline".into()),
            medical_history: None,
            medications: None,
            emergency_contact: None,
            emergency_phone: None,
            notes: None,
            created_at: None,
        }
    }

    // The frontend (src/services/api.ts) converts camelCase <-> snake_case and sends `null` for
    // missing optionals. These checks pin the exact JSON shapes both ways, no database needed.
    #[test]
    fn frontend_payloads_match_backend_structs() {
        use serde_json::json;
        let patient: Patient = serde_json::from_value(json!({
            "id": null, "billet_number": "1213", "first_name": "A", "last_name": "B", "phone": "0600000000",
            "insurance": null, "date_of_birth": "", "gender": "female", "address": null, "email": null,
            "allergies": null, "medical_history": null, "medications": null, "emergency_contact": null,
            "emergency_phone": null, "notes": null
        })).expect("patient payload");
        assert_eq!(patient.billet_number.as_deref(), Some("1213"));

        let t: ledger::Treatment = serde_json::from_value(json!({
            "id": null, "patient_id": 7, "treatment_date": "2026-03-15", "tooth": "36", "act": "Composite",
            "quote": 1500, "notes": null, "created_by": 2, "total_paid": 0
        })).expect("treatment payload");
        assert_eq!((t.patient_id, t.quote), (7, 1500.0));
        // an edit sends the row back as it was read, including created_at
        serde_json::from_value::<ledger::Treatment>(json!({
            "id": 5, "patient_id": 7, "treatment_date": "2026-03-15", "tooth": "", "act": "x", "quote": 10.5,
            "notes": "n", "created_by": 2, "total_paid": 4.25, "created_at": "2026-03-15 10:00:00"
        })).expect("edited treatment payload");

        let a: Appointment = serde_json::from_value(json!({
            "id": null, "patient_id": 7, "patient_name": null, "patient_phone": null, "date": "2026-03-15",
            "time": "09:30", "treatment_type": "Consultation", "notes": null, "status": "programmé"
        })).expect("appointment payload");
        assert_eq!(a.status, "programmé");
    }

    #[test]
    fn backend_output_has_the_field_names_the_frontend_reads() {
        let keys = |v: serde_json::Value| -> std::collections::BTreeSet<String> {
            v.as_object().unwrap().keys().cloned().collect()
        };
        let want = |names: &[&str]| -> std::collections::BTreeSet<String> { names.iter().map(|s| s.to_string()).collect() };

        let t = ledger::Treatment { id: Some(1), patient_id: 2, treatment_date: "2026-01-01".into(), tooth: "".into(),
            act: "a".into(), quote: 1.0, notes: None, created_by: 1, total_paid: 0.0, created_at: None };
        assert_eq!(keys(serde_json::to_value(t).unwrap()), want(&["id", "patient_id", "treatment_date", "tooth", "act",
            "quote", "notes", "created_by", "total_paid", "created_at"]));

        let b = ledger::PatientBalance { patient_id: 1, total_quote: 1.0, total_paid: 0.0 };
        assert_eq!(keys(serde_json::to_value(b).unwrap()), want(&["patient_id", "total_quote", "total_paid"]));

        let p = ledger::TreatmentPayment { id: 1, treatment_id: 1, amount: 1.0, payment_method: "espèces".into(),
            payment_date: "2026-01-01".into(), collected_by: 1 };
        assert_eq!(keys(serde_json::to_value(p).unwrap()), want(&["id", "treatment_id", "amount", "payment_method",
            "payment_date", "collected_by"]));

        let s = DailySummary::default();
        assert_eq!(keys(serde_json::to_value(s).unwrap()), want(&["date", "staff_id", "staff_name", "total_cash",
            "total_card", "total_check", "total_transfer", "total_collected", "number_of_payments"]));

        let auth = AuthResult { user: User { id: Some(1), name: "n".into(), code: String::new(), role: "doctor".into(),
            is_active: true, created_at: None }, db_url: "x".into() };
        let v = serde_json::to_value(auth).unwrap();
        assert!(v.get("db_url").is_some());
        assert_eq!(keys(v["user"].clone()), want(&["id", "name", "code", "role", "is_active", "created_at"]));
    }

    #[test]
    fn fdi_tooth_numbers() {
        for ok in ["11", "18", "28", "36", "48", "51", "55", "65", "75", "85"] {
            assert!(ledger::valid_tooth(ok), "{}", ok);
        }
        for bad in ["", "1", "10", "19", "29", "39", "49", "56", "66", "76", "86", "91", "00", "3a", "111", " 36"] {
            assert!(!ledger::valid_tooth(bad), "{:?}", bad);
        }
    }

    #[tokio::test]
    #[ignore]
    async fn tooth_marks_upsert_and_validation() {
        let (doc, rec, doc_id, rec_id) = sessions().await;
        let pid = add_patient(patient("Teeth"), rec.db_url.clone()).await.unwrap();
        let mark = |tooth: &str, status: &str, note: Option<&str>, by: i64| ledger::ToothMark {
            patient_id: pid, tooth: tooth.into(), status: status.into(), note: note.map(String::from), updated_by: by, updated_at: None,
        };

        ledger::set_tooth_mark(mark("36", "soigne", Some("composite occlusal"), rec_id), rec.db_url.clone()).await.unwrap();
        ledger::set_tooth_mark(mark("46", "absente", None, doc_id), doc.db_url.clone()).await.unwrap();
        // same tooth again = update, not a duplicate row
        ledger::set_tooth_mark(mark("36", "couronne", Some("couronne posée"), doc_id), doc.db_url.clone()).await.unwrap();

        let marks = ledger::get_tooth_marks(pid, rec.db_url.clone()).await.unwrap();
        assert_eq!(marks.len(), 2);
        let m36 = marks.iter().find(|m| m.tooth == "36").unwrap();
        assert_eq!((m36.status.as_str(), m36.note.as_deref(), m36.updated_by), ("couronne", Some("couronne posée"), doc_id));
        assert!(m36.updated_at.as_deref().unwrap_or("").len() >= 10);

        // clearing keeps the row but empties it (reception has no DELETE privilege)
        ledger::set_tooth_mark(mark("46", "", None, rec_id), rec.db_url.clone()).await.unwrap();
        let m46 = ledger::get_tooth_marks(pid, doc.db_url.clone()).await.unwrap().into_iter().find(|m| m.tooth == "46").unwrap();
        assert_eq!((m46.status.as_str(), m46.note), ("", None));

        for (t, s) in [("99", "soigne"), ("3", "soigne"), ("36", "inconnu"), ("56", "")] {
            assert!(ledger::set_tooth_mark(mark(t, s, None, rec_id), rec.db_url.clone()).await.is_err(), "{} {}", t, s);
        }
        // a multi-tooth designation on an act is stored as typed
        let mut act = treatment(pid, rec_id, 100.0);
        act.tooth = "36, 37, 46".into();
        let id = ledger::add_treatment(act, 0.0, "espèces".into(), rec.db_url.clone()).await.unwrap();
        assert_eq!(ledger::get_patient_treatments(pid, rec.db_url.clone()).await.unwrap()[0].tooth, "36, 37, 46");
        ledger::delete_treatment(id, doc.db_url.clone()).await.unwrap();
        let mut too_long = treatment(pid, rec_id, 1.0);
        too_long.tooth = "11, ".repeat(40);
        assert!(ledger::add_treatment(too_long, 0.0, "espèces".into(), rec.db_url.clone()).await.is_err());

        // patient cleanup: tooth marks are not financial history, so remove them first
        let pool = Pool::new(doc.db_url.as_str()).unwrap();
        pool.get_conn().unwrap().exec_drop("DELETE FROM tooth_marks WHERE patient_id = ?", (pid,)).unwrap();
        delete_patient(pid, doc.db_url.clone()).await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn excel_backup_is_written_and_readable() {
        let (doc, rec, _, rec_id) = sessions().await;
        let pid = add_patient(patient("Backup"), rec.db_url.clone()).await.unwrap();
        let id = ledger::add_treatment(treatment(pid, rec_id, 300.0), 100.0, "espèces".into(), rec.db_url.clone()).await.unwrap();

        let dir = std::env::temp_dir().join(format!("cabinet-backup-test-{}", std::process::id()));
        let staff: Vec<(i64, String)> = config::get().unwrap().users.iter().map(|u| (u.id, u.name.clone())).collect();
        let result = backup::write_backup(&dir, &doc.db_url, &staff).expect("backup");
        assert!(result.path.ends_with(".xlsx") && result.treatments >= 1 && result.patients >= 1);

        // an .xlsx is a zip: check the sheets exist and today's data is inside
        let file = std::fs::File::open(&result.path).unwrap();
        let mut zip = zip::ZipArchive::new(file).unwrap();
        let mut workbook = String::new();
        std::io::Read::read_to_string(&mut zip.by_name("xl/workbook.xml").unwrap(), &mut workbook).unwrap();
        for sheet in ["Résumé", "Patients", "Actes", "Paiements", "Rendez-vous", "Dents"] {
            assert!(workbook.contains(sheet), "sheet {} missing", sheet);
        }
        let mut strings = String::new();
        std::io::Read::read_to_string(&mut zip.by_name("xl/sharedStrings.xml").unwrap(), &mut strings).unwrap();
        assert!(strings.contains("TestBackup") && strings.contains("Dévitalisation"), "patient/act missing from the workbook");
        // the passwords never end up in the file
        assert!(!strings.contains(&config::get().unwrap().users[0].mysql_password));

        // running it twice the same day replaces the file instead of piling up copies
        let again = backup::write_backup(&dir, &doc.db_url, &staff).unwrap();
        assert_eq!(again.path, result.path);
        assert_eq!(std::fs::read_dir(&dir).unwrap().filter(|e| e.as_ref().unwrap().path().extension().map_or(false, |x| x == "xlsx")).count(), 1);

        std::fs::remove_dir_all(&dir).ok();
        ledger::delete_treatment(id, doc.db_url.clone()).await.unwrap();
        delete_patient(pid, doc.db_url.clone()).await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn cnss_sheets_and_settings() {
        let (doc, rec, _, rec_id) = sessions().await;
        let pid = add_patient(patient("Cnss"), rec.db_url.clone()).await.unwrap();
        let sheet = |id: Option<i64>, data: &str| cnss::CnssSheet {
            id, patient_id: pid, label: "Soins du 12/03".into(), data: data.into(), created_by: rec_id, created_at: None, updated_at: None,
        };

        let id = cnss::save_cnss_sheet(sheet(None, r#"{"immat":"123456789","acts":[{"teeth":"36"}]}"#), rec.db_url.clone()).await.unwrap();
        cnss::save_cnss_sheet(sheet(Some(id), r#"{"immat":"987654321"}"#), rec.db_url.clone()).await.unwrap();
        let other = cnss::save_cnss_sheet(sheet(None, "{}"), doc.db_url.clone()).await.unwrap();

        let list = cnss::get_cnss_sheets(pid, rec.db_url.clone()).await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, Some(other), "newest first");
        assert!(list.iter().find(|s| s.id == Some(id)).unwrap().data.contains("987654321"), "update replaced the data");

        // only valid JSON is accepted
        assert!(cnss::save_cnss_sheet(sheet(None, "not json"), rec.db_url.clone()).await.is_err());
        // reception cannot delete a sheet, the doctor can
        assert!(cnss::delete_cnss_sheet(id, rec.db_url.clone()).await.is_err());
        cnss::delete_cnss_sheet(id, doc.db_url.clone()).await.unwrap();
        cnss::delete_cnss_sheet(other, doc.db_url.clone()).await.unwrap();
        assert!(cnss::get_cnss_sheets(pid, doc.db_url.clone()).await.unwrap().is_empty());

        // settings: whitelist, upsert, trimmed
        cnss::set_setting("cnss_inp".into(), " 123456789 ".into(), rec.db_url.clone()).await.unwrap();
        cnss::set_setting("cnss_inp".into(), "111222333".into(), doc.db_url.clone()).await.unwrap();
        cnss::set_setting("cnss_city".into(), "Meknès".into(), doc.db_url.clone()).await.unwrap();
        let settings = cnss::get_settings(rec.db_url.clone()).await.unwrap();
        assert_eq!(settings.get("cnss_inp").map(String::as_str), Some("111222333"));
        assert_eq!(settings.get("cnss_city").map(String::as_str), Some("Meknès"));
        assert!(cnss::set_setting("mysql_password".into(), "x".into(), doc.db_url.clone()).await.is_err());
        delete_patient(pid, doc.db_url.clone()).await.unwrap();
    }

    #[test]
    fn host_validation() {
        assert_eq!(resolve_host(None).unwrap(), "localhost");
        assert_eq!(resolve_host(Some(" 192.168.1.10 ".into())).unwrap(), "192.168.1.10");
        assert!(resolve_host(Some("a@evil/db".into())).is_err());
        assert!(resolve_host(Some("host?x=1".into())).is_err());
    }

    #[tokio::test]
    #[ignore]
    async fn auth_roles_and_bad_code() {
        load_config();
        let cfg = config::get().unwrap();
        let doc = cfg.users.iter().find(|u| u.role == "doctor").unwrap();
        let rec = cfg.users.iter().find(|u| u.role == "reception").unwrap();

        let d = authenticate_user(doc.code.clone(), Some("localhost".into())).await.unwrap();
        assert_eq!(d.user.role, "doctor");
        assert!(d.user.code.is_empty(), "code must not be sent to the frontend");
        let r = authenticate_user(rec.code.clone(), None).await.unwrap();
        assert_eq!(r.user.role, "reception");
        assert!(authenticate_user("0000".into(), None).await.is_err());
        // unreachable server => clear DB error, not a hang
        assert!(authenticate_user(doc.code.clone(), Some("127.0.0.1:1".into())).await.is_err());
        assert!(verify_doctor_answer(cfg.doctor_security_answer.to_uppercase()).unwrap());
        assert!(!verify_doctor_answer("nope".into()).unwrap());
    }

    #[tokio::test]
    #[ignore]
    async fn patient_and_appointment_lifecycle_with_role_privileges() {
        load_config();
        let cfg = config::get().unwrap();
        let doc = authenticate_user(cfg.users.iter().find(|u| u.role == "doctor").unwrap().code.clone(), None).await.unwrap();
        let rec = authenticate_user(cfg.users.iter().find(|u| u.role == "reception").unwrap().code.clone(), None).await.unwrap();

        // reception adds + edits a patient; another connection (doctor) sees it => shared data
        let id = add_patient(patient("Life"), rec.db_url.clone()).await.unwrap();
        let seen = get_patients(doc.db_url.clone()).await.unwrap();
        let p = seen.iter().find(|p| p.id == Some(id)).expect("doctor sees reception's patient");
        assert_eq!(p.date_of_birth, "1990-05-17");
        assert_eq!(p.allergies.as_deref(), Some("pénicilline"));

        let mut edited = patient("Edited");
        edited.phone = "0611111111".into();
        update_patient(id, edited, rec.db_url.clone()).await.unwrap();
        let p = get_patients(doc.db_url.clone()).await.unwrap().into_iter().find(|p| p.id == Some(id)).unwrap();
        assert_eq!((p.first_name.as_str(), p.phone.as_str()), ("TestEdited", "0611111111"));

        // appointment: add, change status, list per patient
        let apt = Appointment {
            id: None, patient_id: id, patient_name: None, patient_phone: None,
            date: "2030-01-15".into(), time: "09:30".into(), treatment_type: "Détartrage".into(),
            notes: None, status: "programmé".into(), created_at: None,
        };
        let apt_id = add_appointment(apt, rec.db_url.clone()).await.unwrap();
        // reschedule + edit from reception
        let mut moved = get_patient_appointments(id, rec.db_url.clone()).await.unwrap().remove(0);
        moved.date = "2030-01-16".into();
        moved.time = "14:00".into();
        moved.notes = Some("à rappeler".into());
        update_appointment(apt_id, moved, rec.db_url.clone()).await.unwrap();
        let after = get_patient_appointments(id, rec.db_url.clone()).await.unwrap().remove(0);
        assert_eq!((after.date.as_str(), after.time.as_str(), after.notes.as_deref()), ("2030-01-16", "14:00", Some("à rappeler")));
        update_appointment_status(apt_id, "terminé".into(), doc.db_url.clone()).await.unwrap();
        let mine = get_patient_appointments(id, rec.db_url.clone()).await.unwrap();
        assert_eq!(mine.len(), 1);
        assert_eq!(mine[0].status, "terminé");
        assert_eq!(mine[0].patient_name.as_deref(), Some("TestEdited Patient"));
        assert!(get_appointments(rec.db_url.clone()).await.unwrap().iter().any(|a| a.id == Some(apt_id)));

        // DB-level privileges: reception may delete appointments but never patients
        assert!(delete_patient(id, rec.db_url.clone()).await.is_err(), "reception must not delete patients");
        delete_appointment(apt_id, rec.db_url.clone()).await.unwrap();
        assert!(get_patient_appointments(id, rec.db_url.clone()).await.unwrap().is_empty());
        delete_patient(id, doc.db_url.clone()).await.unwrap();
        assert!(get_patients(doc.db_url.clone()).await.unwrap().iter().all(|p| p.id != Some(id)));
    }

    #[tokio::test]
    #[ignore]
    async fn payments_and_daily_summaries() {
        load_config();
        let cfg = config::get().unwrap();
        let doc_u = cfg.users.iter().find(|u| u.role == "doctor").unwrap();
        let rec_u = cfg.users.iter().find(|u| u.role == "reception").unwrap();
        let doc = authenticate_user(doc_u.code.clone(), None).await.unwrap();
        let rec = authenticate_user(rec_u.code.clone(), None).await.unwrap();

        let pid = add_patient(patient("Pay"), rec.db_url.clone()).await.unwrap();
        let date = "2031-02-03".to_string();
        let pay = |amount: f64, method: &str, by: i64| Payment {
            id: None, patient_id: pid, appointment_id: None, treatment_id: None, patient_name: None, treatment_act: None, amount, payment_method: method.into(),
            notes: None, collected_by: by, payment_date: "2031-02-03".into(), created_at: None,
        };
        add_payment(pay(200.0, "espèces", rec_u.id), rec.db_url.clone()).await.unwrap();
        add_payment(pay(150.5, "carte", rec_u.id), rec.db_url.clone()).await.unwrap();
        add_payment(pay(500.0, "chèque", doc_u.id), doc.db_url.clone()).await.unwrap();

        assert_eq!(get_payments_by_date(date.clone(), doc.db_url.clone()).await.unwrap().len(), 3);

        let mine = get_daily_summary_by_staff(date.clone(), rec_u.id, rec.db_url.clone()).await.unwrap();
        assert_eq!((mine.total_cash, mine.total_card, mine.total_collected, mine.number_of_payments), (200.0, 150.5, 350.5, 2));
        assert_eq!(mine.staff_name, rec_u.name);
        let all = get_daily_summary_all_staff(date.clone(), doc.db_url.clone()).await.unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all.iter().find(|s| s.staff_id == doc_u.id).unwrap().total_check, 500.0);
        let none = get_daily_summary_by_staff("2000-01-01".into(), rec_u.id, rec.db_url.clone()).await.unwrap();
        assert_eq!(none.total_collected, 0.0);

        // cleanup: payments have no delete command, so remove via root-free doctor connection
        let pool = Pool::new(doc.db_url.as_str()).unwrap();
        let mut conn = pool.get_conn().unwrap();
        conn.exec_drop("DELETE FROM payments WHERE payment_date = ?", (date,)).unwrap();
        delete_patient(pid, doc.db_url.clone()).await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn discovery_finds_server() {
        // localhost fast path
        assert_eq!(discover_server(None).await.unwrap().as_deref(), Some("localhost"));
        // a stale saved IP is skipped, not trusted
        assert_eq!(discover_server(Some("10.255.255.1".into())).await.unwrap().as_deref(), Some("localhost"));
        // subnet scan: the published port also answers on 127.0.0.x, so scanning 127.0.0.0/24 must find it
        let found = scan_subnet([127, 0, 0], 99).await.expect("scan should find a listener");
        assert!(found.starts_with("127.0.0."));
        // nothing listening on an unused private range => None
        assert_eq!(scan_subnet([10, 254, 253], 1).await, None);
    }

    fn treatment(pid: i64, by: i64, quote: f64) -> ledger::Treatment {
        ledger::Treatment {
            id: None, patient_id: pid, treatment_date: "2029-03-10".into(), tooth: "36".into(),
            act: "Dévitalisation".into(), quote, notes: None, created_by: by, total_paid: 0.0, created_at: None,
        }
    }

    async fn sessions() -> (AuthResult, AuthResult, i64, i64) {
        load_config();
        let cfg = config::get().unwrap();
        let d = cfg.users.iter().find(|u| u.role == "doctor").unwrap();
        let r = cfg.users.iter().find(|u| u.role == "reception").unwrap();
        (
            authenticate_user(d.code.clone(), None).await.unwrap(),
            authenticate_user(r.code.clone(), None).await.unwrap(),
            d.id, r.id,
        )
    }

    #[tokio::test]
    #[ignore]
    async fn billet_numbers_are_unique_and_auto_numbered() {
        let (doc, rec, _, _) = sessions().await;
        // (first ever patient: MAX() is NULL) -> "1" is only checked while the table is empty
        let existing = get_patients(doc.db_url.clone()).await.unwrap();
        if existing.iter().all(|p| p.billet_number.is_none()) {
            assert_eq!(ledger::get_next_billet_number(rec.db_url.clone()).await.unwrap(), "1");
        }
        let next: i64 = ledger::get_next_billet_number(rec.db_url.clone()).await.unwrap().parse().unwrap();
        let mut a = patient("BilletA");
        a.billet_number = Some(format!("{}", next + 5000));
        a.insurance = Some("CNSS".into());
        let id_a = add_patient(a.clone(), rec.db_url.clone()).await.unwrap();
        let got = get_patients(doc.db_url.clone()).await.unwrap().into_iter().find(|p| p.id == Some(id_a)).unwrap();
        assert_eq!((got.billet_number.as_deref(), got.insurance.as_deref()), (a.billet_number.as_deref(), Some("CNSS")));
        // the next suggested number follows the highest one
        let after: i64 = ledger::get_next_billet_number(rec.db_url.clone()).await.unwrap().parse().unwrap();
        assert_eq!(after, next + 5001);
        // same billet twice => friendly error, in add and in update
        let err = add_patient(a.clone(), rec.db_url.clone()).await.unwrap_err();
        assert_eq!(err, "Ce numéro de billet existe déjà");
        // blank billets never collide
        let id_b = add_patient(patient("NoBilletB"), rec.db_url.clone()).await.unwrap();
        let id_c = add_patient(patient("NoBilletC"), rec.db_url.clone()).await.unwrap();
        let mut b = patient("NoBilletB");
        b.billet_number = a.billet_number.clone();
        assert_eq!(update_patient(id_b, b, rec.db_url.clone()).await.unwrap_err(), "Ce numéro de billet existe déjà");
        for id in [id_a, id_b, id_c] {
            delete_patient(id, doc.db_url.clone()).await.unwrap();
        }
    }

    #[tokio::test]
    #[ignore]
    async fn ledger_lines_payments_and_balances() {
        let (doc, rec, doc_id, rec_id) = sessions().await;
        let pid = add_patient(patient("Ledger"), rec.db_url.clone()).await.unwrap();

        // line 1: quote 1000, 400 paid in cash at the visit (a paper row being re-entered)
        let t1 = ledger::add_treatment(treatment(pid, rec_id, 1000.0), 400.0, "espèces".into(), rec.db_url.clone()).await.unwrap();
        // line 2: quote 250, nothing paid yet
        let mut second = treatment(pid, rec_id, 250.0);
        second.treatment_date = "2029-04-02".into();
        second.act = "Détartrage".into();
        let t2 = ledger::add_treatment(second, 0.0, "espèces".into(), rec.db_url.clone()).await.unwrap();

        let lines = ledger::get_patient_treatments(pid, doc.db_url.clone()).await.unwrap();
        assert_eq!(lines.len(), 2);
        assert_eq!((lines[0].id, lines[0].quote, lines[0].total_paid), (Some(t1), 1000.0, 400.0));
        assert_eq!((lines[1].id, lines[1].total_paid), (Some(t2), 0.0));
        let bal = ledger::get_patient_balances(doc.db_url.clone()).await.unwrap().into_iter().find(|b| b.patient_id == pid).unwrap();
        assert_eq!((bal.total_quote, bal.total_paid), (1250.0, 400.0));

        // paying the rest later; overpaying is refused
        ledger::add_treatment_payment(t1, 300.0, "carte".into(), "2029-03-20".into(), rec_id, rec.db_url.clone()).await.unwrap();
        let over = ledger::add_treatment_payment(t1, 400.0, "espèces".into(), "2029-03-21".into(), rec_id, rec.db_url.clone()).await.unwrap_err();
        assert!(over.contains("dépasse"), "{}", over);
        ledger::add_treatment_payment(t1, 300.0, "chèque".into(), "2029-03-22".into(), doc_id, doc.db_url.clone()).await.unwrap();
        let pays = ledger::get_treatment_payments(t1, rec.db_url.clone()).await.unwrap();
        assert_eq!(pays.iter().map(|p| p.amount).sum::<f64>(), 1000.0);
        assert_eq!(pays.len(), 3);

        // historic payments land on their own day in the daily caisse
        let day = get_daily_summary_by_staff("2029-03-20".into(), rec_id, rec.db_url.clone()).await.unwrap();
        assert_eq!((day.total_card, day.total_collected), (300.0, 300.0));
        let listed = get_payments_by_date("2029-03-20".into(), doc.db_url.clone()).await.unwrap();
        assert_eq!(listed[0].patient_name.as_deref(), Some("TestLedger Patient"));
        assert_eq!(listed[0].treatment_id, Some(t1));
        assert_eq!(listed[0].treatment_act.as_deref(), Some("Dévitalisation"));

        // quote can't drop below what was already paid, but can go up
        let mut edit = lines[0].clone();
        edit.quote = 900.0;
        assert!(ledger::update_treatment(edit.clone(), rec.db_url.clone()).await.unwrap_err().contains("inférieur"));
        edit.quote = 1200.0;
        edit.act = "Dévitalisation + couronne".into();
        ledger::update_treatment(edit, rec.db_url.clone()).await.unwrap();
        assert_eq!(ledger::get_patient_treatments(pid, rec.db_url.clone()).await.unwrap()[0].quote, 1200.0);

        // a patient with a ledger can't be deleted at all
        assert!(delete_patient(pid, doc.db_url.clone()).await.unwrap_err().contains("suppression impossible"));

        // corrections are doctor-only (reception MySQL account has no DELETE on these tables)
        assert!(ledger::delete_payment(pays[0].id, rec.db_url.clone()).await.is_err());
        assert!(ledger::delete_treatment(t1, rec.db_url.clone()).await.is_err());
        ledger::delete_payment(pays[0].id, doc.db_url.clone()).await.unwrap();
        assert_eq!(ledger::get_treatment_payments(t1, doc.db_url.clone()).await.unwrap().len(), 2);
        ledger::delete_treatment(t1, doc.db_url.clone()).await.unwrap();
        ledger::delete_treatment(t2, doc.db_url.clone()).await.unwrap();
        assert!(ledger::get_treatment_payments(t1, doc.db_url.clone()).await.unwrap().is_empty());
        delete_patient(pid, doc.db_url.clone()).await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn ledger_input_validation() {
        let (doc, rec, _, rec_id) = sessions().await;
        let pid = add_patient(patient("Valid"), rec.db_url.clone()).await.unwrap();
        let add = |t: ledger::Treatment, paid: f64, m: &str| {
            let url = rec.db_url.clone();
            let m = m.to_string();
            async move { ledger::add_treatment(t, paid, m, url).await }
        };
        let mut no_act = treatment(pid, rec_id, 100.0);
        no_act.act = "  ".into();
        assert!(add(no_act, 0.0, "espèces").await.is_err());
        let mut bad_date = treatment(pid, rec_id, 100.0);
        bad_date.treatment_date = "10/03/2029".into();
        assert!(add(bad_date, 0.0, "espèces").await.is_err());
        assert!(add(treatment(pid, rec_id, -5.0), 0.0, "espèces").await.is_err());
        assert!(add(treatment(pid, rec_id, 100.0), 150.0, "espèces").await.unwrap_err().contains("dépasse"));
        assert!(add(treatment(pid, rec_id, 100.0), 50.0, "bitcoin").await.is_err());
        assert!(add(treatment(pid, rec_id, 100.0), f64::NAN, "espèces").await.is_err());
        // nothing was written by any of the rejected calls
        assert!(ledger::get_patient_treatments(pid, doc.db_url.clone()).await.unwrap().is_empty());
        delete_patient(pid, doc.db_url.clone()).await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn two_laptops_paying_the_same_line_cannot_overpay() {
        let (doc, rec, _, rec_id) = sessions().await;
        let pid = add_patient(patient("Race"), rec.db_url.clone()).await.unwrap();
        let t = ledger::add_treatment(treatment(pid, rec_id, 500.0), 100.0, "espèces".into(), rec.db_url.clone()).await.unwrap();
        // 400 left; two simultaneous payments of 300 -> exactly one may succeed
        let (a, b) = tokio::join!(
            ledger::add_treatment_payment(t, 300.0, "espèces".into(), "2029-05-01".into(), rec_id, rec.db_url.clone()),
            ledger::add_treatment_payment(t, 300.0, "carte".into(), "2029-05-01".into(), rec_id, doc.db_url.clone()),
        );
        assert_eq!(a.is_ok() as u8 + b.is_ok() as u8, 1, "a={:?} b={:?}", a, b);
        let paid = ledger::get_patient_treatments(pid, rec.db_url.clone()).await.unwrap()[0].total_paid;
        assert_eq!(paid, 400.0);
        ledger::delete_treatment(t, doc.db_url.clone()).await.unwrap();
        delete_patient(pid, doc.db_url.clone()).await.unwrap();
    }
}
