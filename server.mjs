import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { AnalysisError, getAnalysis, getSky, normalizeCoordinates, normalizePeriod, normalizeQuery } from "./lib/horizons.mjs";
import { applyTerrain, getSurface, getTerrain } from './lib/terrain.mjs';
import './lib/config.mjs';
import { demoHours, demoStart, demoStep, sites } from "./lib/sites.mjs";
import { apiErrorMessage } from "./lib/api-errors.mjs";

const offline = false;
const staticRoots = [
  ["/three/", resolve("node_modules/three")],
  ["/lib/", resolve("lib")],
  ["/", resolve("public")],
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
    if (path === "/api/analysis") {
      const query=normalizeQuery(url.searchParams);
      const terrain=await getTerrain(query,Number(url.searchParams.get('receiver_height_m')??2));
      const data=await getAnalysis({...query,altitudeKm:Number(((terrain.site.elevationMeters+terrain.receiverHeight)/1000).toFixed(6))});
      return json(res,applyTerrain(data,terrain));
    }
    if(path==='/api/terrain') {
      const site=normalizeCoordinates(url.searchParams),detail=url.searchParams.get('detail');
      return json(res,detail?await getSurface(site,detail):await getTerrain(site,Number(url.searchParams.get('receiver_height_m')??2)));
    }
    if (path === "/api/sky") {
      return json(res, await getSky(normalizePeriod(url.searchParams), { offline }));
    }
    if (path.startsWith("/api/demo/")) {
      const site = sites.find(site => path === `/api/demo/${site.id}`);
      if (site) {
        const query={lat:site.lat,lon:site.lon,start:Date.parse(demoStart),end:Date.parse(demoStart)+demoHours*3600000,step:demoStep};
        const terrain=await getTerrain(site,Number(url.searchParams.get('receiver_height_m')??2));
        return json(res,applyTerrain(await getAnalysis({...query,altitudeKm:Number(((terrain.site.elevationMeters+terrain.receiverHeight)/1000).toFixed(6))}),terrain));
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
  console.log(`LunarPilot · http://127.0.0.1:${port}${offline ? " · офлайн" : ""}`);
});
