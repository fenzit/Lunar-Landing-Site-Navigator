import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { demoHours, demoStart, demoStep, sites } from "../lib/sites.mjs";

test("retry a failed Horizons download without repeating a completed target", async t => {
  const origin = process.cwd();
  const replies = {};
  for (const target of ["sun", "earth"]) {
    replies[target] = JSON.parse(await readFile(`data/demo/odysseus-${target}.json`, "utf8")).response;
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), "lunarpilot-horizons-"));
  process.chdir(temporary);
  t.after(async () => {
    process.chdir(origin);
    await rm(temporary, { recursive: true, force: true });
  });
  const { getAnalysis } = await import("../lib/horizons.mjs");
  const start = Date.parse(demoStart);
  const end = start + demoHours * 3_600_000;
  const { lat, lon } = sites[0];
  const query = { lat, lon, start, end, step: demoStep, altitudeKm: 0 };
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    const target = url.searchParams.get("COMMAND") === "'10'" ? "sun" : "earth";
    calls.push(target);
    if (calls.length === 2) throw new TypeError("Connection reset while downloading");
    return Response.json(replies[target]);
  });

  const result = await getAnalysis(query);
  assert.equal(result.source.mode, "live");
  assert.equal(result.samples.length, 337);
  assert.deepEqual(calls, ["sun", "earth", "earth"]);
  assert.equal((await getAnalysis(query)).source.mode, "cache");
  assert.equal(calls.length, 3);

  t.mock.reset();
  const rateLimited = t.mock.method(globalThis, "fetch", async () =>
    new Response(null, { status: 429, headers: { "Retry-After": "15" } }));
  await assert.rejects(getAnalysis({ ...query, altitudeKm: 1 }), {
    errorCode: "horizonsHttp",
    params: { status: 429 },
  });
  assert.equal(rateLimited.mock.callCount(), 1);
});
