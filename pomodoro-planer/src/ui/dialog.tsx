/**
 * Modale Dialoge (natives <dialog>). Es ist immer höchstens ein Dialog offen; der Inhalt ist eine
 * Komponente mit eigenem Zustand und bekommt `close` übergeben.
 */
import { signal } from '@preact/signals';
import type { ComponentChildren, ComponentType } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon';
import { isTouch } from './format';

export interface DialogProps {
  close: () => void;
}

interface DialogSpec {
  key: number;
  Content: ComponentType<DialogProps>;
  wide: boolean;
  onDismiss?: () => void;
}

const current = signal<DialogSpec | null>(null);
let seq = 0;

export const dialogOpen = (): boolean => current.value !== null;

export function openDialog(Content: ComponentType<DialogProps>, opts: { wide?: boolean; onDismiss?: () => void } = {}): void {
  const prev = current.value;
  current.value = { key: ++seq, Content, wide: !!opts.wide, ...(opts.onDismiss ? { onDismiss: opts.onDismiss } : {}) };
  prev?.onDismiss?.();
}

export function closeDialog(): void {
  current.value = null;
}

function dismiss(): void {
  const spec = current.value;
  current.value = null;
  spec?.onDismiss?.();
}

export function DialogHost() {
  const ref = useRef<HTMLDialogElement>(null);
  const spec = current.value;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (spec && !d.open) {
      d.showModal();
      const first = d.querySelector<HTMLElement>('[data-autofocus]');
      if (first && !isTouch) first.focus();
    }
    if (!spec && d.open) d.close();
  }, [spec]);
  return (
    <dialog
      ref={ref}
      class={`dlg${spec?.wide ? ' dlg-wide' : ''}`}
      onCancel={(e) => { e.preventDefault(); dismiss(); }}
    >
      {spec && <spec.Content key={spec.key} close={closeDialog} />}
    </dialog>
  );
}

/** Rahmen im Stil der App: Kopf mit Titel, Inhalt, Fussleiste */
export function DialogFrame(props: {
  title: string;
  children: ComponentChildren;
  footer: ComponentChildren;
  onSubmit?: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <form
      class="dlg-form"
      method="dialog"
      onSubmit={(e) => { e.preventDefault(); void props.onSubmit?.(); }}
    >
      <header class="dlg-head">
        <h2>{props.title}</h2>
        <button type="button" class="icon-btn" aria-label="Schliessen" onClick={props.onClose}><Icon name="x" /></button>
      </header>
      <div class="dlg-body">{props.children}</div>
      <footer class="dlg-foot">{props.footer}</footer>
    </form>
  );
}

/** Ja/Nein-Abfrage */
export function confirmDialog(text: string, opts: { title?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
    openDialog(({ close }) => (
      <DialogFrame
        title={opts.title ?? 'Bist du sicher?'}
        onClose={() => { finish(false); close(); }}
        onSubmit={() => { finish(true); close(); }}
        footer={<>
          <span class="grow" />
          <button type="button" class="btn btn-ghost" onClick={() => { finish(false); close(); }}>Abbrechen</button>
          <button type="submit" class={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} data-autofocus>{opts.ok ?? 'OK'}</button>
        </>}
      >
        <p class="dlg-text">{text}</p>
      </DialogFrame>
    ), { onDismiss: () => finish(false) });
  });
}
