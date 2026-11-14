import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { demoHours, demoStart, demoStep, maxPeriodHours, sites } from "./sites.mjs";
import { atTime, hour, intersect, minute, skyAtTime, visibleWindows } from "./windows.mjs";
import { clipSamples, samplingEnd, searchRange } from './start-search.mjs';
import { apiErrorMessage } from "./api-errors.mjs";
import { horizonsTimeoutMs } from './config.mjs';
import { flatModelVersion } from './model-version.mjs';

const endpoint = "https://ssd.jpl.nasa.gov/api/horizons.api";
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const targets = { sun: "10", earth: "399" };
const cacheDir = resolve("data/cache");
const inFlight = new Map();
let queue = Promise.resolve();

export class AnalysisError extends Error {
  constructor(code, status = 502, params = {}) {
    super(apiErrorMessage(code, params));
    this.errorCode = code;
    this.params = params;
    this.status = status;
  }
}

export function normalizeCoordinates(params) {
  const number = key => params.get(key)?.trim() ? Number(params.get(key)) : NaN;
  const lat = number("lat_deg");
  const lon = number("lon_east_deg");
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
    throw new AnalysisError("coordinates", 400);
  }
  const latRounded = Number(lat.toFixed(6));
  const lonRounded = Number(lon.toFixed(6));
  return {lat:latRounded,lon:lonRounded===180?-180:lonRounded};
}

export function normalizeQuery(params) {
  return {...normalizeCoordinates(params),...normalizePeriod(params)};
}

export function normalizePeriod(params) {
  const startText = params.get("start_utc") ?? "";
  const start = Date.parse(startText);
  const hours = Number(params.get("duration_hours"));
  const step = Number(params.get("step_minutes"));
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:00)?Z$/.test(startText) || !Number.isFinite(start) ||
      new Date(start).toISOString().slice(0, 16) !== startText.slice(0, 16) ||
      start < Date.UTC(1972, 0, 1) || start >= Date.UTC(2100, 0, 1)) {
    throw new AnalysisError("startUtc", 400);
  }
  if(params.has('end_utc')) {
    const endText=params.get('end_utc');
    if(params.has('duration_hours')||!endText.endsWith('Z')) throw new AnalysisError('searchRangeInvalid',400);
    let range;
    try {range=searchRange(startText,endText,1);} catch(error) {throw new AnalysisError(error.code,400);}
    if(![1,5,10,15,30,60].includes(step)||Math.ceil((range.end-start)/(step*minute))>2000) {
      throw new AnalysisError('period',400,{maxHours:maxPeriodHours});
    }
    return {start,end:range.end,step};
  }
  if (!Number.isInteger(hours) || hours < 1 || hours > maxPeriodHours ||
      ![1, 5, 10, 15, 30, 60].includes(step) || hours * 60 / step > 2000) {
    throw new AnalysisError("period", 400, { maxHours: maxPeriodHours });
  }
  return { start, end: start + hours * hour, step };
}

function observerUrl(query, values) {
  const date = t => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  const params = {
    ...values, EPHEM_TYPE: "OBSERVER",
    START_TIME: date(query.start), STOP_TIME: date(samplingEnd(query)), STEP_SIZE: `${query.step}m`,
    CSV_FORMAT: "YES", APPARENT: "AIRLESS", TIME_TYPE: "UT",
    TIME_ZONE: "+00:00", OBJ_DATA: "NO", MAKE_EPHEM: "YES",
  };
  const url = new URL(endpoint);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, `'${value}'`);
  return url;
}

export function horizonsUrl(query, target) {
  const east = query.lon < 0 ? query.lon + 360 : query.lon;
  return observerUrl(query, {
    COMMAND: targets[target], CENTER: "coord@301", COORD_TYPE: "GEODETIC",
    SITE_COORD: `${Number(east.toFixed(6))},${query.lat},${query.altitudeKm??0}`, QUANTITIES: "4", ELEV_CUT: "-90",
  });
}

function responseText(response) {
  const version = response?.signature?.version;
  const result = response?.result;
  if (response?.error || !["1.2", "1.3"].includes(version) || typeof result !== "string") {
    throw new AnalysisError("horizonsFormat");
  }
  return result;
}

function tableRows(result) {
  const table = result.match(/\$\$SOE\s*\n([\s\S]+?)\$\$EOE/);
  if (!table) throw new AnalysisError("missingTable");
  return table[1].trim().split(/\r?\n/).map(line => {
    const [date, , , ...cells] = line.split(",").map(cell => cell.trim());
    const parts = date.match(/^(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2})$/);
    const month = parts ? months.indexOf(parts[2]) : -1;
    const t = month < 0 ? NaN : Date.UTC(+parts[1], month, +parts[3], +parts[4], +parts[5]);
    return { t, cells: cells.map(cell => cell ? Number(cell) : NaN) };
  });
}

