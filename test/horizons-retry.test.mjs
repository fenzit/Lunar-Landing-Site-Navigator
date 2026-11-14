import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { hour } from '../lib/windows.mjs';
import { demoHours, demoStart, demoStep, sites } from '../lib/sites.mjs';

const root = process.cwd();
const records = Object.fromEntries(await Promise.all(['sun', 'earth'].map(async target =>
  [target, JSON.parse(await readFile(resolve(root, `data/demo/odysseus-${target}.json`), 'utf8'))])));
const testParent=resolve(root,'data/cache');
await mkdir(testParent,{recursive:true});
const cacheRoot = await mkdtemp(resolve(testParent,'test-horizons-'));
// Isolate the real cache/queue implementation without changing production APIs.
let getAnalysis;
try {
  process.chdir(cacheRoot);
  ({ getAnalysis } = await import('../lib/horizons.mjs?retry-test'));
} finally { process.chdir(root); }
after(async () => {
  assert.equal(dirname(cacheRoot), testParent);
  await rm(cacheRoot, { recursive: true, force: true });
});
const query = { lat: sites[0].lat, lon: sites[0].lon, altitudeKm: 0,
  start: Date.parse(demoStart), end: Date.parse(demoStart) + demoHours * hour, step: demoStep };

test('a temporary Horizons timeout is retried and the complete calculation is cached', async context => {
  let calls = 0;
  const fetchMock = context.mock.method(globalThis, 'fetch', async url => {
    calls++;
    if (calls === 1) throw new DOMException('JPL response timed out', 'TimeoutError');
    const target = new URL(url).searchParams.get('COMMAND') === "'10'" ? 'sun' : 'earth';
    return { ok: true, json: async () => records[target].response };
  });
  const result = await getAnalysis(query);
  assert.equal(result.samples.length, 337);
  assert.equal(calls, 3, 'retry Sun once, then fetch Earth');
  fetchMock.mock.mockImplementation(() => { throw new Error('cache should avoid all network calls'); });
  const cached = await getAnalysis(query);
  assert.equal(cached.source.mode, 'cache');
  assert.deepEqual(cached.windows, result.windows);
});

test('a temporary HTTP 503 retries without parallel JPL requests', async context => {
  let calls=0, active=0, maximum=0;
  context.mock.method(globalThis,'fetch',async url=>{
    calls++;active++;maximum=Math.max(maximum,active);
    try {
      if(calls===1) return {ok:false,status:503};
      const target=new URL(url).searchParams.get('COMMAND')==="'10'"?'sun':'earth';
      return {ok:true,json:async()=>records[target].response};
    } finally {active--;}
  });
  const result=await getAnalysis({...query,testCase:'temporary-http'});
  assert.equal(result.samples.length,337);
  assert.equal(calls,3);
  assert.equal(maximum,1);
});

test('permanent HTTP errors are not retried', async context => {
  let calls=0;
  context.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:false,status:400};});
  await assert.rejects(getAnalysis({...query,testCase:'bad-http'}),{errorCode:'horizonsHttp',params:{status:400}});
  assert.equal(calls,1);
});

test('exhausted timeouts are bounded and never cache a partial calculation', async context => {
  let calls=0;
  const fetchMock=context.mock.method(globalThis,'fetch',async()=>{calls++;throw new DOMException('timeout','TimeoutError');});
  const failing={...query,testCase:'exhausted-timeout'};
  await assert.rejects(getAnalysis(failing),{errorCode:'horizonsTimeout'});
  assert.equal(calls,3);
  fetchMock.mock.mockImplementation(async url=>{
    calls++;
    const target=new URL(url).searchParams.get('COMMAND')==="'10'"?'sun':'earth';
    return {ok:true,json:async()=>records[target].response};
  });
  const result=await getAnalysis(failing);
  assert.equal(result.source.mode,'live');
  assert.equal(calls,5,'a fresh calculation requests both bodies after failure');
});

test('a long Retry-After is respected by returning the error instead of retrying early', async context => {
  let calls=0;
  context.mock.method(globalThis,'fetch',async()=>{
    calls++;return {ok:false,status:429,headers:new Headers({'Retry-After':'600'})};
  });
  await assert.rejects(getAnalysis({...query,testCase:'rate-limit'}),{errorCode:'horizonsHttp',params:{status:429}});
  assert.equal(calls,1);
});
