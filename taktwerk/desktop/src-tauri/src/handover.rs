// Einmalige Datenübernahme aus der bisherigen Desktop-App (siehe handover.js). Ein unsichtbares
// Fenster öffnet die frühere Online-Adresse und schickt Datenbank und Einstellungen als Ereignis.
// Die eingebaute App holt sie beim Start mit handover_take ab und übernimmt, was ihr fehlt.
//
// Hat die App die Daten abgeholt (auch wenn es nichts zu übernehmen gab), merkt sie sich das in
// der Datei handover-done und versucht es nie wieder. Ohne Netz und ohne alten Speicher bricht
// sie nach TIMEOUT ab und versucht es beim nächsten Start erneut.

use std::path::Path;
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use serde::Deserialize;
use tauri::webview::PageLoadEvent;
use tauri::{App, AppHandle, Listener, Manager, Runtime};

pub const LABEL: &str = "handover";
const EVENT: &str = "taktwerk-handover";
const SCRIPT: &str = include_str!("handover.js");
const MARKER: &str = "handover-done";
const OLD_HOST: &str = "simonbruder-hub.github.io";
const TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Default)]
struct Inner {
    done: bool,
    data: Option<String>,
}

#[derive(Default)]
pub struct Handover {
    inner: Mutex<Inner>,
    ready: Condvar,
}

impl Handover {
    fn finish(&self, data: Option<String>) {
        let mut inner = self.inner.lock().unwrap();
        if inner.done {
            return;
        }
        inner.done = true;
        inner.data = data;
        self.ready.notify_all();
    }
}

#[derive(Deserialize)]
struct Head {
    ok: bool,
}

/// Hat die bisherige Desktop-App Daten der Online-Adresse gespeichert? Gleicher Speicherordner,
/// denn die App-Kennung bleibt gleich. Windows (WebView2): EBWebView/Default/IndexedDB/https_<host>_0...
/// Linux (WebKitGTK): databases/indexeddb/v1/https_<host>_0, localstorage/... oder storage/*/*/origin.
fn old_data_present(dir: &Path) -> bool {
    let named = |sub: &[&str]| {
        let path = sub.iter().fold(dir.to_path_buf(), |p, s| p.join(s));
        std::fs::read_dir(path)
            .map(|entries| entries.flatten().any(|e| e.file_name().to_string_lossy().contains(OLD_HOST)))
            .unwrap_or(false)
    };
    named(&["EBWebView", "Default", "IndexedDB"])
        || named(&["databases", "indexeddb", "v1"])
        || named(&["localstorage"])
        || webkit_origin_files(dir)
}

/// Neuere WebKitGTK-Versionen legen je Herkunft einen Ordner mit der Datei «origin» an
fn webkit_origin_files(dir: &Path) -> bool {
    let Ok(outer) = std::fs::read_dir(dir.join("storage")) else { return false };
    outer
        .flatten()
        .filter_map(|a| std::fs::read_dir(a.path()).ok())
        .flat_map(|inner| inner.flatten())
        .any(|b| {
            std::fs::read(b.path().join("origin"))
                .map(|bytes| bytes.windows(OLD_HOST.len()).any(|w| w == OLD_HOST.as_bytes()))
                .unwrap_or(false)
        })
}

fn close<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    // nicht im Ereignis-Rückruf selbst schliessen, sondern kurz danach aus einem eigenen Thread
    std::thread::spawn(move || {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.destroy();
        }
    });
}

pub fn start<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let dir = app.path().app_local_data_dir()?;
    if dir.join(MARKER).exists() || !old_data_present(&dir) {
        app.state::<Handover>().finish(None);
        return Ok(());
    }

    let h = handle.clone();
    app.listen_any(EVENT, move |event| {
        let payload = event.payload().to_string();
        let ok = serde_json::from_str::<Head>(&payload).map(|head| head.ok).unwrap_or(false);
        h.state::<Handover>().finish(ok.then_some(payload));
        close(&h);
    });

    let h = handle.clone();
    crate::windows::build_from_config(&handle, LABEL)?
        .initialization_script(SCRIPT)
        .on_page_load(move |_webview, payload| {
            // ohne Netz und ohne Service Worker landet das Fenster auf einer Fehlerseite
            if payload.event() == PageLoadEvent::Finished && payload.url().host_str() != Some(OLD_HOST) {
                h.state::<Handover>().finish(None);
                close(&h);
            }
        })
        .build()?;

    let h = handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(TIMEOUT);
        h.state::<Handover>().finish(None);
        close(&h);
    });
    Ok(())
}

/// Wartet, bis die Übernahme fertig ist (höchstens TIMEOUT), und gibt die Daten einmal heraus
/// (JSON, sonst null). Erst jetzt gilt die Übernahme als erledigt.
#[tauri::command]
pub async fn handover_take<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let handover = app.state::<Handover>();
        let mut inner = handover.inner.lock().unwrap();
        while !inner.done {
            inner = handover.ready.wait(inner).unwrap();
        }
        let data = inner.data.take();
        if data.is_some() {
            if let Ok(dir) = app.path().app_local_data_dir() {
                let _ = std::fs::write(dir.join(MARKER), b"1");
            }
        }
        data
    })
    .await
    .map_err(|e| e.to_string())
}
