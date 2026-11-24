# Centre Dentaire — installation (3 étapes, rien à installer)

Un seul poste fait le **serveur** (celui qui garde déjà la base de données). Les autres ouvrent seulement une adresse dans **Chrome**. Pas de Docker, pas de Git, pas de programme sur les autres postes.

## Sur le poste serveur (une seule fois)

1. Télécharger **`cabinet-web.zip`** (https://github.com/medr00t/cabinet_panel → dossier `release-web`) et le décompresser, par exemple dans `C:\CentreDentaire`.
2. **Clic droit sur `INSTALLER-SERVEUR.bat` → Exécuter en tant qu'administrateur.** Il ouvre le pare-feu, démarre le serveur et le configure pour **démarrer tout seul à chaque ouverture de session Windows, sans fenêtre** : plus rien à lancer ensuite. Il affiche l'adresse à utiliser.
   - Pour que cela marche dès l'allumage du portable sans taper de mot de passe : Windows + R → `netplwiz` → décocher « Les utilisateurs doivent entrer un nom d'utilisateur et un mot de passe » (connexion automatique).
3. Dans Paramètres → Système → Alimentation : **Veille = Jamais** (sur secteur).

Le serveur reprend la base de données et le fichier de codes déjà présents sur ce poste : rien à refaire si l'ancienne application y fonctionnait.

## Sur tous les autres postes

Ouvrir Chrome et taper l'adresse affichée par le serveur, par exemple **`http://NOM-DU-PC:8080`** (ou `http://192.168.1.152:8080`). Ajouter la page aux favoris. Se connecter avec son code à 4 chiffres.

> **Adresse qui ne change plus :** sur le serveur, clic droit sur **`IP-FIXE.bat` → Exécuter en tant qu'administrateur** (une seule fois). Il fixe l'adresse actuelle du poste. (Mieux encore, si possible : « Réservation DHCP » dans le routeur, 192.168.1.1.) Sinon, utiliser l'adresse affichée dans la fenêtre du serveur.

## Zoom et plein écran

En bas du menu de gauche : **−** / **+** (mémorisé sur chaque poste), **100 %** pour revenir à la normale, bouton **plein écran** (ou `F11`).

## Mises à jour (à distance, AnyDesk, sans rien installer)

1. Connexion AnyDesk au poste serveur.
2. Transfert de fichiers AnyDesk : envoyer le nouveau **`cabinet-web.zip`** dans le dossier du serveur (là où se trouve `DEMARRER-CABINET.bat`).
3. Double-clic sur **`METTRE-A-JOUR.bat`**. Il arrête le serveur, remplace le programme et le redémarre. Les données, codes et sauvegardes ne sont **jamais** touchés ; si la nouvelle version modifie la base, la modification s'applique toute seule.
4. Sur chaque poste : F5.

(Côté développeur : `./build/build-web-windows.sh` produit `release-web/cabinet-web.zip`.)

## Sauvegardes

Le docteur : bouton **Sauvegarde Excel** (aussi automatique à chaque connexion). Les fichiers sont sur le poste serveur ; **Télécharger** les copie sur le poste du docteur. Les copier régulièrement sur une clé USB ou dans le cloud.

## Si ça ne marche pas

- « Le serveur ne répond pas » : poste serveur éteint, en veille, ou session Windows pas ouverte → ouvrir la session. Si besoin, `DEMARRER-CABINET.bat` démarre le serveur à la main avec une fenêtre (diagnostic). Le journal est `cabinet_web.log` dans le dossier du serveur.
- La page s'ouvre sur le serveur mais pas sur les autres postes : le pare-feu → relancer `DEMARRER-CABINET.bat` en administrateur.
- Rien ne s'affiche : envoyer une photo de la fenêtre noire.

*(Option avancée, non nécessaire : voir `INSTALL_DOCKER.md`.)*
