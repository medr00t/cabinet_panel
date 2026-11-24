@echo off
chcp 65001 >nul
rem MISE A JOUR du cabinet, sans rien installer. A distance (AnyDesk) :
rem   1. glisser le nouveau fichier cabinet-web.zip dans ce dossier (transfert de fichiers AnyDesk)
rem   2. double-clic sur ce fichier
cd /d "%~dp0"
if not exist "cabinet-web.zip" (
  echo Le fichier cabinet-web.zip est introuvable dans ce dossier. Glissez-le ici puis relancez.
  pause
  exit /b 1
)
echo Arret du serveur...
taskkill /f /im cabinet_web.exe >nul 2>&1
timeout /t 3 /nobreak >nul
echo Installation de la nouvelle version...
if exist "%TEMP%\cabinet-maj" rmdir /s /q "%TEMP%\cabinet-maj"
powershell -NoProfile -Command "Expand-Archive -Force 'cabinet-web.zip' '%TEMP%\cabinet-maj'"
if errorlevel 1 (
  echo Echec de l'extraction. Rien n'a ete modifie.
  pause
  exit /b 1
)
copy /y "%TEMP%\cabinet-maj\cabinet-web\cabinet_web.exe" "cabinet_web.exe" >nul
if exist "dist" rmdir /s /q "dist"
xcopy /e /i /q /y "%TEMP%\cabinet-maj\cabinet-web\dist" "dist" >nul
if exist "%TEMP%\cabinet-maj\cabinet-web\database" xcopy /e /i /q /y "%TEMP%\cabinet-maj\cabinet-web\database" "database" >nul
rmdir /s /q "%TEMP%\cabinet-maj"
del /q "cabinet-web.zip"
echo.
echo Mise a jour terminee. Demarrage du serveur...
start "" "%~dp0DEMARRER-CABINET.bat"
echo Les postes doivent simplement actualiser la page ^(F5^). Les donnees n'ont pas ete touchees.
timeout /t 8 >nul
