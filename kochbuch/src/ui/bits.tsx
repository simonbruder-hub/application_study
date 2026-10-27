/** Kleine Bausteine: Magen-Ampel und Portionen-Wähler */
import type { MagenStufe, Rezept } from '../data/types';
import { portionSchritte, portionText } from '../logic/einkauf';
import { MAGEN_NAME } from '../logic/filter';

export const Ampel = ({ stufe }: { stufe: MagenStufe }) => <span class={`ampel ampel-${stufe}`} aria-hidden="true" />;

export function MagenBadge({ stufe }: { stufe: MagenStufe }) {
  return <span class={`badge magen magen-${stufe}`}><Ampel stufe={stufe} />{MAGEN_NAME[stufe]}</span>;
}

export function Portionen({ r, faktor, personen, onChange }: {
  r: Rezept; faktor: number; personen: number; onChange: (f: number) => void;
}) {
  const { min, max, schritt } = portionSchritte(r, personen);
  const setze = (f: number) => onChange(Math.min(max, Math.max(min, Math.round(f / schritt) * schritt)));
  return (
    <div class="stepper" role="group" aria-label={`Menge für ${r.titel}`}>
      <button type="button" class="btn-icon" aria-label="weniger" disabled={faktor <= min + 1e-9} onClick={() => setze(faktor - schritt)}>−</button>
      <output aria-live="polite">{portionText(r, faktor, personen)}</output>
      <button type="button" class="btn-icon" aria-label="mehr" disabled={faktor >= max - 1e-9} onClick={() => setze(faktor + schritt)}>+</button>
    </div>
  );
}
