use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

// Codes, MySQL passwords and the doctor's security answer live in a JSON file outside the
// repository (see cabinet_config.example.json), never in the source or the bundled frontend.

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserEntry {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub role: String,
    pub mysql_user: String,
    pub mysql_password: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub users: Vec<UserEntry>,
    /// no longer asked at login; kept so older config files still load
    #[serde(default)]
    pub doctor_security_answer: String,
    /// where the daily Excel backups go (default: Documents/Sauvegardes Cabinet)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backup_dir: Option<String>,
}

// Replaceable at runtime: the first-run wizard writes the file while the app is already running.
static CONFIG_DIR: RwLock<Option<PathBuf>> = RwLock::new(None);
static CONFIG: RwLock<Option<Result<Arc<AppConfig>, String>>> = RwLock::new(None);

pub fn config_path(config_dir: &Path) -> PathBuf {
    std::env::var("CABINET_CONFIG").map(PathBuf::from).unwrap_or_else(|_| config_dir.join("cabinet_config.json"))
}

pub fn exists(config_dir: &Path) -> bool {
    config_path(config_dir).is_file()
}

pub fn load(config_dir: PathBuf) {
    *CONFIG_DIR.write().unwrap() = Some(config_dir.clone());
    let path = config_path(&config_dir);
    let result = std::fs::read_to_string(&path)
        .map_err(|e| format!("Fichier de configuration introuvable ({}): {}", path.display(), e))
        .and_then(|text| {
            serde_json::from_str::<AppConfig>(&text)
                .map(Arc::new)
                .map_err(|e| format!("Configuration invalide ({}): {}", path.display(), e))
        });
    *CONFIG.write().unwrap() = Some(result);
}

/// Writes the config file and makes it the active configuration.
pub fn save(config_dir: &Path, config: &AppConfig) -> Result<(), String> {
    let path = config_path(config_dir);
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir).map_err(|e| format!("Dossier de configuration: {}", e))?; }
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("Enregistrement de la configuration ({}): {}", path.display(), e))?;
    *CONFIG.write().unwrap() = Some(Ok(Arc::new(config.clone())));
    Ok(())
}

pub fn get() -> Result<Arc<AppConfig>, String> {
    match CONFIG.read().unwrap().as_ref() {
        Some(Ok(config)) => Ok(config.clone()),
        Some(Err(e)) => Err(e.clone()),
        None => Err("Configuration non chargée".to_string()),
    }
}

/// Saves a modified copy of the active configuration (used by the doctor's settings page).
pub fn save_active(config: &AppConfig) -> Result<(), String> {
    let dir = CONFIG_DIR.read().unwrap().clone().ok_or_else(|| "Configuration non chargée".to_string())?;
    save(&dir, config)
}
