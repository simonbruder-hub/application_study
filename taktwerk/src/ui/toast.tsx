import { signal } from '@preact/signals';

interface ToastItem {
  id: number;
  text: string;
  out: boolean;
  action?: { label: string; fn: () => void };
}

const toasts = signal<ToastItem[]>([]);
let seq = 0;

export function toast(text: string, opts: { action?: { label: string; fn: () => void }; timeout?: number } = {}): void {
  const id = ++seq;
  const timeout = opts.timeout ?? 4500;
  toasts.value = [...toasts.value, { id, text, out: false, ...(opts.action ? { action: opts.action } : {}) }].slice(-4);
  setTimeout(() => { toasts.value = toasts.value.map((t) => (t.id === id ? { ...t, out: true } : t)); }, timeout);
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id); }, timeout + 350);
}

export function ToastHost() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast${t.out ? ' is-out' : ''}`}>
          <span>{t.text}</span>
          {t.action && (
            <button type="button" class="toast-btn" onClick={() => {
              t.action!.fn();
              toasts.value = toasts.value.filter((x) => x.id !== t.id);
            }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}
