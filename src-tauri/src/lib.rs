mod config;

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
        (first_name, last_name, phone, email, date_of_birth, gender, address, allergies, medical_history, medications, emergency_contact, emergency_phone, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ";
    
    // Build parameter values
    let mut params: Vec<mysql::Value> = Vec::new();
    params.push(patient.first_name.into());
    params.push(patient.last_name.into());
    params.push(patient.phone.into());
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
            let error_msg = format!("Erreur lors de l'insertion en base de données: {}", e);
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
    let query = "SELECT id, first_name, last_name, phone, email, date_of_birth, gender, address, allergies, medical_history, medications, emergency_contact, emergency_phone, notes, created_at FROM patients ORDER BY created_at DESC";
    
    let patients_result: Result<Vec<Patient>, mysql::Error> = conn.query_map(query, |mut row: mysql::Row| {
        Patient {
            id: Some(row.take::<i64, _>("id").unwrap_or(0)),
            first_name: row.take::<String, _>("first_name").unwrap_or_default(),
            last_name: row.take::<String, _>("last_name").unwrap_or_default(),
            phone: row.take::<String, _>("phone").unwrap_or_default(),
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
        r"UPDATE patients SET first_name = ?, last_name = ?, phone = ?, email = ?, date_of_birth = ?, gender = ?,
          address = ?, allergies = ?, medical_history = ?, medications = ?, emergency_contact = ?,
          emergency_phone = ?, notes = ? WHERE id = ?",
        Params::Positional(vec![
            patient.first_name.into(), patient.last_name.into(), patient.phone.into(), patient.email.into(),
            patient.date_of_birth.into(), patient.gender.into(), patient.address.into(), patient.allergies.into(),
            patient.medical_history.into(), patient.medications.into(), patient.emergency_contact.into(),
            patient.emergency_phone.into(), patient.notes.into(), id.into(),
        ]),
    ).map_err(|e| format!("Erreur lors de la modification du patient: {}", e))
}

#[tauri::command]
async fn delete_patient(id: i64, db_url: String) -> Result<(), String> {
    let mut conn = get_connection_with_retry(&db_url, 3).await?;
    conn.exec_drop("DELETE FROM patients WHERE id = ?", (id,))
        .map_err(|e| format!("Erreur lors de la suppression du patient: {}", e))
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
        (appointment_id, patient_id, amount, payment_method, collected_by, notes, payment_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    ";
    
    // Build parameter values
    let mut params: Vec<mysql::Value> = Vec::new();
    params.push(payment.appointment_id.into());
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
    println!("[DEBUG] Fetching payments for date {} from MySQL", date);
    
    // Connect to MySQL with auto-retry
    match get_connection_with_retry(&db_url, 3).await {
        Ok(mut conn) => {
            // Query payments from MySQL with patient and staff info
            let query = r"
                SELECT 
                    p.id, 
                    p.appointment_id, 
                    p.patient_id, 
                    p.amount, 
                    p.payment_method, 
                    p.collected_by, 
                    p.notes, 
                    p.payment_date, 
                    p.created_at
                FROM payments p 
                WHERE p.payment_date = ?
                ORDER BY p.created_at DESC
            ";
            
            let payments_result: Result<Vec<Payment>, mysql::Error> = conn.exec_map(query, (date,), |mut row: mysql::Row| {
                Payment {
                    id: Some(row.take::<i64, _>("id").unwrap_or(0)),
                    appointment_id: row.take::<Option<i64>, _>("appointment_id").unwrap_or(None),
                    patient_id: row.take::<i64, _>("patient_id").unwrap_or(0),
                    amount: row.take::<f64, _>("amount").unwrap_or(0.0),
                    payment_method: row.take::<String, _>("payment_method").unwrap_or_default(),
                    collected_by: row.take::<i64, _>("collected_by").unwrap_or(0),
                    notes: row.take::<Option<String>, _>("notes").unwrap_or(None),
                    payment_date: row.take::<String, _>("payment_date").unwrap_or_default(),
                    created_at: row.take::<Option<String>, _>("created_at").unwrap_or(None),
                }
            });
            
            match payments_result {
                Ok(payments) => {
                    println!("[DEBUG] Found {} payments", payments.len());
                    Ok(payments)
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
            update_appointment_status,
            delete_appointment,
            add_payment,
            get_payments_by_date,
            test_database_connection,
            reconnect_database,
            get_daily_summary_by_staff,
            get_daily_summary_all_staff,
            verify_doctor_answer,
            discover_server
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
            id: None, patient_id: pid, appointment_id: None, amount, payment_method: method.into(),
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
}
