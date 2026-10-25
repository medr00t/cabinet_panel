use serde::Deserialize;
use std::path::PathBuf;
use std::sync::OnceLock;

// Codes, MySQL passwords and the doctor's security answer live in a JSON file outside the
// repository (see cabinet_config.example.json), never in the source or the bundled frontend.

#[derive(Debug, Deserialize, Clone)]
pub struct UserEntry {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub role: String,
    pub mysql_user: String,
    pub mysql_password: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub users: Vec<UserEntry>,
    pub doctor_security_answer: String,
    /// where the daily Excel backups go (default: Documents/Sauvegardes Cabinet)
    #[serde(default)]
    pub backup_dir: Option<String>,
}

static CONFIG: OnceLock<Result<AppConfig, String>> = OnceLock::new();

pub fn load(config_dir: PathBuf) {
    let path = std::env::var("CABINET_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| config_dir.join("cabinet_config.json"));

    let result = std::fs::read_to_string(&path)
        .map_err(|e| format!("Fichier de configuration introuvable ({}): {}", path.display(), e))
        .and_then(|text| {
            serde_json::from_str::<AppConfig>(&text)
                .map_err(|e| format!("Configuration invalide ({}): {}", path.display(), e))
        });
    let _ = CONFIG.set(result);
}

pub fn get() -> Result<&'static AppConfig, String> {
    match CONFIG.get() {
        Some(Ok(config)) => Ok(config),
        Some(Err(e)) => Err(e.clone()),
        None => Err("Configuration non chargée".to_string()),
    }
}
