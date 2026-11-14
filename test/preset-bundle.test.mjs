import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rmdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAnalysis } from '../lib/horizons.mjs';
import { applyTerrain } from '../lib/terrain.mjs';
import { presetAnalysis, presetDemo, presetManifest, presetRange, presetSky, presetSurface, samplePresetRange } from '../lib/preset-bundle.mjs';
import { terrainModelVersion } from '../lib/model-version.mjs';
import { atTime, hour, landingResult, minute } from '../lib/windows.mjs';

const root = new URL('../data/presets/', import.meta.url);
const read = async path => JSON.parse(gunzipSync(await readFile(new URL(path, root))));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('four named polar sites have twelve continuous months, real provenance and verified package files', async () => {
  const m = await presetManifest();
  assert.equal(m.modelVersion, terrainModelVersion);
  assert.equal(m.coverage.end - m.coverage.start, 365 * 24 * hour);
  assert.equal(m.sites.length, 4);
  assert.deepEqual(m.sites.slice(0, 2).map(s => s.id), ['odysseus', 'athena']);
  const files = [...m.sky, m.skyInput];
  for (const site of m.sites) {
    assert.ok(site.name && Math.abs(site.lat) > 80);
    assert.equal(site.equipmentHeight, 2); assert.equal(site.coverage.stepMinutes, 30);
    assert.ok(site.source.records.sun.url.includes('ssd.jpl.nasa.gov'));
    assert.ok(site.source.records.earth.retrievedUtc && site.terrainSources.every(s => s.citation));
    assert.equal(site.chunks.length, 12);
    assert.equal(site.chunks[0].start, m.coverage.start); assert.equal(site.chunks.at(-1).end, m.coverage.end);
    assert.ok(site.chunks.every((c, i) => !i || c.start === site.chunks[i - 1].end));
    files.push(...site.chunks, site.surface, site.landscape, site.input);
  }
  for (const file of files) assert.equal(digest(await readFile(new URL(file.file, root))), file.sha256, file.file);
});

test('a saved interval is reproduced exactly from its original real JPL responses and DEM input', async () => {
  const m = await presetManifest(), site = m.sites[0], chunk = site.chunks[0];
  const input = await read(site.input.file), saved = await read(chunk.file);
  const base = buildAnalysis(input.query, input.records, 'bundle');
  const samples = base.samples.filter(s => s.t >= chunk.start && s.t <= chunk.end);
  const calculated = applyTerrain({ ...base, period: { start: chunk.start, end: chunk.end, stepMinutes: input.query.step }, samples }, input.terrain);
  assert.deepEqual(JSON.parse(JSON.stringify(calculated)), saved);
  assert.ok(input.records.sun.response.result.includes('Airless apparent azimuth and elevation of target center'));
  assert.ok(input.query.altitudeKm > 2.5, 'JPL observer altitude includes measured ground plus equipment');
});

test('a selected date spans monthly boundaries with exact UTC sampling and recomputed window clipping', async () => {
  const m = await presetManifest();
  const query = { ...m.sites[1], start: Date.parse('2027-03-13T07:17Z'), end: Date.parse('2027-03-15T08:23Z'), step: 30 };
  const data = await presetAnalysis(query, 2);
  assert.equal(data.samples[0].t, query.start); assert.equal(data.samples.at(-1).t, query.end);
  assert.equal(new Set(data.samples.map(s => s.t)).size, data.samples.length);
  assert.ok(data.windows.both.every(w => w.start >= query.start && w.end <= query.end));
  const input = await read(m.sites[1].input.file), base = buildAnalysis(input.query, input.records, 'bundle');
  assert.deepEqual(data.samples[0], atTime(base.samples, query.start, 30 * minute));
  assert.deepEqual(data.samples.at(-1), atTime(base.samples, query.end, 30 * minute));
  const sky = await presetSky(query);
  assert.equal(sky.samples[0].t, data.samples[0].t); assert.equal(sky.samples.at(-1).t, query.end);
});

