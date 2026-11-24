fn main() {
    // the desktop app needs the Tauri build step; the web server does not
    if std::env::var_os("CARGO_FEATURE_DESKTOP").is_some() {
        tauri_build::build()
    }
}
