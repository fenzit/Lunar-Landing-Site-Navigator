import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { comparisonParameters, comparisonResult, comparisonUrl, SiteComparison } from '../lib/site-comparison.mjs';
import { demoAnalysis, normalizeQuery } from '../lib/horizons.mjs';
import { applyTerrain } from '../lib/terrain.mjs';
import { sites } from '../lib/sites.mjs';
import { hour, landingResult, minute } from '../lib/windows.mjs';
import { terrainModelVersion } from '../lib/model-version.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8').then(JSON.parse);
const params = (points = sites, overrides = {}) => comparisonParameters({
  start: '2026-11-14T00:00', end: '2026-11-21T00:00', required: 4, height: 2, step: 30, points, ...overrides,
});
const preset = async site => applyTerrain(await demoAnalysis(site), await read(`./fixtures/${site.id}-terrain.json`));

test('arbitrary A/B coordinates share exact UTC, step, height and operation settings in both requests', () => {
  const snapshot = params([{ lat: 13.12345678, lon: 180 }, { lat: -20.25, lon: -173.5 }], { step: 15, height: 20, required: 2 });
  const queries = snapshot.points.map(p => new URL(comparisonUrl(p, snapshot), 'http://localhost').searchParams);
  assert.deepEqual(queries.map(q => normalizeQuery(q)), snapshot.points.map(p => ({ lat: p.lat, lon: p.lon, start: snapshot.start, end: snapshot.end, step: 15 })));
  assert.ok(queries.every(q => q.get('receiver_height_m') === '20'));
  assert.equal(snapshot.points[0].lon, -180);
  for (const bad of [{ step: 7 }, { step: 1 }, { height: -1 }, { height: 101 }, { required: 0 }, { points: [{ lat: NaN, lon: 0 }, sites[1]] }]) assert.throws(() => params(sites, bad));
});

test('saved real Odysseus/Athena responses use one timeline and the current DEM model', async () => {
  const snapshot = params(), data = await Promise.all(sites.map(preset));
  const rows = data.map((a, i) => comparisonResult(a, snapshot, snapshot.points[i]));
  assert.ok(rows.every(row => row.version === terrainModelVersion));
  assert.notDeepEqual(rows[0].candidates, rows[1].candidates);
  for (const row of rows) for (const candidate of row.candidates) {
    const offset = (candidate.first - snapshot.start) / minute;
    assert.equal(Number.isInteger(offset), true);
    assert.equal(snapshot.start + offset * minute, candidate.first, 'opening a window uses the common slider origin');
    const opened = landingResult(row.analysis.windows.both, candidate.first, snapshot.required);
    assert.equal(opened.sufficient, true);
    assert.equal(opened.remaining - snapshot.required * hour, candidate.reserve);
  }
});

test('a saved real arbitrary site keeps its own coordinates and clipped confirmed margin', async () => {
  const saved = await read('./fixtures/arbitrary-analysis.json');
  const data = applyTerrain(saved, saved.terrain);
  const snapshot = params([data.site, sites[1]], { end: new Date(data.period.end).toISOString().slice(0, 16), required: 2 });
  const row = comparisonResult(data, snapshot, snapshot.points[0]);
  assert.equal(row.candidates[0].first, Date.parse('2026-11-22T22:13Z'));
  assert.equal(row.candidates[0].reserve, (217 * 60 + 40) * minute);
  assert.equal(row.candidates[0].clippedEnd, true);
  assert.equal(row.analysis.source.records.sun.version, '1.2');
});

test('no window, insufficient operation time, clipping and a source error are distinct outcomes', async () => {
  const data = await preset(sites[0]), snapshot = params();
  const empty = comparisonResult({ ...data, windows: { ...data.windows, both: [] } }, snapshot, snapshot.points[0]);
  assert.equal(empty.state, 'empty'); assert.equal(empty.clipped, false);
  const short = comparisonResult({ ...data, windows: { ...data.windows, both: [{ start: snapshot.start, end: snapshot.start + hour, clippedEnd: true }] } }, snapshot, snapshot.points[0]);
  assert.equal(short.state, 'short'); assert.equal(short.clipped, true);
  const observed = [];
  await new SiteComparison().run(snapshot, async point => {
    if (point.lon === sites[1].lon) throw new Error('JPL unavailable');
    return data;
  }, value => observed.push(value));
  const final = observed.at(-1);
  assert.equal(final.rows[0].analysis, data);
  assert.equal(final.rows[1].state, 'error');
  assert.equal(final.rows[1].error.message, 'JPL unavailable');
  assert.ok(observed.some(value => value.rows[0].analysis && value.rows[1].state === 'loading'), 'A is usable before B completes');
});

test('mismatched periods, coordinates, heights and unversioned results cannot enter a comparison', async () => {
  const data = await preset(sites[0]), snapshot = params();
  for (const changed of [
    { ...data, site: sites[1] }, { ...data, period: { ...data.period, stepMinutes: 60 } },
    { ...data, period: { ...data.period, end: data.period.end - minute } },
    { ...data, terrain: { ...data.terrain, receiverHeight: 20 } }, { ...data, model: {} },
  ]) assert.throws(() => comparisonResult(changed, snapshot, snapshot.points[0]), { code: 'comparisonMismatch' });
});

test('cancel and a superseding run ignore delayed responses and do not load a second site', async () => {
  const runner = new SiteComparison(), snapshot = params(), updates = [], loaded = [];
  let finish;
  const pending = runner.run(snapshot, point => { loaded.push(point); return new Promise(resolve => { finish = resolve; }); }, value => updates.push(value));
  runner.cancel();
  const before = updates.length; finish(await preset(sites[0]));
  assert.equal(await pending, false);
  assert.equal(updates.length, before); assert.equal(loaded.length, 1);
  const next = [];
  await runner.run(snapshot, preset, value => next.push(value));
  assert.ok(next.at(-1).rows.every(row => row.analysis));
});
