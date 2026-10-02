use serde::{Deserialize, Serialize};
use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: Option<i64>,
    pub name: String,
    pub code: String,
    pub role: String, // 'doctor', 'reception', 'staff'
    pub is_active: bool,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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

fn get_db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    // Get the user's local app data directory
    let app_data_dir = dirs::data_local_dir()
        .ok_or("Failed to get app data directory")?;
    
    let mut path = app_data_dir;
    path.push("cabinet_panel");
    
    // Create the directory if it doesn't exist
    fs::create_dir_all(&path)?;
    path.push("cabinet.db");
    
    Ok(path)
}

fn init_database() -> Result<Connection> {
    let db_path = get_db_path().map_err(|e| rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
        Some(format!("Failed to get database path: {}", e))
    ))?;
    
    println!("Database path: {:?}", db_path);
    println!("Database file exists: {}", db_path.exists());
    
    let conn = Connection::open(&db_path)?;
    
    // Enable foreign key support
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            date_of_birth TEXT NOT NULL,
            gender TEXT NOT NULL,
            address TEXT,
            allergies TEXT,
            medical_history TEXT,
            medications TEXT,
            emergency_contact TEXT,
            emergency_phone TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Add new columns for existing databases (will silently fail if columns already exist)
    let _ = conn.execute("ALTER TABLE patients ADD COLUMN allergies TEXT", []);
    let _ = conn.execute("ALTER TABLE patients ADD COLUMN medical_history TEXT", []);
    let _ = conn.execute("ALTER TABLE patients ADD COLUMN medications TEXT", []);
    let _ = conn.execute("ALTER TABLE patients ADD COLUMN emergency_contact TEXT", []);
    let _ = conn.execute("ALTER TABLE patients ADD COLUMN emergency_phone TEXT", []);
    let _ = conn.execute("ALTER TABLE patients ADD COLUMN notes TEXT", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            treatment_type TEXT NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'programmé',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Users table for authentication and role management
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Payments table for financial tracking
    conn.execute(
        "CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            appointment_id INTEGER NOT NULL,
            patient_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            payment_method TEXT NOT NULL,
            collected_by INTEGER NOT NULL,
            notes TEXT,
            payment_date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
            FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
            FOREIGN KEY (collected_by) REFERENCES users (id)
        )",
        [],
    )?;

    // Insert default users if table is empty
    {
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM users")?;
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        
        if count == 0 {
            conn.execute(
                "INSERT INTO users (name, code, role) VALUES 
                ('Dr. El Ansari', '1234', 'doctor'),
                ('Réception Principale', '5678', 'reception'),
                ('Assistant(e)', '9012', 'staff')",
                [],
            )?;
            println!("[DEBUG] Default users created");
        }
    };

    // Test database by counting existing records
    {
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM patients")?;
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        println!("Current patients count: {}", count);
    } // stmt is dropped here, releasing the borrow on conn

    Ok(conn)
}

#[tauri::command]
fn add_patient(patient: Patient) -> Result<i64, String> {
    println!("Adding patient: {:?}", patient);
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let result = conn.execute(
        "INSERT INTO patients (first_name, last_name, phone, email, date_of_birth, gender, address, allergies, medical_history, medications, emergency_contact, emergency_phone, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        [
            &patient.first_name,
            &patient.last_name,
            &patient.phone,
            &patient.email.unwrap_or_default(),
            &patient.date_of_birth,
            &patient.gender,
            &patient.address.unwrap_or_default(),
            &patient.allergies.unwrap_or_default(),
            &patient.medical_history.unwrap_or_default(),
            &patient.medications.unwrap_or_default(),
            &patient.emergency_contact.unwrap_or_default(),
            &patient.emergency_phone.unwrap_or_default(),
            &patient.notes.unwrap_or_default(),
        ],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    println!("Patient added with ID: {}, affected rows: {}", id, result);
    
    Ok(id)
}

