use serde::{Deserialize, Serialize};
use tauri_plugin_sql::{Database, Migration, MigrationKind};

// ----------------------------------------------------------------------------------------------------------------------
// MYSQL CONNECTION & CREDENTIAL CONSTANTS
// ----------------------------------------------------------------------------------------------------------------------

// Connection & Credential Constants
const SERVER_IP: &str = "192.168.1.50";
const DB_NAME: &str = "cabinet";

// Dedicated Low-Privilege User (for initial authentication query ONLY)
const LOGIN_USER: &str = "app_login";
const LOGIN_PASS: &str = "<MOT_DE_PASSE>"; // Replace with actual password

// Mapping of User Roles to their Full MySQL Credentials (for dynamic connection)
const USER_CREDENTIALS: [(&str, &str, &str); 3] = [
    // (Role in DB, MySQL Username, MySQL Password)
    ("doctor", "guestx", "<MOT_DE_PASSE>"),
    ("reception", "reception", "<MOT_DE_PASSE>"),
    ("staff", "assistant", "<MOT_DE_PASSE>"), 
];

fn get_login_url() -> String {
    format!("mysql://{}:{}@{}/{}", LOGIN_USER, LOGIN_PASS, SERVER_IP, DB_NAME)
}

fn get_dynamic_url(username: &str, password: &str) -> String {
    format!("mysql://{}:{}@{}/{}", username, password, SERVER_IP, DB_NAME)
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
    pub description: String,
    pub staff_id: i64,
    pub date: String,
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
    
    // Connect using low-privilege login user
    let login_url = get_login_url();
    let db = Database::load(login_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    // Query user from MySQL database
    let query = "SELECT id, name, code, role, is_active, created_at FROM users WHERE code = ? AND is_active = 1";
    let rows = db.select(query)
        .bind(&code)?
        .fetch_all()
        .await
        .map_err(|e| format!("Query error: {}", e))?;
    
    if rows.is_empty() {
        return Err("Code invalide ou utilisateur inactif".to_string());
    }
    
    let row = &rows[0];
    let user = User {
        id: Some(row.get::<i64>("id")?),
        name: row.get::<String>("name")?,
        code: row.get::<String>("code")?,
        role: row.get::<String>("role")?,
        is_active: row.get::<bool>("is_active")?,
        created_at: row.get::<Option<String>>("created_at")?,
    };
    
    // Find the corresponding full credentials from USER_CREDENTIALS
    let credentials = USER_CREDENTIALS.iter()
        .find(|(role, _, _)| *role == user.role)
        .ok_or_else(|| format!("Unknown role: {}", user.role))?;

    let dynamic_url = get_dynamic_url(credentials.1, credentials.2);
    
    println!("[DEBUG] User authenticated successfully: {} ({})", user.name, user.role);
    
    Ok(AuthResult {
        user,
        db_url: dynamic_url,
    })
}

#[tauri::command]
async fn add_patient(patient: Patient, db_url: String) -> Result<i64, String> {
    println!("[DEBUG] Adding patient: {:?}", patient);
    
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
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = r#"
        INSERT INTO patients 
        (first_name, last_name, phone, email, date_of_birth, gender, address, allergies, medical_history, medications, emergency_contact, emergency_phone, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    "#;
    
    let result = db.execute(query)
        .bind(&patient.first_name)?
        .bind(&patient.last_name)?
        .bind(&patient.phone)?
        .bind(&patient.email)?
        .bind(&patient.date_of_birth)?
        .bind(&patient.gender)?
        .bind(&patient.address)?
        .bind(&patient.allergies)?
        .bind(&patient.medical_history)?
        .bind(&patient.medications)?
        .bind(&patient.emergency_contact)?
        .bind(&patient.emergency_phone)?
        .bind(&patient.notes)?
        .fetch_all()
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    
    let patient_id = db.last_insert_id().await.map_err(|e| format!("Failed to get last insert ID: {}", e))?;
    
    println!("[DEBUG] Patient added with ID: {}", patient_id);
    Ok(patient_id as i64)
}

#[tauri::command]
async fn get_patients(db_url: String) -> Result<Vec<Patient>, String> {
    println!("[DEBUG] Fetching patients from MySQL database...");
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = "SELECT * FROM patients ORDER BY created_at DESC";
    let rows = db.select(query)
        .fetch_all()
        .await
        .map_err(|e| format!("Query error: {}", e))?;
    
    let mut patients = Vec::new();
    for row in rows {
        let patient = Patient {
            id: Some(row.get::<i64>("id")?),
            first_name: row.get::<String>("first_name")?,
            last_name: row.get::<String>("last_name")?,
            phone: row.get::<String>("phone")?,
            email: row.get::<Option<String>>("email")?,
            date_of_birth: row.get::<String>("date_of_birth")?,
            gender: row.get::<String>("gender")?,
            address: row.get::<Option<String>>("address")?,
            allergies: row.get::<Option<String>>("allergies")?,
            medical_history: row.get::<Option<String>>("medical_history")?,
            medications: row.get::<Option<String>>("medications")?,
            emergency_contact: row.get::<Option<String>>("emergency_contact")?,
            emergency_phone: row.get::<Option<String>>("emergency_phone")?,
            notes: row.get::<Option<String>>("notes")?,
            created_at: row.get::<Option<String>>("created_at")?,
        };
        patients.push(patient);
    }
    
    println!("[DEBUG] Found {} patients", patients.len());
    Ok(patients)
}

#[tauri::command]
async fn update_patient(id: i64, patient: Patient, db_url: String) -> Result<(), String> {
    println!("[DEBUG] Updating patient: {}", id);
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = r#"
        UPDATE patients SET 
        first_name = ?, last_name = ?, phone = ?, email = ?, date_of_birth = ?, 
        gender = ?, address = ?, allergies = ?, medical_history = ?, medications = ?, 
        emergency_contact = ?, emergency_phone = ?, notes = ?
        WHERE id = ?
    "#;
    
    db.execute(query)
        .bind(&patient.first_name)?
        .bind(&patient.last_name)?
        .bind(&patient.phone)?
        .bind(&patient.email)?
        .bind(&patient.date_of_birth)?
        .bind(&patient.gender)?
        .bind(&patient.address)?
        .bind(&patient.allergies)?
        .bind(&patient.medical_history)?
        .bind(&patient.medications)?
        .bind(&patient.emergency_contact)?
        .bind(&patient.emergency_phone)?
        .bind(&patient.notes)?
        .bind(&id)?
        .fetch_all()
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    
    println!("[DEBUG] Patient updated successfully");
    Ok(())
}

#[tauri::command]
async fn delete_patient(id: i64, db_url: String) -> Result<(), String> {
    println!("[DEBUG] Deleting patient: {}", id);
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = "DELETE FROM patients WHERE id = ?";
    db.execute(query)
        .bind(&id)?
        .fetch_all()
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    
    println!("[DEBUG] Patient deleted successfully");
    Ok(())
}

#[tauri::command]
async fn add_appointment(appointment: Appointment, db_url: String) -> Result<i64, String> {
    println!("[DEBUG] Adding appointment: {:?}", appointment);
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = r#"
        INSERT INTO appointments 
        (patient_id, date, time, treatment_type, notes, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
    "#;
    
    let result = db.execute(query)
        .bind(&appointment.patient_id)?
        .bind(&appointment.date)?
        .bind(&appointment.time)?
        .bind(&appointment.treatment_type)?
        .bind(&appointment.notes)?
        .bind(&appointment.status)?
        .fetch_all()
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    
    let appointment_id = db.last_insert_id().await.map_err(|e| format!("Failed to get last insert ID: {}", e))?;
    
    println!("[DEBUG] Appointment added with ID: {}", appointment_id);
    Ok(appointment_id as i64)
}

#[tauri::command]
async fn get_appointments(db_url: String) -> Result<Vec<Appointment>, String> {
    println!("[DEBUG] Fetching appointments from MySQL database...");
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = r#"
        SELECT a.*, CONCAT(p.first_name, ' ', p.last_name) as patient_name, p.phone as patient_phone
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        ORDER BY a.date ASC, a.time ASC
    "#;
    
    let rows = db.select(query)
        .fetch_all()
        .await
        .map_err(|e| format!("Query error: {}", e))?;
    
    let mut appointments = Vec::new();
    for row in rows {
        let appointment = Appointment {
            id: Some(row.get::<i64>("id")?),
            patient_id: row.get::<i64>("patient_id")?,
            patient_name: row.get::<Option<String>>("patient_name")?,
            patient_phone: row.get::<Option<String>>("patient_phone")?,
            date: row.get::<String>("date")?,
            time: row.get::<String>("time")?,
            treatment_type: row.get::<String>("treatment_type")?,
            notes: row.get::<Option<String>>("notes")?,
            status: row.get::<String>("status")?,
            created_at: row.get::<Option<String>>("created_at")?,
        };
        appointments.push(appointment);
    }
    
    println!("[DEBUG] Found {} appointments", appointments.len());
    Ok(appointments)
}

#[tauri::command]
async fn get_patient_appointments(patient_id: i64, db_url: String) -> Result<Vec<Appointment>, String> {
    println!("[DEBUG] Fetching appointments for patient: {}", patient_id);
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = r#"
        SELECT a.*, CONCAT(p.first_name, ' ', p.last_name) as patient_name, p.phone as patient_phone
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        WHERE a.patient_id = ?
        ORDER BY a.date ASC, a.time ASC
    "#;
    
    let rows = db.select(query)
        .bind(&patient_id)?
        .fetch_all()
        .await
        .map_err(|e| format!("Query error: {}", e))?;
    
    let mut appointments = Vec::new();
    for row in rows {
        let appointment = Appointment {
            id: Some(row.get::<i64>("id")?),
            patient_id: row.get::<i64>("patient_id")?,
            patient_name: row.get::<Option<String>>("patient_name")?,
            patient_phone: row.get::<Option<String>>("patient_phone")?,
            date: row.get::<String>("date")?,
            time: row.get::<String>("time")?,
            treatment_type: row.get::<String>("treatment_type")?,
            notes: row.get::<Option<String>>("notes")?,
            status: row.get::<String>("status")?,
            created_at: row.get::<Option<String>>("created_at")?,
        };
        appointments.push(appointment);
    }
    
    println!("[DEBUG] Found {} appointments for patient", appointments.len());
    Ok(appointments)
}

#[tauri::command]
async fn update_appointment_status(id: i64, status: String, db_url: String) -> Result<(), String> {
    println!("[DEBUG] Updating appointment status: {} -> {}", id, status);
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = "UPDATE appointments SET status = ? WHERE id = ?";
    db.execute(query)
        .bind(&status)?
        .bind(&id)?
        .fetch_all()
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    
    println!("[DEBUG] Appointment status updated successfully");
    Ok(())
}

#[tauri::command]
async fn delete_appointment(id: i64, db_url: String) -> Result<(), String> {
    println!("[DEBUG] Deleting appointment: {}", id);
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = "DELETE FROM appointments WHERE id = ?";
    db.execute(query)
        .bind(&id)?
        .fetch_all()
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    
    println!("[DEBUG] Appointment deleted successfully");
    Ok(())
}

#[tauri::command]
async fn add_payment(payment: Payment, db_url: String) -> Result<i64, String> {
    println!("[DEBUG] Adding payment: {:?}", payment);
    
    // Connect using dynamic URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = r#"
        INSERT INTO payments 
        (patient_id, appointment_id, amount, payment_method, description, staff_id, date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    "#;
    
    let result = db.execute(query)
        .bind(&payment.patient_id)?
        .bind(&payment.appointment_id)?
        .bind(&payment.amount)?
        .bind(&payment.payment_method)?
        .bind(&payment.description)?
        .bind(&payment.staff_id)?
        .bind(&payment.date)?
        .fetch_all()
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    
    let payment_id = db.last_insert_id().await.map_err(|e| format!("Failed to get last insert ID: {}", e))?;
    
    println!("[DEBUG] Payment added with ID: {}", payment_id);
    Ok(payment_id as i64)
}

#[tauri::command]
async fn test_database_connection(db_url: String) -> Result<String, String> {
    println!("[DEBUG] Testing connection to: {}", db_url);
    
    // Try to connect using the provided URL
    let db = Database::load(db_url)
        .await
        .map_err(|e| {
            println!("[ERROR] Database connection test failed: {}", e);
            format!("Failed to create connection pool: {}", e)
        })?;
    
    // Test with a simple query
    let query = "SELECT 1 as test_value";
    let rows = db.select(query)
        .fetch_all()
        .await
        .map_err(|e| {
            println!("[ERROR] Database test query failed: {}", e);
            format!("Database test query failed: {}", e)
        })?;
    
    if rows.is_empty() {
        return Err("Connection test query returned no results".to_string());
    }
    
    println!("[DEBUG] Database connection test successful");
    Ok("Connection successful".to_string())
}

#[tauri::command]
async fn get_payments_by_date(date: String, db_url: String) -> Result<Vec<Payment>, String> {
    println!("[DEBUG] Fetching payments for date: {}", date);
    
    // Connect using dynamic URL  
    let db = Database::load(db_url)
        .await
        .map_err(|e| format!("Database connection error: {}", e))?;
    
    let query = "SELECT * FROM payments WHERE date = ? ORDER BY created_at DESC";
    let rows = db.select(query)
        .bind(&date)?
        .fetch_all()
        .await
        .map_err(|e| format!("Query error: {}", e))?;
    
    let mut payments = Vec::new();
    for row in rows {
        let payment = Payment {
            id: Some(row.get::<i64>("id")?),
            patient_id: row.get::<i64>("patient_id")?,
            appointment_id: row.get::<Option<i64>>("appointment_id")?,
            amount: row.get::<f64>("amount")?,
            payment_method: row.get::<String>("payment_method")?,
            description: row.get::<String>("description")?,
            staff_id: row.get::<i64>("staff_id")?,
            date: row.get::<String>("date")?,
            created_at: row.get::<Option<String>>("created_at")?,
        };
        payments.push(payment);
    }
    
    println!("[DEBUG] Found {} payments", payments.len());
    Ok(payments)
}

// App configuration  
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            authenticate_user,
            test_database_connection,
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
            get_payments_by_date
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}