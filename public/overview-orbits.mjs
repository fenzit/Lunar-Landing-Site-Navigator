import {moonDirection} from '../lib/geography.mjs';

// Display distances are compressed. This changes the overview's origin, not
// the Moon-fixed JPL directions or the terrain visibility calculation.
export const overviewDistances = Object.freeze({sun:52, earth:17});

export function overviewPositions(sky, rotation) {
  const c=Math.cos(rotation),s=Math.sin(rotation);
  const rotate=([x,y,z],distance)=>[(c*x+s*z)*distance,y*distance,(-s*x+c*z)*distance];
  const moon=rotate(moonDirection(sky.sunLat,sky.sunLon),-overviewDistances.sun);
  const moonToEarth=rotate(moonDirection(sky.earthLat,sky.earthLon),overviewDistances.earth);
  return {sun:[0,0,0],moon,earth:moon.map((value,i)=>value+moonToEarth[i])};
}
