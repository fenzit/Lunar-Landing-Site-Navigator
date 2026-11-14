import { sites } from './sites.mjs';

export const presetCoverage = {
  start: Date.parse('2026-11-14T00:00:00Z'), end: Date.parse('2027-11-14T00:00:00Z'),
  step: 30, height: 2,
};
export const polarPresets = [...sites, {
  id: 'north-pole', name: 'North polar sample', lat: 90, lon: 25,
  mission: 'Selected DEM point · 90° N, 25° E', url: 'https://pgda.gsfc.nasa.gov/products/98',
}, {
  id: 'south-polar', name: 'South polar sample', lat: -89.5, lon: 0,
  mission: 'Selected DEM point · 89.5° S, 0° E', url: 'https://pgda.gsfc.nasa.gov/products/90',
}];
export const defenseEpisode = {
  start: Date.parse('2026-11-14T00:00:00Z'), end: Date.parse('2026-11-21T00:00:00Z'),
  time: Date.parse('2026-11-15T07:00:00Z'), required: 4, height: 2, step: 30,
  sites: ['odysseus', 'athena'],
};
