-- Adds the CNSS sheets and the clinic settings. Run once on an existing database:
--   mysql -uroot -p cabinet < database/migrations_003_cnss.sql

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
