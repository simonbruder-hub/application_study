import './styles/app.css';
import { render } from 'preact';
import { App } from './App';

const root = document.getElementById('root')!;
root.textContent = '';
render(<App />, root);

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !import.meta.env.DEV) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