export function parseResponse(response, target, query) {
  const result = responseText(response);
  const heading = result.match(/Date__\(UT\)__HR:MN,\s*,\s*,\s*Azi_\(a-app\),\s*Elev_\(a-app\),/);
  const observer = result.match(/Center geodetic\s*:\s*([\d.eE+\-]+),\s*([\d.eE+\-]+),\s*([\d.eE+\-]+)\s*\{E-lon/);
  const east = ((query.lon % 360) + 360) % 360;
  if (!heading || !observer || !result.includes("Airless apparent azimuth and elevation of target center") ||
      Math.abs(Number(observer[1]) - east) > 1e-6 ||
      Math.abs(Number(observer[2]) - query.lat) > 1e-6 || Math.abs(Number(observer[3])-(query.altitudeKm??0)) > 1e-4 ||
      !new RegExp(`Target body name:[^\\n]+\\(${targets[target]}\\)`).test(result) ||
      !/Center body name:\s*Moon \(301\)/.test(result)) {
    throw new AnalysisError("observerMismatch");
  }
  return tableRows(result).map(({ t, cells: [az, el] }) => {
    if (!Number.isFinite(t) || !Number.isFinite(az) || az < 0 || az > 360 ||
        !Number.isFinite(el) || Math.abs(el) > 90) {
      throw new AnalysisError("invalidSample");
    }
    return { t, az, el };
  });
}

export function parseSky(record, query, mode) {
  const result = responseText(record.response);
  if (!/Target body name:\s*Moon \(301\)/.test(result) ||
      !/Center body name:\s*Earth \(399\)/.test(result) ||
      !/Center-site name:\s*GEOCENTRIC/.test(result) ||
      !/Target pole\/equ\s*:\s*MOON_ME\s*\{East-longitude positive\}/.test(result) ||
      !/Date__\(UT\)__HR:MN,\s*,\s*,\s*ObsSub-LON,\s*ObsSub-LAT,\s*SunSub-LON,\s*SunSub-LAT,/.test(result)) {
    throw new AnalysisError("skyFormat");
  }
  const samples = tableRows(result).map(({ t, cells: [earthLon, earthLat, sunLon, sunLat] }) => {
    if (![earthLon, earthLat, sunLon, sunLat].every(Number.isFinite) ||
        earthLon < 0 || earthLon > 360 || sunLon < 0 || sunLon > 360 ||
        Math.abs(earthLat) > 90 || Math.abs(sunLat) > 90) {
      throw new AnalysisError("invalidDirection");
    }
    return { t, earthLon, earthLat, sunLon, sunLat };
  });
  verifiedRows(samples, query);
  return { period: query, samples:clipSamples(samples,query,skyAtTime), source: { mode, ...provenance(record) } };
}

function verifiedRows(rows, query) {
  const step = query.step * minute;
  if (rows.length !== Math.ceil((query.end - query.start) / step) + 1 ||
      rows.some(({ t }, index) => t !== query.start + step * index)) {
    throw new AnalysisError("incomplete");
  }
  return new Map(rows.map(row => [row.t, row]));
}

export function buildAnalysis(query, records, mode) {
  const sun = parseResponse(records.sun.response, "sun", query);
  verifiedRows(sun, query);
  const earth = verifiedRows(parseResponse(records.earth.response, "earth", query), query);
  const samples = clipSamples(sun.map(({ t, az, el }) => ({
    t, sunAz: az, sunEl: el, earthAz: earth.get(t).az, earthEl: earth.get(t).el,
  })),query,atTime);
  const windows = { sun: visibleWindows(samples, "sunEl"), earth: visibleWindows(samples, "earthEl") };
  windows.both = intersect(windows.sun, windows.earth);
  const durations = windows.both.map(window => window.end - window.start);
  return {
    site: { lat: query.lat, lon: query.lon, altitudeKm: query.altitudeKm??0 },
    period: { start: query.start, end: query.end, stepMinutes: query.step },
    samples, windows,
    summary: { longestMs: Math.max(0, ...durations), totalMs: durations.reduce((a, b) => a + b, 0) },
    model: { version: flatModelVersion, horizonDeg: 0, centers: true, terrain: false },
    source: {
      name: "NASA/JPL Horizons", mode,
      records: Object.fromEntries(Object.entries(records).map(([key, record]) => [key, provenance(record)])),
    },
  };
}

const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const provenance = record => ({
  url: record.url, version: record.response.signature.version, retrievedUtc: record.retrievedUtc,
});

export async function demoAnalysis(site) {
  const start = Date.parse(demoStart);
  const query = { lat: site.lat, lon: site.lon, start, end: start + demoHours * hour, step: demoStep };
  const sun = await readJson(`data/demo/${site.id}-sun.json`);
  const earth = await readJson(`data/demo/${site.id}-earth.json`);
  return buildAnalysis(query, { sun, earth }, "demo");
}

async function fetchRecord(url) {
  const contact = process.env.LUNARPILOT_CONTACT || "https://github.com/fenzit/Lunar-Landing-Site-Navigator";
  const headers = { "User-Agent": `LunarPilot/0.1.0 (${contact})` };
  for (let attempt=0; attempt<3; attempt++) {
    let retryDelay=500*2**attempt;
    try {
      const reply = await fetch(url, { headers, signal: AbortSignal.timeout(horizonsTimeoutMs) });
      if (!reply.ok) {
        await reply.body?.cancel().catch(() => {});
        const retryAfter=reply.headers?.get('retry-after');
        if(retryAfter) {
          const seconds=Number(retryAfter);
          retryDelay=Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(retryAfter)-Date.now());
        }
        throw new AnalysisError('horizonsHttp',502,{status:reply.status});
      }
      return { url: url.href, response: await reply.json(), retrievedUtc: new Date().toISOString() };
    } catch(error) {
      const temporary=error instanceof AnalysisError
        ? [408,429,500,502,503,504].includes(error.params.status)
        : ['TimeoutError','AbortError','TypeError','SyntaxError'].includes(error.name);
      if(!temporary||attempt===2||retryDelay>10000) {
        if(error instanceof AnalysisError) throw error;
        throw new AnalysisError(['TimeoutError','AbortError'].includes(error.name)?'horizonsTimeout':'horizonsUnavailable');
      }
      // Stay within the shared serial queue: never issue parallel JPL requests.
      await delay(Number.isFinite(retryDelay)?Math.max(500,retryDelay):500);
    }
  }
}

