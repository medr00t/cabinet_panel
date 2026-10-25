# Configuration MySQL pour Cabinet Panel

## État Actuel
✅ **Patients**: Sauvegardés dans `cabinet_data/patients.json` + synchronisation automatique vers MySQL  
🔧 **Rendez-vous**: Sauvegardés dans `cabinet_data/appointments.json` (en cours d'implémentation)  
🔧 **Base MySQL**: Configuration prête, synchronisation automatique ajoutée

## Configuration MySQL

### 1. Vérifiez vos identifiants MySQL
Ouvrez le fichier `src-tauri/src/lib.rs` et modifiez les constantes aux lignes 12-15:

```rust
const SERVER_IP: &str = "localhost";     // Votre IP MySQL
const LOGIN_USER: &str = "root";         // Votre utilisateur MySQL  
const LOGIN_PASS: &str = "<MOT_DE_PASSE>";      // Votre mot de passe MySQL
const DB_NAME: &str = "cabinet";         // Nom de votre base de données
```

### 2. Structure de table nécessaire
Vérifiez que votre table `patients` a cette structure:

```sql
CREATE TABLE patients (
    id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    date_of_birth DATE,
    gender VARCHAR(10),
    address TEXT,
    allergies TEXT,
    medical_history TEXT,
    medications TEXT,
    emergency_contact VARCHAR(255),
    emergency_phone VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Installation MySQL CLI (si nécessaire)
Pour la synchronisation automatique, vous devez avoir le client MySQL installé:

```bash
# Windows - téléchargez depuis mysql.com
# Ou avec Chocolatey:
choco install mysql

# Vérifiez l'installation:
mysql --version
```

## Comment ça fonctionne maintenant

### Système Hybride: Fichiers + MySQL
1. **Sauvegarde locale**: Tous les données sont sauvegardées en fichiers JSON localement
2. **Auto-sync MySQL**: Chaque ajout/modification de patient est automatiquement synchronisé vers MySQL  
3. **Détection de changements**: L'app détecte automatiquement les changements de fichiers et recharge les données
4. **Persistance garantie**: Même si MySQL échoue, vos données sont sauvegardées localement

### Fichiers créés
- `cabinet_data/patients.json` - Données des patients
- `cabinet_data/appointments.json` - Données des rendez-vous (bientôt)

### Logs de débogage
Surveillez la console pour:
- `[DEBUG] Patient synced to MySQL successfully` - Synchronisation réussie
- `[WARNING] Failed to sync patient to MySQL` - Problème de synchronisation

## Prochaines étapes
1. ✅ Patients entièrement fonctionnels (fichier + MySQL sync)
2. 🔧 Finaliser la sauvegarde des rendez-vous
3. 🔧 Ajouter sync MySQL pour les rendez-vous
4. 🔧 Interface de configuration des paramètres MySQL

## Tests
Pour tester:
1. Ajoutez un patient dans l'interface
2. Vérifiez `cabinet_data/patients.json` - doit contenir le patient
3. Vérifiez votre table MySQL `patients` - doit contenir le même patient
4. Redémarrez l'app - le patient doit toujours être visible

**Le système "sync auto" fonctionne maintenant! 🎉**