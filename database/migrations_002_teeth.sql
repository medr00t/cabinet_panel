-- Adds the tooth chart data. Run once on a database created before it existed:
--   mysql -uroot -p cabinet < database/migrations_002_teeth.sql
ALTER TABLE treatments MODIFY tooth VARCHAR(120) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS tooth_marks (
    patient_id INT NOT NULL,
    tooth VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT '',
    note TEXT,
    updated_by INT NOT NULL,
    updated_at VARCHAR(19),
    PRIMARY KEY (patient_id, tooth)
);