#[tauri::command]
fn get_patients() -> Result<Vec<Patient>, String> {
    println!("Fetching patients from database...");
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, first_name, last_name, phone, email, date_of_birth, gender, address, allergies, medical_history, medications, emergency_contact, emergency_phone, notes, created_at 
         FROM patients ORDER BY last_name, first_name"
    ).map_err(|e| e.to_string())?;

    let patient_iter = stmt.query_map([], |row| {
        Ok(Patient {
            id: Some(row.get(0)?),
            first_name: row.get(1)?,
            last_name: row.get(2)?,
            phone: row.get(3)?,
            email: row.get(4).ok(),
            date_of_birth: row.get(5)?,
            gender: row.get(6)?,
            address: row.get(7).ok(),
            allergies: row.get(8).ok(),
            medical_history: row.get(9).ok(),
            medications: row.get(10).ok(),
            emergency_contact: row.get(11).ok(),
            emergency_phone: row.get(12).ok(),
            notes: row.get(13).ok(),
            created_at: row.get(14).ok(),
        })
    }).map_err(|e| e.to_string())?;

    let mut patients = Vec::new();
    for patient in patient_iter {
        patients.push(patient.map_err(|e| e.to_string())?);
    }

    println!("Found {} patients", patients.len());
    Ok(patients)
}

#[tauri::command]
fn update_patient(id: i64, patient: Patient) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE patients SET first_name = ?1, last_name = ?2, phone = ?3, email = ?4, 
         date_of_birth = ?5, gender = ?6, address = ?7, allergies = ?8, medical_history = ?9, 
         medications = ?10, emergency_contact = ?11, emergency_phone = ?12, notes = ?13 WHERE id = ?14",
        [
            &patient.first_name,
            &patient.last_name,
            &patient.phone,
            &patient.email.unwrap_or_default(),
            &patient.date_of_birth,
            &patient.gender,
            &patient.address.unwrap_or_default(),
            &patient.allergies.unwrap_or_default(),
            &patient.medical_history.unwrap_or_default(),
            &patient.medications.unwrap_or_default(),
            &patient.emergency_contact.unwrap_or_default(),
            &patient.emergency_phone.unwrap_or_default(),
            &patient.notes.unwrap_or_default(),
            &id.to_string(),
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_patient(id: i64) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    conn.execute("DELETE FROM patients WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM appointments WHERE patient_id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn add_appointment(appointment: Appointment) -> Result<i64, String> {
    println!("[DEBUG] Adding appointment: {:?}", appointment);
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let result = conn.execute(
        "INSERT INTO appointments (patient_id, date, time, treatment_type, notes, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        [
            &appointment.patient_id.to_string(),
            &appointment.date,
            &appointment.time,
            &appointment.treatment_type,
            &appointment.notes.unwrap_or_default(),
            &appointment.status,
        ],
    ).map_err(|e| {
        println!("[ERROR] Failed to insert appointment: {}", e);
        e.to_string()
    })?;

    let id = conn.last_insert_rowid();
    println!("[DEBUG] Appointment added with ID: {}, affected rows: {}", id, result);
    Ok(id)
}

#[tauri::command]
fn get_appointments() -> Result<Vec<Appointment>, String> {
    println!("[DEBUG] Fetching appointments from database...");
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT a.id, a.patient_id, a.date, a.time, a.treatment_type, a.notes, a.status, a.created_at,
                p.first_name || ' ' || p.last_name as patient_name, p.phone as patient_phone
         FROM appointments a
         LEFT JOIN patients p ON a.patient_id = p.id
         ORDER BY a.date DESC, a.time DESC"
    ).map_err(|e| e.to_string())?;

    let appointment_iter = stmt.query_map([], |row| {
        Ok(Appointment {
            id: Some(row.get(0)?),
            patient_id: row.get(1)?,
            date: row.get(2)?,
            time: row.get(3)?,
            treatment_type: row.get(4)?,
            notes: row.get(5).ok(),
            status: row.get(6)?,
            created_at: row.get(7).ok(),
            patient_name: row.get(8).ok(),
            patient_phone: row.get(9).ok(),
        })
    }).map_err(|e| e.to_string())?;

    let mut appointments = Vec::new();
    for appointment in appointment_iter {
        appointments.push(appointment.map_err(|e| e.to_string())?);
    }

    println!("[DEBUG] Found {} appointments", appointments.len());
    Ok(appointments)
}

#[tauri::command]
fn get_patient_appointments(patient_id: i64) -> Result<Vec<Appointment>, String> {
    println!("[DEBUG] Fetching appointments for patient {} from database...", patient_id);
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT a.id, a.patient_id, a.date, a.time, a.treatment_type, a.notes, a.status, a.created_at,
                p.first_name || ' ' || p.last_name as patient_name, p.phone as patient_phone
         FROM appointments a
         LEFT JOIN patients p ON a.patient_id = p.id
         WHERE a.patient_id = ?1
         ORDER BY a.date DESC, a.time DESC"
    ).map_err(|e| e.to_string())?;

    let appointment_iter = stmt.query_map([patient_id], |row| {
        Ok(Appointment {
            id: Some(row.get(0)?),
            patient_id: row.get(1)?,
            date: row.get(2)?,
            time: row.get(3)?,
            treatment_type: row.get(4)?,
            notes: row.get(5).ok(),
            status: row.get(6)?,
            created_at: row.get(7).ok(),
            patient_name: row.get(8).ok(),
            patient_phone: row.get(9).ok(),
        })
    }).map_err(|e| e.to_string())?;

    let mut appointments = Vec::new();
    for appointment in appointment_iter {
        appointments.push(appointment.map_err(|e| e.to_string())?);
    }

    println!("[DEBUG] Found {} appointments for patient {}", appointments.len(), patient_id);
    Ok(appointments)
}

