# Centre Dentaire — serveur avec Docker (OPTION, non nécessaire)

> Pour le cabinet, utilisez plutôt `INSTALL_WEB.md` : rien à installer. Docker + Git ne servent que si vous le souhaitez (par exemple un serveur Linux).

Un seul poste fait le **serveur**. Tout (base de données + application web) tourne dans Docker et redémarre tout seul. Les autres postes ouvrent seulement `http://<adresse du serveur>:8080` dans Chrome.

## 1. Installation du serveur (une seule fois)

Sur le poste serveur (Windows 10/11) :

1. **Adresse IP fixe** et **jamais en veille** : voir `INSTALL_WEB.md`, étape 1 (réservation DHCP dans le routeur, ou IP manuelle).
2. Installer **Docker Desktop** (https://www.docker.com/products/docker-desktop), l'ouvrir, puis dans ses réglages (⚙) → General : cocher **« Start Docker Desktop when you sign in »**.
3. Installer **Git** (https://git-scm.com/download/win), puis dans PowerShell :
   ```
   cd C:\
   git clone https://github.com/medr00t/cabinet_panel CentreDentaire
   ```
4. Double-clic sur **`C:\CentreDentaire\server\INSTALLER.bat`** : il demande le nom du docteur et les deux codes à 4 chiffres, crée les mots de passe de la base tout seul, puis installe et démarre tout (10 à 15 minutes la première fois).
5. Pare-feu (une seule fois), PowerShell **en administrateur** :
   ```
   netsh advfirewall firewall add rule name="Centre Dentaire - web" dir=in action=allow protocol=TCP localport=8080 profile=any
   ```
6. Sur ce poste : `http://localhost:8080`. Sur les autres : `http://192.168.1.152:8080` (adresse IP du serveur).

Après un redémarrage de Windows, tout revient seul (Docker Desktop démarre à l'ouverture de session, puis les deux conteneurs).

## 2. Mises à jour (à distance, avec AnyDesk)

1. Se connecter au poste serveur avec AnyDesk.
2. Double-clic sur **`C:\CentreDentaire\server\METTRE-A-JOUR.bat`**.
3. Attendre « Termine » (2 à 10 minutes). Les données (base, codes, sauvegardes) ne sont **jamais** touchées.
4. Sur chaque poste : actualiser la page (F5).

Ce que fait le script : télécharge la dernière version (`git pull`), reconstruit et redémarre l'application. Si la nouvelle version modifie la base de données, la modification s'applique **toute seule** au démarrage (fichiers `database/updates/*.sql`, appliqués une seule fois chacun).

Côté développeur : `git push` sur `main` suffit ; ensuite lancer `METTRE-A-JOUR.bat` sur le serveur.

## 3. En cas de problème

Double-clic sur **`server\DIAGNOSTIC.bat`** : il affiche l'état, les dernières lignes du journal, un test de la page et l'adresse du poste. Envoyer une photo.

- Page inaccessible depuis un autre poste mais OK sur le serveur : pare-feu (étape 5) ou adresse IP changée.
- « Le serveur ne répond pas » : Docker Desktop n'est pas démarré ou le poste est en veille.
- Redémarrer à la main : dans `server\` → `docker compose restart`.

## 4. Sauvegardes

- Excel (bouton **Sauvegarde Excel**, automatique à chaque connexion du docteur) : fichiers dans `C:\CentreDentaire\server\backups`. **Copier ce dossier régulièrement** sur une clé USB ou dans le cloud ; le bouton *Télécharger* fonctionne aussi.
- Perte du serveur : réinstaller (étapes 1 à 4) puis, en docteur, **Sauvegarde Excel → Restaurer** le fichier le plus récent.

## 5. Reprendre les données de l'ancienne installation

La base de l'ancien programme (poste 192.168.1.152) n'est pas dans Docker. Pour la reprendre : sur l'ancien système, faire une **Sauvegarde Excel complète**, copier les fichiers `cabinet_*.xlsx` dans `server\backups`, puis dans le nouveau système, en docteur : **Sauvegarde Excel → Restaurer** (une base vide est nécessaire : c'est le cas juste après l'installation).
