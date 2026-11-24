@echo off
chcp 65001 >nul
rem PREMIERE INSTALLATION du serveur du cabinet (double-clic). Docker Desktop doit etre installe et demarre.
cd /d "%~dp0"
docker --version >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop n'est pas installe. Installez-le depuis https://www.docker.com/products/docker-desktop puis relancez ce fichier.
  pause
  exit /b 1
)
if not exist ".env" (
  echo.
  echo === Configuration du cabinet ===
  set /p NOM=Nom du docteur ^(ex: Dr. El Ansari^) :
  set /p CODE_DOC=Code du docteur ^(4 chiffres^) :
  set /p CODE_REC=Code de la reception ^(4 chiffres^) :
  powershell -NoProfile -Command "function P { -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}) }; $l = @('MYSQL_ROOT_PASSWORD=' + (P), 'DOCTOR_DB_USER=guestx', 'DOCTOR_DB_PASSWORD=' + (P), 'RECEPTION_DB_USER=reception', 'RECEPTION_DB_PASSWORD=' + (P), 'DOCTOR_NAME=' + $env:NOM, 'DOCTOR_CODE=' + $env:CODE_DOC, 'RECEPTION_CODE=' + $env:CODE_REC); [IO.File]::WriteAllLines('.env', $l)"
)
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Echec. Ouvrez Docker Desktop, attendez qu'il soit pret, puis relancez ce fichier.
  pause
  exit /b 1
)
echo.
echo Serveur installe. Adresse a ouvrir dans Chrome sur les autres postes : http://IPv4-de-ce-poste:8080
ipconfig | findstr /i "IPv4"
echo.
pause
