import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisHistory, historyLimit } from '../public/analysis-history.mjs';
import { demoAnalysis } from '../lib/horizons.mjs';
import { sites } from '../lib/sites.mjs';
import { visibilityRows } from '../public/window-table.mjs';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const options = { site: sites[0], selection: sites[0].id, required: 4 };

test('a later calculation preserves earlier windows, settings and timeline after reload', async () => {
  const saved = storage(), history = new AnalysisHistory(saved);
  const first = await demoAnalysis(sites[0]);
  const id = history.save(first, options);
  history.save(await demoAnalysis(sites[1]), { ...options, site: sites[1], selection: sites[1].id, required: 2 });
  const restored = new AnalysisHistory(saved).get(id);
  assert.deepEqual(restored.analysis, first);
  assert.equal(restored.required, 4);
  assert.deepEqual(restored.site, sites[0]);
  assert.deepEqual(visibilityRows(restored.analysis.windows.both, restored.analysis.period, restored.required),
    visibilityRows(first.windows.both, first.period, 4));
});

test('history keeps the three most recent distinct calculations and refreshes duplicates', async () => {
  const history = new AnalysisHistory(storage()), data = await demoAnalysis(sites[0]);
  const ids = [];
  for (let required = 1; required <= historyLimit + 2; required++) ids.push(history.save(data, { ...options, required }));
  assert.equal(history.records.length, historyLimit);
  assert.equal(history.get(ids[0]), null);
  assert.equal(history.get(ids[1]), null);
  assert.ok(history.get(ids[2]));
  history.save(data, { ...options, required: 3 });
  assert.equal(history.records.length, historyLimit);
  assert.equal(history.records[0].id, ids[2]);
});

test('snapshots and restored results cannot mutate another saved calculation', async () => {
  const history = new AnalysisHistory(storage()), data = await demoAnalysis(sites[0]);
  const id = history.save(data, options);
  const expected = data.samples[0].sunEl;
  data.samples[0].sunEl = 999;
  const result = history.get(id);
  assert.equal(result.analysis.samples[0].sunEl, expected);
  result.analysis.samples[0].sunEl = 888;
  assert.equal(history.get(id).analysis.samples[0].sunEl, expected);
});

test('calculations without shared windows are preserved rather than dropped', async () => {
  const saved = storage(), history = new AnalysisHistory(saved), data = await demoAnalysis(sites[0]);
  data.windows.both = [];
  data.summary = { totalMs: 0, longestMs: 0 };
  const id = history.save(data, options);
  assert.deepEqual(new AnalysisHistory(saved).get(id).analysis.windows.both, []);
});

test('storage errors retain history for the current session without breaking calculations', async () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const history = new AnalysisHistory(denied), data = await demoAnalysis(sites[0]);
  const id = history.save(data, options);
  history.save(await demoAnalysis(sites[1]), options);
  assert.equal(history.persistent, false);
  assert.deepEqual(history.get(id).analysis, data);
  assert.equal(history.records.length, 2);
});

test('corrupt and incompatible browser history is ignored and can be replaced', async () => {
  for (const value of ['{bad', JSON.stringify({ version: 2, records: [] }), JSON.stringify({ version: 1, records: [null, {}] })]) {
    const saved = { getItem: () => value, setItem() {} };
    const history = new AnalysisHistory(saved);
    assert.equal(history.records.length, 0);
    const id = history.save(await demoAnalysis(sites[0]), options);
    assert.ok(history.get(id));
  }
});

test('equipment height is part of the calculation identity and is restored', async () => {
  const history = new AnalysisHistory(storage()), data = await demoAnalysis(sites[0]);
  data.terrain = { receiverHeight: 2 };
  const low = history.save(data, options);
  data.terrain.receiverHeight = 10;
  const high = history.save(data, options);
  assert.notEqual(low, high);
  assert.equal(history.get(low).analysis.terrain.receiverHeight, 2);
  assert.equal(history.get(high).analysis.terrain.receiverHeight, 10);
});
