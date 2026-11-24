@echo off
chcp 65001 >nul
rem MISE A JOUR du cabinet (double-clic, ou a distance avec AnyDesk). Les donnees ne sont jamais touchees.
cd /d "%~dp0"
echo Telechargement de la nouvelle version...
git -C .. pull --ff-only
if errorlevel 1 (
  echo.
  echo Impossible de telecharger la mise a jour ^(Internet ? Git installe ?^). Rien n'a ete modifie.
  pause
  exit /b 1
)
echo.
echo Installation de la nouvelle version ^(2 a 10 minutes^)...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Echec. Verifiez que Docker Desktop est demarre, puis relancez ce fichier.
  pause
  exit /b 1
)
docker image prune -f >nul 2>&1
echo.
docker compose ps
echo.
echo Version installee :
git -C .. log -1 --format="%%h  %%cd  %%s" --date=format:%%d/%%m/%%Y
echo.
echo Termine. Les postes doivent simplement actualiser la page ^(F5^).
pause