#[tauri::command]
fn update_appointment(id: i64, appointment: Appointment) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE appointments SET patient_id = ?1, date = ?2, time = ?3, treatment_type = ?4, 
         notes = ?5, status = ?6 WHERE id = ?7",
        [
            &appointment.patient_id.to_string(),
            &appointment.date,
            &appointment.time,
            &appointment.treatment_type,
            &appointment.notes.unwrap_or_default(),
            &appointment.status,
            &id.to_string(),
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn update_appointment_status(id: i64, status: String) -> Result<(), String> {
    println!("[DEBUG] Updating appointment {} status to: {}", id, status);
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let result = conn.execute(
        "UPDATE appointments SET status = ?1 WHERE id = ?2",
        [&status, &id.to_string()],
    ).map_err(|e| {
        println!("[ERROR] Failed to update appointment status: {}", e);
        e.to_string()
    })?;
    
    println!("[DEBUG] Appointment status updated, affected rows: {}", result);
    Ok(())
}

/*
#[tauri::command]
fn update_appointment_status(id: i64, status: String) -> Result<(), String> {
    println!("[DEBUG] Updating appointment {} status to: {}", id, status);
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let result = conn.execute(
        "UPDATE appointments SET status = ?1 WHERE id = ?2",
        [&status, &id.to_string()],
    ).map_err(|e| {
        println!("[ERROR] Failed to update appointment status: {}", e);
        e.to_string()
    })?;
    
    println!("[DEBUG] Appointment status updated, affected rows: {}", result);
    Ok(())
}
*/

#[tauri::command]
fn delete_appointment(id: i64) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    conn.execute("DELETE FROM appointments WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// User authentication functions
#[tauri::command]
fn authenticate_user(code: String) -> Result<User, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, code, role, is_active, created_at FROM users WHERE code = ?1 AND is_active = 1"
    ).map_err(|e| e.to_string())?;

    let user = stmt.query_row([&code], |row| {
        Ok(User {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            code: row.get(2)?,
            role: row.get(3)?,
            is_active: row.get(4)?,
            created_at: row.get(5).ok(),
        })
    }).map_err(|_| "Code invalide ou utilisateur inactif".to_string())?;

    Ok(user)
}

#[tauri::command]
fn get_users() -> Result<Vec<User>, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, code, role, is_active, created_at FROM users ORDER BY role, name"
    ).map_err(|e| e.to_string())?;

    let user_iter = stmt.query_map([], |row| {
        Ok(User {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            code: row.get(2)?,
            role: row.get(3)?,
            is_active: row.get(4)?,
            created_at: row.get(5).ok(),
        })
    }).map_err(|e| e.to_string())?;

    let mut users = Vec::new();
    for user in user_iter {
        users.push(user.map_err(|e| e.to_string())?);
    }

    Ok(users)
}

// Payment management functions
#[tauri::command]
fn add_payment(payment: Payment) -> Result<i64, String> {
    println!("[DEBUG] Adding payment: {:?}", payment);
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let result = conn.execute(
        "INSERT INTO payments (appointment_id, patient_id, amount, payment_method, collected_by, notes, payment_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        [
            &payment.appointment_id.to_string(),
            &payment.patient_id.to_string(),
            &payment.amount.to_string(),
            &payment.payment_method,
            &payment.collected_by.to_string(),
            &payment.notes.unwrap_or_default(),
            &payment.payment_date,
        ],
    ).map_err(|e| {
        println!("[ERROR] Failed to insert payment: {}", e);
        e.to_string()
    })?;

    let id = conn.last_insert_rowid();
    println!("[DEBUG] Payment added with ID: {}, affected rows: {}", id, result);
    Ok(id)
}

