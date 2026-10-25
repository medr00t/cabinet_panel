#!/bin/bash
# Runs once, on first start with an empty volume. Creates the two app accounts.
set -e
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER '${DOCTOR_DB_USER:-guestx}'@'%' IDENTIFIED BY '${DOCTOR_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON cabinet.* TO '${DOCTOR_DB_USER:-guestx}'@'%';
CREATE USER '${RECEPTION_DB_USER:-reception}'@'%' IDENTIFIED BY '${RECEPTION_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE ON cabinet.* TO '${RECEPTION_DB_USER:-reception}'@'%';
GRANT DELETE ON cabinet.appointments TO '${RECEPTION_DB_USER:-reception}'@'%';
FLUSH PRIVILEGES;
SQL
