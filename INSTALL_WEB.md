> Avec Docker (recommandé, mises à jour simples) : voir [INSTALL_DOCKER.md](INSTALL_DOCKER.md).

# Centre Dentaire — version web (mode d'emploi)

Un seul poste fait le **serveur** (il garde la base de données). Tous les autres postes ouvrent simplement une adresse dans **Chrome** : rien à installer, rien à configurer.

## 1. Sur le poste serveur (une seule fois)

1. **Adresse IP fixe** — au choix :
   - *Le mieux* : dans le routeur (souvent `192.168.1.1`), « Réservation DHCP » / « Address reservation » : lier ce poste à `192.168.1.152`.
   - *Ou* dans Windows : Paramètres → Réseau et Internet → Wi-Fi (ou Ethernet) → votre réseau → Propriétés matérielles → Attribution d'adresse IP → Modifier → Manuel → IPv4 :
     adresse `192.168.1.152`, masque `255.255.255.0`, passerelle `192.168.1.1` (vérifier avec `ipconfig`, ligne « Passerelle par défaut »), DNS `192.168.1.1` et `8.8.8.8`.
2. **Ne jamais se mettre en veille** : Paramètres → Système → Alimentation → Veille : Jamais (sur secteur).
3. Décompresser `cabinet-web.zip` (par exemple dans `C:\CentreDentaire\cabinet-web`).
4. Clic droit sur **DEMARRER-CABINET.bat → Exécuter en tant qu'administrateur** (la première fois : ouvre le port 8080 du pare-feu). Laisser la fenêtre ouverte.
   - Le serveur utilise la base de données déjà installée sur ce poste et le fichier `cabinet_config.json` existant (`%APPDATA%\com.centre-dentaire.riad-el-ansari`). Rien à refaire si l'ancienne application fonctionnait sur ce poste.
5. Pour qu'il démarre tout seul avec Windows : touche Windows + R → `shell:startup` → y glisser un raccourci vers `DEMARRER-CABINET.bat`.

## 2. Sur tous les autres postes

Ouvrir Chrome et aller sur **`http://192.168.1.152:8080`** (ajouter la page aux favoris). Se connecter avec son code à 4 chiffres.

Sur le poste serveur lui-même : `http://localhost:8080`.

## 3. Zoom et plein écran

En bas du menu de gauche (et sur l'écran de connexion) : boutons **−** / **+** pour le zoom (le niveau est mémorisé sur chaque poste), **100 %** pour revenir à la normale, et le bouton **plein écran**. `F11` fonctionne aussi.

## 4. Sauvegardes

Le docteur : bouton **Sauvegarde Excel**. Les fichiers sont créés sur le poste serveur ; le bouton **Télécharger** les enregistre sur le poste du docteur (à copier régulièrement sur une clé USB ou dans le cloud).

## 5. Si ça ne marche pas

- « Le serveur ne répond pas » : le poste serveur est éteint / en veille, ou `DEMARRER-CABINET.bat` n'est pas lancé.
- La page ne s'ouvre pas depuis un autre poste, mais s'ouvre sur le serveur : le pare-feu. Relancer le `.bat` en administrateur.
- Le port 8080 est pris : définir la variable `CABINET_PORT` (par exemple `set CABINET_PORT=8090` dans le `.bat`).
- L'adresse du serveur a changé : refaire l'étape 1 (adresse IP fixe).
