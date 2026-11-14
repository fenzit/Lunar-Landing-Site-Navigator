const rad = Math.PI / 180;

export function normalizeLongitude(lon) {
  return lon >= -180 && lon < 180 ? lon : ((lon + 180) % 360 + 360) % 360 - 180;
}

export function moonDirection(lat, lon) {
  const horizontal = Math.cos(lat * rad);
  return [horizontal * Math.sin(lon * rad), Math.sin(lat * rad), horizontal * Math.cos(lon * rad)];
}

export function moonCoordinates(x, y, z) {
  return {
    lat: Number((Math.atan2(y, Math.hypot(x, z)) / rad).toFixed(6)),
    lon: normalizeLongitude(Number((Math.atan2(x, z) / rad).toFixed(6))),
  };
}

export function skyDirection(az, el) {
  const horizontal = Math.cos(el * rad);
  return [horizontal * Math.sin(az * rad), Math.sin(el * rad), -horizontal * Math.cos(az * rad)];
}

export function heightAt(elevations, lat, lon) {
  const width = 1440, height = 720;
  const col = (normalizeLongitude(lon) + 180) * 4 - 0.5;
  const row = Math.max(0, Math.min(height - 1, (90 - lat) * 4 - 0.5));
  const x0 = Math.floor(col), y0 = Math.floor(row);
  const y1 = Math.min(height - 1, y0 + 1);
  const xf = col - x0, yf = row - y0;
  const at = (x, y) => elevations[y * width + (x + width) % width];
  const top = at(x0, y0) * (1 - xf) + at(x0 + 1, y0) * xf;
  const bottom = at(x0, y1) * (1 - xf) + at(x0 + 1, y1) * xf;
  return top * (1 - yf) + bottom * yf;
}
