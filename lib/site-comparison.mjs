import { searchRange, suitableCandidates } from './start-search.mjs';
import { minute } from './windows.mjs';

function invalid(code) { throw Object.assign(new RangeError(code), { code }); }

export function comparisonParameters({ start, end, required, height, step, points }) {
  const range = searchRange(start, end, required);
  height = Number(height); step = Number(step);
  if (!Number.isFinite(height) || height < 0 || height > 100) invalid('receiverHeight');
  if (![1, 5, 10, 15, 30, 60].includes(step) || Math.ceil((range.end - range.start) / (step * minute)) > 2000) invalid('comparisonStepError');
  if (points?.length !== 2 || points.some(p =>
    !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lon) || Math.abs(p.lon) > 180)) invalid('coordinates');
  return { ...range, height, step, points: points.map(p => ({
    ...p, lat: Number(p.lat.toFixed(6)), lon: Math.round(p.lon * 1e6) === 180e6 ? -180 : Number(p.lon.toFixed(6)),
  })) };
}

export function comparisonUrl(point, snapshot) {
  const iso = time => new Date(time).toISOString().replace('.000', '');
  return '/api/analysis?' + new URLSearchParams({
    lat_deg: point.lat, lon_east_deg: point.lon, start_utc: iso(snapshot.start), end_utc: iso(snapshot.end),
    step_minutes: snapshot.step, receiver_height_m: snapshot.height,
  });
}

export function comparisonResult(analysis, snapshot, point) {
  // A source returning another site or range cannot silently enter a comparison.
  if (analysis.period.start !== snapshot.start || analysis.period.end !== snapshot.end ||
      analysis.period.stepMinutes !== snapshot.step || analysis.site.lat !== point.lat || analysis.site.lon !== point.lon ||
      analysis.terrain?.receiverHeight !== snapshot.height || !analysis.model?.version) invalid('comparisonMismatch');
  const candidates = suitableCandidates(analysis, snapshot.required);
  return { analysis, candidates, state: !analysis.windows.both.length ? 'empty' : !candidates.length ? 'short' : 'ready',
    clipped: analysis.windows.both.some(w => w.clippedEnd), version: analysis.model.version };
}

// Each successful side is published immediately. A failed B never discards A;
// cancellation and superseded runs cannot publish late responses.
export class SiteComparison {
  generation = 0;
  cancel() { this.generation++; this.controller?.abort(); this.controller = null; }

  async run(snapshot, load, onUpdate) {
    this.cancel();
    const id = this.generation, controller = this.controller = new AbortController();
    const rows = snapshot.points.map(point => ({ point, state: 'pending' }));
    const publish = () => onUpdate({ snapshot, rows: rows.map(row => ({ ...row })) });
    publish();
    for (const [index, point] of snapshot.points.entries()) {
      if (id !== this.generation) return false;
      rows[index].state = 'loading'; publish();
      try {
        const data = await load(point, snapshot, controller.signal);
        if (id !== this.generation) return false;
        rows[index] = { point, ...comparisonResult(data, snapshot, point) };
      } catch (error) {
        if (id !== this.generation) return false;
        rows[index] = { point, state: 'error', error };
      }
      publish();
    }
    if (id === this.generation) this.controller = null;
    return true;
  }
}
