/* Ansicht «Einstellungen»: Darstellung, Timer, Vorlagen, Signale, Planung, App & Daten */
'use strict';

Views.einstellungen = {
  title: 'Einstellungen',
  render() {
    const s = Store.settings;
    const ui = App.ui;
    const num = (key, label, min, max, step, unit) => `
      <div class="num-field">
        <label for="set-${key}">${label}</label>
        <div class="stepper">
          <button type="button" class="icon-btn sm" data-act="stepSetting" data-key="${key}" data-d="${-step}" aria-label="${label} verringern">${UI.icon('minus')}</button>
          <input id="set-${key}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${s[key]}" data-change="setting" data-key="${key}">
          <button type="button" class="icon-btn sm" data-act="stepSetting" data-key="${key}" data-d="${step}" aria-label="${label} erhöhen">${UI.icon('plus')}</button>
          <span class="unit">${unit}</span>
        </div>
      </div>`;
    const sw = (key, label, hint = '') => `<label class="switch"><input type="checkbox" data-change="settingBool" data-key="${key}"${s[key] ? ' checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    const modeSeg = (v, t, ic) => `<button type="button" class="seg-btn${ui.mode === v ? ' is-on' : ''}" aria-pressed="${ui.mode === v}" data-act="setMode" data-v="${v}">${UI.icon(ic)}${t}</button>`;
    const skinSeg = (v, t) => `<button type="button" class="seg-btn${ui.skin === v ? ' is-on' : ''}" aria-pressed="${ui.skin === v}" data-act="setSkin" data-v="${v}">${t}</button>`;
    const backendTxt = Store.backend.name === 'claude'
      ? 'Deine Daten werden in deinem Claude-Konto gespeichert und sind auf allen Geräten verfügbar, auf denen du diese Seite öffnest.'
      : 'Deine Daten liegen nur in diesem Browser auf diesem Gerät. Für den Wechsel zwischen Laptop und Handy: Backup exportieren und auf dem anderen Gerät importieren.';
    const build = window.PP_BUILD || 'web';
    const canInstall = !!App.installPrompt;
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

    return `
    <div class="view-head"><div><p class="eyebrow">Einstellungen</p><h1>Anpassen</h1></div></div>
    <div class="settings-grid">
      <section class="card">
        <div class="card-head"><h2>Darstellung</h2></div>
        <p class="label">Modus</p>
        <div class="seg seg-wide" role="group" aria-label="Modus">${modeSeg('auto', 'Automatisch', 'auto')}${modeSeg('tag', 'Tag', 'sun')}${modeSeg('nacht', 'Nacht', 'moon')}</div>
        <p class="label">Stil</p>
        <div class="seg seg-wide" role="group" aria-label="Stil">${skinSeg('klassisch', 'Klassisch')}${skinSeg('anime', 'Anime ✦')}</div>
        <p class="muted small">Der Anime-Stil bringt Tomaten-Chan, Speedlines und Kirschblüten in den Pausen mit und funktioniert bei Tag und Nacht.</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Timer</h2></div>
        <div class="num-grid">
          ${num('focus', 'Fokus', 1, 240, 5, 'min')}
          ${num('short', 'Kurze Pause', 1, 60, 1, 'min')}
          ${num('long', 'Lange Pause', 1, 120, 5, 'min')}
          ${num('longEvery', 'Lange Pause nach', 1, 12, 1, 'Pomodoros')}
        </div>
        ${sw('autoBreak', 'Pause automatisch starten')}
        ${sw('autoFocus', 'Nächsten Fokus automatisch starten')}
      </section>

      <section class="card">
        <div class="card-head"><h2>Vorlagen</h2></div>
        <ul class="preset-list">${(s.presets || []).map((p) => `<li>
          <button type="button" class="preset-apply" data-act="applyPreset" data-id="${U.esc(p.id)}"><b>${U.esc(p.name)}</b>
          <span class="mono muted">${p.focus} / ${p.short} / ${p.long} min · lange Pause nach ${p.longEvery}</span></button>
          <button type="button" class="icon-btn sm" data-act="deletePreset" data-id="${U.esc(p.id)}" aria-label="Vorlage ${U.esc(p.name)} löschen">${UI.icon('trash')}</button></li>`).join('')}</ul>
        <form class="quick-add" data-form="savePreset" autocomplete="off">
          <label class="sr-only" for="presetName">Name der Vorlage</label>
          <input id="presetName" name="name" data-keep placeholder="Name der neuen Vorlage …" required maxlength="30">
          <button type="submit" class="btn btn-ghost">${UI.icon('plus')}Speichern</button>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Signale</h2></div>
        ${sw('sound', 'Signalton am Ende einer Phase')}
        <div class="range-row"><label for="set-volume">Lautstärke</label>
          <input id="set-volume" type="range" min="0" max="1" step="0.05" value="${s.volume}" data-change="settingNum" data-key="volume">
          <button type="button" class="btn btn-ghost btn-sm" data-act="testSound">${UI.icon('bell')}Testen</button></div>
        ${sw('notify', 'Benachrichtigung anzeigen', 'Wenn die App im Hintergrund ist.')}
        ${sw('wakeLock', 'Bildschirm wach halten', 'Während der Timer läuft.')}
        ${sw('background', 'Im Hintergrund weiterlaufen', `${U.isAndroid ? 'Empfohlen auf Android. ' : ''}Zeigt den Timer mit Start/Pause in der Benachrichtigung bzw. in den Medien-Steuerelementen. Kann laufende Musik pausieren.`)}
      </section>

      <section class="card">
        <div class="card-head"><h2>Planung</h2></div>
        <div class="num-grid">
          <div class="num-field"><label for="set-goal">Tagesziel</label>
            <div class="stepper">
              <button type="button" class="icon-btn sm" data-act="stepSetting" data-key="dailyGoalMin" data-d="-30" aria-label="Tagesziel verringern">${UI.icon('minus')}</button>
              <input id="set-goal" type="number" min="0" max="960" step="15" value="${s.dailyGoalMin}" data-change="setting" data-key="dailyGoalMin" inputmode="numeric">
              <button type="button" class="icon-btn sm" data-act="stepSetting" data-key="dailyGoalMin" data-d="30" aria-label="Tagesziel erhöhen">${UI.icon('plus')}</button>
              <span class="unit">min</span></div></div>
          ${num('capacity', 'Kapazität pro Tag', 1, 30, 1, 'Pomodoros')}
        </div>
        <p class="muted small">Die Kapazität zeigt im Kalender, ob ein Tag überplant ist.</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Tastenkürzel</h2></div>
        <dl class="kbd-list">
          <div><dt><kbd>Leertaste</kbd></dt><dd>Start / Pause / Weiter</dd></div>
          <div><dt><kbd>F</kbd></dt><dd>Fokus beenden &amp; speichern</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Pause überspringen</dd></div>
          <div><dt><kbd>M</kbd></dt><dd>Minimieren (Mini-Fenster)</dd></div>
          <div><dt><kbd>N</kbd></dt><dd>Neue Aufgabe</dd></div>
          <div><dt><kbd>T</kbd></dt><dd>Tag / Nacht wechseln</dd></div>
          <div><dt><kbd>1</kbd>–<kbd>6</kbd></dt><dd>Ansicht wechseln</dd></div>
        </dl>
      </section>

      <section class="card">
        <div class="card-head"><h2>App &amp; Download</h2></div>
        ${installed ? '<p>Die App ist installiert. ✓</p>' : ''}
        ${canInstall ? `<button type="button" class="btn btn-primary" data-act="install">${UI.icon('download')}Als App installieren</button>` : ''}
        ${!installed && !canInstall && build === 'web' ? `<p class="muted small">${U.isAndroid
          ? 'Android: Im Chrome-Menü ⋮ «App installieren» bzw. «Zum Startbildschirm hinzufügen» wählen.'
          : 'Laptop: In Chrome oder Edge rechts in der Adressleiste auf das Installieren-Symbol klicken.'}</p>` : ''}
        ${build !== 'standalone' ? `<button type="button" class="btn btn-ghost" data-act="downloadApp">${UI.icon('download')}Offline-Datei herunterladen (.html)</button>
          <p class="muted small">Eine einzelne Datei, die ohne Internet im Browser läuft – per Doppelklick öffnen. Daten bleiben in jenem Browser.</p>`
          : '<p class="muted small">Du nutzt die Offline-Datei. Die Daten liegen in diesem Browser.</p>'}
      </section>

      <section class="card">
        <div class="card-head"><h2>Daten</h2>
          <span class="save-state" data-save-state></span></div>
        <p class="muted small">${backendTxt}</p>
        <div class="btn-col">
          <button type="button" class="btn btn-ghost" data-act="exportJson">${UI.icon('download')}Backup exportieren (.json)</button>
          <button type="button" class="btn btn-ghost" data-act="importJson">${UI.icon('upload')}Backup importieren</button>
          <button type="button" class="btn btn-ghost" data-act="exportCsvAll">${UI.icon('download')}Alle Zeiten als CSV</button>
          ${Store.hasDemo() ? `<button type="button" class="btn btn-ghost" data-act="removeDemo">${UI.icon('x')}Beispieldaten entfernen</button>`
            : `<button type="button" class="btn btn-ghost" data-act="loadDemo">${UI.icon('plus')}Beispieldaten laden</button>`}
          <button type="button" class="btn btn-ghost btn-danger-text" data-act="clearAll">${UI.icon('trash')}Alle Daten löschen</button>
        </div>
      </section>
    </div>`;
  },
};
