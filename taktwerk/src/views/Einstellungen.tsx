/** Ansicht «Einstellungen»: Timer, Darstellung, Signale, Sync & Konto, Daten, App */
import { useEffect, useState } from 'preact/hooks';
import type { TimerKind, UserSettings, Workspace } from '../data/types';
import { useInstallPrompt } from '../app/install';
import { prefs, saveBackendConfig, setPrefs } from '../app/prefs';
import { viewParam } from '../app/router';
import { app, resetLocalData } from '../app/services';
import { entities, now, settings, snapshot, syncStatus, timerState } from '../app/store';
import { chimeNow, ensureAudio, requestNotifyPermission } from '../app/timer/signals';
import { SOUNDS, type SoundId } from '../app/timer/sounds';
import { sendLoginCode, signOut, verifyLoginCode } from '../sync/supabaseRemote';
import { Seg, Stepper, Switch, WORKSPACE_LABEL } from '../ui/components/bits';
import { confirmDialog } from '../ui/dialog';
import { Icon } from '../ui/Icon';
import { fmtAgo, plural, todayKey } from '../ui/format';
import { toast } from '../ui/toast';
import { SKINS } from '../ui/skins';
import { allTags, deleteTag, renameTag, setTagColor, tagColor } from '../app/tags';
import { missingSchemaColumns } from '../sync/supabaseRemote';

type NumKey = 'focus_minutes' | 'short_break_minutes' | 'long_break_minutes' | 'long_break_every' | 'daily_goal_minutes';

const NUMS: readonly { key: NumKey; label: string; min: number; max: number; step?: number; unit: string }[] = [
  { key: 'focus_minutes', label: 'Fokus', min: 1, max: 180, unit: 'min' },
  { key: 'short_break_minutes', label: 'Kurze Pause', min: 1, max: 60, unit: 'min' },
  { key: 'long_break_minutes', label: 'Lange Pause', min: 1, max: 90, unit: 'min' },
  { key: 'long_break_every', label: 'Lange Pause nach', min: 1, max: 12, unit: 'Runden' },
  { key: 'daily_goal_minutes', label: 'Tagesziel', min: 0, max: 960, step: 15, unit: 'min' },
];

async function saveSetting(patch: Partial<Omit<UserSettings, 'id' | 'updated_at' | 'updated_by'>>): Promise<void> {
  await app().sync.saveSettings(patch);
  await app().timer.resetPlanned();
}

