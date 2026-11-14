import { searchRange, suitableCandidates } from '../lib/start-search.mjs';
import { apiErrorMessage } from '../lib/api-errors.mjs';
import { language, t } from './i18n.mjs';

export function createStartSearch(root, { context, load, open, date, duration, describeError }) {
  const form=root.querySelector('form');
  const start=root.querySelector('#search-start'),end=root.querySelector('#search-end');
  const needed=root.querySelector('#search-required'),sort=root.querySelector('#search-sort');
  const sortControl=sort.closest('label');
  const sortNote=root.querySelector('#search-sort-note');
  const submit=root.querySelector('#search-submit'),cancel=root.querySelector('#search-cancel');
  const status=root.querySelector('#search-status'),results=root.querySelector('#search-results');
  const caption=root.querySelector('#search-snapshot'),siteLabel=root.querySelector('#search-site');
  let result,job,jobContext,generation=0,message;

  function required() {
    const value=needed.valueAsNumber;
    return needed.validity.valid&&Number.isFinite(value)?value:result?.required;
  }

  function render() {
    const current=context();
    siteLabel.textContent=current?t('searchSite',{lat:current.site.lat.toFixed(5),lon:current.site.lon.toFixed(5),height:current.height}):t('searchSiteMissing');
    submit.disabled=!current||Boolean(job);
    cancel.hidden=!job;
    root.setAttribute('aria-busy',String(Boolean(job)));
    status.textContent=message?.()??'';
    caption.hidden=!result;
    results.replaceChildren();
    sort.disabled=true;
    sortControl.hidden=true;
    sortNote.hidden=true;
    if(!result) return;
    const need=required();
    caption.textContent=t('searchSnapshot',{
      lat:result.analysis.site.lat.toFixed(5),lon:result.analysis.site.lon.toFixed(5),height:result.context.height,
      start:date(result.analysis.period.start),end:date(result.analysis.period.end),required:need.toLocaleString(language),
    });
    const candidates=suitableCandidates(result.analysis,need,sort.value);
    sortControl.hidden=candidates.length<2;
    sort.disabled=Boolean(job)||sortControl.hidden;
    sortNote.hidden=Boolean(job)||candidates.length!==1;
    sortNote.textContent=t('searchOrderSingle');
    if(!candidates.length) {
      const empty=document.createElement('p');empty.className='search-empty';empty.textContent=t('searchEmpty');results.append(empty);return;
    }
    const scroll=document.createElement('div');scroll.className='windows-scroll';scroll.tabIndex=0;
    scroll.setAttribute('role','region');scroll.setAttribute('aria-labelledby','search-title');
    const table=document.createElement('table');table.setAttribute('aria-labelledby','search-title');table.setAttribute('aria-describedby','search-snapshot');
    const head=table.createTHead().insertRow();
    for(const key of ['searchFirst','searchLast','windowsDuration','searchReserve','windowsAction']) {
      const th=document.createElement('th');th.scope='col';th.textContent=t(key);head.append(th);
    }
    const body=table.createTBody();
    for(const candidate of candidates) {
      const row=body.insertRow();
      const add=value=>{const td=row.insertCell();td.textContent=value;return td;};
      for(const time of [candidate.first,candidate.last]) {
        const cell=add(''),element=document.createElement('time');element.dateTime=new Date(time).toISOString();
        const stamp=new Date(time).toISOString();element.append(stamp.slice(0,10),document.createElement('br'),`${stamp.slice(11,16)} UTC`);cell.append(element);
      }
      const bound=candidate.clippedEnd?'≥ ':'';
      const length=add(bound+duration(candidate.duration));
      if(candidate.clippedEnd) {const note=document.createElement('small');note.className='window-clipped';note.textContent=t('searchClipped');length.append(note);}
      add(`${bound}+${duration(candidate.reserve)}`).className='window-enough';
      const action=add('');action.className='search-row-actions';
      for(const [key,time] of candidate.first===candidate.last?[['searchOpenFirst',candidate.first]]:[['searchOpenFirst',candidate.first],['searchOpenLast',candidate.last]]) {
        const button=document.createElement('button');button.type='button';button.textContent=t(key);
        button.disabled=Boolean(job);button.setAttribute('aria-label',t('searchOpenLabel',{time:date(time)}));
        button.addEventListener('click',()=>open(result.analysis,result.context,required(),time));action.append(button);
      }
    }
    scroll.append(table);results.append(scroll);
  }

  function cancelSearch() {
    if(!job) return;
    generation++;job.abort();job=null;message=()=>t('searchCancelled');render();
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    for(const input of [start,end,needed]) input.setAttribute('aria-invalid','false');
    let range;
    try {range=searchRange(start.value,end.value,needed.valueAsNumber);} catch(error) {
      const invalid=error.code==='searchRequiredInvalid'?[needed]:[start,end];
      for(const input of invalid) input.setAttribute('aria-invalid','true');
      message=()=>apiErrorMessage(error.code,{},language);render();
      (error.code==='searchRequiredInvalid'?needed:!start.value?start:end).focus();return;
    }
    const selected=context();
    if(!selected) {message=()=>t('searchSiteMissing');render();return;}
    job?.abort();const id=++generation;job=new AbortController();jobContext=selected;
    message=()=>t('searchLoading');render();
    try {
      const data=await load(range,selected,job.signal);
      if(id!==generation) return;
      job=null;result={analysis:data,context:selected,required:range.required};
      message=()=>t('searchReady');
      // Apply the same complete result to the shared chart; opening a row never
      // requests another daily/point calculation.
      open(data,selected,required(),data.period.start,false);
    } catch(error) {
      if(id!==generation) return;
      job=null;message=()=>t('searchSourceError',{error:describeError(error)});
    }
    render();
  });
  cancel.addEventListener('click',cancelSearch);
  sort.addEventListener('change',render);
  needed.addEventListener('input',render);
  return {
    cancel:cancelSearch,
    contextChanged() {
      const current=context();
      if(job&&(!current||current.site.lat!==jobContext.site.lat||current.site.lon!==jobContext.site.lon||current.height!==jobContext.height)) cancelSearch();
      else render();
    },
    defaults(period,requiredHours) {
      if(!start.value) start.value=new Date(period.start).toISOString().slice(0,16);
      if(!end.value) end.value=new Date(period.end).toISOString().slice(0,16);
      if(!needed.value) needed.value=requiredHours;
      render();
    },
    localize:render,
  };
}
