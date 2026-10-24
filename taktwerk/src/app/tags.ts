/**
 * Tags für Projekte: Namen am Projekt (Project.tags), Farben in den synchronisierten Einstellungen
 * (UserSettings.tag_colors). Ohne gespeicherte Farbe bekommt ein Tag eine feste Farbe aus seinem Namen.
 */
import { computed } from '@preact/signals';
import type { Project } from '../data/types';
import { app } from './services';
import { entities, settings } from './store';

/** Vorschläge, solange noch keine eigenen Tags existieren */
export const TAG_SUGGESTIONS = ['Coding', 'Lernen', 'Admin', 'Meeting', 'Schreiben', 'Lesen', 'Prüfung', 'Labor'];

/** Farbpalette für Tags und Projekte: kräftig genug für Tag- und Nachtmodus */
export const TAG_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#0f9fb5', '#8b5e3c', '#c2185b', '#5f7076'];

export const projectTags = (p: Project | null | undefined): string[] => p?.tags ?? [];

const norm = (t: string) => t.trim().replace(/\s+/g, ' ').slice(0, 30);
const key = (t: string) => norm(t).toLocaleLowerCase('de-CH');

/** Alle Tags (aus Projekten und gespeicherten Farben), alphabetisch, ohne Doppel (Gross/Klein egal) */
export const allTags = computed(() => {
  const seen = new Map<string, string>();
  for (const p of entities.value.projects) for (const t of projectTags(p)) if (!seen.has(key(t))) seen.set(key(t), norm(t));
  for (const t of Object.keys(settings.value.tag_colors ?? {})) if (!seen.has(key(t))) seen.set(key(t), norm(t));
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de-CH'));
});

export function tagColor(tag: string): string {
  const saved = settings.value.tag_colors?.[norm(tag)];
  if (saved) return saved;
  let h = 0;
  for (const ch of key(tag)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length]!;
}

/** Tag-Liste bereinigen: getrimmt, ohne Doppel, höchstens 12 */
export function cleanTags(tags: readonly string[]): string[] {
  const out = new Map<string, string>();
  for (const t of tags) if (norm(t)) out.set(key(t), norm(t));
  return [...out.values()].slice(0, 12);
}

export async function setTagColor(tag: string, color: string): Promise<void> {
  await app().sync.saveSettings({ tag_colors: { ...(settings.value.tag_colors ?? {}), [norm(tag)]: color } });
}

/** Tag in allen Projekten umbenennen (oder mit einem bestehenden zusammenführen) */
export async function renameTag(from: string, to: string): Promise<void> {
  const target = norm(to);
  if (!target || key(from) === key(target) && from === target) return;
  for (const p of entities.value.projects) {
    if (!projectTags(p).some((t) => key(t) === key(from))) continue;
    await app().repo.update('projects', p.id, { tags: cleanTags(projectTags(p).map((t) => (key(t) === key(from) ? target : t))) });
  }
  const colors = { ...(settings.value.tag_colors ?? {}) };
  const c = colors[norm(from)];
  delete colors[norm(from)];
  if (c && !colors[target]) colors[target] = c;
  await app().sync.saveSettings({ tag_colors: colors });
}

export async function deleteTag(tag: string): Promise<void> {
  for (const p of entities.value.projects) {
    if (!projectTags(p).some((t) => key(t) === key(tag))) continue;
    await app().repo.update('projects', p.id, { tags: projectTags(p).filter((t) => key(t) !== key(tag)) });
  }
  const colors = { ...(settings.value.tag_colors ?? {}) };
  delete colors[norm(tag)];
  await app().sync.saveSettings({ tag_colors: colors });
}
