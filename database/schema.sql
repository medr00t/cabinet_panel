-- Tables expected by src-tauri/src/lib.rs.
-- Dates/times are VARCHAR on purpose: the backend reads them as strings.
CREATE DATABASE IF NOT EXISTS cabinet CHARACTER SET utf8mb4;
USE cabinet;

CREATE TABLE IF NOT EXISTS patients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    billet_number VARCHAR(20) NULL,           -- N° Billet on the paper card
    insurance VARCHAR(100),                   -- Couverture médicale
    email VARCHAR(255),
    date_of_birth VARCHAR(10),
    gender VARCHAR(10),
    address TEXT,
    allergies TEXT,
    medical_history TEXT,
    medications TEXT,
    emergency_contact VARCHAR(255),
    emergency_phone VARCHAR(20),
    notes TEXT,
    created_at VARCHAR(19),
    UNIQUE INDEX uq_patients_billet (billet_number),
    INDEX (last_name, first_name)
);

CREATE TABLE IF NOT EXISTS appointments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    date VARCHAR(10) NOT NULL,
    time VARCHAR(8) NOT NULL,
    treatment_type VARCHAR(255) NOT NULL,
    notes TEXT,
    status VARCHAR(20) NOT NULL,
    created_at VARCHAR(19),
    INDEX (patient_id), INDEX (date)
);

CREATE TABLE IF NOT EXISTS payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    appointment_id INT,
    treatment_id INT NULL,
    patient_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    collected_by INT NOT NULL,
    notes TEXT,
    payment_date VARCHAR(10) NOT NULL,
    created_at VARCHAR(19),
    INDEX (payment_date), INDEX (treatment_id), INDEX (patient_id)
);

-- One row per line of the paper ledger: Date | Désignation | Acte médical | Devis.
-- "Payer" is the sum of payments rows pointing at it; "Reste" = quote - paid.
CREATE TABLE IF NOT EXISTS treatments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    treatment_date VARCHAR(10) NOT NULL,
    tooth VARCHAR(120) NOT NULL DEFAULT '',    -- Désignation: FDI tooth numbers ("36, 37") and/or a zone
    act VARCHAR(255) NOT NULL,                 -- Acte médical
    quote DECIMAL(10,2) NOT NULL DEFAULT 0,    -- Devis
    notes TEXT,
    created_by INT NOT NULL,
    created_at VARCHAR(19),
    INDEX (patient_id, treatment_date)
);

-- Per-tooth state and remark ("odontogramme"): one row per patient and tooth (FDI numbering).
-- status: '' (none) | carie | soigne | devitalise | couronne | implant | absente
CREATE TABLE IF NOT EXISTS tooth_marks (
    patient_id INT NOT NULL,
    tooth VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT '',
    note TEXT,
    updated_by INT NOT NULL,
    updated_at VARCHAR(19),
    PRIMARY KEY (patient_id, tooth)
);

-- CNSS "Feuille de soins dentaires": each saved sheet is a snapshot of the filled form (JSON), kept in the
-- patient's dossier so it can be reopened, corrected and reprinted.
CREATE TABLE IF NOT EXISTS cnss_sheets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    label VARCHAR(120) NOT NULL DEFAULT '',
    data MEDIUMTEXT NOT NULL,
    created_by INT NOT NULL,
    created_at VARCHAR(19),
    updated_at VARCHAR(19),
    INDEX (patient_id)
);

-- Clinic-wide values remembered once (dentist INP number, city...).
CREATE TABLE IF NOT EXISTS settings (
    name VARCHAR(60) PRIMARY KEY,
    value TEXT,
    updated_at VARCHAR(19)
);

-- Reception accounts created by the doctor (removed = deleted_at set, never erased)
CREATE TABLE IF NOT EXISTS staff (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    code VARCHAR(4) NOT NULL,
    created_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    INDEX (code)
);

-- Radiology images and documents attached to a patient's file (removed = deleted_at set, never erased)
CREATE TABLE IF NOT EXISTS patient_files (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    title VARCHAR(160) NOT NULL DEFAULT '',
    original_name VARCHAR(200) NOT NULL,
    stored_name VARCHAR(80) NOT NULL,
    mime VARCHAR(60) NOT NULL,
    size_bytes INT NOT NULL,
    taken_on VARCHAR(10) NULL,
    created_by INT NOT NULL,
    created_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    INDEX (patient_id)
);
