import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyScatterCells,scatterCell,scatterKey } from '../lib/lunar-scatter.mjs';
import { destination } from '../lib/terrain-math.mjs';

test('procedural stones retain identity and coordinates after eviction and revisiting',()=>{
  const site={lat:-80.1276,lon:1.4367},cells=nearbyScatterCells(site);
  const original=cells.slice(0,8).flatMap(scatterCell);
  nearbyScatterCells(destination(site,8000,15000)).flatMap(scatterCell);
  assert.deepEqual(cells.slice(0,8).flatMap(scatterCell),original);
  assert.ok(original.some(p=>p.kind==='boulder'));
});
test('decoration covers distant walking positions, including cube seams and polar regions',()=>{
  for(const site of [{lat:-80.1276,lon:1.4367},{lat:35.264389,lon:45},{lat:90,lon:21},{lat:0,lon:179.999}]) {
    const near=nearbyScatterCells(site),far=nearbyScatterCells(destination(site,5000,2000));
    assert.ok(near.length>20&&far.length>20);
    assert.equal(new Set(near.map(scatterKey)).size,near.length);
    assert.ok(far.flatMap(scatterCell).length>200);
    assert.equal(far.some(c=>new Set(near.map(scatterKey)).has(scatterKey(c))),false);
  }
});
