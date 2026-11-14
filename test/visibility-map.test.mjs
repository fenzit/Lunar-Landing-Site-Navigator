import assert from "node:assert/strict";
import test from "node:test";
import { runVisibilityBatch, visibilityGrid } from "../lib/visibility-batch.mjs";

const center = { lat: -80.1276, lon: 1.4367 };
const time = Date.UTC(2026, 10, 14, 0, 15);
const period = { start: time - 900_000, end: time + 900_000, stepMinutes: 30 };
const analysis = {
  site: center,
  period,
  terrain: { horizon: [0, 2, 4, 2] },
  samples: [
    { t: period.start, sunAz: 359, sunEl: 2, earthAz: 90, earthEl: 2 },
    { t: period.end, sunAz: 1, sunEl: 4, earthAz: 90, earthEl: 2 },
  ],
  windows: {
    sun: [{ start: period.start, end: period.end }],
    earth: [],
    both: [],
  },
};

test("the center of the 3×3 map reports the ordinary analysis at the slider time", async () => {
  const points = visibilityGrid(center, 400);
  assert.equal(points.length, 9);
  assert.deepEqual(points[4], center);
  assert.ok(points[1].lat > center.lat && points[7].lat < center.lat);
  assert.ok(points[3].lon < center.lon && points[5].lon > center.lon);

  const loaded = [];
  await runVisibilityBatch([points[4]], time, async () => analysis, { onPoint: result => loaded.push(result) });
  assert.deepEqual(loaded[0], {
    point: center,
    bodies: { sun: { clearance: 3, visible: true }, earth: { clearance: 0, visible: false } },
    windows: analysis.windows,
  });
});

test("an unavailable point leaves the other points and their windows usable", async () => {
  const points = visibilityGrid(center, 400).slice(3, 6);
  const unavailable = new Error("DEM unavailable");
  const results = [];
  await runVisibilityBatch(points, time, async point => {
    if (point === points[1]) throw unavailable;
    return analysis;
  }, { onPoint: (result, index) => { results[index] = result; } });
  assert.equal(results.length, 3);
  assert.equal(results[0].bodies.sun.visible, true);
  assert.deepEqual(results[1], { point: center, error: unavailable });
  assert.deepEqual(results[2].windows, analysis.windows);
});

test("cancelling while one point is loading starts no further points", async () => {
  const points = visibilityGrid(center, 400);
  const controller = new AbortController();
  const started = [];
  const reported = [];
  let completePoint;
  const batch = runVisibilityBatch(points, time, (point, signal) => {
    assert.equal(signal, controller.signal);
    started.push(point);
    return new Promise(resolve => { completePoint = resolve; });
  }, { signal: controller.signal, onPoint: result => reported.push(result) });
  controller.abort();
  completePoint(analysis);
  await batch;
  assert.deepEqual(started, [points[0]]);
  assert.deepEqual(reported, []);
});
