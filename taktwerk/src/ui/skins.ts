/**
 * Stile der App. Farben und Formen stehen in den CSS-Dateien unter styles/skins/ (gesetzt über
 * data-skin auf <html>); hier stehen Name, Vorschaufarben, Browser-Farbe und nachzuladende Schriften.
 */

export type Skin = 'klassisch' | 'anime' | 'technik' | 'barock' | 'natur' | 'amtlich';

export interface SkinInfo {
  id: Skin;
  label: string;
  hint: string;
  /** Vorschau in den Einstellungen: Hintergrund, Akzent, Zweitfarbe */
  swatch: readonly [string, string, string];
  /** theme-color der Browserleiste: Tag, Nacht */
  bar: readonly [string, string];
  /** Google-Fonts-Familien (Teil nach "family="), werden erst bei Wahl des Stils geladen */
  fonts?: string;
}

export const SKINS: readonly SkinInfo[] = [
  {
    id: 'klassisch', label: 'Klassisch', hint: 'Leuchtendes Zifferblatt, Atemkreis in der Pause',
    swatch: ['#edf1f0', '#c63a29', '#217a6f'], bar: ['#edf1f0', '#0d1214'],
  },
  {
    id: 'anime', label: 'Anime', hint: 'Blitze, Herzen, Laternenfest und Tomaten-Chan',
    swatch: ['#fdf1f6', '#e0285a', '#7457f5'], bar: ['#fdf1f6', '#130d26'],
    fonts: 'M+PLUS+Rounded+1c:wght@400;700;800&family=Mochiy+Pop+One',
  },
  {
    id: 'technik', label: 'Technik', hint: 'Oszilloskop: Sinus, Rechteck, Lissajous',
    swatch: ['#040a09', '#ffd23f', '#35e0ff'], bar: ['#e9eff4', '#040a09'],
    fonts: 'Share+Tech+Mono',
  },
  {
    id: 'barock', label: 'Barock', hint: 'Gold, römische Ziffern, Tafelmusik, Feuerwerk',
    swatch: ['#f6efe1', '#8e1b2c', '#b0862f'], bar: ['#f6efe1', '#140d0a'],
    fonts: 'Playfair+Display:ital,wght@0,600;0,800;1,600&family=EB+Garamond:ital,wght@0,400;0,600;1,400',
  },
  {
    id: 'natur', label: 'Natur', hint: 'Wald im Wind, Sonnenuntergang, Pflanze wächst',
    swatch: ['#eef1e6', '#4f7a3a', '#c2452d'], bar: ['#eef1e6', '#0c140f'],
    fonts: 'Fraunces:opsz,wght@9..144,500;9..144,700&family=Nunito:wght@400;700',
  },
  {
    id: 'amtlich', label: 'Amtlich', hint: 'Formular, Kaffeepause und Stempel',
    swatch: ['#ffffff', '#d52b1e', '#111111'], bar: ['#f2f2f0', '#0f141a'],
    fonts: 'Inter:wght@400;600;800&family=IBM+Plex+Mono:wght@500',
  },
];

export const skinInfo = (id: string): SkinInfo => SKINS.find((s) => s.id === id) ?? SKINS[0]!;
