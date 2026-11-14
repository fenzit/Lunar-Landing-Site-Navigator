import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { AnalysisError } from './horizons.mjs';
import { applyTerrain } from './terrain.mjs';
import { terrainModelVersion } from './model-version.mjs';
import { atTime, minute, skyAtTime } from './windows.mjs';

const root = new URL('../data/presets/', import.meta.url), files = new Map();
let manifest;
export async function presetManifest() {
  if (!manifest) manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  if (manifest.format !== 1 || manifest.modelVersion !== terrainModelVersion) throw new AnalysisError('presetVersion', 409);
  return manifest;
}

async function dataFile(entry) {
  if (!files.has(entry.file)) {
    const promise = readFile(new URL(entry.file, root)).then(bytes => {
      if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new AnalysisError('presetCorrupt', 503);
      return JSON.parse(gunzipSync(bytes));
    }).catch(error => { files.delete(entry.file); throw error; });
    files.set(entry.file, promise);
    while (files.size > 4) files.delete(files.keys().next().value);
  }
  return files.get(entry.file);
}

export function presetRange(manifest, query, height = manifest.coverage.height) {
  if (query.start < manifest.coverage.start || query.end > manifest.coverage.end || query.end <= query.start ||
      height !== manifest.coverage.height || query.step < manifest.coverage.step || query.step % manifest.coverage.step !== 0) {
    throw new AnalysisError('presetCoverage', 422);
  }
}

export function samplePresetRange(samples, query, interpolate, sourceStep = 30) {
  const step = sourceStep * minute;
  if (!samples.length || samples[0].t > query.start || samples.at(-1).t < query.end ||
      samples.some((sample, i) => i && sample.t - samples[i - 1].t !== step)) throw new AnalysisError('presetCorrupt', 503);
  const result = [];
  for (let t = query.start; t < query.end; t += query.step * minute) result.push({ ...interpolate(samples, t, step), t });
  result.push({ ...interpolate(samples, query.end, step), t: query.end });
  return result;
}

async function rangeData(chunks, query) {
  const loaded = [];
  for (const chunk of chunks.filter(c => c.start <= query.end && c.end >= query.start)) loaded.push(await dataFile(chunk));
  const samples = [...new Map(loaded.flatMap(data => data.samples).map(sample => [sample.t, sample])).values()].sort((a, b) => a.t - b.t);
  return { first: loaded[0], samples };
}

export async function presetAnalysis(query, height = 2, id) {
  const manifest = await presetManifest(); presetRange(manifest, query, height);
  const entry = manifest.sites.find(site => id ? site.id === id : site.lat === query.lat && site.lon === query.lon);
  if (!entry) throw new AnalysisError('presetSite', 422);
  const { first, samples } = await rangeData(entry.chunks, query);
  if (!first || first.model?.version !== manifest.modelVersion) throw new AnalysisError('presetCorrupt', 503);
  const data = applyTerrain({ ...first, samples: samplePresetRange(samples, query, atTime, manifest.coverage.step),
    period: { start: query.start, end: query.end, stepMinutes: query.step },
    source: { ...first.source, mode: 'bundle', packageCoverage: manifest.coverage },
  }, first.terrain);
  return data;
}

export async function presetSky(query) {
  const manifest = await presetManifest(); presetRange(manifest, query);
  const { first, samples } = await rangeData(manifest.sky, query);
  if (!first) throw new AnalysisError('presetCorrupt', 503);
  return { period: query, source: { ...first.source, mode: 'bundle' }, samples: samplePresetRange(samples, query, skyAtTime, manifest.coverage.step) };
}

export async function presetSurface(point, detail) {
  const manifest = await presetManifest();
  const entry = manifest.sites.find(site => site.lat === point.lat && site.lon === point.lon);
  if (!entry) throw new AnalysisError('presetSite', 422);
  return dataFile(detail === 'landscape' ? entry.landscape : entry.surface);
}

export async function presetDemo() {
  const manifest = await presetManifest(), episode = manifest.episode, analyses = [];
  for (const id of episode.sites) analyses.push(await presetAnalysis(episode, episode.height, id));
  return { episode, sites: manifest.sites.filter(s => episode.sites.includes(s.id)), analyses };
}
