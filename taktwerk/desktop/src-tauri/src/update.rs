// Updates über den Tauri-Updater: Die App fragt beim Start nach (latest.json im neusten GitHub-Release),
// zeigt einen Hinweis und installiert erst auf Wunsch. Die Installer sind mit dem Schlüssel aus dem
// GitHub-Secret TAURI_SIGNING_PRIVATE_KEY signiert, der öffentliche Teil steht in tauri.conf.json.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct DesktopInfo {
    version: String,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn desktop_info<R: Runtime>(app: AppHandle<R>) -> DesktopInfo {
    DesktopInfo { version: app.package_info().version.to_string() }
}

/// Neue Version vorhanden? (ohne Netz: Fehler, die App zeigt dann einfach nichts an)
#[tauri::command]
pub async fn update_check<R: Runtime>(app: AppHandle<R>, pending: State<'_, PendingUpdate>) -> Result<Option<UpdateInfo>, String> {
    let update = app.updater().map_err(err)?.check().await.map_err(err)?;
    let info = update.as_ref().map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() });
    *pending.0.lock().unwrap() = update;
    Ok(info)
}

/// Herunterladen, Signatur prüfen, installieren und neu starten
#[tauri::command]
pub async fn update_install<R: Runtime>(app: AppHandle<R>, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending.0.lock().unwrap().take().ok_or("Kein Update gefunden")?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(err)?;
    app.restart();
}
