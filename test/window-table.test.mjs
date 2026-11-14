import test from 'node:test';
import assert from 'node:assert/strict';
import { savedCalculations, visibilityRows } from '../public/window-table.mjs';
import { hour, minute } from '../lib/windows.mjs';

const start = Date.parse('2026-11-14T00:00:00Z');
const period = { start, end: start + 24 * hour };
const window = (from, to, flags = {}) => ({
  start: start + from * minute, end: start + to * minute,
  openStart: true, openEnd: true, clippedEnd: false, ...flags,
});

test('visibility table keeps every window in chronological order and computes operation margins', () => {
  const windows = [window(500, 800), window(10.25, 12), window(100, 340)];
  const rows = visibilityRows(windows, period, 4);
  assert.deepEqual(rows.map(row => row.offset), [11, 101, 501]);
  assert.deepEqual(rows.map(row => row.duration), [1.75 * minute, 4 * hour, 5 * hour]);
  assert.deepEqual(rows.map(row => row.reserve), [1.75 * minute - 4 * hour, 0, hour]);
  assert.equal(windows[0].start, start + 500 * minute, 'does not reorder the source analysis');
});

test('short windows remain selectable regardless of operation duration when a minute fits', () => {
  const [row] = visibilityRows([window(10.75, 11.25)], period, 12);
  assert.equal(row.duration, .5 * minute);
  assert.equal(row.offset, 11);
  assert.ok(row.reserve < 0);
});

test('a window without a slider minute is retained with a disabled jump', () => {
  const rows = visibilityRows([window(10.1, 10.9), window(10, 11), window(10.1, 11)], period, 1);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.offset === null), 'neither open boundary is a visible minute');
});

test('closed boundaries and period-end clipping preserve a selectable minute', () => {
  const rows = visibilityRows([
    window(0, 1, { openStart: false }),
    window(1439.5, 1440, { openEnd: false, clippedEnd: true }),
  ], period, 1);
  assert.equal(rows[0].offset, 0);
  assert.equal(rows[1].offset, 1440);
  assert.equal(rows[1].clippedEnd, true);
  assert.equal(rows[1].duration, .5 * minute);
});

test('selectable minutes follow the shared slider origin and cannot exceed its period', () => {
  const shifted = { start: start + 30_000, end: start + 150_000 };
  const rows = visibilityRows([
    { start: start + 60_000, end: start + 100_000, openStart: true, openEnd: true },
    { start: start + 150_001, end: start + 240_000, openStart: true, openEnd: false },
  ], shifted, 4);
  assert.equal(rows[0].offset, 1);
  assert.equal(rows[1].offset, null);
});

test('empty analyses and changing requirements do not invent or filter windows', () => {
  assert.deepEqual(visibilityRows([], period, 4), []);
  const input = [window(20, 140, { clippedEnd: true })];
  const [first] = visibilityRows(input, period, 1);
  const [updated] = visibilityRows(input, period, 3);
  assert.equal(first.reserve, hour);
  assert.equal(updated.reserve, -hour);
  assert.equal(first.offset, updated.offset);
  assert.equal(updated.clippedEnd, true);
});

test('one table has at most five calculation rows while retaining all their windows', () => {
  const records=Array.from({length:6},(_,index)=>({id:String(index),required:4,analysis:{period,windows:{both:[window(10,80),window(120,600)]}}}));
  const rows=savedCalculations(records,null,4);
  assert.deepEqual(rows.map(row=>row.id),['0','1','2','3','4']);
  assert.ok(rows.every(row=>row.rows.length===2));
  assert.equal(records.length,6);
});

test('changing operation time updates the active calculation margin without changing saved neighbours', () => {
  const records=['first','second'].map(id=>({id,required:4,analysis:{period,windows:{both:[window(0,300)]}}}));
  const [first,second]=savedCalculations(records,'first',2);
  assert.equal(first.rows[0].reserve,3*hour);
  assert.equal(second.rows[0].reserve,hour);
  assert.equal(records[0].required,4);
});

test('an empty calculation still occupies one history row', () => {
  const rows=savedCalculations([{id:'empty',required:4,analysis:{period,windows:{both:[]}}}],null,4);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].rows,[]);
});
