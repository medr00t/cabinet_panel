# Installation sur Windows

Un seul fichier : `release-windows/Centre Dentaire Riad El Ansari_2.0.0_x64-setup.exe`. Pas de Docker, rien d'autre à installer à la main.

## 1. Premier poste (celui qui garde la base de données)

1. Lancez l'installateur, puis ouvrez **Centre Dentaire Riad El Ansari**.
2. Choisissez **Ce poste garde la base de données**.
3. Indiquez qui utilise ce poste (Réception ou Docteur), son code à 4 chiffres, et choisissez le **mot de passe du cabinet** (8 caractères minimum). Notez-le : il sera redemandé sur les autres postes.
4. L'application télécharge MySQL (environ 270 Mo, Internet nécessaire une seule fois), l'installe, crée les tables et les comptes. Comptez quelques minutes.
5. Si des sauvegardes Excel du cabinet sont trouvées (Documents, Bureau, Téléchargements, clé USB), l'application propose de les **restaurer**.
6. La base de données redémarre toute seule avec Windows. Ce poste doit être allumé pendant les heures du cabinet. Si Windows demande d'autoriser le réseau, acceptez.

## 2. Les autres postes

Installez, ouvrez, choisissez **Ce poste se connecte à un autre poste**, saisissez son code et le **même mot de passe du cabinet**. Le serveur est trouvé tout seul sur le réseau.

## 3. Changer un code ou un mot de passe

Sur l'écran de connexion, **Reconfigurer ce poste** rejoue les questions :
- *Code du docteur* : refaire l'assistant sur le poste du docteur avec le **même** mot de passe du cabinet et le nouveau code.
- *Réponse de sécurité du docteur* : idem.
- Le mot de passe du cabinet lui-même ne change pas après l'installation de la base de données.

## 4. Si WebView2 ne s'installe pas

Windows 10 ancien : installez « Microsoft Edge WebView2 Runtime » (Evergreen Standalone) depuis le site de Microsoft, puis relancez l'installateur.

## 5. Si la base de données ne démarre pas

Les fichiers sont dans `%LOCALAPPDATA%\CentreDentaire\database` (journal : `mysqld.log`). Si MySQL se plaint d'une DLL manquante, installez « Microsoft Visual C++ Redistributable 2015-2022 (x64) ».

## 6. « Un autre programme utilise déjà le port 3306 »

Un autre MySQL (ancien service, XAMPP, WAMP, ou un `mysqld.exe` resté d'un essai précédent) occupe déjà le port. Dans **PowerShell** (clic droit sur Démarrer), copiez cette ligne pour voir lequel :

```
Get-Process -Id (Get-NetTCPConnection -LocalPort 3306 -State Listen).OwningProcess | Select Name, Id, Path
```

- Si le chemin contient `CentreDentaire\database` : c'est resté d'un essai précédent. Fermez-le, puis rouvrez l'application :

  ```
  Stop-Process -Name mysqld -Force
  ```

- Si c'est un service MySQL dont vous n'avez pas besoin (PowerShell en administrateur) :

  ```
  Stop-Service MySQL80
  Set-Service MySQL80 -StartupType Disabled
  ```

  (remplacez `MySQL80` par le nom affiché dans `services.msc`)

- Si ce MySQL contient des données à garder, ne l'arrêtez pas : il faut utiliser un autre port pour l'application.

## 7. L'autre poste reste sur « Recherche du serveur »

Le pare-feu du poste qui garde la base de données bloque sans doute le port 3306. Sur **ce poste** (celui de la base), dans PowerShell **en administrateur** :

```
netsh advfirewall firewall add rule name="Centre Dentaire - base de donnees" dir=in action=allow protocol=TCP localport=3306 profile=any
```

(Rouvrir **Reconfigurer ce poste → Ce poste garde la base de données** fait la même chose et Windows demande alors l'autorisation.) Vérifiez aussi que les deux ordinateurs sont sur le même Wi-Fi ou le même câble.

## 8. Connexion lente entre les postes

La base de données n'interroge plus le nom de chaque poste qui se connecte (`skip-name-resolve`), ce qui prenait plusieurs secondes. Sur un poste déjà installé, le réglage est appliqué au **prochain démarrage** de la base : fermez-la une fois puis rouvrez l'application, dans PowerShell :

```
Stop-Process -Name mysqld -Force
```

## 9. « Le serveur est là, mais le mot de passe est incorrect » (alors que c'est le même mot de passe)

Il peut y avoir **deux** serveurs MySQL sur le poste de la base de données : celui de l'application et un autre qui écoute aussi sur le port 3306. Sur ce poste, dans PowerShell :

```
Get-NetTCPConnection -LocalPort 3306 -State Listen | Select LocalAddress, LocalPort, OwningProcess
Get-Process mysqld | Select Id, Path
```

- **Une seule ligne**, avec un chemin qui contient `CentreDentaire\database` : c'est normal, le problème est ailleurs.
- **Deux lignes** (deux adresses ou deux processus) : arrêtez tous les `mysqld`, puis rouvrez l'application, qui relance le bon :

  ```
  Stop-Process -Name mysqld -Force
  ```

Ensuite, sur le poste de la base : **Reconfigurer ce poste → Ce poste garde la base de données** (cochez *Afficher le mot de passe*), puis sur l'autre poste : **Reconfigurer ce poste → se connecte à un autre poste**.
