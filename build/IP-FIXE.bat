@echo off
chcp 65001 >nul
rem FIXE l'adresse IP de ce poste (celle qu'il utilise maintenant), pour qu'elle ne change plus.
rem A lancer UNE fois : clic droit -> Executer en tant qu'administrateur.
net session >nul 2>&1
if errorlevel 1 (
  echo Clic droit sur ce fichier puis "Executer en tant qu'administrateur".
  pause
  exit /b 1
)
powershell -NoProfile -Command "$c = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1; if (-not $c) { Write-Host 'Aucun reseau actif trouve.'; exit 1 }; $i=$c.InterfaceIndex; $ip=$c.IPv4Address.IPAddress; $pl=$c.IPv4Address.PrefixLength; $gw=$c.IPv4DefaultGateway.NextHop; Write-Host ('Adresse fixee : ' + $ip + '  (passerelle ' + $gw + ')'); Set-NetIPInterface -InterfaceIndex $i -Dhcp Disabled; Remove-NetIPAddress -InterfaceIndex $i -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue; Remove-NetRoute -InterfaceIndex $i -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue; New-NetIPAddress -InterfaceIndex $i -IPAddress $ip -PrefixLength $pl -DefaultGateway $gw | Out-Null; Set-DnsClientServerAddress -InterfaceIndex $i -ServerAddresses @($gw,'8.8.8.8')"
echo.
echo Termine. Adresse de ce poste :
ipconfig | findstr /i "IPv4"
echo.
echo Pour revenir en automatique un jour : Parametres - Reseau - Proprietes - Attribution IP - Automatique ^(DHCP^).
pause
