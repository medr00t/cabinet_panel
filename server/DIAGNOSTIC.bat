@echo off
chcp 65001 >nul
rem Affiche l'etat du serveur du cabinet (a lancer en cas de probleme, puis envoyer une photo).
cd /d "%~dp0"
echo === Etat des conteneurs ===
docker compose ps
echo.
echo === Dernieres lignes du serveur web ===
docker compose logs --tail 25 web
echo.
echo === Test de la page ===
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8080 -TimeoutSec 5).StatusCode } catch { 'ECHEC: ' + $_.Exception.Message }"
echo.
echo === Adresse de ce poste ===
ipconfig | findstr /i "IPv4"
echo.
echo === Version ===
git -C .. log -1 --format="%%h  %%cd  %%s" --date=format:%%d/%%m/%%Y
echo.
pause
