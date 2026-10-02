use serde::{Deserialize, Serialize};
use mysql::*;
use mysql::prelude::*;

// ----------------------------------------------------------------------------------------------------------------------
// MYSQL CONNECTION & CREDENTIAL CONSTANTS
// ----------------------------------------------------------------------------------------------------------------------

// Connection & Credential Constants
const SERVER_IP: &str = "localhost";
const DB_NAME: &str = "cabinet";

// Mapping of User Roles to their Full MySQL Credentials (for dynamic connection)
const USER_CREDENTIALS: [(&str, &str, &str); 3] = [
    // (Role in DB, MySQL Username, MySQL Password)
    ("doctor", "guestx", "2016_2026guestx"),
    ("reception", "reception", "reception@docali"),
    ("staff", "assistant", "assistant@docali"), 
];

fn get_dynamic_url(username: &str, password: &str) -> String {
    format!("mysql://{}:{}@{}/{}", username, password, SERVER_IP, DB_NAME)
}

// Test database connection
async fn test_connection(db_url: &str) -> Result<(), String> {
    println!("[DEBUG] Testing connection to: {}", db_url);
    
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailySummary {
    pub staff_id: i64,
    pub staff_name: String,
    pub date: String,
    pub total_amount: f64,
    pub transaction_count: i64,
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
async fn authenticate_user(code: String) -> Result<AuthResult, String> {
    println!("[DEBUG] Authenticating user with code: {}", code);
    
    // For now, use mock authentication since the tauri-plugin-sql setup is complex
    // TODO: Implement proper MySQL authentication once plugin is properly configured
    let user = match code.as_str() {
        "1234" => User {
            id: Some(1),
            name: "Dr. El Ansari".to_string(),
            code: code.clone(),
            role: "doctor".to_string(),
            is_active: true,
            created_at: None,
        },
        "5678" => User {
            id: Some(2),
            name: "Réception Principale".to_string(),
            code: code.clone(),
            role: "reception".to_string(),
            is_active: true,
            created_at: None,
        },
        "9012" => User {
            id: Some(3),
            name: "Assistant(e)".to_string(),
            code: code.clone(),
            role: "staff".to_string(),
            is_active: true,
            created_at: None,
        },
        _ => {
            return Err("Code invalide ou utilisateur inactif".to_string());
        }
    };

    // Find the corresponding full credentials from USER_CREDENTIALS
    let credentials = USER_CREDENTIALS.iter()
        .find(|(role, _, _)| *role == user.role)
        .ok_or_else(|| format!("Unknown role: {}", user.role))?;

    let dynamic_url = get_dynamic_url(credentials.1, credentials.2);
    
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
    println!("[DEBUG] Using connection: {}", db_url);
    
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
    println!("[DEBUG] Using connection: {}", db_url);
    
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
async fn update_patient(id: i64, _patient: Patient, db_url: String) -> Result<(), String> {
    println!("[DEBUG] Updating patient {} in MySQL", id);
    println!("[DEBUG] Using connection: {}", db_url);
    
    // TODO: Implement actual MySQL update
    println!("[DEBUG] Patient would be updated in MySQL");
    Ok(())
}

#[tauri::command]
async fn delete_patient(id: i64, db_url: String) -> Result<(), String> {
    println!("[DEBUG] Deleting patient {} from MySQL", id);
    println!("[DEBUG] Using connection: {}", db_url);
    
    // TODO: Implement actual MySQL deletion
    println!("[DEBUG] Patient would be deleted from MySQL");
    Ok(())
}

#[tauri::command]
async fn add_appointment(appointment: Appointment, db_url: String) -> Result<i64, String> {
    println!("[DEBUG] Adding appointment to MySQL: {:?}", appointment);
    println!("[DEBUG] Using connection: {}", db_url);
    
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
            // Fall back to mock behavior if database fails
            println!("[DEBUG] Falling back to mock appointment ID");
            Ok(1i64)
        }
    }
}

#[tauri::command]
async fn get_appointments(db_url: String) -> Result<Vec<Appointment>, String> {
    println!("[DEBUG] Fetching appointments from MySQL database...");
    println!("[DEBUG] Using connection: {}", db_url);
    
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
    println!("[DEBUG] Fetching appointments for patient {} from MySQL", patient_id);
    println!("[DEBUG] Using connection: {}", db_url);
    
    // TODO: Implement actual MySQL query
    let appointments = Vec::new();
    
    println!("[DEBUG] Found {} appointments for patient (mock)", appointments.len());
    Ok(appointments)
}

#[tauri::command]
async fn update_appointment_status(id: i64, status: String, db_url: String) -> Result<(), String> {
    println!("[DEBUG] Updating appointment {} status to {} in MySQL", id, status);
    println!("[DEBUG] Using connection: {}", db_url);
    
    // TODO: Implement actual MySQL update
    println!("[DEBUG] Appointment status would be updated in MySQL");
    Ok(())
}

#[tauri::command]
async fn delete_appointment(id: i64, db_url: String) -> Result<(), String> {
    println!("[DEBUG] Deleting appointment {} from MySQL", id);
    println!("[DEBUG] Using connection: {}", db_url);
    
    // TODO: Implement actual MySQL deletion
    println!("[DEBUG] Appointment would be deleted from MySQL");
    Ok(())
}

#[tauri::command]
async fn add_payment(payment: Payment, db_url: String) -> Result<i64, String> {
    println!("[DEBUG] Adding payment to MySQL: {:?}", payment);
    println!("[DEBUG] Using connection: {}", db_url);
    
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
    println!("[DEBUG] Using connection: {}", db_url);
    
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

#[tauri::command]
async fn test_database_connection(db_url: String) -> Result<String, String> {
    match test_connection(&db_url).await {
        Ok(_) => Ok("Connexion réussie à la base de données".to_string()),
        Err(e) => Err(format!("Erreur de connexion: {}", e))
    }
}

#[tauri::command]
async fn reconnect_database(code: String) -> Result<AuthResult, String> {
    println!("[DEBUG] Attempting to reconnect with code: {}", code);
    
    // Re-authenticate to get fresh connection
    authenticate_user(code).await
}

// App configuration  
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            reconnect_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}