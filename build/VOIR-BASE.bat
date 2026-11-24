@echo off
chcp 65001 >nul
rem VOIR LA BASE DE DONNEES (lecture seule) - a lancer sur le poste du docteur (le serveur). Ne modifie rien.
set "SQL=SELECT 'patients' AS table_name, COUNT(*) AS lignes FROM patients UNION SELECT 'rendez-vous', COUNT(*) FROM appointments UNION SELECT 'actes', COUNT(*) FROM treatments UNION SELECT 'paiements', COUNT(*) FROM payments UNION SELECT 'fiches CNSS', COUNT(*) FROM cnss_sheets; SELECT id, billet_number AS billet, first_name AS prenom, last_name AS nom, phone AS telephone FROM patients ORDER BY id DESC LIMIT 20; SELECT name AS reglage, value AS valeur FROM settings WHERE name = 'reception_code';"
powershell -NoProfile -Command "$h=$env:LOCALAPPDATA+'\CentreDentaire\database'; if (-not (Test-Path ($h+'\state.json'))) { Write-Host 'Base de donnees introuvable sur ce poste (dossier CentreDentaire).'; exit 1 }; $s=Get-Content ($h+'\state.json') | ConvertFrom-Json; $env:MYSQL_PWD=$s.root_password; & ($h+'\mysql\bin\mysql.exe') -uroot -h127.0.0.1 -P $s.port cabinet --default-character-set=utf8mb4 -t -e $env:SQL; $env:MYSQL_PWD=$null"
echo.
echo Si une erreur "Can't connect" apparait : lancez DEMARRER-CABINET.bat, attendez 30 secondes, puis relancez ce fichier.
pause
