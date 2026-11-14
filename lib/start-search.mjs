import { hour, minute, suitableStarts } from './windows.mjs';
import { maxPeriodHours } from './sites.mjs';

function invalid(code) { throw Object.assign(new RangeError(code), { code }); }

export function utcMinute(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00)?Z?$/.test(value)) return NaN;
  const time=Date.parse(value.endsWith('Z')?value:`${value}Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,16)===value.slice(0,16)
    && time>=Date.UTC(1972,0,1) && time<Date.UTC(2100,0,1) ? time : NaN;
}

export function searchRange(startText, endText, requiredHours) {
  const start=utcMinute(startText),end=utcMinute(endText);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) invalid('searchRangeInvalid');
  if(end-start>maxPeriodHours*hour) invalid('searchRangeLong');
  const required=Number(requiredHours);
  if(!Number.isFinite(required)||required<.25||required>maxPeriodHours||!Number.isInteger(required*4)) invalid('searchRequiredInvalid');
  return {start,end,required};
}

export function suitableCandidates(analysis, requiredHours, order='earliest') {
  const candidates=analysis.windows.both.flatMap(window=>{
    const interval=suitableStarts([window],requiredHours)[0];
    if(!interval) return [];
    return [{first:interval.start,last:interval.end,duration:window.end-window.start,
      reserve:window.end-interval.start-requiredHours*hour,clippedEnd:window.clippedEnd??false}];
  });
  return candidates.sort(order==='longest'
    ? (a,b)=>b.duration-a.duration||a.first-b.first
    : (a,b)=>a.first-b.first||b.duration-a.duration);
}

// Include the next regular observation, then clip interpolation to the user's
// exact minute. No visibility beyond the requested end becomes confirmed time.
export function samplingEnd({start,end,step}) {
  return start+Math.ceil((end-start)/(step*minute))*step*minute;
}

export function clipSamples(samples, query, interpolate) {
  const clipped=samples.filter(sample=>sample.t<=query.end);
  if(clipped.at(-1)?.t!==query.end) clipped.push({...interpolate(samples,query.end,query.step*minute),t:query.end});
  return clipped;
}