#[tauri::command]
fn get_payments_by_date(date: String) -> Result<Vec<Payment>, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT p.id, p.appointment_id, p.patient_id, p.amount, p.payment_method, 
                p.collected_by, p.notes, p.payment_date, p.created_at,
                pt.first_name || ' ' || pt.last_name as patient_name,
                u.name as collected_by_name
         FROM payments p
         LEFT JOIN patients pt ON p.patient_id = pt.id
         LEFT JOIN users u ON p.collected_by = u.id
         WHERE p.payment_date = ?1
         ORDER BY p.created_at DESC"
    ).map_err(|e| e.to_string())?;

    let payment_iter = stmt.query_map([&date], |row| {
        Ok(Payment {
            id: Some(row.get(0)?),
            appointment_id: row.get(1)?,
            patient_id: row.get(2)?,
            amount: row.get(3)?,
            payment_method: row.get(4)?,
            collected_by: row.get(5)?,
            notes: row.get(6).ok(),
            payment_date: row.get(7)?,
            created_at: row.get(8).ok(),
            patient_name: row.get(9).ok(),
            collected_by_name: row.get(10).ok(),
        })
    }).map_err(|e| e.to_string())?;

    let mut payments = Vec::new();
    for payment in payment_iter {
        payments.push(payment.map_err(|e| e.to_string())?);
    }

    Ok(payments)
}

#[tauri::command]
fn get_daily_summary_by_staff(date: String, staff_id: i64) -> Result<DailySummary, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT 
            u.name,
            COALESCE(SUM(CASE WHEN p.payment_method = 'espèces' THEN p.amount ELSE 0 END), 0) as total_cash,
            COALESCE(SUM(CASE WHEN p.payment_method = 'carte' THEN p.amount ELSE 0 END), 0) as total_card,
            COALESCE(SUM(CASE WHEN p.payment_method = 'chèque' THEN p.amount ELSE 0 END), 0) as total_check,
            COALESCE(SUM(CASE WHEN p.payment_method = 'virement' THEN p.amount ELSE 0 END), 0) as total_transfer,
            COALESCE(SUM(p.amount), 0) as total_collected,
            COALESCE(COUNT(p.id), 0) as number_of_payments
         FROM users u
         LEFT JOIN payments p ON u.id = p.collected_by AND p.payment_date = ?1
         WHERE u.id = ?2
         GROUP BY u.id, u.name"
    ).map_err(|e| e.to_string())?;

    let summary = stmt.query_row([&date, &staff_id.to_string()], |row| {
        Ok(DailySummary {
            date: date.clone(),
            staff_id,
            staff_name: row.get(0)?,
            total_cash: row.get(1)?,
            total_card: row.get(2)?,
            total_check: row.get(3)?,
            total_transfer: row.get(4)?,
            total_collected: row.get(5)?,
            number_of_payments: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(summary)
}

#[tauri::command]
fn get_daily_summary_all_staff(date: String) -> Result<Vec<DailySummary>, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT 
            u.id,
            u.name,
            COALESCE(SUM(CASE WHEN p.payment_method = 'espèces' THEN p.amount ELSE 0 END), 0) as total_cash,
            COALESCE(SUM(CASE WHEN p.payment_method = 'carte' THEN p.amount ELSE 0 END), 0) as total_card,
            COALESCE(SUM(CASE WHEN p.payment_method = 'chèque' THEN p.amount ELSE 0 END), 0) as total_check,
            COALESCE(SUM(CASE WHEN p.payment_method = 'virement' THEN p.amount ELSE 0 END), 0) as total_transfer,
            COALESCE(SUM(p.amount), 0) as total_collected,
            COALESCE(COUNT(p.id), 0) as number_of_payments
         FROM users u
         LEFT JOIN payments p ON u.id = p.collected_by AND p.payment_date = ?1
         WHERE u.role IN ('reception', 'staff')
         GROUP BY u.id, u.name
         ORDER BY u.name"
    ).map_err(|e| e.to_string())?;

    let summary_iter = stmt.query_map([&date], |row| {
        Ok(DailySummary {
            date: date.clone(),
            staff_id: row.get(0)?,
            staff_name: row.get(1)?,
            total_cash: row.get(2)?,
            total_card: row.get(3)?,
            total_check: row.get(4)?,
            total_transfer: row.get(5)?,
            total_collected: row.get(6)?,
            number_of_payments: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut summaries = Vec::new();
    for summary in summary_iter {
        summaries.push(summary.map_err(|e| e.to_string())?);
    }

    Ok(summaries)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
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
            authenticate_user,
            get_users,
            add_payment,
            get_payments_by_date,
            get_daily_summary_by_staff,
            get_daily_summary_all_staff
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
