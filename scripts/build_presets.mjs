import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildAnalysis, getAnalysis, getSky, parseSky } from '../lib/horizons.mjs';
import { applyTerrain, getSurface, getTerrain } from '../lib/terrain.mjs';
import { terrainModelVersion } from '../lib/model-version.mjs';
import { defenseEpisode, polarPresets, presetCoverage } from '../lib/preset-catalog.mjs';

const root = new URL('../data/presets/', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async path => JSON.parse(gunzipSync(await readFile(new URL(path, root))));
async function save(path, value) {
  const url = new URL(path, root); await mkdir(new URL('.', url), { recursive: true });
  const bytes = gzipSync(JSON.stringify(value), { level: 9 }); await writeFile(url, bytes);
  return { file: path, sha256: digest(bytes), bytes: bytes.length };
}
const cacheRecord = async key => JSON.parse(await readFile(new URL(`../data/cache/${digest(key)}.json`, import.meta.url), 'utf8'));

async function capture() {
  for (const site of polarPresets) {
    try { await read(`inputs/${site.id}.json.gz`); console.log(`${site.id}: using frozen inputs`); continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    console.log(`${site.id}: loading measured DEM`);
    const terrain = await getTerrain(site, presetCoverage.height);
    const landscape = await getSurface(site, 'landscape');
    const query = { lat: site.lat, lon: site.lon, start: presetCoverage.start, end: presetCoverage.end, step: presetCoverage.step,
      altitudeKm: Number(((terrain.site.elevationMeters + terrain.receiverHeight) / 1000).toFixed(6)) };
    console.log(`${site.id}: loading one year of real JPL directions`);
    await getAnalysis(query);
    const records = await cacheRecord(JSON.stringify(query));
    await save(`inputs/${site.id}.json.gz`, { query, records, terrain, landscape });
    console.log(`${site.id}: saved verified scientific inputs`);
  }
  try { await read('inputs/sky.json.gz'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const query = { start: presetCoverage.start, end: presetCoverage.end, step: presetCoverage.step };
    console.log('sky: loading one year of Moon-fixed directions');
    await getSky(query);
    await save('inputs/sky.json.gz', { query, record: await cacheRecord(`sky:${query.start}:${query.end}:${query.step}`) });
  }
}

export async function buildPresets() {
  const start = new Date(presetCoverage.start), bounds = [];
  for (let index = 0; index < 12; index++) bounds.push({
    start: Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, start.getUTCDate()),
    end: Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index + 1, start.getUTCDate()),
  });
  const manifest = { format: 1, modelVersion: terrainModelVersion, coverage: presetCoverage,
    episode: defenseEpisode, sites: [], sky: [] };
  for (const site of polarPresets) {
    const input = await read(`inputs/${site.id}.json.gz`);
    const base = buildAnalysis(input.query, input.records, 'bundle');
    const entry = { ...site, coverage: base.period, equipmentHeight: input.terrain.receiverHeight,
      modelVersion: terrainModelVersion, source: base.source, terrainSources: input.terrain.sources,
      input: { file: `inputs/${site.id}.json.gz`, sha256: digest(await readFile(new URL(`inputs/${site.id}.json.gz`, root))) }, chunks: [] };
    for (const period of bounds) {
      const samples = base.samples.filter(s => s.t >= period.start && s.t <= period.end);
      const data = applyTerrain({ ...base, period: { ...period, stepMinutes: base.period.stepMinutes }, samples }, input.terrain);
      const path = `${site.id}/${new Date(period.start).toISOString().slice(0, 10)}.json.gz`;
      entry.chunks.push({ ...period, ...await save(path, data) });
    }
    entry.surface = await save(`${site.id}/surface.json.gz`, { ...input.terrain, horizon: undefined, horizonDistances: undefined });
    entry.landscape = await save(`${site.id}/landscape.json.gz`, input.landscape);
    manifest.sites.push(entry);
    console.log(`${site.id}: 12 monthly chunks, ${base.samples.length} JPL samples`);
  }
  const input = await read('inputs/sky.json.gz'), sky = parseSky(input.record, input.query, 'bundle');
  manifest.skySource = sky.source;
  manifest.skyInput = { file: 'inputs/sky.json.gz', sha256: digest(await readFile(new URL('inputs/sky.json.gz', root))) };
  for (const period of bounds) manifest.sky.push({ ...period, ...await save(`sky/${new Date(period.start).toISOString().slice(0, 10)}.json.gz`, {
    period: { ...period, step: presetCoverage.step }, source: sky.source, samples: sky.samples.filter(s => s.t >= period.start && s.t <= period.end),
  }) });
  await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built ${manifest.sites.length} sites for 12 months from frozen inputs; no cache is needed to serve the bundle.`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--download')) await capture();
  await buildPresets();
}
