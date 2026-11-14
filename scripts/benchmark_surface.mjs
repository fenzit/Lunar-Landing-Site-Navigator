import assert from 'node:assert/strict';

const origin=process.env.LUNARPILOT_ORIGIN??'http://127.0.0.1:4173';
const params=new URLSearchParams({lat_deg:-80.12761,lon_east_deg:1.43671,detail:'surface'});
const start=performance.now();
const response=await fetch(`${origin}/api/terrain?${params}`);
const text=await response.text(),data=JSON.parse(text);
console.log(JSON.stringify({status:response.status,milliseconds:Math.round(performance.now()-start),bytes:Buffer.byteLength(text),grids:data.grids?.map(g=>g.size),horizonSamples:data.horizon?.length??0}));
assert.equal(response.status,200);
assert.equal(data.grids.length,1,'First walking geometry must not wait for distant meshes');
assert.ok(data.grids[0].heights.length>10000);
assert.ok(!('horizon' in data),'First walking geometry must not wait for scientific horizon calculation');
