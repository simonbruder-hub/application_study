// Desktop-Hülle für Taktwerk: zeigt die Einzeldatei der Web-App (dist/single) in einem eigenen Fenster.
// Unter Windows ohne zusätzliches Konsolenfenster.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Taktwerk konnte nicht gestartet werden");
}
