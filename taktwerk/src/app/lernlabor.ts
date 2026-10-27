/**
 * Adresse des Lernlabors (eigene App im selben Repository). Auf GitHub Pages relativ, damit ein späterer
 * Umzug auf eine eigene Domain beide Apps mitnimmt; sonst (Einzeldatei, Desktop, lokal) die veröffentlichte Adresse.
 */
export const LERNLABOR_URL = location.hostname.endsWith('github.io')
  ? '../../lernlabor/app/'
  : 'https://simonbruder-hub.github.io/apps/lernlabor/app/';
