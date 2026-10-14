/* Pomodoro-Timer: Phasen, Zeitmessung über Zeitstempel (läuft auch in
 * Hintergrund-Tabs korrekt), Signalton, Benachrichtigung, Wake Lock,
 * Medien-Steuerung (Android-Benachrichtigung / Sperrbildschirm). */
'use strict';

const PHASES = {
  focus: { label: 'Fokus', short: 'Fokus', kanji: '集中' },
  short: { label: 'Kurze Pause', short: 'Pause', kanji: '休憩' },
  long: { label: 'Lange Pause', short: 'Lange Pause', kanji: '休息' },
};

const Timer = (() => {
  let audio = null;
  let chimeNodes = [];
  let chimeAt = null;
  let wakeLock = null;
  let bgAudio = null;
  let lastMediaMinute = null;

  const t = () => Store.state.timer;
  const S = () => Store.state.settings;

  const durationOf = (phase) => Math.max(60, Math.round((S()[phase] || 1) * 60));
  const duration = () => t().duration ?? durationOf(t().phase);
  const remaining = (now = Date.now()) => {
    const x = t();
    if (x.status === 'running') return Math.max(0, (x.endsAt - now) / 1000);
    return x.remaining ?? durationOf(x.phase);
  };
  const elapsedFocus = (now = Date.now()) => {
    const x = t();
    if (x.phase !== 'focus') return 0;
    let s = x.focusAccum || 0;
    if (x.status === 'running' && x.segmentStart) s += (now - x.segmentStart) / 1000;
    return s;
  };
  const isRunning = () => t().status === 'running';
  const isActive = () => t().status !== 'idle';

  function commit() {
    Store.commitTimer();
    syncMedia(true);
  }

  function start(at = Date.now()) {
    const x = t();
    if (x.status === 'running') return;
    ensureAudio();
    if (x.status === 'idle') {
      if (x.remaining == null) { x.duration = durationOf(x.phase); x.remaining = x.duration; }
      if (x.phase === 'focus') { x.sessionStart = at; x.focusAccum = 0; }
    }
    x.endsAt = at + x.remaining * 1000;
    if (x.phase === 'focus') x.segmentStart = at;
    x.status = 'running';
    scheduleChime();
    requestWake();
    commit();
  }

  function pause() {
    const x = t();
    if (x.status !== 'running') return;
    const now = Date.now();
    x.remaining = Math.max(1, (x.endsAt - now) / 1000);
    if (x.phase === 'focus' && x.segmentStart) { x.focusAccum += (now - x.segmentStart) / 1000; x.segmentStart = null; }
    x.endsAt = null;
    x.status = 'paused';
    cancelChime();
    releaseWake();
    commit();
  }

  const toggle = () => (isRunning() ? pause() : start());

  /** Laufende/geplante Phase um min Minuten verlängern/verkürzen */
  function adjust(min) {
    const x = t();
    const rem = remaining();
    const next = Math.max(60, rem + min * 60);
    const delta = next - rem;
    if (delta === 0) return;
    if (x.status === 'running') { x.endsAt += delta * 1000; x.duration = duration() + delta; scheduleChime(); }
    else { x.remaining = next; x.duration = Math.max(next, duration() + delta); }
    commit();
  }

  function toIdle(phase) {
    const x = t();
    cancelChime();
    releaseWake();
    Object.assign(x, { phase, status: 'idle', remaining: null, duration: null, endsAt: null, segmentStart: null, focusAccum: 0, sessionStart: null });
  }

  function setPhase(phase) { toIdle(phase); commit(); }
  function reset() { toIdle(t().phase); commit(); }

  function logFocus(endMs, full) {
    const x = t();
    let sec = x.focusAccum || 0;
    if (x.segmentStart) sec += (endMs - x.segmentStart) / 1000;
    sec = Math.round(sec);
    if (sec < 60) return null;
    const tg = Store.resolveTarget(x.target);
    const s = {
      id: U.uid('s'), start: x.sessionStart ?? endMs - sec * 1000, end: endMs, sec, full,
      taskId: tg.taskId, projectId: tg.projectId, category: tg.category, title: tg.taskId || tg.projectId ? tg.title : '',
      note: '', manual: false,
    };
    Store.addSession(s);
    return s;
  }

  /** Fokus abschliessen → Pause vorbereiten */
  function finishFocus(endMs, full) {
    const x = t();
    const s = logFocus(endMs, full);
    x.cycle = (x.cycle || 0) + 1;
    const every = Math.max(1, S().longEvery || 4);
    toIdle(x.cycle % every === 0 ? 'long' : 'short');
    return s;
  }

  /** Fokus vorzeitig beenden und speichern */
  function finishEarly() {
    const x = t();
    if (x.phase !== 'focus') { skip(); return null; }
    const now = Date.now();
    const full = elapsedFocus(now) >= duration() * 0.5;
    const s = finishFocus(now, full);
    if (S().autoBreak) start(); else commit();
    return s;
  }

  /** Pause überspringen */
  function skip() {
    toIdle('focus');
    commit();
  }

  /** Phase ist regulär abgelaufen */
  function complete(endMs) {
    const x = t();
    const phase = x.phase;
    const scheduled = chimeAt === endMs && audio && audio.state === 'running';
    chimeNodes = []; chimeAt = null; // geplanter Ton soll weiterklingen
    let s = null;
    if (phase === 'focus') s = finishFocus(endMs, true);
    else toIdle('focus');
    const next = t().phase;
    if (!scheduled) chime(phase === 'focus' ? 'focusEnd' : 'breakEnd');
    const msg = phase === 'focus'
      ? `${s ? 'Pomodoro geschafft' : 'Fokus beendet'} – ${PHASES[next].label} (${S()[next]} min)`
      : 'Pause vorbei – weiter geht’s mit Fokus';
    notify(phase === 'focus' ? 'Fokus beendet' : 'Pause vorbei', msg);
    App.onPhaseComplete(phase, next, s, msg);
    const auto = next === 'focus' ? S().autoFocus : S().autoBreak;
    if (auto && Date.now() - endMs < durationOf(next) * 1000) start(endMs); else commit();
  }

  function tick() {
    const x = t();
    if (x.status === 'running' && Date.now() >= x.endsAt) complete(x.endsAt);
    syncMedia(false);
  }

  /** Nach dem Laden: abgelaufene Phase nachtragen, Ton neu planen */
  function resume() {
    const x = t();
    if (x.status === 'running') {
      if (Date.now() >= x.endsAt) complete(x.endsAt);
      else scheduleChime();
    }
  }

  /* ---------- Ton ---------- */
  function ensureAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { audio = null; }
    return audio;
  }

  function chime(kind, when) {
    const ctx = audio;
    if (!ctx || !S().sound) return [];
    const at = when ?? ctx.currentTime + 0.02;
    const vol = U.clamp(S().volume ?? 0.7, 0, 1);
    const notes = kind === 'focusEnd' ? [987.8, 784, 659.3] : kind === 'breakEnd' ? [659.3, 784, 987.8] : [784, 987.8];
    const nodes = [];
    notes.forEach((f, i) => {
      const t0 = at + i * 0.24;
      [1, 2.76].forEach((mult, k) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f * mult;
        const peak = (k === 0 ? 0.32 : 0.07) * vol + 0.0001;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (k === 0 ? 1.3 : 0.5));
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + 1.4);
        nodes.push(o);
      });
    });
    return nodes;
  }

  /** Ton im Voraus auf das Ende planen: klingt pünktlich, auch wenn der Tab gedrosselt wird */
  function scheduleChime() {
    cancelChime();
    const x = t();
    if (!audio || !S().sound || x.status !== 'running') return;
    const delay = Math.max(0, (x.endsAt - Date.now()) / 1000);
    chimeNodes = chime(x.phase === 'focus' ? 'focusEnd' : 'breakEnd', audio.currentTime + delay);
    chimeAt = x.endsAt;
  }
  function cancelChime() {
    chimeNodes.forEach((n) => { try { n.stop(); } catch { /* schon gestoppt */ } });
    chimeNodes = []; chimeAt = null;
  }
  function testSound() { ensureAudio(); setTimeout(() => chime('focusEnd'), 30); }

  /* ---------- Benachrichtigung ---------- */
  function notify(title, body) {
    try {
      if (!S().notify || !('Notification' in window) || Notification.permission !== 'granted') return;
      if (!document.hidden && !App.pipOpen()) return;
      const opts = { body, tag: 'pomodoro', renotify: true, icon: 'icons/icon-192.png' };
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {});
      } else new Notification(title, opts);
    } catch { /* nicht verfügbar */ }
  }
  async function requestNotify() {
    try {
      if (!('Notification' in window)) return 'unsupported';
      if (Notification.permission === 'granted') return 'granted';
      return await Notification.requestPermission();
    } catch { return 'denied'; }
  }

  /* ---------- Bildschirm wach halten ---------- */
  async function requestWake() {
    try {
      if (!S().wakeLock || !('wakeLock' in navigator) || wakeLock || document.hidden) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { wakeLock = null; }
  }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch { /* egal */ } wakeLock = null; }

  /* ---------- Hintergrund-Modus / Medien-Steuerung ----------
   * Spielt eine stumme Tonspur, solange der Timer läuft. So bleibt die App
   * auf Android im Hintergrund aktiv (Signalton kommt pünktlich) und der
   * Timer erscheint mit Start/Pause in der Benachrichtigung bzw. in den
   * Medien-Steuerelementen des Browsers. */
  function silentWavUrl() {
    const rate = 8000; const secs = 10; const n = rate * secs;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function setupMediaHandlers() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const h = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* nicht unterstützt */ } };
    h('play', () => start());
    h('pause', () => pause());
    h('stop', () => pause());
    h('nexttrack', () => { if (t().phase === 'focus') finishEarly(); else skip(); });
  }

  function syncMedia(force) {
    const want = !!S().background && isRunning();
    try {
      if (want) {
        if (!bgAudio) {
          bgAudio = new Audio(silentWavUrl());
          bgAudio.loop = true;
          setupMediaHandlers();
        }
        if (bgAudio.paused) bgAudio.play().catch(() => {});
      } else if (bgAudio && !bgAudio.paused) {
        bgAudio.pause();
      }
      if (!('mediaSession' in navigator) || !bgAudio) return;
      const ms = navigator.mediaSession;
      const minute = Math.ceil(remaining() / 60);
      if (!force && minute === lastMediaMinute) return;
      lastMediaMinute = minute;
      if (!S().background) { ms.metadata = null; ms.playbackState = 'none'; return; }
      const x = t();
      const tg = Store.resolveTarget(x.target);
      ms.metadata = new MediaMetadata({
        title: `${PHASES[x.phase].label} · noch ${minute} min`,
        artist: x.phase === 'focus' ? tg.title : 'Pomodoro-Planer',
        album: 'Pomodoro-Planer',
      });
      ms.playbackState = isRunning() ? 'playing' : 'paused';
      if (ms.setPositionState && isActive()) {
        const d = duration();
        ms.setPositionState({ duration: d, playbackRate: 1, position: U.clamp(d - remaining(), 0, d) });
      }
    } catch { /* Medien-API nicht verfügbar */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { tick(); if (isRunning()) requestWake(); }
  });
  document.addEventListener('pointerdown', () => { if (audio && audio.state === 'suspended') audio.resume(); }, { passive: true });

  return {
    PHASES, durationOf, duration, remaining, elapsedFocus, isRunning, isActive, start, pause, toggle, adjust,
    setPhase, reset, finishEarly, skip, tick, resume, testSound, requestNotify, ensureAudio, syncMedia,
    scheduleChime,
  };
})();
