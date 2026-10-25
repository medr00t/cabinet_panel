use serde::{Deserialize, Serialize};
use tauri_plugin_sql::{Database, Migration, MigrationKind};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use chrono;

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

// File-based storage with auto-sync for development
static STORAGE_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    path.push("cabinet_data");
    if !path.exists() {
        fs::create_dir_all(&path).unwrap_or_default();
    }
    path
});

static PATIENTS: LazyLock<Mutex<HashMap<i64, Patient>>> = LazyLock::new(|| {
    Mutex::new(load_patients_from_file())
});

static NEXT_PATIENT_ID: LazyLock<Mutex<i64>> = LazyLock::new(|| {
    let patients = load_patients_from_file();
    let max_id = patients.keys().max().copied().unwrap_or(0);
    Mutex::new(max_id + 1)
});

// Track last file modification time for auto-sync
static LAST_SYNC: LazyLock<Mutex<Option<SystemTime>>> = LazyLock::new(|| {
    Mutex::new(None)
});

// Appointment storage
static APPOINTMENTS: LazyLock<Mutex<HashMap<i64, Appointment>>> = LazyLock::new(|| {
    Mutex::new(load_appointments_from_file())
});

static NEXT_APPOINTMENT_ID: LazyLock<Mutex<i64>> = LazyLock::new(|| {
    let appointments = load_appointments_from_file();
    let max_id = appointments.keys().max().copied().unwrap_or(0);
    Mutex::new(max_id + 1)
});

// File storage helper functions with auto-sync
fn get_patients_file_path() -> PathBuf {
    let mut path = STORAGE_DIR.clone();
    path.push("patients.json");
    path
}

fn get_appointments_file_path() -> PathBuf {
    let mut path = STORAGE_DIR.clone();
    path.push("appointments.json");
    path
}

fn load_appointments_from_file() -> HashMap<i64, Appointment> {
    let file_path = get_appointments_file_path();
    
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            match serde_json::from_str::<HashMap<i64, Appointment>>(&content) {
                Ok(appointments) => {
                    println!("[DEBUG] Loaded {} appointments from file", appointments.len());
                    appointments
                }
                Err(e) => {
                    println!("[DEBUG] Error parsing appointments file: {}", e);
                    HashMap::new()
                }
            }
        }
        Err(_) => {
            println!("[DEBUG] No existing appointments file found, starting fresh");
            HashMap::new()
        }
    }
}

fn save_appointments_to_file(appointments: &HashMap<i64, Appointment>) -> Result<(), String> {
    let file_path = get_appointments_file_path();
    
    match serde_json::to_string_pretty(appointments) {
        Ok(content) => {
            match fs::write(&file_path, content) {
                Ok(_) => {
                    println!("[DEBUG] Saved {} appointments to file", appointments.len());
                    Ok(())
                }
                Err(e) => Err(format!("Failed to write appointments file: {}", e))
            }
        }
        Err(e) => Err(format!("Failed to serialize appointments: {}", e))
    }
}

fn should_reload_from_file() -> bool {
    let file_path = get_patients_file_path();
    
    if let Ok(metadata) = fs::metadata(&file_path) {
        if let Ok(modified) = metadata.modified() {
            let mut last_sync = LAST_SYNC.lock().unwrap();
            
            if let Some(last_time) = *last_sync {
                if modified > last_time {
                    *last_sync = Some(modified);
                    return true;
                }
            } else {
                *last_sync = Some(modified);
                return true;
            }
        }
    }
    false
}

fn load_patients_from_file() -> HashMap<i64, Patient> {
    let file_path = get_patients_file_path();
    
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            match serde_json::from_str::<HashMap<i64, Patient>>(&content) {
                Ok(patients) => {
                    println!("[DEBUG] Loaded {} patients from file", patients.len());
                    patients
                }
                Err(e) => {
                    println!("[DEBUG] Error parsing patients file: {}", e);
                    HashMap::new()
                }
            }
        }
        Err(_) => {
            println!("[DEBUG] No existing patients file found, starting fresh");
            HashMap::new()
        }
    }
}

fn save_patients_to_file(patients: &HashMap<i64, Patient>) -> Result<(), String> {
    let file_path = get_patients_file_path();
    
    match serde_json::to_string_pretty(patients) {
        Ok(content) => {
            match fs::write(&file_path, content) {
                Ok(_) => {
                    // Update sync time
                    if let Ok(metadata) = fs::metadata(&file_path) {
                        if let Ok(modified) = metadata.modified() {
                            *LAST_SYNC.lock().unwrap() = Some(modified);
                        }
                    }
                    println!("[DEBUG] Saved {} patients to file", patients.len());
                    Ok(())
                }
                Err(e) => Err(format!("Failed to write patients file: {}", e))
            }
        }
        Err(e) => Err(format!("Failed to serialize patients: {}", e))
    }
}

