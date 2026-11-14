import { normalizeLongitude } from "./geography.mjs";
import { destination, elevationClearance } from "./terrain-math.mjs";
import { atTime, minute } from "./windows.mjs";

export function visibilityGrid(center, spacing) {
  const points = [];
  for (const north of [spacing, 0, -spacing]) {
    for (const east of [-spacing, 0, spacing]) {
      const { lat, lon } = destination(center, east, north);
      points.push({
        lat: Number(lat.toFixed(6)),
        lon: normalizeLongitude(Number(lon.toFixed(6))),
      });
    }
  }
  return points;
}

export async function runVisibilityBatch(points, time, loadAnalysis, { signal, onPoint }) {
  for (const [index, point] of points.entries()) {
    if (signal?.aborted) break;

    let result;
    try {
      const analysis = await loadAnalysis(point, signal);
      const angles = atTime(analysis.samples, time, analysis.period.stepMinutes * minute);
      const bodies = {};
      for (const body of ["sun", "earth"]) {
        const clearance = elevationClearance(angles[`${body}El`], angles[`${body}Az`], analysis.terrain.horizon);
        bodies[body] = { clearance, visible: clearance > 0 };
      }
      result = { point, bodies, windows: analysis.windows };
    } catch (error) {
      result = { point, error };
    }

    if (signal?.aborted) break;
    onPoint(result, index);
  }
}
