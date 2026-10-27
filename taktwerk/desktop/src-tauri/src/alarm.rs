// Ton und Benachrichtigung am Phasenende, geplant in einem eigenen Thread. Damit klingelt es
// pünktlich, auch wenn das Fenster ausgeblendet, verdeckt oder vom System gebremst ist.
//
// Die Klänge erzeugt die App selbst (gleiche Synthese wie im Browser) und schickt sie einmal als
// PCM-Daten hierher. Hauptfenster und Widget melden dasselbe Phasenende mit demselben Schlüssel,
// es klingelt trotzdem nur einmal.

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime};

use base64::Engine;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_notification::NotificationExt;

/// Liegt ein geplanter Ton so knapp vor dem Ende, wird er beim Ersetzen oder Löschen noch abgespielt:
/// Die App wechselt die Phase im selben Moment, in dem es klingeln soll.
const DUE_WINDOW: Duration = Duration::from_millis(1500);

struct Sound {
    rate: u32,
    samples: Vec<i16>,
}

struct Pending {
    key: String,
    at: SystemTime,
    sound: Option<Arc<Sound>>,
    note: Option<(String, String)>,
}

#[derive(Default)]
struct Inner {
    sounds: HashMap<String, Arc<Sound>>,
    pending: Option<Pending>,
    /// sofort auszulösen (fällig, aber schon durch ein neues Phasenende ersetzt)
    due: Vec<Pending>,
    /// Schlüssel des zuletzt ausgelösten Phasenendes (nicht doppelt läuten)
    fired: Option<String>,
}

#[derive(Default)]
pub struct Alarm {
    inner: Mutex<Inner>,
    wake: Condvar,
}

fn is_due(p: &Pending) -> bool {
    p.at <= SystemTime::now() + DUE_WINDOW
}

/// Thread, der auf das nächste Phasenende wartet. Gewartet wird höchstens eine Sekunde am Stück
/// gegen die Systemuhr, so stimmt die Zeit auch nach dem Ruhezustand des Laptops.
pub fn start<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let alarm = app.state::<Alarm>();
        let mut inner = alarm.inner.lock().unwrap();
        loop {
            if let Some(p) = inner.pending.take_if(|p| p.at <= SystemTime::now()) {
                inner.due.push(p);
            }
            if !inner.due.is_empty() {
                let list = std::mem::take(&mut inner.due);
                inner.fired = list.last().map(|p| p.key.clone());
                drop(inner);
                for p in list {
                    fire(&app, p);
                }
                inner = alarm.inner.lock().unwrap();
                continue;
            }
            let wait = inner
                .pending
                .as_ref()
                .map(|p| p.at.duration_since(SystemTime::now()).unwrap_or_default().min(Duration::from_secs(1)));
            inner = match wait {
                None => alarm.wake.wait(inner).unwrap(),
                Some(d) => alarm.wake.wait_timeout(inner, d).unwrap().0,
            };
        }
    });
}

fn fire<R: Runtime>(app: &AppHandle<R>, p: Pending) {
    if let Some(sound) = p.sound {
        play(sound);
    }
    if let Some((title, body)) = p.note {
        // wie im Browser: nur melden, wenn gerade kein Taktwerk-Fenster im Vordergrund ist
        let focused = app.webview_windows().values().any(|w| w.is_focused().unwrap_or(false));
        if !focused {
            let _ = app.notification().builder().title(title).body(body).show();
        }
    }
}

fn play(sound: Arc<Sound>) {
    std::thread::spawn(move || {
        // Ausgabe erst jetzt öffnen: folgt dem aktuellen Gerät (z. B. Kopfhörer eingesteckt)
        let Ok((_stream, handle)) = rodio::OutputStream::try_default() else { return };
        let Ok(sink) = rodio::Sink::try_new(&handle) else { return };
        sink.append(rodio::buffer::SamplesBuffer::new(1, sound.rate, sound.samples.clone()));
        sink.sleep_until_end();
    });
}

/// Klang ablegen: Mono, 16 Bit (Little Endian), Base64
#[tauri::command]
pub async fn sound_load(alarm: State<'_, Alarm>, key: String, rate: u32, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    let samples = bytes.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
    alarm.inner.lock().unwrap().sounds.insert(key, Arc::new(Sound { rate, samples }));
    Ok(())
}

/// Phasenende melden: key kennzeichnet das Ende (gleich in allen Fenstern), delay_ms ab jetzt.
/// sound: Schlüssel eines mit sound_load abgelegten Klangs; title/body: Benachrichtigung.
#[tauri::command]
pub async fn alarm_set(
    alarm: State<'_, Alarm>,
    key: String,
    delay_ms: i64,
    sound: Option<String>,
    title: Option<String>,
    body: Option<String>,
) -> Result<(), String> {
    let mut inner = alarm.inner.lock().unwrap();
    let sound = sound.and_then(|k| inner.sounds.get(&k).cloned());
    let note = title.map(|t| (t, body.unwrap_or_default()));
    if let Some(p) = inner.pending.as_mut().filter(|p| p.key == key) {
        p.sound = sound;
        p.note = note;
        return Ok(());
    }
    if inner.fired.as_deref() == Some(key.as_str()) || inner.due.iter().any(|p| p.key == key) {
        return Ok(());
    }
    flush_due(&mut inner);
    let now = SystemTime::now();
    let at = if delay_ms > 0 { now + Duration::from_millis(delay_ms as u64) } else { now };
    inner.pending = Some(Pending { key, at, sound, note });
    alarm.wake.notify_all();
    Ok(())
}

/// Kein Phasenende geplant (Pause, Stopp, Ton und Benachrichtigung aus)
#[tauri::command]
pub async fn alarm_clear(alarm: State<'_, Alarm>) -> Result<(), String> {
    let mut inner = alarm.inner.lock().unwrap();
    flush_due(&mut inner);
    alarm.wake.notify_all();
    Ok(())
}

/// Geplantes Phasenende entfernen; ist es schon fällig, wird es nicht verworfen, sondern sofort ausgelöst
fn flush_due(inner: &mut Inner) {
    if let Some(p) = inner.pending.take() {
        if is_due(&p) {
            inner.due.push(p);
        }
    }
}