fn sync_patients_if_needed() {
    if should_reload_from_file() {
        println!("[DEBUG] File changed detected, reloading patients");
        let fresh_patients = load_patients_from_file();
        let mut patients = PATIENTS.lock().unwrap();
        *patients = fresh_patients;
        
        // Update next ID
        let max_id = patients.keys().max().copied().unwrap_or(0);
        *NEXT_PATIENT_ID.lock().unwrap() = max_id + 1;
    }
}

// Sync patient to MySQL database
fn sync_patient_to_mysql(patient: &Patient) {
    let patient_clone = patient.clone();
    tokio::spawn(async move {
        if let Err(e) = sync_patient_to_mysql_impl(patient_clone).await {
            println!("[WARNING] Failed to sync patient to MySQL: {}", e);
        }
    });
}

async fn sync_patient_to_mysql_impl(patient: Patient) -> Result<(), String> {
    // Simple MySQL insertion using raw SQL
    // This is a basic implementation - in production you'd use proper connection pooling
    use std::process::Command;
    
    let mysql_cmd = format!(
        "INSERT INTO patients (id, first_name, last_name, phone, email, date_of_birth, gender, address, allergies, medical_history, medications, emergency_contact, emergency_phone, notes, created_at) VALUES ({}, '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}') ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), last_name=VALUES(last_name), phone=VALUES(phone), email=VALUES(email), date_of_birth=VALUES(date_of_birth), gender=VALUES(gender), address=VALUES(address), allergies=VALUES(allergies), medical_history=VALUES(medical_history), medications=VALUES(medications), emergency_contact=VALUES(emergency_contact), emergency_phone=VALUES(emergency_phone), notes=VALUES(notes);",
        patient.id.unwrap_or(0),
        patient.first_name.replace("'", "''"),
        patient.last_name.replace("'", "''"),
        patient.phone.replace("'", "''"),
        patient.email.unwrap_or_default().replace("'", "''"),
        patient.date_of_birth.replace("'", "''"),
        patient.gender.replace("'", "''"),
        patient.address.unwrap_or_default().replace("'", "''"),
        patient.allergies.unwrap_or_default().replace("'", "''"),
        patient.medical_history.unwrap_or_default().replace("'", "''"),
        patient.medications.unwrap_or_default().replace("'", "''"),
        patient.emergency_contact.unwrap_or_default().replace("'", "''"),
        patient.emergency_phone.unwrap_or_default().replace("'", "''"),
        patient.notes.unwrap_or_default().replace("'", "''"),
        patient.created_at.unwrap_or_default().replace("'", "''")
    );
    
    let output = Command::new("mysql")
        .args(&[
            "-h", SERVER_IP,
            "-u", LOGIN_USER,
            &format!("-p{}", LOGIN_PASS),
            DB_NAME,
            "-e", &mysql_cmd
        ])
        .output();
    
    match output {
        Ok(result) => {
            if result.status.success() {
                println!("[DEBUG] Patient synced to MySQL successfully");
                Ok(())
            } else {
                let error = String::from_utf8_lossy(&result.stderr);
                Err(format!("MySQL error: {}", error))
            }
        }
        Err(e) => {
            Err(format!("Failed to execute mysql command: {}", e))
        }
    }
}

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
    pub role: String, // 'doctor', 'reception', 'staff'
    pub is_active: bool,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Payment {
    pub id: Option<i64>,
    pub appointment_id: i64,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub amount: f64,
    pub payment_method: String, // 'espèces', 'carte', 'chèque', 'virement'
    pub collected_by: i64, // user_id of staff who collected
    pub collected_by_name: Option<String>,
    pub notes: Option<String>,
    pub payment_date: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResult {
    pub user: User,
    pub db_url: String,
}

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
async fn add_patient(patient: Patient) -> Result<i64, String> {
    println!("[DEBUG] Adding patient: {:?}", patient);
    
    // Validate required fields
    if patient.first_name.trim().is_empty() {
        return Err("Le prénom est requis".to_string());
    }
    if patient.last_name.trim().is_empty() {
        return Err("Le nom est requis".to_string());
    }
    if patient.phone.trim().is_empty() {
        return Err("Le numéro de téléphone est requis".to_string());
    }
    if patient.date_of_birth.trim().is_empty() {
        return Err("La date de naissance est requise".to_string());
    }
    
    // Sync before adding
    sync_patients_if_needed();
    
    // Store patient with file persistence
    let mut patients = PATIENTS.lock().unwrap();
    let mut next_id = NEXT_PATIENT_ID.lock().unwrap();
    
    let id = *next_id;
    let mut stored_patient = patient;
    stored_patient.id = Some(id);
    stored_patient.created_at = Some(chrono::Utc::now().to_rfc3339());
    
    patients.insert(id, stored_patient.clone());
    *next_id += 1;
    
    // Save to file
    if let Err(e) = save_patients_to_file(&patients) {
        println!("[WARNING] Failed to save patients to file: {}", e);
        return Err(format!("Erreur lors de la sauvegarde: {}", e));
    }
    
    // Sync to MySQL
    sync_patient_to_mysql(&stored_patient);
    
    println!("[DEBUG] Patient added with ID: {} (Total patients: {})", id, patients.len());
    Ok(id)
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
async fn update_patient(id: i64, patient: Patient) -> Result<(), String> {
    println!("[DEBUG] Updating patient {} in MySQL: {:?}", id, patient);
    
    // Validate required fields
    if patient.first_name.trim().is_empty() {
        return Err("Le prénom est requis".to_string());
    }
    if patient.last_name.trim().is_empty() {
        return Err("Le nom est requis".to_string());
    }
    if patient.phone.trim().is_empty() {
        return Err("Le numéro de téléphone est requis".to_string());
    }
    
    // Sync before updating
    sync_patients_if_needed();
    
    let mut patients = PATIENTS.lock().unwrap();
    if let Some(existing_patient) = patients.get(&id) {
        let mut updated_patient = patient;
        updated_patient.id = Some(id);
        updated_patient.created_at = existing_patient.created_at.clone();
        patients.insert(id, updated_patient);
        
        // Save to file
        if let Err(e) = save_patients_to_file(&patients) {
            return Err(format!("Erreur lors de la sauvegarde: {}", e));
        }
        
        println!("[DEBUG] Patient updated successfully");
        Ok(())
    } else {
        Err(format!("Patient avec l'ID {} non trouvé", id))
    }
}

#[tauri::command]
async fn delete_patient(id: i64) -> Result<(), String> {
    println!("[DEBUG] Deleting patient: {}", id);
    
    // Sync before deleting
    sync_patients_if_needed();
    
    let mut patients = PATIENTS.lock().unwrap();
    if patients.remove(&id).is_some() {
        // Save to file
        if let Err(e) = save_patients_to_file(&patients) {
            return Err(format!("Erreur lors de la sauvegarde: {}", e));
        }
        
        println!("[DEBUG] Patient deleted successfully (Remaining: {})", patients.len());
        Ok(())
    } else {
        Err(format!("Patient avec l'ID {} non trouvé", id))
    }
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
async fn get_patient_appointments(patient_id: i64) -> Result<Vec<Appointment>, String> {
    println!("[DEBUG] Fetching appointments for patient: {}", patient_id);
    // TODO: Implement with proper MySQL connection
    let appointments = Vec::new();
    println!("[DEBUG] Found {} appointments for patient", appointments.len());
    Ok(appointments)
}

#[tauri::command]
async fn update_appointment(id: i64, _appointment: Appointment) -> Result<(), String> {
    println!("[DEBUG] Updating appointment: {}", id);
    // TODO: Implement with proper MySQL connection
    Ok(())
}

#[tauri::command]
async fn update_appointment_status(id: i64, status: String) -> Result<(), String> {
    println!("[DEBUG] Updating appointment status: {} to {}", id, status);
    // TODO: Implement with proper MySQL connection
    Ok(())
}

#[tauri::command]
async fn delete_appointment(id: i64) -> Result<(), String> {
    println!("[DEBUG] Deleting appointment: {}", id);
    // TODO: Implement with proper MySQL connection
    Ok(())
}

#[tauri::command]
async fn get_users() -> Result<Vec<User>, String> {
    println!("[DEBUG] Fetching users from database...");
    // TODO: Implement with proper MySQL connection
    let users = Vec::new();
    Ok(users)
}

#[tauri::command]
async fn add_payment(payment: Payment) -> Result<i64, String> {
    println!("[DEBUG] Adding payment: {:?}", payment);
    // TODO: Implement with proper MySQL connection
    let id = 1i64;
    println!("[DEBUG] Payment added with ID: {}", id);
    Ok(id)
}

#[tauri::command]
async fn get_payments_by_date(date: String) -> Result<Vec<Payment>, String> {
    println!("[DEBUG] Fetching payments for date: {}", date);
    // TODO: Implement with proper MySQL connection
    let payments = Vec::new();
    Ok(payments)
}

#[tauri::command]
async fn get_daily_summary_by_staff(date: String, staff_id: i64) -> Result<DailySummary, String> {
    println!("[DEBUG] Fetching daily summary for staff: {} on {}", staff_id, date);
    // TODO: Implement with proper MySQL connection
    let summary = DailySummary {
        date: date.clone(),
        staff_id,
        staff_name: "Staff Member".to_string(),
        total_cash: 0.0,
        total_card: 0.0,
        total_check: 0.0,
        total_transfer: 0.0,
        total_collected: 0.0,
        number_of_payments: 0,
    };
    Ok(summary)
}

#[tauri::command]
async fn get_daily_summary_all_staff(date: String) -> Result<Vec<DailySummary>, String> {
    println!("[DEBUG] Fetching daily summary for all staff on: {}", date);
    // TODO: Implement with proper MySQL connection
    let summaries = Vec::new();
    Ok(summaries)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        // Add your database migrations here
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(&format!("mysql://{}:{}@{}/{}", LOGIN_USER, LOGIN_PASS, SERVER_IP, DB_NAME), migrations)
                .build(),
        )
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
            get_users,
            add_payment,
            get_payments_by_date,
            get_daily_summary_by_staff,
            get_daily_summary_all_staff
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}