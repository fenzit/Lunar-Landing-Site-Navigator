import test from 'node:test';
import assert from 'node:assert/strict';
import { destination,moonRadius } from '../lib/terrain-math.mjs';
import { changeDirection,surfaceOffset,walkingCoordinates } from '../lib/surface-world.mjs';

test('walking frame changes preserve geographic position across longitude seams and poles',()=>{
  for(const origin of [{lat:-80.1276,lon:1.4367},{lat:89.999,lon:179.99},{lat:-90,lon:42},{lat:0,lon:179.999}]) {
    const point=destination(origin,4200,1700),next=destination(origin,4000,1500),offset=surfaceOffset(next,point);
    const restored=walkingCoordinates(next,{x:offset.east,z:-offset.north});
    const error=surfaceOffset(point,restored);assert.ok(Math.hypot(error.east,error.north)<.0001);
  }
});
test('reorienting the sky in a new frame preserves the same direction',()=>{
  const a={lat:-80,lon:1},b={lat:-82,lon:25};
  const c=changeDirection(315,7,a,b),back=changeDirection(c.azimuth,c.elevation,b,a);
  assert.ok(Math.abs(back.azimuth-315)<1e-9);assert.ok(Math.abs(back.elevation-7)<1e-9);
  assert.ok(Math.hypot(...Object.values(surfaceOffset({lat:0,lon:0},{lat:0,lon:180})))-Math.PI*moonRadius<1e-6);
});
