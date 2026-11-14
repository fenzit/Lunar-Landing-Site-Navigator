import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceStream } from '../lib/surface-stream.mjs';
import { destination } from '../lib/terrain-math.mjs';
const patch=site=>({site:{...site,elevationMeters:100},grids:[{size:129,step:20,heights:Array(129*129).fill(100)}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('measured terrain is prefetched beyond the old kilometre limit and the cache stays bounded',async()=>{
  const origin={lat:-80.1276,lon:1.4367},adopted=[];
  const stream=new SurfaceStream({load:async site=>patch(site),onPatch:p=>adopted.push(p),capacity:4});
  stream.reset(patch(origin));
  for(let distance=650;distance<=6500;distance+=650) {stream.update(destination(origin,distance,0));await tick();}
  assert.ok(adopted.length>=7);assert.ok(stream.cache.size<=4);
  assert.ok(Math.abs(stream.current.site.lon-origin.lon)>.1);
});
test('failed streaming retains valid measured terrain and supports retry',async()=>{
  let fail=true,now=0;const original=patch({lat:0,lon:0});
  const stream=new SurfaceStream({load:async site=>{if(fail) throw new Error('network');return patch(site);},onPatch:()=>{},now:()=>now});
  stream.reset(original);stream.update(destination(original.site,700,0));await tick();
  assert.equal(stream.current,original);assert.ok(stream.error);
  fail=false;now=5001;stream.retry();await tick();assert.notEqual(stream.current,original);assert.equal(stream.error,null);
});
test('a late response cannot replace terrain after selecting a new landing site',async()=>{
  let resolve;
  const stream=new SurfaceStream({load:()=>new Promise(r=>{resolve=r;}),onPatch:()=>assert.fail('stale patch adopted')});
  const original=patch({lat:0,lon:0});stream.reset(original);stream.update(destination(original.site,700,0));await tick();
  const other=patch({lat:-85,lon:25});stream.reset(other);resolve(patch({lat:0,lon:.02}));await tick();
  assert.equal(stream.current,other);
});
test('a completed prefetch does not move the overview camera and is adopted on returning to walking',async()=>{
  let resolve;
  const stream=new SurfaceStream({load:site=>new Promise(r=>{resolve=()=>r(patch(site));}),onPatch:()=>{}});
  const original=patch({lat:0,lon:0}),point=destination(original.site,700,0);
  stream.reset(original);stream.update(point);await tick();stream.update(point,{paused:true});resolve();await tick();
  assert.equal(stream.current,original);stream.update(point);assert.notEqual(stream.current,original);
});
