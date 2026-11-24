-- Reception accounts created by the doctor. A removed account is only marked (deleted_at), never erased.
CREATE TABLE IF NOT EXISTS staff (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    code VARCHAR(4) NOT NULL,
    created_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    INDEX (code)
);
