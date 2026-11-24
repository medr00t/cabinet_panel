@echo off
chcp 65001 >nul
rem Demarrage MANUEL avec fenetre (diagnostic). En temps normal, INSTALLER-SERVEUR.bat suffit : le serveur demarre tout seul.
cd /d "%~dp0"
taskkill /f /im cabinet_web.exe >nul 2>&1
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
echo Le serveur s'est arrete. Fermez cette fenetre. ^(Il redemarrera tout seul a la prochaine ouverture de session.^)
pause