test('coverage and settings outside the bundle are rejected rather than extrapolated or silently fetched', async () => {
  const m = await presetManifest(), query = { ...m.sites[0], start: m.coverage.start, end: m.coverage.start + 24 * hour, step: 30 };
  for (const [q, height] of [[{ ...query, start: query.start - minute }, 2], [{ ...query, end: m.coverage.end + minute }, 2], [{ ...query, step: 15 }, 2], [query, 20]]) {
    assert.throws(() => presetRange(m, q, height), { errorCode: 'presetCoverage' });
  }
  await assert.rejects(presetAnalysis({ ...query, lat: -85, lon: 0 }), { errorCode: 'presetSite' });
  const last = await presetAnalysis({ ...query, start: m.coverage.end - hour, end: m.coverage.end, step: 60 });
  assert.equal(last.samples.at(-1).t, m.coverage.end);
  assert.throws(() => samplePresetRange([{ t: 0 }, { t: 2 * hour }], { start: 0, end: hour, step: 30 }, atTime), { errorCode: 'presetCorrupt' });
});

test('the one-button defense episode loads both sites, shows a real difference and includes measured walking terrain', async () => {
  const { episode, analyses } = await presetDemo();
  assert.equal(analyses.length, 2);
  const results = analyses.map(a => landingResult(a.windows.both, episode.time, episode.required));
  assert.equal(results[0].sufficient, false); assert.equal(results[0].remaining, 0);
  assert.equal(results[1].sufficient, true); assert.equal(results[1].clipped, true);
  assert.equal(results[1].remaining, 137 * hour);
  for (const analysis of analyses) {
    const surface = await presetSurface(analysis.site, 'surface'), landscape = await presetSurface(analysis.site, 'landscape');
    assert.equal(surface.grids[0].size, 129); assert.equal(landscape.grids.length, 4);
    assert.equal(surface.site.elevationMeters, analysis.terrain.site.elevationMeters);
    assert.ok(surface.grids[0].heights.every(Number.isFinite));
  }
});

test('a cold local server opens the demo, graph, sky and all display assets with external fetch forbidden', async t => {
  const tools = new URL('../.tools/', import.meta.url); await mkdir(tools, { recursive: true });
  const cwd = await mkdtemp(fileURLToPath(new URL('offline-test-', tools)));
  const preload = 'data:text/javascript,' + encodeURIComponent("globalThis.fetch=async()=>{throw new Error('External network forbidden by cold-start test')}");
  const child = spawn(process.execPath, ['--import', preload, fileURLToPath(new URL('../server.mjs', import.meta.url)), '--offline'], {
    cwd, env: { ...process.env, LUNARPILOT_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    const closed = child.exitCode === null ? new Promise(resolve => child.once('close', resolve)) : Promise.resolve();
    child.kill(); await closed; await rmdir(cwd);
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Cold-start server timed out: ' + output)), 10000);
    child.stdout.on('data', bytes => { output += bytes; const url = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (url) { clearTimeout(timer); resolve(url[0]); } });
    child.stderr.on('data', bytes => { output += bytes; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); if (code) reject(new Error(output)); });
  });
  const get = path => fetch(base + path);
  assert.equal((await (await get('/api/sites')).json()).offline, true);
  const response = await get('/api/presets/demo'); assert.equal(response.status, 200);
  const demo = await response.json(); assert.equal(demo.analyses.length, 2);
  const params = new URLSearchParams({ start_utc: '2026-11-14T00:00Z', duration_hours: '168', step_minutes: '30' });
  assert.equal((await get('/api/sky?' + params)).status, 200);
  for (const site of demo.sites) {
    assert.equal((await get(`/api/terrain?lat_deg=${site.lat}&lon_east_deg=${site.lon}&detail=landscape`)).status, 200);
    assert.equal((await get(`/api/demo/${site.id}`)).status, 200);
  }
  for (const path of ['/', '/app.mjs', '/preset-browser.mjs', '/site-comparison.mjs', '/lib/site-comparison.mjs', '/three/build/three.module.js',
    '/assets/moon.webp', '/assets/earth.webp', '/assets/lola-km.bin', '/assets/lola-north.webp', '/assets/lola-south.webp', '/assets/slope.webp']) {
    const reply = await get(path); assert.equal(reply.status, 200, path); await reply.arrayBuffer();
  }
  const outside = await get('/api/analysis?' + params + '&lat_deg=0&lon_east_deg=0'); assert.equal(outside.status, 422);
  assert.equal((await outside.json()).code, 'presetSite');
  await assert.rejects(access(new URL('data/cache/', 'file:///' + cwd.replaceAll('\\', '/') + '/')), { code: 'ENOENT' });
});
