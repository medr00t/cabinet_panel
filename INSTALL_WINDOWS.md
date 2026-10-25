# Installing on a Windows laptop

Installer: `release-windows/Centre Dentaire Riad El Ansari_2.0.0_x64-setup.exe` (unsigned).

## 1. Install the app

1. Run the `.exe`. If Windows SmartScreen warns, click **More info**, then **Run anyway**.
2. If the installer says it **failed to install WebView2**, see "WebView2" below.

## 2. Put the config file in place

The app reads its codes and database passwords from a file that is **not** part of the installer.

1. Paste `%APPDATA%` into the Explorer address bar and press Enter.
2. Create a folder named `com.centre-dentaire.riad-el-ansari`.
3. Copy the laptop's config file into it and rename it to `cabinet_config.json`
   (reception laptop: the reception file; doctor's laptop: the doctor file).

Without this file the app starts but shows a "configuration introuvable" error at login.
A template is in `cabinet_config.example.json`.

## 3. Start the app

The login screen looks for the database server on the local network by itself and shows
"Serveur : ...". If it says "Serveur introuvable", click **Modifier**, type the IP address of the
laptop that runs the database, and click OK. Both laptops must be on the same network.
The database server setup is described in `LAN_SETUP.md`.

## WebView2 (the app cannot run without it)

The app displays its screens with Microsoft's WebView2 runtime. Windows 11 already has it; Windows 10
or a laptop with poor internet may not, and then the installer fails to download it.

1. Go to https://developer.microsoft.com/en-us/microsoft-edge/webview2/ and scroll to
   **Evergreen Standalone Installer**. Download the **x64** version (on another computer and copy it
   over if the cabinet laptop has no internet).
2. Right-click it and choose **Run as administrator**.
3. Start the app. If the app installer stopped halfway, run its `.exe` again, as administrator.

If the WebView2 download fails too, check that:
- the laptop really has internet (open a website),
- the date and time are correct (a wrong date makes the download fail),
- you are running the installer as administrator.

---

# Installation sur un poste Windows

Installateur : `release-windows/Centre Dentaire Riad El Ansari_2.0.0_x64-setup.exe` (non signé).

## 1. Installer l'application

1. Lancer le `.exe`. Si Windows SmartScreen affiche un avertissement : **Informations complémentaires**, puis **Exécuter quand même**.
2. Si l'installateur indique que **WebView2 n'a pas pu être installé**, voir « WebView2 » ci-dessous.

## 2. Placer le fichier de configuration

L'application lit ses codes et mots de passe dans un fichier qui **n'est pas** dans l'installateur.

1. Coller `%APPDATA%` dans la barre d'adresse de l'Explorateur et valider.
2. Créer un dossier nommé `com.centre-dentaire.riad-el-ansari`.
3. Y copier le fichier de configuration du poste et le renommer `cabinet_config.json`
   (poste réception : le fichier réception ; poste du docteur : le fichier docteur).

Sans ce fichier, l'application démarre mais affiche « configuration introuvable » à la connexion.
Un modèle se trouve dans `cabinet_config.example.json`.

## 3. Lancer l'application

L'écran de connexion cherche tout seul le serveur de base de données sur le réseau local et affiche
« Serveur : ... ». Si « Serveur introuvable » : cliquer sur **Modifier**, saisir l'adresse IP du poste
qui héberge la base, puis OK. Les deux postes doivent être sur le même réseau.
L'installation du serveur de base de données est décrite dans `LAN_SETUP.md`.

## WebView2 (l'application ne fonctionne pas sans)

L'application affiche ses écrans grâce à WebView2 de Microsoft. Windows 11 l'a déjà ; Windows 10 ou un
poste avec une mauvaise connexion peut ne pas l'avoir, et l'installateur échoue alors à le télécharger.

1. Aller sur https://developer.microsoft.com/en-us/microsoft-edge/webview2/ et descendre à
   **Evergreen Standalone Installer**. Télécharger la version **x64** (sur un autre ordinateur puis copier
   si le poste n'a pas internet).
2. Clic droit dessus, **Exécuter en tant qu'administrateur**.
3. Lancer l'application. Si l'installateur de l'application s'est arrêté, relancer son `.exe`, aussi en administrateur.

Si le téléchargement de WebView2 échoue aussi, vérifier que :
- le poste a vraiment internet (ouvrir un site),
- la date et l'heure sont correctes (une mauvaise date fait échouer le téléchargement),
- l'installateur est lancé en administrateur.
