// Desktop-App von Taktwerk: Die App ist fest eingebaut (läuft offline), dazu ein eigenes Widget-Fenster,
// Ton und Benachrichtigung am Phasenende aus Rust, Updates über den Tauri-Updater und die einmalige
// Übernahme der Daten aus der bisherigen Desktop-App (lud die Online-Version).
// Unter Windows ohne zusätzliches Konsolenfenster.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod alarm;
mod handover;
mod update;
mod windows;

use tauri::{Manager, WindowEvent};
use tauri_plugin_window_state::StateFlags;

/// Fensterstatus (Ort und Grösse) von Hauptfenster und Widget; sichtbar oder nicht steuert die App selbst
pub const STATE_FLAGS: StateFlags = StateFlags::SIZE
    .union(StateFlags::POSITION)
    .union(StateFlags::MAXIMIZED);

fn main() {
    tauri::Builder::default()
        // zweiter Start: das laufende Fenster nach vorne holen statt eine zweite App zu öffnen
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| windows::reveal(app)))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(STATE_FLAGS)
                .with_denylist(&[handover::LABEL])
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(alarm::Alarm::default())
        .manage(handover::Handover::default())
        .manage(update::PendingUpdate::default())
        .setup(|app| {
            windows::build_app_window(app.handle(), windows::MAIN)?.build()?;
            alarm::start(app.handle().clone());
            handover::start(app)?;
            windows::show_main_later(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label();
            match event {
                // Hauptfenster oder Widget schliessen beendet die App (das andere ist dann ausgeblendet)
                WindowEvent::CloseRequested { .. } if label == windows::MAIN || label == windows::WIDGET => {
                    window.app_handle().exit(0);
                }
                WindowEvent::Moved(_) | WindowEvent::Resized(_) if label == windows::MAIN || label == windows::WIDGET => {
                    windows::save_state_soon(window.app_handle());
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            windows::main_show,
            windows::widget_open,
            windows::widget_close,
            windows::widget_fit,
            alarm::sound_load,
            alarm::alarm_set,
            alarm::alarm_clear,
            handover::handover_take,
            update::desktop_info,
            update::update_check,
            update::update_install,
        ])
        .run(tauri::generate_context!())
        .expect("Taktwerk konnte nicht gestartet werden");
}
