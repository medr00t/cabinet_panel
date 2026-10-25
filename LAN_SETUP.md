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

À chaque connexion du docteur, l'application met à jour un classeur Excel **par mois** dans
`Documents\Sauvegardes Cabinet\` : `cabinet_2026-10.xlsx`, `cabinet_2026-11.xlsx`…

Chaque classeur contient :
- **Résumé** : les totaux du mois et une ligne par jour ;
- **Nouveaux patients** : tous les patients enregistrés pendant le mois, sur une seule feuille ;
- **une feuille par jour** (`25-10`, `26-10`…) : rendez-vous, actes, paiements (avec le total encaissé par mode)
  et nouveaux patients de la journée ;
- **Tous les patients** et **Dents** : l'état complet, pour qu'un seul fichier suffise à tout retrouver.

Le fichier du mois en cours est mis à jour à chaque connexion (la feuille du jour se complète, les jours
précédents restent). À la fin du mois, un nouveau fichier commence et l'ancien est conservé tel quel.
Le bouton **Sauvegarde Excel** du menu régénère tous les mois. Pour changer le dossier, ajouter
`"backup_dir": "D:\\Sauvegardes"` dans `cabinet_config.json`. Si un fichier est ouvert dans Excel, une copie
avec l'heure est créée. Les fichiers ne contiennent aucun mot de passe.
