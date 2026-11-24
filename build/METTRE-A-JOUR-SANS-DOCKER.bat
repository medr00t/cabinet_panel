@echo off
chcp 65001 >nul
rem MISE A JOUR du cabinet, sans rien installer. Les donnees ne sont jamais touchees.
rem   1. mettre le nouveau fichier cabinet-web.zip dans ce dossier OU dans Telechargements (AnyDesk ou telechargement GitHub)
rem   2. double-clic sur ce fichier
cd /d "%~dp0"
set "ZIP="
for %%f in ("%~dp0cabinet-web*.zip") do set "ZIP=%%~f"
if not defined ZIP for %%f in ("%USERPROFILE%\Downloads\cabinet-web*.zip") do set "ZIP=%%~f"
if not defined ZIP (
  echo Aucun fichier cabinet-web.zip trouve ^(ni dans ce dossier, ni dans Telechargements^).
  echo Telechargez-le ou glissez-le dans ce dossier, puis relancez.
  pause
  exit /b 1
)
echo Fichier de mise a jour : %ZIP%
echo Arret du serveur...
schtasks /end /tn "Centre Dentaire" >nul 2>&1
taskkill /f /im cabinet_web.exe >nul 2>&1
timeout /t 3 /nobreak >nul
echo Installation de la nouvelle version...
if exist "%TEMP%\cabinet-maj" rmdir /s /q "%TEMP%\cabinet-maj"
powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath $env:ZIP -DestinationPath ($env:TEMP + '\cabinet-maj')"
if errorlevel 1 (
  echo Echec de l'extraction. Rien n'a ete modifie.
  pause
  exit /b 1
)
if not exist "%TEMP%\cabinet-maj\cabinet-web\cabinet_web.exe" (
  echo Ce fichier ne ressemble pas a une mise a jour du cabinet. Rien n'a ete modifie.
  pause
  exit /b 1
)
copy /y "%TEMP%\cabinet-maj\cabinet-web\cabinet_web.exe" "cabinet_web.exe" >nul
if exist "dist" rmdir /s /q "dist"
xcopy /e /i /q /y "%TEMP%\cabinet-maj\cabinet-web\dist" "dist" >nul
if exist "%TEMP%\cabinet-maj\cabinet-web\database" xcopy /e /i /q /y "%TEMP%\cabinet-maj\cabinet-web\database" "database" >nul
for %%s in (INSTALLER-SERVEUR.bat installer-serveur.ps1 lancer-cache.vbs DEMARRER-CABINET.bat) do if exist "%TEMP%\cabinet-maj\cabinet-web\%%s" copy /y "%TEMP%\cabinet-maj\cabinet-web\%%s" "%%s" >nul
rmdir /s /q "%TEMP%\cabinet-maj"
del /q "%ZIP%"
echo.
echo Mise a jour terminee. Demarrage du serveur...
schtasks /run /tn "Centre Dentaire" >nul 2>&1
if errorlevel 1 start "" "%~dp0DEMARRER-CABINET.bat"
echo Les postes doivent simplement actualiser la page ^(F5^). Les donnees n'ont pas ete touchees.
timeout /t 8 >nul
