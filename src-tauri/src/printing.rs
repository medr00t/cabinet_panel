// Hands a generated PDF to the system: saved in a temp folder, then opened with the default PDF viewer
// or browser, where the user prints with Ctrl+P.

use std::path::PathBuf;

use base64::Engine;

fn safe_name(name: &str) -> String {
    let stem: String = name.trim_end_matches(".pdf").chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' }).take(70).collect();
    let stem = stem.trim().to_string();
    if stem.is_empty() { "document".to_string() } else { stem }
}

fn open_with_system(path: &PathBuf) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd").args(["/C", "start", ""]).arg(path).creation_flags(0x0800_0000).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(all(unix, not(target_os = "macos")))]
    { std::process::Command::new("xdg-open").arg(path).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}

/// Saves a base64-encoded PDF to the temp folder and opens it. Returns the file path.
#[tauri::command]
pub async fn open_pdf(name: String, data: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.as_bytes()).map_err(|_| "PDF invalide".to_string())?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("Ce n'est pas un fichier PDF".to_string());
    }
    let dir = std::env::temp_dir().join("cabinet-impressions");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Dossier temporaire: {}", e))?;
    // a time suffix: the previous copy may still be open in the viewer (Windows locks it)
    let file = dir.join(format!("{}_{}.pdf", safe_name(&name), chrono::Local::now().format("%H%M%S")));
    std::fs::write(&file, &bytes).map_err(|e| format!("Enregistrement du PDF: {}", e))?;
    open_with_system(&file).map_err(|e| format!("Impossible d'ouvrir le PDF ({}). Fichier: {}", e, file.display()))?;
    Ok(file.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_are_sanitised() {
        assert_eq!(safe_name("Feuille CNSS - BENALI Samira.pdf"), "Feuille CNSS - BENALI Samira");
        assert_eq!(safe_name("../../etc/passwd"), "______etc_passwd");
        assert_eq!(safe_name("   "), "document");
        assert!(safe_name(&"x".repeat(300)).len() <= 70);
    }
}
