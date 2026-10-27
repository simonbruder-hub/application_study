// Hauptfenster und Widget. Das Widget ist ein eigenes Fenster ohne Rahmen, immer im Vordergrund.
// Seine Breite bestimmt man selbst (frei verkleinerbar), die Höhe passt die App dem Inhalt an.
// Ist das Widget offen, ist das Hauptfenster ausgeblendet.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_window_state::AppHandleExt;

pub const MAIN: &str = "main";
pub const WIDGET: &str = "widget";

/// Abstand des Widgets zum Bildschirmrand beim allerersten Öffnen (logische Pixel)
const MARGIN: f64 = 24.0;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Fenster aus tauri.conf.json bauen (dort mit "create": false hinterlegt)
pub fn build_from_config<'a, R: Runtime>(app: &'a AppHandle<R>, label: &str) -> Result<WebviewWindowBuilder<'a, R, AppHandle<R>>, String> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == label)
        .cloned()
        .ok_or_else(|| format!("Fenster {label} fehlt in tauri.conf.json"))?;
    WebviewWindowBuilder::from_config(app, &config).map_err(err)
}

/// Fenster der App: Links in ein neues Fenster (Lernlabor, Downloads) öffnen im normalen Browser
pub fn build_app_window<'a, R: Runtime>(app: &'a AppHandle<R>, label: &str) -> Result<WebviewWindowBuilder<'a, R, AppHandle<R>>, String> {
    Ok(build_from_config(app, label)?.on_new_window(|url, _features| {
        if matches!(url.scheme(), "https" | "http" | "mailto") {
            let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
        }
        NewWindowResponse::Deny
    }))
}

fn show_and_focus<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

static SAVE_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Ort und Grösse kurz nach dem Verschieben oder Ziehen speichern, nicht erst beim Beenden
/// (sonst gehen sie verloren, wenn Windows herunterfährt oder die App abstürzt)
pub fn save_state_soon<R: Runtime>(app: &AppHandle<R>) {
    let generation = SAVE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(800));
        if SAVE_GENERATION.load(Ordering::SeqCst) == generation {
            let _ = app.save_window_state(crate::STATE_FLAGS);
        }
    });
}

/// Das gerade benutzte Fenster nach vorne holen (Widget, sonst Hauptfenster)
pub fn reveal<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(WIDGET) {
        show_and_focus(&w);
    } else if let Some(m) = app.get_webview_window(MAIN) {
        show_and_focus(&m);
    }
}

/// Das Hauptfenster startet unsichtbar; die App zeigt es (oder das Widget), sobald sie bereit ist.
/// Kommt nichts (Fehler beim Laden), erscheint es nach einigen Sekunden trotzdem.
pub fn show_main_later<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(8));
        let widget_open = app.get_webview_window(WIDGET).is_some();
        if let Some(m) = app.get_webview_window(MAIN) {
            if !widget_open && !m.is_visible().unwrap_or(true) {
                show_and_focus(&m);
            }
        }
    });
}

#[tauri::command]
pub async fn main_show<R: Runtime>(app: AppHandle<R>) {
    if let Some(m) = app.get_webview_window(MAIN) {
        show_and_focus(&m);
    }
}

/// Widget öffnen und Hauptfenster ausblenden. place: zum ersten Mal, oben rechts hinsetzen.
/// Sichtbar wird das Widget erst mit widget_fit, wenn seine Höhe stimmt (spätestens nach 2 s).
#[tauri::command]
pub async fn widget_open<R: Runtime>(app: AppHandle<R>, place: bool) -> Result<(), String> {
    let widget = match app.get_webview_window(WIDGET) {
        Some(w) => {
            show_and_focus(&w);
            w
        }
        None => {
            let w = build_app_window(&app, WIDGET)?.build().map_err(err)?;
            if place {
                place_top_right(&w);
            }
            let later = w.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(2));
                if !later.is_visible().unwrap_or(true) {
                    let _ = later.show();
                }
            });
            w
        }
    };
    let _ = widget.set_always_on_top(true);
    if let Some(m) = app.get_webview_window(MAIN) {
        let _ = m.hide();
    }
    Ok(())
}

fn place_top_right<R: Runtime>(w: &WebviewWindow<R>) {
    let Ok(Some(monitor)) = w.current_monitor().or_else(|_| w.primary_monitor()) else { return };
    let scale = monitor.scale_factor();
    // ein noch unsichtbares Fenster meldet unter Linux die Breite 0: dann die Breite aus der Konfiguration
    let configured = w.config().app.windows.iter().find(|c| c.label == WIDGET).map_or(280.0, |c| c.width);
    let width = w
        .outer_size()
        .map(|s| s.width)
        .ok()
        .filter(|&px| px > 0)
        .unwrap_or_else(|| (configured * scale).round() as u32);
    let area = monitor.work_area();
    let margin = (MARGIN * scale).round() as i32;
    let x = area.position.x + area.size.width as i32 - width as i32 - margin;
    let y = area.position.y + margin;
    let _ = w.set_position(PhysicalPosition::new(x.max(area.position.x), y));
}

/// Grosse Ansicht: Widget schliessen (Ort und Grösse bleiben gespeichert), Hauptfenster zeigen
#[tauri::command]
pub async fn widget_close<R: Runtime>(app: AppHandle<R>) {
    let _ = app.save_window_state(crate::STATE_FLAGS);
    if let Some(m) = app.get_webview_window(MAIN) {
        show_and_focus(&m);
    }
    if let Some(w) = app.get_webview_window(WIDGET) {
        let _ = w.destroy();
    }
}

/// Grösse des Widgets setzen (logische Pixel): Breite wie gezogen oder gemerkt, Höhe wie der Inhalt.
/// Beim ersten Mal danach sichtbar machen (unter Linux greift die Grösse erst beim sichtbaren Fenster sicher).
#[tauri::command]
pub async fn widget_fit<R: Runtime>(window: WebviewWindow<R>, width: f64, height: f64) -> Result<(), String> {
    if window.label() != WIDGET {
        return Ok(());
    }
    let scale = window.scale_factor().map_err(err)?;
    let size = window.inner_size().map_err(err)?.to_logical::<f64>(scale);
    let target = LogicalSize::new(width.clamp(100.0, 1600.0).round(), height.clamp(24.0, 1600.0).round());
    let differs = (size.width - target.width).abs() >= 1.0 || (size.height - target.height).abs() >= 1.0;
    if differs {
        window.set_size(target).map_err(err)?;
    }
    if !window.is_visible().unwrap_or(true) {
        window.show().map_err(err)?;
        window.set_size(target).map_err(err)?;
    }
    Ok(())
}
