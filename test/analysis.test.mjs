import test from "node:test";
import assert from "node:assert/strict";
import { demoAnalysis, getAnalysis, getSky, normalizeQuery } from "../lib/horizons.mjs";
import { sites } from "../lib/sites.mjs";
import { atTime, intersect, landingResult, minute, skyAtTime, suitableStarts, visibleWindows } from "../lib/windows.mjs";
import { moonCoordinates, moonDirection, skyDirection } from "../lib/geography.mjs";

test("a shared window can begin and end between the same two samples", () => {
  const samples = [
    { t: 0, sun: .7, earth: -1 },
    { t: 30 * minute, sun: -.1, earth: 2 },
  ];
  const windows = intersect(visibleWindows(samples, "sun"), visibleWindows(samples, "earth"));
  assert.equal(windows.length, 1);
  assert.equal(windows[0].start, 10 * minute);
  assert.ok(Math.abs(windows[0].end - 26.25 * minute) < 1e-8);
  assert.equal(suitableStarts(windows, .25)[0].start, 11 * minute);
});

test("touching zero is a boundary and cannot join continuous windows", () => {
  const samples = [{ t: 0, sun: 2 }, { t: minute, sun: 0 }, { t: 2 * minute, sun: 2 }];
  const windows = visibleWindows(samples, "sun");
  assert.equal(windows.length, 2);
  assert.equal(intersect([windows[0]], [windows[1]]).length, 0);
  assert.equal(landingResult(windows, minute, 1).remaining, 0);
});

test("azimuth crosses north by the shortest arc", () => {
  const samples = [
    { t: 0, sunEl: -1, earthEl: 4, sunAz: 359, earthAz: 1 },
    { t: 2 * minute, sunEl: 1, earthEl: 6, sunAz: 1, earthAz: 359 },
  ];
  assert.deepEqual(atTime(samples, minute, 2 * minute),
    { t: minute, sunAz: 0, sunEl: 0, earthAz: 0, earthEl: 5 });
});

test("real offline cases give different answers at 04:00 UTC", async () => {
  const [odysseus, athena] = await Promise.all(sites.map(demoAnalysis));
  const t = Date.parse("2026-11-14T04:00:00Z");
  assert.equal(odysseus.samples.length, 337);
  assert.equal(odysseus.samples[0].sunEl, -4.128079);
  assert.equal(athena.samples[0].earthEl, -0.153869);
  assert.equal(landingResult(odysseus.windows.both, t, 4).sufficient, false);
  assert.equal(landingResult(athena.windows.both, t, 4).sufficient, true);
  assert.equal(landingResult(athena.windows.both, t, 4).clipped, true);
});

test("offline arbitrary coordinates do not reuse a nearby preset", async () => {
  const query = normalizeQuery(new URLSearchParams({
    lat_deg: "-81", lon_east_deg: "1.5", start_utc: "2026-11-14T00:00Z",
    duration_hours: "168", step_minutes: "30",
  }));
  await assert.rejects(getAnalysis(query, { offline: true }), { status: 503 });
});

test("lunar coordinates round trip near the seam, pole, and at both sites", () => {
  for (const { lat, lon } of [...sites, { lat: 13, lon: 179.999999 }, { lat: -89.9999, lon: -179.99 }]) {
    const result = moonCoordinates(...moonDirection(lat, lon));
    assert.ok(Math.abs(result.lat - lat) < 1e-8);
    assert.ok(Math.abs(result.lon - lon) < 1e-8);
  }
  assert.ok(moonDirection(0, 90)[0] > .99);
  assert.ok(skyDirection(0, 0)[2] < -.99);
  assert.ok(skyDirection(90, 0)[0] > .99);
});

test("the saved Moon-fixed series agrees with the Sun elevation at both sites", async () => {
  const start = Date.parse("2026-11-14T00:00:00Z");
  const end = Date.parse("2026-11-21T00:00:00Z");
  const sky = await getSky({ start, end, step: 30 }, { offline: true });
  assert.equal(sky.source.mode, "demo");
  assert.equal(sky.samples.length, 337);
  assert.equal(sky.samples[0].sunLon, 126.617658);
  assert.equal(sky.samples.at(-1).sunLon, 41.450414);
  for (const site of sites) {
    const analysis = await demoAnalysis(site);
    const up = moonDirection(site.lat, site.lon);
    for (const index of [0, 120, 336]) {
      const { sunLat, sunLon } = sky.samples[index];
      const sun = moonDirection(sunLat, sunLon);
      const elevation = Math.asin(up.reduce((dot, component, i) => dot + component * sun[i], 0)) * 180 / Math.PI;
      assert.ok(Math.abs(elevation - analysis.samples[index].sunEl) < .01);
    }
  }
});

test("Moon-fixed longitude interpolates across 0° without a full rotation", () => {
  const samples = [
    { t: 0, sunLat: -1, sunLon: 359, earthLat: 4, earthLon: 1 },
    { t: 2 * minute, sunLat: 1, sunLon: 1, earthLat: 6, earthLon: 359 },
  ];
  assert.deepEqual(skyAtTime(samples, minute, 2 * minute),
    { sunLat: 0, sunLon: 0, earthLat: 5, earthLon: 0 });
  assert.equal(skyAtTime(samples, 3 * minute, 2 * minute), null);
});
