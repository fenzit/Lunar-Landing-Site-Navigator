import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from 'node:url';
import { AnalysisError, getAnalysis, getSky, normalizeCoordinates, normalizePeriod, normalizeQuery } from "./lib/horizons.mjs";
import { applyTerrain, getSurface, getTerrain } from './lib/terrain.mjs';
import './lib/config.mjs';
import { demoHours, demoStart, demoStep, sites } from "./lib/sites.mjs";
import { apiErrorMessage } from "./lib/api-errors.mjs";
import { normalizePresetPeriod, presetAnalysis, presetDemo, presetManifest, presetSky, presetSurface } from './lib/preset-bundle.mjs';

const offline = process.argv.includes('--offline') || process.env.LUNARPILOT_OFFLINE === '1';
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const staticRoots = [
  ["/three/", resolve(projectRoot, "node_modules/three")],
  ["/lib/", resolve(projectRoot, "lib")],
  ["/", resolve(projectRoot, "public")],
];
const browserLibraries = new Set([
  "/lib/windows.mjs",
  "/lib/geography.mjs",
  "/lib/sites.mjs",
  "/lib/api-errors.mjs",
  "/lib/terrain-math.mjs",
  "/lib/walking.mjs",
  "/lib/surface-world.mjs",
  "/lib/surface-stream.mjs",
  "/lib/lunar-scatter.mjs",
  "/lib/visibility-batch.mjs",
  "/lib/start-search.mjs",
  "/lib/site-comparison.mjs",
]);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp", ".png": "image/png", ".bin": "application/octet-stream",
};

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function errorResponse(res, code, status, params = {}) {
  return json(res, { error: apiErrorMessage(code, params), code, params }, status);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET") return errorResponse(res, "method", 405);
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    if (path === "/api/sites") {
      return json(res, { sites, offline, demo: { start: demoStart, hours: demoHours, step: demoStep } });
    }
    if (path === '/api/presets') return json(res, await presetManifest());
    if (path === '/api/presets/demo') return json(res, await presetDemo());
    if (path === '/api/presets/sky') return json(res, await presetSky(normalizePresetPeriod(url.searchParams)));
    if (path === '/api/presets/analysis') {
      const query = normalizePresetPeriod(url.searchParams);
      return json(res, await presetAnalysis(query, Number(url.searchParams.get('receiver_height_m') ?? 2), url.searchParams.get('site')));
    }
    if (path === "/api/analysis") {
      const query=normalizeQuery(url.searchParams);
      if (offline) return json(res, await presetAnalysis(query, Number(url.searchParams.get('receiver_height_m') ?? 2)));
      const terrain=await getTerrain(query,Number(url.searchParams.get('receiver_height_m')??2));
      const data=await getAnalysis({...query,altitudeKm:Number(((terrain.site.elevationMeters+terrain.receiverHeight)/1000).toFixed(6))});
      return json(res,applyTerrain(data,terrain));
    }
    if(path==='/api/terrain') {
      const site=normalizeCoordinates(url.searchParams),detail=url.searchParams.get('detail');
      if (detail) {
        try { return json(res, await presetSurface(site, detail)); }
        catch (error) { if (offline || !(error instanceof AnalysisError) || error.errorCode !== 'presetSite') throw error; }
      }
      if (offline) throw new AnalysisError('offlineOnly', 503);
      return json(res,detail?await getSurface(site,detail):await getTerrain(site,Number(url.searchParams.get('receiver_height_m')??2)));
    }
    if (path === "/api/sky") {
      const query = normalizePeriod(url.searchParams);
      try { return json(res, await presetSky(query)); }
      catch (error) { if (offline || !(error instanceof AnalysisError) || error.errorCode !== 'presetCoverage') throw error; }
      return json(res, await getSky(query, { offline }));
    }
    if (path.startsWith("/api/demo/")) {
      const site = sites.find(site => path === `/api/demo/${site.id}`);
      if (site) {
        const query={lat:site.lat,lon:site.lon,start:Date.parse(demoStart),end:Date.parse(demoStart)+demoHours*3600000,step:demoStep};
        return json(res, await presetAnalysis(query, Number(url.searchParams.get('receiver_height_m') ?? 2)));
      }
    }
    if (path.startsWith("/api/")) return errorResponse(res, "route", 404);
    if (path.startsWith("/lib/") && !browserLibraries.has(path)) return errorResponse(res, "file", 404);
    if (path.includes("\\")) return errorResponse(res, "url", 400);

    const [prefix, root] = staticRoots.find(([prefix]) => path.startsWith(prefix));
    const file = resolve(root, path === "/" ? "index.html" : path.slice(prefix.length));
    const type = types[extname(file)];
    if (!file.startsWith(root + sep) || !type) return errorResponse(res, "file", 404);
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
    res.end(body);
  } catch (error) {
    if (error instanceof AnalysisError) return errorResponse(res, error.errorCode, error.status, error.params);
    if (["ENOENT", "EISDIR"].includes(error.code)) return errorResponse(res, "file", 404);
    if (error instanceof URIError) return errorResponse(res, "url", 400);
    console.error(error);
    errorResponse(res, "server", 500);
  }
});

const port = Number(process.env.LUNARPILOT_PORT || 4173);
server.listen(port, "127.0.0.1", () => {
  console.log(`LunarPilot · http://127.0.0.1:${server.address().port}${offline ? " · офлайн" : ""}`);
});
