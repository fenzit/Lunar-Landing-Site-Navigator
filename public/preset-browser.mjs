import { language, t } from './i18n.mjs';
import { hour } from '../lib/windows.mjs';

export function createPresetBrowser(root, { load, open, date, describeError }) {
  const form = root.querySelector('form'), field = name => form.elements.namedItem(name);
  const caption = root.querySelector('#preset-coverage'), status = root.querySelector('#preset-status');
  const sources = root.querySelector('#preset-sources'), submit = root.querySelector('#preset-open');
  const full = root.querySelector('#preset-full'), periodLimit = root.querySelector('#preset-period-limit');
  let manifest, message, busy = false;
  const selectedSite = () => manifest?.sites.find(site => site.id === field('site').value);
  const utcInput = time => new Date(time).toISOString().slice(0, 16);

  function updatePeriod() {
    const site = selectedSite();
    if (!site) return;
    const { start, end } = site.coverage;
    const startField = field('start'), hours = field('hours');
    startField.min = utcInput(start);
    startField.max = utcInput(end - hour);
    const max = Math.max(0, Math.floor((end - Date.parse(startField.value + 'Z')) / hour));
    hours.max = Number.isFinite(max) ? max : 0;
    submit.disabled = busy;
    full.disabled = busy;
    periodLimit.textContent = startField.value && startField.validity.valid
      ? t('presetLimit', { hours: max.toLocaleString(language) })
      : t('presetStartOutside');
  }

  function render() {
    status.textContent = message?.() ?? '';
    if (!manifest) return;
    const site = selectedSite();
    if (!site) return;
    updatePeriod();
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

  field('start').addEventListener('input', updatePeriod);
  form.addEventListener('change', render);
  full.addEventListener('click', () => {
    if (busy) return;
    const { start, end } = selectedSite().coverage;
    field('start').value = utcInput(start);
    field('hours').value = (end - start) / hour;
    updatePeriod();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const site = selectedSite();
    if (!site || busy) return;
    updatePeriod();
    if (!form.reportValidity()) return;
    const required = field('required').valueAsNumber;
    const params = new URLSearchParams({ site: site.id, start_utc: field('start').value + 'Z',
      duration_hours: field('hours').value, step_minutes: field('step').value, receiver_height_m: field('height').value });
    busy = true; message = () => t('presetLoading'); render();
    try {
      const data = await load('/api/presets/analysis?' + params);
      open(data, { site, selection: site.id, height: data.terrain.receiverHeight }, required, data.period.start);
      message = () => t('presetOpened', { name: site.name });
    } catch (error) { message = () => describeError(error); }
    finally { busy = false; render(); }
  });

  return {
    localize: render,
    async init() {
      try {
        manifest = await load('/api/presets');
        field('site').replaceChildren();
        for (const site of manifest.sites) { const option = document.createElement('option'); option.value = site.id; option.textContent = site.name; field('site').append(option); }
        field('start').value = utcInput(manifest.episode.start);
        field('hours').value = (manifest.episode.end - manifest.episode.start) / hour;
        field('required').value = manifest.episode.required; field('height').value = manifest.coverage.height;
        field('step').value = manifest.coverage.step;
        message = () => t('presetReady', { count: manifest.sites.length.toLocaleString(language) });
      } catch (error) { message = () => describeError(error); }
      render();
    },
  };
}
