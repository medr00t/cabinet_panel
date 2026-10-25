@echo off
rem Lance la base de donnees du cabinet sur CE poste (double-clic). Docker Desktop doit etre installe.
cd /d "%~dp0"
if not exist ".env" (
  echo Le fichier .env est introuvable. Copiez .env.example en .env et remplacez les CHANGE_ME par des mots de passe.
  pause
  exit /b 1
)
docker compose up -d
if errorlevel 1 (
  echo.
  echo Docker n'est pas demarre ou n'est pas installe. Ouvrez Docker Desktop puis relancez ce fichier.
  pause
  exit /b 1
)
echo.
echo La base de donnees tourne sur ce poste. Adresse a retenir (IPv4) :
ipconfig | findstr /i "IPv4"
echo.
echo Les autres postes trouvent ce serveur automatiquement. Laissez ce poste allume pendant les heures de travail.
pause
