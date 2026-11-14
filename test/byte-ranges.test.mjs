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
  const bytes=new ArrayBuffer(100),original={getData:async()=>bytes,getHeader:()=> 'bytes 0-99/100'};
  const result=await boundedRangeRequest('bytes=0-99',async range=>{assert.equal(range,'bytes=0-99');return original;});
  assert.equal(await result.getData(),bytes);
});

test('truncated DEM bytes are rejected even when the header looks complete',async()=>{
  await assert.rejects(()=>boundedRangeRequest('bytes=0-99',async()=>({getHeader:()=> 'bytes 0-99/100',getData:async()=>new ArrayBuffer(50)})),/Incomplete DEM range/);
});

test('a shifted HTTP Range response is rejected instead of becoming wrong elevations',async()=>{
  await assert.rejects(()=>boundedRangeRequest('bytes=1024-3071',async range=>{
    const [,a,b]=range.match(/bytes=(\d+)-(\d+)/);
    return {getData:async()=>new ArrayBuffer(+b-+a+1),getHeader:()=>`bytes ${+a+1}-${+b+1}/10000`};
  },1024));
});
