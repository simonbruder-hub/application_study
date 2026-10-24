/** App-Rahmen: Seitenleiste (Desktop), Kopfzeile mit Modus und Sync, Ansicht, Mini-Leiste, Navigation */
import { useEffect } from 'preact/hooks';
import { useInstallPrompt } from './app/install';
import { prefs } from './app/prefs';
import { go, view, VIEWS, type ViewName } from './app/router';
import { loaded } from './app/store';
import { expand, minimize, pipOpen } from './app/pip';
import { ModeSwitch, SideTimer, SyncIndicator } from './ui/components/Chrome';
import { Dock, dockVisible, MiniPlayer } from './ui/components/Mini';
import { DialogHost } from './ui/dialog';
import { Icon, Logo } from './ui/Icon';
import { isDark, toggleDayNight } from './ui/theme';
import { ToastHost } from './ui/toast';
import { Fokus } from './views/Fokus';
import { Aufgaben } from './views/Aufgaben';
import { Projekte } from './views/Projekte';
import { Auswertung } from './views/Auswertung';
import { Einstellungen } from './views/Einstellungen';

const VIEW_COMPONENTS: Record<ViewName, () => preact.JSX.Element> = {
  fokus: Fokus,
  aufgaben: Aufgaben,
  projekte: Projekte,
  auswertung: Auswertung,
  einstellungen: Einstellungen,
};

function ThemeButton() {
  const dark = isDark();
  return (
    <button type="button" class="icon-btn" aria-label={dark ? 'Tagmodus (T)' : 'Nachtmodus (T)'} title={dark ? 'Tagmodus (T)' : 'Nachtmodus (T)'} onClick={toggleDayNight}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

/** Logo: führt immer zur Fokus-Ansicht. Reiner Ansichtswechsel, der Timer läuft unverändert weiter. */
function HomeLink() {
  return (
    <a class="brand" href="#fokus" aria-label="Taktwerk: zur Fokus-Ansicht" onClick={(e) => { e.preventDefault(); go('fokus'); }}>
      <Logo /><span>Taktwerk</span>
    </a>
  );
}

export function App() {
  const v = view.value;
  const mini = prefs.value.mini;
  const install = useInstallPrompt();
  const View = VIEW_COMPONENTS[v];

  useEffect(() => {
    document.body.classList.toggle('is-mini', mini);
  }, [mini]);

  return (
    <>
      <div class={`app${dockVisible() ? ' has-dock' : ''}`} data-view={v}>
        <aside class="sidebar" aria-label="Hauptnavigation">
          <HomeLink />
          <nav class="nav">
            {VIEWS.map((x, i) => (
              <button
                key={x.id} type="button" class={`nav-item${x.id === v ? ' is-on' : ''}`} aria-current={x.id === v ? 'page' : undefined}
                onClick={() => go(x.id)}
              >
                <Icon name={x.icon} /><span>{x.label}</span><kbd>{i + 1}</kbd>
              </button>
            ))}
          </nav>
          <SideTimer />
          <div class="side-foot">
            {install.available && (
              <button type="button" class="btn btn-ghost btn-sm" onClick={() => void install.install()}>
                <Icon name="download" />App installieren
              </button>
            )}
          </div>
        </aside>

        <div class="col">
          <header class="topbar">
            <HomeLink />
            <ModeSwitch />
            <span class="grow" />
            <SyncIndicator />
            <ThemeButton />
            <button
              type="button" class="icon-btn" title={pipOpen.value ? 'Schwebendes Fenster schliessen (M)' : 'Minimieren (M)'}
              aria-label="Minimieren" onClick={() => void minimize()}
            >
              <Icon name="minimize" />
            </button>
          </header>
          <main id="main" class="main" tabIndex={-1}>
            {loaded.value ? <View /> : <div class="boot">Deine Daten werden geladen …</div>}
          </main>
        </div>

        <Dock />

        <nav class="tabbar" aria-label="Navigation">
          {VIEWS.filter((x) => x.tab).map((x) => (
            <button
              key={x.id} type="button" class={`tab${x.id === v ? ' is-on' : ''}`} aria-current={x.id === v ? 'page' : undefined}
              onClick={() => go(x.id)}
            >
              <Icon name={x.icon} /><span>{x.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {mini && (
        <div class="mini-root">
          <MiniPlayer onExpand={expand} />
        </div>
      )}
      <DialogHost />
      <ToastHost />
    </>
  );
}
