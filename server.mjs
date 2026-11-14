import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { AnalysisError, demoAnalysis, getAnalysis, getSky, normalizePeriod, normalizeQuery } from "./lib/horizons.mjs";
import { demoHours, demoStart, demoStep, sites } from "./lib/sites.mjs";

const offline = process.argv.includes("--offline");
const staticRoots = [
  ["/three/", resolve("node_modules/three")],
  ["/lib/", resolve("lib")],
  ["/", resolve("public")],
];
const browserLibraries = new Set(["/lib/windows.mjs", "/lib/geography.mjs", "/lib/sites.mjs"]);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp", ".png": "image/png", ".bin": "application/octet-stream",
};

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET") return json(res, { error: "Используйте GET." }, 405);
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    if (path === "/api/sites") {
      return json(res, { sites, offline, demo: { start: demoStart, hours: demoHours, step: demoStep } });
    }
    if (path === "/api/analysis") {
      return json(res, await getAnalysis(normalizeQuery(url.searchParams), { offline }));
    }
    if (path === "/api/sky") {
      return json(res, await getSky(normalizePeriod(url.searchParams), { offline }));
    }
    if (path.startsWith("/api/demo/")) {
      const site = sites.find(site => path === `/api/demo/${site.id}`);
      if (site) return json(res, await demoAnalysis(site));
    }
    if (path.startsWith("/api/")) return json(res, { error: "Такого маршрута нет." }, 404);
    if (path.startsWith("/lib/") && !browserLibraries.has(path)) return json(res, { error: "Файл не найден." }, 404);
    if (path.includes("\\")) return json(res, { error: "Неверный URL." }, 400);

    const [prefix, root] = staticRoots.find(([prefix]) => path.startsWith(prefix));
    const file = resolve(root, path === "/" ? "index.html" : path.slice(prefix.length));
    const type = types[extname(file)];
    if (!file.startsWith(root + sep) || !type) return json(res, { error: "Файл не найден." }, 404);
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
    res.end(body);
  } catch (error) {
    if (error instanceof AnalysisError) return json(res, { error: error.message }, error.status);
    if (["ENOENT", "EISDIR"].includes(error.code)) return json(res, { error: "Файл не найден." }, 404);
    if (error instanceof URIError) return json(res, { error: "Неверный URL." }, 400);
    console.error(error);
    json(res, { error: "Ошибка локального сервера." }, 500);
  }
});

const port = Number(process.env.LUNARPILOT_PORT || 4173);
server.listen(port, "127.0.0.1", () => {
  console.log(`LunarPilot · http://127.0.0.1:${port}${offline ? " · офлайн" : ""}`);
});