async function cachedRequest(key, offline, parse, fetchRecords) {
  const path = resolve(cacheDir, `${createHash("sha256").update(key).digest("hex")}.json`);
  try {
    return parse(await readJson(path), "cache");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (offline) throw new AnalysisError("offline", 503);
  if (inFlight.has(key)) return inFlight.get(key);
  if (inFlight.size >= 5) throw new AnalysisError("busy", 429);
  const task = queue.then(async () => {
    try {
      const records = await fetchRecords();
      const analysis = parse(records, "live");
      await mkdir(cacheDir, { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(records));
      await rename(`${path}.tmp`, path);
      return analysis;
    } catch (error) {
      await delay(1000);
      if (error instanceof AnalysisError) throw error;
      throw new AnalysisError("horizonsUnavailable");
    }
  });
  inFlight.set(key, task);
  queue = task.catch(() => {});
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

export async function getAnalysis(query, { offline = false } = {}) {
  const site = sites.find(({ lat, lon }) => query.lat === lat && query.lon === lon);
  if (site && query.altitudeKm===undefined && query.start === Date.parse(demoStart) && query.end - query.start === demoHours * hour &&
      query.step === demoStep) return demoAnalysis(site);
  return cachedRequest(JSON.stringify(query), offline, (records, mode) => buildAnalysis(query, records, mode), async () => {
    const sun = await fetchRecord(horizonsUrl(query, "sun"));
    verifiedRows(parseResponse(sun.response, "sun", query), query);
    const earth = await fetchRecord(horizonsUrl(query, "earth"));
    return { sun, earth };
  });
}

export async function getSky(query, { offline = false } = {}) {
  const start = Date.parse(demoStart), end = start + demoHours * hour;
  const demoInterval = demoStep * minute;
  if (query.start >= start && query.end <= end && query.step % demoStep === 0 &&
      (query.start - start) % demoInterval === 0 && samplingEnd(query)<=end) {
    const record = await readJson("data/demo/moon-sky.json");
    const { samples, source } = parseSky(record, { start, end, step: demoStep }, "demo");
    const step = query.step * minute;
    return {
      period: query, source,
      samples: clipSamples(samples.filter(({ t }) => t >= query.start && t <= samplingEnd(query) && (t - query.start) % step === 0),query,skyAtTime),
    };
  }
  const url = observerUrl(query, { COMMAND: "301", CENTER: "500@399", QUANTITIES: "14,15" });
  return cachedRequest(`sky:${query.start}:${query.end}:${query.step}`, offline,
    (record, mode) => parseSky(record, query, mode), () => fetchRecord(url));
}
