import { comparisonParameters, comparisonUrl, SiteComparison } from '../lib/site-comparison.mjs';
import { apiErrorMessage } from '../lib/api-errors.mjs';
import { minute } from '../lib/windows.mjs';
import { language, t } from './i18n.mjs';

const ns = 'http://www.w3.org/2000/svg';
export function createSiteComparison(root, { load, open, pick, date, duration, describeError }) {
  const form = root.querySelector('form'), field = name => form.elements.namedItem(name);
  const result = root.querySelector('#comparison-results'), status = root.querySelector('#comparison-status');
  const snapshotLabel = root.querySelector('#comparison-snapshot'), plot = root.querySelector('#comparison-plot');
  const cancel = root.querySelector('#comparison-cancel'), runner = new SiteComparison();
  let state, busy = false, message, cursor, cursorX, currentTime, submitted;
  const selectedPoints = [];
  const inputKey = () => JSON.stringify([...form.elements].filter(e => e.name).map(e => [e.name, e.value]));
  const point = index => {
    const lat = field(`lat${index}`).valueAsNumber, lon = field(`lon${index}`).valueAsNumber;
    return { ...(selectedPoints[index]?.lat === lat && selectedPoints[index]?.lon === lon ? selectedPoints[index] : {}), lat, lon };
  };

  function setPoint(index, value) {
    selectedPoints[index] = value;
    field(`lat${index}`).value = value.lat; field(`lon${index}`).value = value.lon;
    render();
  }

  function updateTime(time) {
    currentTime = time;
    if (!cursor || !state) return;
    cursor.hidden = time < state.snapshot.start || time > state.snapshot.end;
    cursor.setAttribute('visibility', cursor.hidden ? 'hidden' : 'visible');
    if (!cursor.hidden) { cursor.setAttribute('x1', cursorX(time)); cursor.setAttribute('x2', cursorX(time)); }
  }

  function drawTimeline() {
    plot.replaceChildren(); cursor = null;
    if (!state) return;
    const width = Math.max(300, plot.clientWidth || 800), left = 34, right = width - 16;
    const { start, end, required } = state.snapshot;
    cursorX = time => left + (time - start) / (end - start) * (right - left);
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} 154`); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('comparisonTimeline'));
    const add = (tag, attrs, content) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (content) node.textContent = content;
      svg.append(node); return node;
    };
    state.rows.forEach((row, index) => {
      const y = 16 + index * 50;
      add('text', { x: 4, y: y + 15 }, index ? 'B' : 'A');
      add('rect', { x: left, y, width: right - left, height: 30, class: 'plot-bg' });
      for (const window of row.analysis?.windows.both ?? []) {
        add('rect', { x: cursorX(window.start), y, width: Math.max(1, cursorX(window.end) - cursorX(window.start)), height: 30, class: 'comparison-window' });
      }
      for (const candidate of row.candidates ?? []) {
        const end = candidate.last + required * 60 * minute;
        const bar = add('rect', { x: cursorX(candidate.first), y: y + 8, width: Math.max(2, cursorX(end) - cursorX(candidate.first)), height: 14, class: index ? 'comparison-band' : 'start-band' });
        const title = document.createElementNS(ns, 'title'); title.textContent = date(candidate.first); bar.append(title);
      }
    });
    for (const fraction of width < 600 ? [0, 1] : [0, .5, 1]) {
      const time = start + fraction * (end - start), stamp = new Date(time).toISOString();
      add('text', { x: cursorX(time), y: 142, 'text-anchor': fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle' }, `${stamp.slice(5, 10)} ${stamp.slice(11, 16)} UTC`);
    }
    cursor = add('line', { y1: 8, y2: 104, class: 'plot-cursor' });
    plot.append(svg); updateTime(currentTime ?? start);
  }

  function openRow(row, time, focus = true) {
    if (!row.analysis) return;
    const { snapshot } = state;
    open(row.analysis, { site: row.point, selection: row.point.id ?? 'custom', height: snapshot.height }, snapshot.required, time, focus);
  }

  function render() {
    root.setAttribute('aria-busy', String(busy)); cancel.hidden = !busy;
    root.querySelector('#comparison-submit').disabled = busy;
    status.textContent = message?.() ?? '';
    if (state && submitted !== inputKey()) status.textContent += ' ' + t('comparisonStale');
    snapshotLabel.hidden = !state; result.replaceChildren();
    if (!state) return;
    const { snapshot } = state;
    snapshotLabel.textContent = t('comparisonSnapshot', {
      start: date(snapshot.start), end: date(snapshot.end), step: snapshot.step, height: snapshot.height,
      required: snapshot.required.toLocaleString(language),
    });
    for (const [index, row] of state.rows.entries()) {
      const article = document.createElement('article'); article.className = 'comparison-result';
      const heading = document.createElement('h4'); heading.textContent = `${index ? 'B' : 'A'}${row.point.name ? ' · ' + row.point.name : ''} · ${row.point.lat}°, ${row.point.lon}°`; article.append(heading);
      const label = document.createElement('p'); label.className = 'comparison-state';
      label.textContent = row.state === 'error' ? t('comparisonSourceError', { error: row.error.code === 'comparisonMismatch' ? t('comparisonMismatch') : describeError(row.error) }) : t('comparisonState_' + row.state);
      label.setAttribute('role', 'status'); article.append(label);
      if (row.analysis) {
        const first = row.candidates[0];
        if (first) {
          const dl = document.createElement('dl');
          for (const [key, value] of [['comparisonFirst', date(first.first)], ['searchReserve', (first.clippedEnd ? '≥ ' : '') + duration(first.reserve)]]) {
            const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t(key); dd.textContent = value; dl.append(dt, dd);
          }
          article.append(dl);
        }
        if (row.clipped) { const p = document.createElement('p'); p.className = 'window-clipped'; p.textContent = t('comparisonClipped'); article.append(p); }
        const model = document.createElement('p'); model.className = 'comparison-model'; model.textContent = t('comparisonModel', { version: row.version }); article.append(model);
        for (const body of ['sun', 'earth']) {
          const record = row.analysis.source.records[body], link = document.createElement('a');
          link.href = record.url; link.textContent = `${t(body)} · JPL API ${record.version}`; article.append(link, ' ');
        }
        const actions = document.createElement('div'); actions.className = 'analysis-actions';
        const show = document.createElement('button'); show.type = 'button'; show.textContent = t('comparisonInspect');
        show.addEventListener('click', () => openRow(row, currentTime >= snapshot.start && currentTime <= snapshot.end ? currentTime : snapshot.start)); actions.append(show); article.append(actions);
        if (row.candidates.length) {
          const windows = document.createElement('details'), summary = document.createElement('summary');
          summary.textContent = t('comparisonWindows', { count: row.candidates.length }); windows.append(summary); windows.open = true;
          const list = document.createElement('ul');
          row.candidates.forEach(candidate => {
            const item = document.createElement('li'), button = document.createElement('button'); button.type = 'button';
            button.textContent = date(candidate.first); button.setAttribute('aria-label', t('searchOpenLabel', { time: date(candidate.first) }));
            button.addEventListener('click', () => openRow(row, candidate.first));
            item.append(button, ' · ' + (candidate.clippedEnd ? '≥ ' : '') + duration(candidate.reserve)); list.append(item);
          });
          windows.append(list); article.append(windows);
        }
      }
      result.append(article);
    }
    drawTimeline();
  }

  async function run(snapshot, loader = (p, s, signal) => load(comparisonUrl(p, s), signal)) {
    submitted = inputKey(); busy = true; message = () => t('comparisonLoading');
    const completed = await runner.run(snapshot, loader, next => { state = next; render(); });
    if (!completed) return;
    busy = false; message = () => t('comparisonDone'); render();
    return true;
  }

  form.addEventListener('submit', event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    try {
      const snapshot = comparisonParameters({ start: field('from').value, end: field('until').value,
        required: field('required').valueAsNumber, height: field('height').valueAsNumber,
        step: field('step').value, points: [point(0), point(1)] });
      run(snapshot);
    } catch (error) {
      message = () => apiErrorMessage(error.code, {}, language) ?? t(error.code); render();
    }
  });
  form.addEventListener('input', render);
  cancel.addEventListener('click', () => {
    runner.cancel(); busy = false;
    if (state) state.rows = state.rows.map(row => ['pending', 'loading'].includes(row.state) ? { ...row, state: 'cancelled' } : row);
    message = () => t('comparisonCancelled'); render();
  });
  for (const button of root.querySelectorAll('[data-compare-pick]')) button.addEventListener('click', () => pick(Number(button.dataset.comparePick)));
  window.addEventListener('resize', drawTimeline);
  return {
    setPoint, updateTime, localize: render,
    defaults(data, selected, required) {
      if (field('from').value) return;
      field('from').value = new Date(data.period.start).toISOString().slice(0, 16);
      field('until').value = new Date(data.period.end).toISOString().slice(0, 16);
      field('required').value = required; field('height').value = data.terrain?.receiverHeight ?? 2;
      field('step').value = data.period.stepMinutes;
      const other = selectedPoints.find(p => p.lat !== selected.lat || p.lon !== selected.lon);
      if (selectedPoints[1]?.lat === selected.lat && selectedPoints[1]?.lon === selected.lon && other) setPoint(1, other);
      setPoint(0, selected);
    },
    presets(points) { points.slice(0, 2).forEach((p, index) => setPoint(index, p)); },
    async openPackage({ episode, sites, analyses }) {
      const points = episode.sites.map(id => sites.find(site => site.id === id));
      const snapshot = comparisonParameters({ ...episode, points,
        start: new Date(episode.start).toISOString().slice(0, 16), end: new Date(episode.end).toISOString().slice(0, 16) });
      field('from').value = new Date(snapshot.start).toISOString().slice(0, 16);
      field('until').value = new Date(snapshot.end).toISOString().slice(0, 16);
      field('required').value = snapshot.required; field('height').value = snapshot.height; field('step').value = snapshot.step;
      points.forEach((point, index) => setPoint(index, point));
      const completed = await run(snapshot, async point => analyses.find(data => data.site.lat === point.lat && data.site.lon === point.lon));
      if (completed) openRow(state.rows[0], episode.time, false);
      return completed;
    },
  };
}
