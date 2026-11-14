import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedRangeRequest } from '../lib/byte-ranges.mjs';

test('merged DEM strips are fetched in bounded chunks and reconstructed byte for byte',async()=>{
  const source=Uint8Array.from({length:10003},(_,i)=>i%251),requests=[];
  const response=await boundedRangeRequest('bytes=37-9842',async range=>{
    const [,a,b]=range.match(/bytes=(\d+)-(\d+)/),start=+a,end=+b;
    assert.ok(end-start+1<=1024,'upstream must never receive the oversized merged strip request');
    requests.push([start,end]);
    return {getData:async()=>source.slice(start,end+1).buffer,getHeader:()=>`bytes ${start}-${end}/${source.length}`};
  },1024);
  assert.equal(requests.length,10);
  assert.equal(response.getHeader('content-range'),'bytes 37-9842/10003');
  assert.deepEqual(new Uint8Array(await response.getData()),source.slice(37,9843));
});

test('a small DEM range is passed through without extra allocation',async()=>{
  const original={ok:true};
  assert.equal(await boundedRangeRequest('bytes=0-99',async range=>{assert.equal(range,'bytes=0-99');return original;}),original);
});
