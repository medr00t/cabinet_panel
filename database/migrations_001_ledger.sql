-- Upgrade an existing `cabinet` database created before the ledger existed.
-- Run once:  mysql -uroot -p cabinet < database/migrations_001_ledger.sql
ALTER TABLE patients ADD COLUMN billet_number VARCHAR(20) NULL AFTER phone;
ALTER TABLE patients ADD COLUMN insurance VARCHAR(100) NULL AFTER billet_number;
ALTER TABLE patients ADD UNIQUE INDEX uq_patients_billet (billet_number);
ALTER TABLE payments ADD COLUMN treatment_id INT NULL AFTER appointment_id;
ALTER TABLE payments ADD INDEX (treatment_id), ADD INDEX (patient_id);
CREATE TABLE IF NOT EXISTS treatments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    treatment_date VARCHAR(10) NOT NULL,
    tooth VARCHAR(50) NOT NULL DEFAULT '',
    act VARCHAR(255) NOT NULL,
    quote DECIMAL(10,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by INT NOT NULL,
    created_at VARCHAR(19),
    INDEX (patient_id, treatment_date)
);
