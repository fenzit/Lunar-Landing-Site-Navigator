export const minute = 60_000;
export const hour = 60 * minute;

export function interpolateAngle(a, b, fraction) {
  return (a + fraction * (((b - a + 540) % 360) - 180) + 360) % 360;
}

export function visibleWindows(samples, elevation) {
  const windows = [];
  for (let index = 1; index < samples.length; index++) {
    const left = samples[index - 1];
    const right = samples[index];
    const a = left[elevation], b = right[elevation];
    if (a <= 0 && b <= 0) continue;
    const zero = a > 0 && b > 0 ? null : left.t - a / (b - a) * (right.t - left.t);
    const start = a > 0 ? left.t : zero;
    const end = b > 0 ? right.t : zero;
    const previous = windows.at(-1);
    if (previous?.end === start && a > 0) {
      previous.end = end;
      previous.openEnd = b <= 0;
    } else {
      windows.push({ start, end, openStart: a <= 0, openEnd: b <= 0 });
    }
  }
  return windows.map(window => ({
    ...window,
    clippedStart: window.start === samples[0].t && !window.openStart,
    clippedEnd: window.end === samples.at(-1).t && !window.openEnd,
  }));
}

export function intersect(sun, earth) {
  const both = [];
  let i = 0, j = 0;
  while (i < sun.length && j < earth.length) {
    const a = sun[i], b = earth[j];
    const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
    if (start < end) {
      const openStart = (a.start === start && a.openStart) || (b.start === start && b.openStart);
      const openEnd = (a.end === end && a.openEnd) || (b.end === end && b.openEnd);
      both.push({
        start, end, openStart, openEnd,
        clippedStart: a.clippedStart && b.clippedStart,
        clippedEnd: a.clippedEnd && b.clippedEnd,
      });
    }
    if (a.end <= b.end) i++;
    if (b.end <= a.end) j++;
  }
  return both;
}

export function atTime(samples, t, step) {
  if (t < samples[0].t || t > samples.at(-1).t) throw new RangeError("Время вне расчётного периода");
  const index = Math.min(Math.floor((t - samples[0].t) / step), samples.length - 2);
  const a = samples[index], b = samples[index + 1];
  const fraction = (t - a.t) / (b.t - a.t);
  const elevation = key => a[key] + fraction * (b[key] - a[key]);
  const azimuth = key => interpolateAngle(a[key], b[key], fraction);
  return {
    t, sunEl: elevation("sunEl"), earthEl: elevation("earthEl"),
    sunAz: azimuth("sunAz"), earthAz: azimuth("earthAz"),
  };
}

export function skyAtTime(samples, t, step) {
  if (t < samples[0].t || t > samples.at(-1).t) return null;
  const index = Math.min(Math.floor((t - samples[0].t) / step), samples.length - 2);
  const a = samples[index], b = samples[index + 1];
  const fraction = (t - a.t) / (b.t - a.t);
  return {
    sunLat: a.sunLat + fraction * (b.sunLat - a.sunLat),
    earthLat: a.earthLat + fraction * (b.earthLat - a.earthLat),
    sunLon: interpolateAngle(a.sunLon, b.sunLon, fraction),
    earthLon: interpolateAngle(a.earthLon, b.earthLon, fraction),
  };
}
// Use whole minutes for selectable starts. An exact zero is an open boundary.
export function suitableStarts(windows, requiredHours) {
  return windows.flatMap(window => {
    let start = Math.ceil(window.start / minute) * minute;
    if (window.openStart && start === window.start) start += minute;
    const end = Math.floor((window.end - requiredHours * hour) / minute) * minute;
    return start <= end ? [{ start, end }] : [];
  });
}

export function landingResult(windows, t, requiredHours) {
  const current = windows.find(window =>
    (t > window.start || (t === window.start && !window.openStart)) &&
    (t < window.end || (t === window.end && !window.openEnd)));
  const remaining = current ? current.end - t : 0;
  const sufficient = remaining >= requiredHours * hour;
  const next = suitableStarts(windows, requiredHours).find(window => window.end >= t);
  return {
    remaining, sufficient, clipped: current?.clippedEnd ?? false,
    next: next ? Math.max(t, next.start) : null,
  };
}
