@echo off
rem Demarre le serveur du cabinet sur CE poste (double-clic). Laissez cette fenetre ouverte.
cd /d "%~dp0"
rem Ouvre le port 8080 du pare-feu (la premiere fois, lancez ce fichier en "Executer en tant qu administrateur")
netsh advfirewall firewall show rule name="Centre Dentaire - web" >nul 2>&1 || netsh advfirewall firewall add rule name="Centre Dentaire - web" dir=in action=allow protocol=TCP localport=8080 profile=any >nul 2>&1
echo.
echo Adresse a ouvrir dans Chrome sur les autres postes : http://IPv4-de-ce-poste:8080
ipconfig | findstr /i "IPv4"
echo.
cabinet_web.exe
pause
