import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { href, route } from './router';
import { bereit, zettel } from './state';
import { Toast } from './ui/toast';
import { Daten } from './views/Daten';
import { Einkauf } from './views/Einkauf';
import { RezeptSeite } from './views/RezeptSeite';
import { Rezepte } from './views/Rezepte';

type Theme = 'auto' | 'light' | 'dark';
const THEME_KEY = 'kochbuch.theme';

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
  const n = zettel.value.rezepte.length;
  return (
    <header class="top">
      <a class="brand" href={href('/')}>
        <svg viewBox="0 0 32 32" class="brand-logo" aria-hidden="true">
          <rect x="1" y="1" width="30" height="30" rx="8" class="bl-bg" />
          <path d="M8 13h16M10 13v8a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-8M10 15H7.5M22 15h2.5M13 9.5c-1-1.2 1-2 0-3.2M16 9.5c-1-1.2 1-2 0-3.2M19 9.5c-1-1.2 1-2 0-3.2" class="bl-pot" />
        </svg>
        <span>Kochbuch</span>
      </a>
      <nav>
        <a href={href('/')} class={path === '/' || path.startsWith('/rezept') ? 'is-on' : ''}>Rezepte</a>
        <a href={href('/einkauf')} class={path === '/einkauf' ? 'is-on' : ''}>Einkauf{n > 0 && <span class="nav-n">{n}</span>}</a>
        <a href={href('/daten')} class={path === '/daten' ? 'is-on' : ''}>Daten</a>
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

function Seite() {
  if (!bereit.value) return <p class="boot">Rezepte werden geladen …</p>;
  const seg = route.value.path.split('/').filter(Boolean);
  if (seg[0] === 'rezept' && seg[1]) {
    const id = decodeURIComponent(seg[1]);
    return <RezeptSeite key={id} id={id} />;
  }
  if (seg[0] === 'einkauf') return <Einkauf />;
  if (seg[0] === 'daten') return <Daten />;
  return <Rezepte />;
}

export function App() {
  useEffect(() => applyTheme(theme.value), [theme.value]);
  return (
    <>
      <Header />
      <main><Seite /></main>
      <Toast />
    </>
  );
}