export function Einstellungen() {
  useEffect(() => {
    if (viewParam.value === 'sync') document.getElementById('sync')?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <>
      <div class="view-head"><div><h1>Einstellungen</h1></div></div>
      <div class="settings-grid">
        <TimerCard />
        <KindCard />
        <LookCard />
        <SignalCard />
        <SyncCard />
        <TagsCard />
        <DataCard />
        <AppCard />
        <KeysCard />
      </div>
    </>
  );
}

function TimerCard() {
  const s = settings.value;
  return (
    <section class="card">
      <h2>Timer</h2>
      <p class="muted small">Gilt auf allen Geräten.</p>
      <div class="num-grid">
        {NUMS.map((n) => (
          <div key={n.key} class="num-field">
            <label for={`set-${n.key}`}>{n.label}</label>
            <Stepper id={`set-${n.key}`} label={n.label} value={s[n.key]} min={n.min} max={n.max} step={n.step ?? 1} unit={n.unit}
              onChange={(v) => void saveSetting({ [n.key]: v })} />
          </div>
        ))}
      </div>
      <Switch checked={s.auto_start_breaks} onChange={(v) => void saveSetting({ auto_start_breaks: v })} label="Pausen automatisch starten" />
      <Switch checked={s.auto_start_focus} onChange={(v) => void saveSetting({ auto_start_focus: v })} label="Nächsten Fokus automatisch starten" />
    </section>
  );
}

function KindCard() {
  const p = prefs.value;
  const choose = async (ws: Workspace, kind: TimerKind) => {
    setPrefs({ timerKind: { ...prefs.value.timerKind, [ws]: kind } });
    if (ws === prefs.value.workspace && timerState.value.status === 'idle') await app().timer.setKind(kind);
  };
  return (
    <section class="card">
      <h2>Timer-Art je Modus</h2>
      {(['study', 'work'] as const).map((ws) => (
        <div key={ws} class="range-row">
          <span style={{ minWidth: '70px' }}>{WORKSPACE_LABEL[ws]}</span>
          <Seg label={`Timer-Art ${WORKSPACE_LABEL[ws]}`} value={p.timerKind[ws]} onChange={(k) => void choose(ws, k)}
            options={[{ value: 'pomodoro', label: 'Pomodoro' }, { value: 'stopwatch', label: 'Stechuhr' }]} />
        </div>
      ))}
    </section>
  );
}

function LookCard() {
  const p = prefs.value;
  return (
    <section class="card">
      <h2>Darstellung</h2>
      <div class="field"><span class="field-label">Modus</span>
        <Seg label="Darstellung" value={p.mode} wide onChange={(mode) => setPrefs({ mode })}
          options={[{ value: 'auto', label: 'Automatisch', icon: 'auto' }, { value: 'tag', label: 'Tag', icon: 'sun' }, { value: 'nacht', label: 'Nacht', icon: 'moon' }]} />
      </div>
      <div style={{ marginTop: '12px' }}>
        <Switch checked={p.showClock} onChange={(showClock) => setPrefs({ showClock })} label="Restzeit als Ziffern anzeigen"
          hint="Aus: nur Zifferblatt und Phase, die Zeit lenkt nicht ab" />
      </div>
      <div class="field" style={{ marginTop: '12px' }}><span class="field-label">Bewegung</span>
        <Seg label="Bewegung" value={p.motion} wide onChange={(motion) => setPrefs({ motion })}
          options={[{ value: 'aus', label: 'Aus' }, { value: 'dezent', label: 'Dezent' }, { value: 'lebendig', label: 'Lebendig' }]} />
        <p class="small muted" style={{ margin: '6px 0 0' }}>
          {p.motion === 'aus' ? 'Keine Animationen, nur ruhige Farben.' : p.motion === 'dezent' ? 'Ruhige Effekte, die nicht vom Fokus ablenken.' : 'Alle Szenen: Blitze, Laternen, Feuerwerk, fliegende Blätter und mehr.'}
        </p>
      </div>
      <div class="field" style={{ marginTop: '12px' }}><span class="field-label">Stil</span>
        <div class="skin-grid" role="radiogroup" aria-label="Stil">
          {SKINS.map((k) => (
            <button
              key={k.id} type="button" role="radio" aria-checked={p.skin === k.id}
              class={`skin-opt${p.skin === k.id ? ' is-on' : ''}`} onClick={() => setPrefs({ skin: k.id })}
            >
              <span class="skin-swatch" aria-hidden="true" style={{ '--s0': k.swatch[0], '--s1': k.swatch[1], '--s2': k.swatch[2] }}><i /><i /></span>
              <b>{k.label}</b>
              <span class="small muted">{k.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SignalCard() {
  const p = prefs.value;
  const toggleNotify = async (on: boolean) => {
    if (!on) { setPrefs({ notify: false }); return; }
    const res = await requestNotifyPermission();
    if (res === 'granted') setPrefs({ notify: true });
    else toast(res === 'unsupported' ? 'Benachrichtigungen werden hier nicht unterstützt.' : 'Benachrichtigungen sind im Browser blockiert.');
  };
  return (
    <section class="card">
      <h2>Signale</h2>
      <Switch checked={p.sound} onChange={(sound) => setPrefs({ sound })} label="Ton am Ende einer Phase" />
      <div class="range-row">
        <label for="vol">Lautstärke</label>
        <input id="vol" type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => setPrefs({ volume: Number(e.currentTarget.value) })} />
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => { ensureAudio(); chimeNow('test', prefs.value.volume); }}><Icon name="bell" />Testen</button>
      </div>
      {p.sound && (
        <div class="sound-grid">
          {([['focus', 'Ende Fokus', 'focusEnd'], ['short', 'Ende kurze Pause', 'shortEnd'], ['long', 'Ende lange Pause', 'longEnd']] as const).map(([key, label, kind]) => (
            <div class="field" key={key}>
              <label for={`snd-${key}`}>{label}</label>
              <div class="row-gap">
                <select id={`snd-${key}`} value={p.sounds[key]} onChange={(e) => {
                  const id = e.currentTarget.value as SoundId;
                  setPrefs({ sounds: { ...prefs.value.sounds, [key]: id } });
                  chimeNow(kind, prefs.value.volume, id);
                }}>
                  {SOUNDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <button type="button" class="icon-btn" aria-label={`${label} anhören`} onClick={() => chimeNow(kind, prefs.value.volume)}><Icon name="play" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Switch checked={p.notify} onChange={(v) => void toggleNotify(v)} label="Benachrichtigungen" hint="Meldung, wenn eine Phase endet und die App im Hintergrund ist" />
      <Switch checked={p.wakeLock} onChange={(wakeLock) => setPrefs({ wakeLock })} label="Bildschirm wach halten" hint="Solange der Timer läuft" />
      <Switch checked={p.background} onChange={(background) => setPrefs({ background })} label="Hintergrund-Modus (Android)"
        hint="Spielt stille Audiospur ab, damit der Timer weiterläuft; Start/Pause über die Medien-Benachrichtigung" />
    </section>
  );
}

const SYNC_LABEL = { idle: 'Synchron', syncing: 'Synchronisiere …', offline: 'Offline', error: 'Fehler', signed_out: 'Nicht angemeldet' } as const;

function SyncStatusLine() {
  const st = syncStatus.value;
  void now.value;
  return (
    <p class="small">
      <span class={`status-dot${st.state === 'idle' ? ' is-good' : st.state === 'error' ? ' is-bad' : st.state === 'offline' ? ' is-warn' : ''}`} />
      {SYNC_LABEL[st.state]}{st.lastSyncedAt ? ` · zuletzt ${fmtAgo(st.lastSyncedAt)}` : ''}
      {st.pending ? ` · ${st.pending} Änderung${st.pending === 1 ? '' : 'en'} ausstehend` : ''}
      {st.error && <><br /><span class="is-error">{st.error}</span></>}
    </p>
  );
}

/** Tags verwalten: Farbe, umbenennen, löschen */
function TagsCard() {
  const tags = allTags.value;
  const used = (t: string) => entities.value.projects.filter((p) => (p.tags ?? []).includes(t)).length;
  return (
    <section class="card">
      <h2>Tags</h2>
      {tags.length === 0 ? (
        <p class="small muted">Noch keine Tags. Im Projekt-Dialog Tags wie «Coding», «Lernen» oder «Admin» vergeben; hier lassen sie sich danach einfärben, umbenennen und löschen.</p>
      ) : (
        <ul class="tag-admin">
          {tags.map((t) => (
            <li key={t}>
              <label class="tag-color" style={{ '--tc': tagColor(t) }} title="Farbe ändern">
                <input type="color" value={tagColor(t)} aria-label={`Farbe für ${t}`} onChange={(e) => void setTagColor(t, e.currentTarget.value)} />
              </label>
              <input class="tag-name" aria-label={`Tag ${t} umbenennen`} defaultValue={t} maxLength={30}
                onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== t) void renameTag(t, v); else e.currentTarget.value = t; }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              <span class="small muted">{plural(used(t), 'Projekt', 'Projekte')}</span>
              <button type="button" class="icon-btn" aria-label={`Tag ${t} löschen`} onClick={() => void (async () => {
                if (await confirmDialog(`Tag «${t}» aus allen Projekten entfernen?`, { ok: 'Entfernen', danger: true })) await deleteTag(t);
              })()}><Icon name="trash" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SyncCard() {
  const { backend, supabase } = app();
  const st = syncStatus.value;
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user.email ?? null));
  }, [supabase]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (err) { toast(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };

  if (!backend || !supabase) {
    const valid = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url.trim()) && key.trim().length > 20;
    return (
      <section class="card" id="sync">
        <h2>Sync & Konto</h2>
        <p class="small">Deine Daten liegen nur auf diesem Gerät. Mit einem kostenlosen Supabase-Projekt synchronisieren Laptop und Handy –{' '}
          <a href="https://github.com/simonbruder-hub/application_study/blob/main/taktwerk/supabase/README.md" target="_blank" rel="noopener">Anleitung</a>.</p>
        <form class="stack" onSubmit={(e) => { e.preventDefault(); if (!valid) return; saveBackendConfig({ url: url.trim().replace(/\/$/, ''), anonKey: key.trim() }); location.reload(); }}>
          <div class="field"><label for="sbUrl">Supabase-URL</label>
            <input id="sbUrl" type="url" placeholder="https://xxxx.supabase.co" value={url} onInput={(e) => setUrl(e.currentTarget.value)} /></div>
          <div class="field"><label for="sbKey">Anon-Key (public)</label>
            <input id="sbKey" value={key} onInput={(e) => setKey(e.currentTarget.value)} autocomplete="off" /></div>
          <div><button type="submit" class="btn btn-primary" disabled={!valid}>Verbinden</button></div>
        </form>
      </section>
    );
  }

  return (
    <section class="card" id="sync">
      <h2>Sync & Konto</h2>
      <SyncStatusLine />
      {missingSchemaColumns().length > 0 && (
        <p class="small is-error">Das Supabase-Schema ist älter als die App ({missingSchemaColumns().join(', ')} fehlt). Im Supabase-SQL-Editor <code>schema.sql</code> erneut ausführen, siehe Anleitung. Bis dahin werden diese Angaben nicht synchronisiert.</p>
      )}
      {st.notices.length > 0 && (
        <>
          <ul class="notice-list">{st.notices.map((n, i) => <li key={i}>{n}</li>)}</ul>
          <button type="button" class="link small" onClick={() => app().sync.clearNotices()}>Hinweise ausblenden</button>
        </>
      )}
      <dl class="kv"><dt>Server</dt><dd>{backend.url}</dd>{user && <><dt>Konto</dt><dd>{user}</dd></>}</dl>
      {user ? (
        <div class="btn-col" style={{ marginTop: '12px' }}>
          <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void run(() => app().sync.syncNow())}><Icon name="sync" />Jetzt synchronisieren</button>
          <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void run(() => app().sync.retryBlocked())}><Icon name="upload" />Blockierte Änderungen erneut senden</button>
          <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void run(async () => { await signOut(supabase); location.reload(); })}><Icon name="user" />Abmelden</button>
        </div>
      ) : step === 'email' ? (
        <form class="stack" style={{ marginTop: '12px' }} onSubmit={(e) => { e.preventDefault(); void run(async () => { await sendLoginCode(supabase, email); setStep('code'); toast('Code gesendet – schau in dein Postfach.'); }); }}>
          <div class="field"><label for="loginMail">E-Mail-Adresse</label>
            <input id="loginMail" type="email" required autocomplete="email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} /></div>
          <div><button type="submit" class="btn btn-primary" disabled={busy || !email.includes('@')}>Anmeldecode senden</button></div>
        </form>
      ) : (
        <form class="stack" style={{ marginTop: '12px' }} onSubmit={(e) => { e.preventDefault(); void run(async () => { await verifyLoginCode(supabase, email, code); toast('Angemeldet'); location.reload(); }); }}>
          <div class="field"><label for="loginCode">Code aus der E-Mail an {email}</label>
            <input id="loginCode" class="code-input" inputMode="numeric" autocomplete="one-time-code" maxLength={10} value={code} onInput={(e) => setCode(e.currentTarget.value.trim())} /></div>
          <div class="row-gap">
            <button type="submit" class="btn btn-primary" disabled={busy || code.length < 6}>Anmelden</button>
            <button type="button" class="btn btn-ghost" onClick={() => setStep('email')}>Andere E-Mail</button>
          </div>
        </form>
      )}
      <p style={{ marginTop: '14px' }}>
        <button type="button" class="link small" onClick={() => void (async () => {
          if (!(await confirmDialog('Die Verbindung zu Supabase auf diesem Gerät entfernen? Die lokalen Daten bleiben erhalten.', { ok: 'Entfernen' }))) return;
          saveBackendConfig(null);
          location.reload();
        })()}>Verbindung entfernen</button>
      </p>
    </section>
  );
}

function DataCard() {
  const [busy, setBusy] = useState(false);
  const m = app().migration;
  const exportExcel = async () => {
    setBusy(true);
    try {
      const { exportXlsx, exportFileName, XLSX_MIME } = await import('../excel/exportWorkbook');
      const { thresholdsFromSettings } = await import('../domain/health');
      const buf = await exportXlsx(snapshot.value, { today: todayKey(), thresholds: thresholdsFromSettings(settings.value) });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
      a.download = exportFileName();
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      toast(`Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    const pending = syncStatus.value.pending;
    const ok = await confirmDialog(
      `Alle Daten auf diesem Gerät werden gelöscht.${pending ? ` ${pending} Änderung${pending === 1 ? ' ist' : 'en sind'} noch nicht synchronisiert und gehen verloren.` : ''} Mit Sync werden die Daten danach neu vom Server geladen.`,
      { title: 'Lokale Daten zurücksetzen', ok: 'Zurücksetzen', danger: true },
    );
    if (ok) await resetLocalData();
  };
  return (
    <section class="card">
      <h2>Daten</h2>
      <div class="btn-col">
        <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void exportExcel()}><Icon name="download" />{busy ? 'Excel wird erstellt …' : 'Excel exportieren'}</button>
      </div>
      <p class="muted small">Excel-Import mit Vorschau folgt später.</p>
      {m && (
        <p class="small">Aus Version 1 übernommen: {m.counts.projects.created} Projekte, {m.counts.tasks.created} Aufgaben, {m.counts.time_logs.created} Zeiteinträge.
          {m.warnings.length > 0 && <><br /><span class="muted">{m.warnings.join(' ')}</span></>}</p>
      )}
      <button type="button" class="btn btn-danger-text" onClick={() => void reset()}><Icon name="trash" />Lokale Daten zurücksetzen</button>
    </section>
  );
}

function AppCard() {
  const install = useInstallPrompt();
  return (
    <section class="card">
      <h2>App</h2>
      {install.available && <button type="button" class="btn btn-primary" onClick={() => void install.install()}><Icon name="download" />App installieren</button>}
      <p class="small">Android: in Chrome im Menü ⋮ «App installieren». Laptop: Installieren-Symbol in der Adressleiste von Chrome oder Edge.</p>
      <p class="small"><a href="../taktwerk.html" download>Einzeldatei herunterladen</a> (Notfall-Variante, offline per Doppelklick) · <a href="../">Startseite</a></p>
    </section>
  );
}

function KeysCard() {
  const keys: [string, string][] = [
    ['Leertaste', 'Start / Pause'], ['F', 'Fertig & speichern'], ['S', 'Pause überspringen'], ['M', 'Minimieren'],
    ['W', 'Lernen ↔ Arbeit'], ['T', 'Tag ↔ Nacht'], ['N', 'Neue Aufgabe'], ['1–5', 'Ansichten'], ['Esc', 'Mini-Ansicht schliessen'],
  ];
  return (
    <section class="card">
      <h2>Tastenkürzel</h2>
      <dl class="kbd-list">{keys.map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl>
    </section>
  );
}
