import test from 'node:test';
import assert from 'node:assert/strict';
import { clearanceSamples, destination, gridHeight, horizonAt, moonRadius, terrainAngle } from '../lib/terrain-math.mjs';
import { applyTerrain } from '../lib/terrain.mjs';
import { horizonsUrl, normalizeCoordinates } from '../lib/horizons.mjs';

test('horizon rays include lunar curvature and equipment height',()=>{
  assert.ok(terrainAngle(100000,0,2)<-1.6);
  assert.ok(terrainAngle(1000,200,2)>11);
  assert.ok(terrainAngle(1000,200,20)<terrainAngle(1000,200,2));
  const dipDistance=Math.sqrt(2*moonRadius*2);
  assert.ok(Math.abs(terrainAngle(dipDistance,0,2)+Math.sqrt(4/moonRadius)*180/Math.PI)<.00001);
});

test('terrain horizon interpolates across north',()=>{
  const h=[2,4,6,8];
  assert.equal(horizonAt(h,360),2);
  assert.equal(horizonAt(h,315),5);
  assert.equal(horizonAt(h,-45),5);
});

test('ridge between ephemeris samples closes and reopens a window',()=>{
  const samples=[{t:0,sunAz:0,sunEl:2,earthAz:0,earthEl:20},{t:3600000,sunAz:90,sunEl:2,earthAz:90,earthEl:20}];
  const horizon=Array(360).fill(0);horizon[45]=4;
  const dense=clearanceSamples(samples,horizon);
  assert.ok(dense.some(s=>s.sunClearance===-2));
  const data=applyTerrain({samples}, {horizon,receiverHeight:2,grids:[]});
  assert.equal(data.windows.both.length,2);
  assert.ok(data.summary.totalMs<3600000);
  assert.equal(data.windows.both[0].openEnd,true);
});

test('north seam crossing does not scan almost a full circle',()=>{
  const a={t:0,sunAz:359,sunEl:2,earthAz:359,earthEl:3}, b={...a,t:1000,sunAz:1,earthAz:1};
  const dense=clearanceSamples([a,b],Array(720).fill(0));
  assert.equal(dense.length,5);
  assert.ok(dense.every(s=>s.sunAz>=359||s.sunAz<=1));
});

test('walking height follows the rendered triangle rather than floating above a saddle',()=>{
  const grid={size:2,step:2,heights:[0,0,0,10]};
  assert.equal(gridHeight(grid,0,0),0);
  assert.equal(gridHeight(grid,.5,-.5),5);
  assert.equal(gridHeight(grid,2,0),null);
});

test('walking coordinates remain finite at both exact poles and wrap longitude',()=>{
  for(const lat of [-90,90]) for(const lon of [-180,0,87]) {
    for(const [e,n] of [[10,0],[0,10],[-10,10]]) {
      const p=destination({lat,lon},e,n);
      assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lon));
      assert.ok(Math.abs(p.lat)<90&&Math.abs(p.lat)>89.99);
      assert.ok(p.lon>=-180&&p.lon<180);
    }
  }
  assert.ok(destination({lat:0,lon:179.99999},10,0).lon<0);
  assert.equal(normalizeCoordinates(new URLSearchParams({lat_deg:'90',lon_east_deg:'180'})).lat,90);
});

test('JPL observer altitude uses DEM elevation plus equipment height',()=>{
  const url=horizonsUrl({lat:-80,lon:1,start:Date.UTC(2026,10,14),end:Date.UTC(2026,10,15),step:30,altitudeKm:2.583568},'sun');
  assert.equal(url.searchParams.get('SITE_COORD'),"'1,-80,2.583568'");
});
