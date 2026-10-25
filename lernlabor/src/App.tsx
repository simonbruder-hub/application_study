import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { Lab } from './lab/Lab';
import { href, route } from './router';
import { Exercises } from './views/Exercises';
import { Fach } from './views/Fach';
import { Home } from './views/Home';
import { Theory } from './views/Theory';

type Theme = 'auto' | 'light' | 'dark';
const THEME_KEY = 'lernlabor.theme';

function readTheme(): Theme {
  try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
}
const theme = signal<Theme>(readTheme());

function applyTheme(t: Theme) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ohne Speicher */ }
}

const THEME_NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_LABEL: Record<Theme, string> = { auto: 'Hell/Dunkel: automatisch', light: 'Hell', dark: 'Dunkel' };

function Header() {
  const path = route.value.path;
  return (
    <header class="top">
      <a class="brand" href={href('/')}>
        <svg viewBox="0 0 32 32" class="brand-logo" aria-hidden="true">
          <rect x="2" y="5" width="28" height="22" rx="5" class="bl-screen" />
          <path d="M5 16 C8 8 11 8 13 16 S18 24 21 16 S25 9 27 12" class="bl-wave" />
        </svg>
        <span>Lernlabor</span>
      </a>
      <nav>
        <a href={href('/')} class={path === '/' ? 'is-on' : ''}>Fächer</a>
        <a href={href('/et')} class={path.startsWith('/et') && path !== '/et/bauen' ? 'is-on' : ''}>Elektrotechnik</a>
        <a href={href('/et/bauen')} class={path === '/et/bauen' ? 'is-on' : ''}>Baukasten</a>
      </nav>
      <button type="button" class="btn-icon theme-btn" title={THEME_LABEL[theme.value]} aria-label={THEME_LABEL[theme.value]} onClick={() => (theme.value = THEME_NEXT[theme.value])}>
        <svg viewBox="0 0 24 24" class="theme-ico" aria-hidden="true">
          {theme.value === 'dark' ? <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
            : theme.value === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></>
              : <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" class="fill" /></>}
        </svg>
      </button>
    </header>
  );
}

function Page() {
  const { path } = route.value;
  const seg = path.split('/').filter(Boolean);
  if (seg.length === 0) return <Home />;
  if (seg[0] === 'et' && seg[1] === 'bauen') return <Lab />;
  if (seg[0] === 'et' && seg[1] === 'theorie' && seg[2]) return <Theory chapter={seg[2]} />;
  if (seg[0] === 'et' && seg[1] === 'aufgaben' && seg[2]) return <Exercises chapter={seg[2]} />;
  if (seg.length === 1) return <Fach id={seg[0]!} />;
  return <Home />;
}

export function App() {
  useEffect(() => applyTheme(theme.value), [theme.value]);
  const wide = route.value.path === '/et/bauen';
  return (
    <>
      <Header />
      <main class={wide ? 'wide' : ''}><Page /></main>
    </>
  );
}
