import './styles/app.css';
import { render } from 'preact';
import { App } from './App';
import { starte } from './state';

const root = document.getElementById('root')!;
root.textContent = '';
render(<App />, root);
void starte();

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !import.meta.env.DEV) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
