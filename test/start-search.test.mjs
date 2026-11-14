import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchRange, suitableCandidates, samplingEnd } from '../lib/start-search.mjs';
import { atTime, hour, landingResult, minute, skyAtTime } from '../lib/windows.mjs';
import { buildAnalysis, demoAnalysis, getSky, normalizePeriod, normalizeQuery, horizonsUrl } from '../lib/horizons.mjs';
import { sites, demoStart, demoHours, demoStep } from '../lib/sites.mjs';

const start=Date.parse('2026-11-14T00:00:00Z');
const window=(from,to,flags={})=>({start:start+from*minute,end:start+to*minute,openStart:true,openEnd:true,...flags});
const analysis=windows=>({period:{start,end:start+30*24*hour},windows:{both:windows}});

test('search ranges use UTC minutes and distinguish invalid, oversized and invalid-operation input',()=>{
  assert.deepEqual(searchRange('2026-11-14T00:00','2026-12-14T00:00',4),{start,end:start+720*hour,required:4});
  assert.equal(searchRange('2026-11-14T00:00','2026-11-14T00:01',.25).end-start,minute);
  for(const [from,to] of [
    ['','2026-11-15T00:00'],['2026-11-14T00:00','2026-11-13T23:59'],
    ['2026-11-14T00:00','2026-11-14T00:00'],['2026-02-30T00:00','2026-03-03T00:00'],
    ['2026-11-14T00:00','2026-11-14T01:00:45'],['2100-01-01T00:00','2100-01-02T00:00'],
  ]) assert.throws(()=>searchRange(from,to,4),{code:'searchRangeInvalid'});
  assert.throws(()=>searchRange('2026-11-14T00:00','2026-12-14T00:01',4),{code:'searchRangeLong'});
  for(const value of [0,-1,.1,4.1,NaN,721]) assert.throws(()=>searchRange('2026-11-14T00:00','2026-11-15T00:00',value),{code:'searchRequiredInvalid'});
});

test('candidate order changes without mutating or recalculating the source windows',()=>{
  const source=analysis([window(600,1200),window(1,301),window(1300,1600)]);
  assert.deepEqual(suitableCandidates(source,4).map(row=>row.first),[start+2*minute,start+601*minute,start+1301*minute]);
  const longest=suitableCandidates(source,4,'longest');
  assert.deepEqual(longest.map(row=>row.duration),[600*minute,300*minute,300*minute]);
  assert.deepEqual(longest.map(row=>row.first),[start+601*minute,start+2*minute,start+1301*minute]);
  assert.equal(source.windows.both[0].start,start+600*minute);
});

test('open start boundaries and exact-duration windows follow the existing landing model',()=>{
  const source=analysis([window(0,240),window(300,540,{openStart:false}),window(600,840.5)]);
  const rows=suitableCandidates(source,4);
  assert.equal(rows.length,1,'open start plus exact duration leaves no complete start minute');
  assert.equal(rows[0].first,start+300*minute);
  assert.equal(rows[0].last,rows[0].first);
  assert.equal(rows[0].reserve,0);
  assert.equal(landingResult(source.windows.both,rows[0].first,4).sufficient,true);
});

test('first and last starts jump to visible minutes with enough confirmed time',()=>{
  const source=analysis([window(10.1,310.9),window(400,1000,{clippedEnd:true,openEnd:false})]);
  const rows=suitableCandidates(source,4);
  assert.equal(rows[0].first,start+11*minute);
  assert.equal(rows[0].last,start+70*minute);
  assert.equal(rows[1].clippedEnd,true);
  assert.equal(rows[1].reserve,359*minute);
  for(const row of rows) for(const time of [row.first,row.last]) {
    assert.equal(Number.isInteger((time-start)/minute),true);
    const opened=landingResult(source.windows.both,time,4);
    assert.equal(opened.sufficient,true);
    assert.ok(opened.remaining>=4*hour);
  }
});

test('empty, too-short and period-clipped windows never promise operations beyond the range',()=>{
  assert.deepEqual(suitableCandidates(analysis([]),4),[]);
  assert.deepEqual(suitableCandidates(analysis([window(1,100,{clippedEnd:true})]),4),[]);
  const source=analysis([window(0,240,{openStart:false,openEnd:false,clippedEnd:true})]);
  const [row]=suitableCandidates(source,4);
  assert.equal(row.reserve,0);
  assert.equal(row.clippedEnd,true);
  assert.equal(row.last,start);
  assert.deepEqual(suitableCandidates(source,4.25),[]);
});

test('the analysis and sky API accept an exact end minute and enforce the 30-day limit',()=>{
  const params=new URLSearchParams({lat_deg:'-80.1276',lon_east_deg:'1.4367',start_utc:'2026-11-14T00:00Z',end_utc:'2026-12-13T23:59Z',step_minutes:'30'});
  for(const normalize of [normalizePeriod,normalizeQuery]) {
    const query=normalize(params);
    assert.equal(query.end,start+720*hour-minute);
    assert.equal(samplingEnd(query),start+720*hour);
    const tooLong=new URLSearchParams(params);tooLong.set('end_utc','2026-12-14T00:01Z');
    assert.throws(()=>normalize(tooLong),{errorCode:'searchRangeLong'});
    const reversed=new URLSearchParams(params);reversed.set('end_utc','2026-11-13T00:00Z');
    assert.throws(()=>normalize(reversed),{errorCode:'searchRangeInvalid'});
    const ambiguous=new URLSearchParams(params);ambiguous.set('duration_hours','24');
    assert.throws(()=>normalize(ambiguous),{errorCode:'searchRangeInvalid'});
  }
});

test('JPL series are clipped to the requested minute before constructing windows',async()=>{
  const records=Object.fromEntries(await Promise.all(['sun','earth'].map(async key=>[key,JSON.parse(await readFile(`data/demo/odysseus-${key}.json`,'utf8'))])));
  const full=await demoAnalysis(sites[0]);
  const query={...sites[0],start:Date.parse(demoStart),end:Date.parse(demoStart)+demoHours*hour-7*minute,step:demoStep};
  const result=buildAnalysis(query,records,'demo');
  assert.equal(result.samples.at(-1).t,query.end);
  assert.equal(result.period.end,query.end);
  assert.deepEqual(result.samples.at(-1),atTime(full.samples,query.end,demoStep*minute));
  assert.ok(result.windows.both.every(row=>row.end<=query.end));
  assert.equal(horizonsUrl(query,'sun').searchParams.get('STOP_TIME'),"'2026-11-21 00:00'");
  const sky=await getSky({start:query.start,end:query.end,step:query.step},{offline:true});
  const fullSky=await getSky({...query,end:query.end+7*minute},{offline:true});
  assert.equal(sky.samples.at(-1).t,query.end);
  assert.deepEqual(sky.samples.at(-1),{...skyAtTime(fullSky.samples,query.end,demoStep*minute),t:query.end});
});
