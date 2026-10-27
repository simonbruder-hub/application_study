/** Testkochbuch mit erfundenen Rezepten (tests/fixtures), im selben Format wie skripte/rezepte_json.py */
import { readFileSync } from 'node:fs';
import { pruefeKochbuch } from '../data/pruefen';

export const fixtureText = () => readFileSync(new URL('../../tests/fixtures/testkochbuch.json', import.meta.url), 'utf8');
export const testbuch = () => pruefeKochbuch(JSON.parse(fixtureText()));
