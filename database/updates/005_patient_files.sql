-- Radiology images and documents attached to a patient's file. A removed file is only marked (deleted_at), never erased.
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
