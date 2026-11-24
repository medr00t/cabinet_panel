@echo off
chcp 65001 >nul
rem INSTALLATION DU SERVEUR (une seule fois) : clic droit -> Executer en tant qu'administrateur.
rem Apres cela, le serveur demarre tout seul a chaque ouverture de session Windows, sans fenetre : plus rien a lancer.
net session >nul 2>&1
if errorlevel 1 (
  echo Clic droit sur ce fichier puis "Executer en tant qu'administrateur".
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer-serveur.ps1"
if errorlevel 1 (
  echo.
  echo Une erreur est survenue. Envoyez une photo de cette fenetre.
)
echo.
pause
