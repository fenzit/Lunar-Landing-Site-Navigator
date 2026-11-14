import { hour, minute } from '../lib/windows.mjs';
import { t } from './i18n.mjs';

// The shared slider selects integer minute offsets from the analysis start.
// A zero crossing is open, so it must never become a selectable landing time.
export function visibilityRows(windows, period, requiredHours) {
  return [...windows].sort((a, b) => a.start - b.start).map(window => {
    let offset = Math.max(0, Math.ceil((window.start - period.start) / minute));
    if (window.openStart && period.start + offset * minute === window.start) offset++;
    const time = period.start + offset * minute;
    const insideEnd = time < window.end || (time === window.end && !window.openEnd);
    return {
      ...window,
      duration: window.end - window.start,
      reserve: window.end - window.start - requiredHours * hour,
      offset: insideEnd && time <= period.end ? offset : null,
    };
  });
}

function elapsed(ms) {
  // Round negative margins down as numbers, keeping ≥ a conservative bound.
  const count = Math.abs(Math.floor(ms / minute));
  return Math.abs(ms) > 0 && Math.abs(ms) < minute ? `<1 ${t('minutes')}`
    : `${Math.floor(count / 60)} ${t('hours')} ${String(count % 60).padStart(2, '0')} ${t('minutes')}`;
}

function utc(time) {
  return new Date(time).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

function cell(row, value) {
  const td = document.createElement('td');
  td.textContent = value;
  row.append(td);
  return td;
}

function timestamp(row, value) {
  const td = cell(row, '');
  const time = document.createElement('time');
  time.dateTime = new Date(value).toISOString();
  const [day, clock] = utc(value).split(' ');
  time.append(day, document.createElement('br'), `${clock} UTC`);
  td.append(time);
  return td;
}

export function renderWindowTable(container, analysis, requiredHours, select) {
  container.replaceChildren();
  container.hidden = !analysis;
  if (!analysis) return;

  const heading = document.createElement('h3');
  heading.id = 'windows-title';
  heading.textContent = t('windowsTitle');
  const note = document.createElement('p');
  note.id = 'windows-note';
  note.className = 'windows-note';
  note.textContent = t('windowsNote', { required: elapsed(requiredHours * hour) });
  container.append(heading, note);

  const rows = visibilityRows(analysis.windows.both, analysis.period, requiredHours);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'windows-empty';
    empty.textContent = t('windowsEmpty');
    container.append(empty);
    return;
  }

  const scroll = document.createElement('div');
  scroll.className = 'windows-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-labelledby', heading.id);
  const table = document.createElement('table');
  table.setAttribute('aria-labelledby', heading.id);
  table.setAttribute('aria-describedby', note.id);
  const head = table.createTHead().insertRow();
  for (const key of ['windowsStart', 'windowsEnd', 'windowsDuration', 'windowsReserve', 'windowsAction']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = t(key);
    head.append(th);
  }
  const body = table.createTBody();
  for (const window of rows) {
    const row = body.insertRow();
    timestamp(row, window.start);
    const end = timestamp(row, window.end);
    if (window.clippedEnd) {
      const badge = document.createElement('small');
      badge.className = 'window-clipped';
      badge.textContent = t('windowsClipped');
      end.append(badge);
    }
    const lowerBound = window.clippedEnd ? '≥ ' : '';
    cell(row, lowerBound + elapsed(window.duration));
    const reserve = cell(row, lowerBound + (window.reserve < 0 ? '−' : '+') + elapsed(window.reserve));
    reserve.className = window.reserve < 0 ? 'window-short' : 'window-enough';
    const action = cell(row, '');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t('windowsJump');
    button.disabled = window.offset === null;
    if (button.disabled) {
      const reason = document.createElement('small');
      reason.textContent = t('windowsNoMinute');
      action.append(reason);
      button.title = reason.textContent;
    } else {
      button.setAttribute('aria-label', t('windowsJumpLabel', { time: utc(analysis.period.start + window.offset * minute) }));
      button.addEventListener('click', () => select(window.offset));
    }
    action.prepend(button);
  }
  scroll.append(table);
  container.append(scroll);
}
