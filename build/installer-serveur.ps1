# Installe le serveur du cabinet une seule fois : pare-feu + demarrage automatique, sans fenetre.
$ErrorActionPreference = 'Stop'
$dossier = Split-Path -Parent $MyInvocation.MyCommand.Path
$nom = 'Centre Dentaire'

# 1) Pare-feu : port 8080 ouvert pour le reseau du cabinet
if (-not (Get-NetFirewallRule -DisplayName 'Centre Dentaire - web' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Centre Dentaire - web' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Any | Out-Null
}

# 2) Ancien raccourci de demarrage (versions precedentes) : on le retire pour ne pas lancer deux serveurs
$ancien = Join-Path ([Environment]::GetFolderPath('Startup')) 'Centre Dentaire.lnk'
if (Test-Path $ancien) { Remove-Item $ancien -Force }

# 3) Tache planifiee : demarre a l'ouverture de session, cachee, et se relance toute seule si le serveur s'arrete
$utilisateur = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $dossier 'lancer-cache.vbs') + '"') -WorkingDirectory $dossier
$declencheur = New-ScheduledTaskTrigger -AtLogOn -User $utilisateur
$reglages = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $utilisateur -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $nom -Action $action -Trigger $declencheur -Settings $reglages -Principal $principal -Force | Out-Null

# 4) On l'arrete s'il tourne deja (ancienne fenetre noire) puis on le demarre maintenant
Get-Process -Name cabinet_web -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $nom

Write-Host ''
Write-Host 'Serveur installe : il demarrera tout seul a chaque ouverture de session Windows, sans fenetre.' -ForegroundColor Green
Write-Host ''
Write-Host 'Adresse a ouvrir dans Chrome sur les autres postes :'
Write-Host ('    http://' + $env:COMPUTERNAME + ':8080')
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } |
    ForEach-Object { Write-Host ('    http://' + $_.IPAddress + ':8080') }
