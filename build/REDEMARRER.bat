@echo off
chcp 65001 >nul
rem REDEMARRE le serveur du cabinet (double-clic). A utiliser si les postes disent "Le serveur ne repond pas".
echo Arret du serveur...
schtasks /end /tn "Centre Dentaire" >nul 2>&1
taskkill /f /im cabinet_web.exe >nul 2>&1
timeout /t 3 /nobreak >nul
echo Demarrage...
schtasks /run /tn "Centre Dentaire" >nul 2>&1
if errorlevel 1 (
  echo Le demarrage automatique n'est pas installe : lancez INSTALLER-SERVEUR.bat ^(clic droit, Executer en tant qu'administrateur^).
  pause
  exit /b 1
)
timeout /t 8 /nobreak >nul
powershell -NoProfile -Command "try { $c = (Invoke-WebRequest -UseBasicParsing http://localhost:8080 -TimeoutSec 8).StatusCode; Write-Host ('Le serveur repond (code ' + $c + ').') -ForegroundColor Green } catch { Write-Host 'Le serveur ne repond pas encore : attendez 30 secondes puis relancez ce fichier, ou lancez DEMARRER-CABINET.bat pour voir l erreur.' -ForegroundColor Yellow }"
echo.
pause
