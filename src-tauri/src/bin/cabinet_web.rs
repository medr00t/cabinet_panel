// The cabinet's web server: run on ONE laptop; every other laptop just opens its address in Chrome.
#[tokio::main]
async fn main() {
    if let Err(e) = cabinet_panel_lib::web::serve().await {
        eprintln!("ERREUR: {}", e);
        eprintln!("Appuyez sur Entrée pour fermer…");
        let mut s = String::new();
        let _ = std::io::stdin().read_line(&mut s);
        std::process::exit(1);
    }
}
