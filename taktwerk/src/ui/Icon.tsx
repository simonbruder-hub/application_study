export type IconName =
  | 'timer' | 'list' | 'folder' | 'calendar' | 'chart' | 'sliders' | 'play' | 'pause' | 'plus' | 'minus'
  | 'check' | 'x' | 'trash' | 'edit' | 'chevron-left' | 'chevron-right' | 'skip' | 'reset' | 'flag'
  | 'download' | 'upload' | 'copy' | 'clock' | 'bell' | 'sun' | 'moon' | 'auto' | 'minimize' | 'expand'
  | 'cloud' | 'cloud-off' | 'sync' | 'book' | 'briefcase' | 'stop' | 'stopwatch' | 'user' | 'warn';

/** Symbol aus dem SVG-Sprite in index.html */
export function Icon({ name, class: cls }: { name: IconName; class?: string }) {
  return (
    <svg class={cls ? `ic ${cls}` : 'ic'} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function Logo() {
  return (
    <svg class="logo" aria-hidden="true">
      <use href="#i-logo" />
    </svg>
  );
}
