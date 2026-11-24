@echo off
chcp 65001 >nul
rem SERVEUR DU CABINET : double-clic pour demarrer. Laissez cette fenetre ouverte (reduite, c'est bien).
cd /d "%~dp0"
taskkill /f /im cabinet_web.exe >nul 2>&1

rem 1) Pare-feu : ouvre le port 8080 (necessite "Executer en tant qu'administrateur" la toute premiere fois)
netsh advfirewall firewall show rule name="Centre Dentaire - web" >nul 2>&1
if errorlevel 1 (
  netsh advfirewall firewall add rule name="Centre Dentaire - web" dir=in action=allow protocol=TCP localport=8080 profile=any >nul 2>&1
  if errorlevel 1 (
    echo ATTENTION : le pare-feu n'a pas pu etre ouvert. Fermez cette fenetre, puis clic droit sur ce fichier
    echo             et "Executer en tant qu'administrateur" ^(une seule fois^).
    echo.
  )
)

rem 2) Demarrage automatique avec Windows (cree le raccourci une seule fois)
powershell -NoProfile -Command "$p=[Environment]::GetFolderPath('Startup')+'\Centre Dentaire.lnk'; if (-not (Test-Path $p)) { $s=(New-Object -ComObject WScript.Shell).CreateShortcut($p); $s.TargetPath='%~dp0DEMARRER-CABINET.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save() }" >nul 2>&1

echo ============================================================
echo  Sur les AUTRES postes, ouvrir Chrome et taper l'une de ces adresses :
echo.
echo     http://%COMPUTERNAME%:8080
ipconfig | findstr /i "IPv4"
echo     ^(l'adresse IPv4 ci-dessus, suivie de :8080^)
echo ============================================================
echo.
cabinet_web.exe
echo.
echo Le serveur s'est arrete. Fermez cette fenetre et relancez DEMARRER-CABINET.bat.
pause
