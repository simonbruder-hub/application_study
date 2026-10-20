/** Installations-Angebot des Browsers (Chrome/Edge/Android): «App installieren» */
import { useEffect, useState } from 'preact/hooks';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let installEvent: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    installListeners.forEach((fn) => fn());
  });
}

export function useInstallPrompt(): { available: boolean; install: () => Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    installListeners.add(fn);
    return () => { installListeners.delete(fn); };
  }, []);
  return {
    available: installEvent !== null,
    install: async () => {
      const e = installEvent;
      if (!e) return;
      await e.prompt();
      await e.userChoice.catch(() => undefined);
      installEvent = null;
      installListeners.forEach((fn) => fn());
    },
  };
}
