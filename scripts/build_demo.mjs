import { writeFile } from "node:fs/promises";
import { demoAnalysis } from "../lib/horizons.mjs";
import { sites } from "../lib/sites.mjs";

for (const site of sites) {
  const analysis = await demoAnalysis(site);
  await writeFile(`data/demo/${site.id}-analysis.json`, JSON.stringify(analysis));
  console.log(`${site.name}: ${analysis.samples.length} отсчётов`);
}
