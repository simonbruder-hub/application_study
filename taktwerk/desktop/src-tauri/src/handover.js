// Datenübernahme aus der bisherigen Desktop-App (bis 1.0.x lud sie die Online-Version, ihre Daten
// liegen darum unter der Online-Adresse). Läuft einmalig in einem unsichtbaren Fenster mit dieser
// Adresse (dank Service Worker auch offline), liest Datenbank und Einstellungen und schickt sie an
// die eingebaute App. Die Online-App selbst wird dabei nicht gestartet.
;(function () {
  if (location.origin !== 'https://simonbruder-hub.github.io' || !/[?&]handover=1/.test(location.search)) return
  try { window.stop() } catch (e) { /* lädt dann eben weiter */ }

  function emit(payload) {
    var tauri = window.__TAURI_INTERNALS__
    if (!tauri) { setTimeout(function () { emit(payload) }, 50); return }
    tauri.invoke('plugin:event|emit', { event: 'taktwerk-handover', payload: payload })
  }

  function readLocal() {
    var out = {}
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i)
      if (k !== null) out[k] = localStorage.getItem(k)
    }
    return out
  }

  function readDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('pomodoro-planer')
      // gab es nicht: nichts anlegen, keine Daten
      req.onupgradeneeded = function () { req.transaction.abort() }
      req.onerror = function () { resolve(null) }
      req.onsuccess = function () {
        var db = req.result
        var names = Array.prototype.slice.call(db.objectStoreNames)
        var tables = {}
        if (!names.length) { db.close(); resolve(tables); return }
        var tx = db.transaction(names, 'readonly')
        names.forEach(function (n) {
          var r = tx.objectStore(n).getAll()
          r.onsuccess = function () { tables[n] = r.result }
        })
        tx.oncomplete = function () { db.close(); resolve(tables) }
        tx.onerror = function () { db.close(); reject(tx.error) }
      }
    })
  }

  readDb().then(
    function (tables) { emit({ ok: true, tables: tables, local: readLocal() }) },
    function (e) { emit({ ok: false, error: String(e) }) }
  )
})()
