import { hour, minute } from '../lib/windows.mjs';
import { t } from './i18n.mjs';
import { historyLimit } from './analysis-history.mjs';

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

function timestamp(value) {
  const time = document.createElement('time');
  time.dateTime = new Date(value).toISOString();
  const [day, clock] = utc(value).split(' ');
  time.append(day, document.createElement('br'), `${clock} UTC`);
  return time;
}

export function savedCalculations(records, activeId, required) {
  return records.slice(0,historyLimit).map(record=>{
    const displayRequired=record.id===activeId?required:record.required;
    return {...record,displayRequired,rows:visibilityRows(record.analysis.windows.both,record.analysis.period,displayRequired)};
  });
}

export function renderHistoryTable(container, records, options) {
  const expanded = new Set(Array.from(container.querySelectorAll('[data-windows-expanded="true"]'),
    row => row.dataset.calculation));
  container.replaceChildren();
  if(!records.length) return;
  const scroll = document.createElement('div');
  scroll.className = 'windows-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-labelledby', 'history-title');
  const table = document.createElement('table');
  table.className='saved-calculations';
  table.setAttribute('aria-labelledby', 'history-title');
  table.setAttribute('aria-describedby', 'history-note');
  const head = table.createTHead().insertRow();
  for (const key of ['historyCalculation','windowsStart', 'windowsEnd', 'windowsDuration', 'windowsReserve', 'windowsAction']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = t(key);
    head.append(th);
  }
  const body = table.createTBody();
  for (const record of savedCalculations(records,options.activeId,options.required)) {
    const row = body.insertRow();
    row.dataset.active=String(record.id===options.activeId);
    const label=document.createElement('th');
    label.scope='row';label.className='calculation-cell';
    const name=document.createElement('b');name.textContent=record.site?.name??t('selectedSite');
    const coords=document.createElement('small');coords.textContent=`${record.analysis.site.lat.toFixed(5)}°, ${record.analysis.site.lon.toFixed(5)}°`;
    const period=document.createElement('small');period.textContent=`${utc(record.analysis.period.start).slice(0,16)} UTC — ${utc(record.analysis.period.end).slice(0,16)} UTC`;
    const settings=document.createElement('small');settings.textContent=t('historyResult',{
      count:record.rows.length,required:record.displayRequired.toLocaleString(),height:record.analysis.terrain?.receiverHeight??2,
    });
    const open=document.createElement('button');open.type='button';open.className='history-open';
    open.textContent=t(record.id===options.activeId?'historyActive':'historyOpen');
    open.disabled=!options.ready;
    open.addEventListener('click',()=>options.open(record.id));
    label.append(name,coords,period,settings,open);row.append(label);
    if(!record.rows.length) {
      const empty=cell(row,t('windowsEmpty'));empty.colSpan=5;
      continue;
    }
    if (record.rows.length > 1) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'history-open history-toggle';
      row.dataset.calculation = record.id;
      function setExpanded(show) {
        row.dataset.windowsExpanded = String(show);
        toggle.setAttribute('aria-expanded', String(show));
        toggle.textContent = show ? t('historyCollapseWindows') : t('historyExpandWindows', { count: record.rows.length - 1 });
      }
      setExpanded(expanded.has(record.id));
      toggle.addEventListener('click', () => setExpanded(toggle.getAttribute('aria-expanded') === 'false'));
      label.append(toggle);
    }
    const columns=Array.from({length:5},()=>cell(row,''));
    for(const [index,window] of record.rows.entries()) {
      const groups=columns.map(column=>{
        const group=document.createElement('div');group.className='saved-window-value';column.append(group);return group;
      });
      groups[0].append(timestamp(window.start));
      if(record.rows.length>1) {
        const number=document.createElement('small');number.textContent=t('windowNumber',{number:index+1});groups[0].prepend(number);
      }
      groups[1].append(timestamp(window.end));
      if(window.clippedEnd) {
        const badge=document.createElement('small');badge.className='window-clipped';badge.textContent=t('windowsClipped');groups[1].append(badge);
      }
      const bound=window.clippedEnd?'≥ ':'';
      groups[2].textContent=bound+elapsed(window.duration);
      groups[3].textContent=bound+(window.reserve<0?'−':'+')+elapsed(window.reserve);
      groups[3].classList.add(window.reserve<0?'window-short':'window-enough');
      const button=document.createElement('button');button.type='button';button.textContent=t('windowsJump');
      button.disabled=!options.ready||window.offset===null;
      if(window.offset===null) {
        const reason=document.createElement('small');reason.textContent=t('windowsNoMinute');groups[4].append(reason);button.title=reason.textContent;
      } else {
        button.setAttribute('aria-label',t('windowsJumpLabel',{time:utc(record.analysis.period.start+window.offset*minute)}));
        button.addEventListener('click',()=>options.select(record.id,window.offset));
      }
      groups[4].prepend(button);
    }
  }
  scroll.append(table);
  container.append(scroll);
}
