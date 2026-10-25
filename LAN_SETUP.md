# Réseau local (plusieurs postes)

Chaque poste lance l'application et se connecte directement à **un seul serveur MySQL**
(en général le poste du docteur). Il n'y a pas de synchronisation entre postes : tous lisent
et écrivent la même base `cabinet`.

## 1. Sur le poste serveur (un seul poste)

Prérequis : Docker (Docker Desktop sur Windows). Dans le dossier `server/` :

1. Copier `.env.example` en `.env` et remplacer chaque `CHANGE_ME` par un mot de passe
   (ce sont les mots de passe MySQL ; ils doivent être les mêmes que dans `cabinet_config.json`).
2. `docker compose up -d`

Au premier démarrage, la base `cabinet`, les tables et les deux comptes sont créés
automatiquement (le compte réception ne peut supprimer que des rendez-vous : la base refuse le reste).
Le conteneur redémarre tout seul avec Docker. Les données sont dans le volume Docker `cabinet-data`.

Base déjà installée avant le carnet de soins (actes / paiements / n° billet) : exécuter une fois
`database/migrations_001_ledger.sql` (voir README). Une installation neuve n'en a pas besoin.

Sauvegarde : `docker exec cabinet-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" cabinet' > sauvegarde.sql`

Donner une IP fixe au poste serveur (réservation DHCP sur le routeur). Autoriser le port 3306
dans le pare-feu pour le réseau local uniquement (Windows : la fenêtre du pare-feu s'affiche au
premier lancement, choisir « réseau privé »).

## 2. Sur les autres postes (réception)

Aucune configuration : au démarrage, l'application cherche toute seule le serveur MySQL
sur le réseau local (port 3306) et s'y connecte. Si le poste du docteur change d'IP,
elle le retrouve à la prochaine connexion. Le champ **Serveur** de l'écran de connexion
n'est là que pour forcer une adresse si la détection échoue (réseaux séparés, pare-feu).

## 3. Fichier de configuration (chaque poste)

Les codes, mots de passe MySQL et la réponse de sécurité du docteur ne sont plus dans le code.
Chaque poste lit `cabinet_config.json` dans son dossier de configuration :
- Linux : `~/.config/com.centre-dentaire.riad-el-ansari/`
- Windows : `%APPDATA%\com.centre-dentaire.riad-el-ansari\`

Modèle : `cabinet_config.example.json` à la racine du projet. Variable `CABINET_CONFIG`
pour utiliser un autre chemin. Le poste de réception n'a pas besoin du mot de passe docteur :
mettre seulement l'utilisateur réception dans son fichier.

## Rôles

Les codes sont définis dans `cabinet_config.json` (rôle `doctor` ou `reception`).

Réception : peut gérer patients, rendez-vous et encaissements, voit uniquement ses propres
paiements du jour. Docteur : tout, y compris suppression de patients, annulation/suppression
de rendez-vous terminés et vue financière de tous les utilisateurs.

## Sauvegarde Excel (poste du docteur)

À chaque connexion du docteur, l'application enregistre toutes les données (patients, actes, paiements,
rendez-vous, remarques sur les dents) dans un classeur Excel :
`Documents\Sauvegardes Cabinet\cabinet_AAAA-MM-JJ.xlsx` (un fichier par jour, remplacé à chaque connexion du
jour). Le bouton **Sauvegarde Excel** du menu fait la même chose à la demande. Pour changer le dossier,
ajouter `"backup_dir": "D:\\Sauvegardes"` dans `cabinet_config.json`. Si le fichier du jour est ouvert dans
Excel, une copie avec l'heure est créée. Le fichier ne contient aucun mot de passe.
