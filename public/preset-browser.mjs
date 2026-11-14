import { language, t } from './i18n.mjs';
import { hour } from '../lib/windows.mjs';

export function createPresetBrowser(root, { load, open, date, describeError }) {
  const form = root.querySelector('form'), field = name => form.elements.namedItem(name);
  const caption = root.querySelector('#preset-coverage'), status = root.querySelector('#preset-status');
  const sources = root.querySelector('#preset-sources'), submit = root.querySelector('#preset-open');
  let manifest, message;

  function render() {
    status.textContent = message?.() ?? '';
    if (!manifest) return;
    const site = manifest.sites.find(s => s.id === field('site').value);
    caption.textContent = t('presetCoverage', {
      lat: site.lat, lon: site.lon, start: date(site.coverage.start), end: date(site.coverage.end),
      step: site.coverage.stepMinutes, height: site.equipmentHeight, version: site.modelVersion,
    });
    sources.replaceChildren();
    for (const record of [{ name: 'JPL · ' + t('sun'), url: site.source.records.sun.url }, { name: 'JPL · ' + t('earth'), url: site.source.records.earth.url },
      ...site.terrainSources.map(s => ({ name: s.name, url: s.citation }))]) {
      const link = document.createElement('a'); link.textContent = record.name; link.href = record.url; sources.append(link, ' · ');
    }
  }

  form.addEventListener('change', render);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const site = manifest.sites.find(s => s.id === field('site').value), required = field('required').valueAsNumber;
    const params = new URLSearchParams({ site: site.id, start_utc: field('start').value + 'Z',
      duration_hours: field('hours').value, step_minutes: field('step').value, receiver_height_m: field('height').value });
    submit.disabled = true; message = () => t('presetLoading'); render();
    try {
      const data = await load('/api/presets/analysis?' + params);
      open(data, { site, selection: site.id, height: data.terrain.receiverHeight }, required, data.period.start);
      message = () => t('presetOpened', { name: site.name });
    } catch (error) { message = () => describeError(error); }
    finally { submit.disabled = false; render(); }
  });

  return {
    localize: render,
    async init() {
      try {
        manifest = await load('/api/presets');
        field('site').replaceChildren();
        for (const site of manifest.sites) { const option = document.createElement('option'); option.value = site.id; option.textContent = site.name; field('site').append(option); }
        field('start').value = new Date(manifest.episode.start).toISOString().slice(0, 16);
        field('hours').value = (manifest.episode.end - manifest.episode.start) / hour;
        field('required').value = manifest.episode.required; field('height').value = manifest.coverage.height;
        field('step').value = manifest.coverage.step; submit.disabled = false;
        message = () => t('presetReady', { count: manifest.sites.length.toLocaleString(language) });
      } catch (error) { message = () => describeError(error); }
      render();
    },
  };
}
