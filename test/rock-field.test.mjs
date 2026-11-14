import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createRockField} from '../public/rock-field.mjs';
import {destination} from '../lib/terrain-math.mjs';
import {lunarBasis} from '../lib/surface-world.mjs';

test('rendered rock batches populate distant terrain and reproduce the same matrices on return',()=>{
  globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})})};
  const parent=new THREE.Group(),field=createRockField(parent),site={lat:-80.1276,lon:1.4367};
  const snapshot=()=>parent.children[0].children.map(mesh=>({count:mesh.count,hash:createHash('sha256').update(Buffer.from(mesh.instanceMatrix.array.buffer,0,mesh.count*16*4)).digest('hex')}));
  field.update(site,site,()=>0);const original=snapshot();
  assert.ok(field.stats().instances>300);assert.ok(field.obstacles().length>0);
  const far=destination(site,5000,0);field.update(far,far,()=>0,{force:true});
  assert.ok(field.stats().instances>300);
  field.update(site,site,()=>0,{force:true});assert.deepEqual(snapshot(),original);
  assert.ok(field.stats().cells<=512);
  delete globalThis.document;
});

test('boulders keep their lunar orientation when the walking frame changes near a pole',()=>{
  globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})})};
  const parent=new THREE.Group(),field=createRockField(parent),site={lat:89.999,lon:10},next=destination(site,800,200);
  function orientation(frame) {
    field.update(site,frame,()=>0,{force:true});const mesh=parent.children[0].children[2];assert.ok(mesh.count>0);
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();mesh.getMatrixAt(0,matrix);matrix.decompose(new THREE.Vector3(),q,new THREE.Vector3());
    const b=lunarBasis(frame),basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(...b.east),new THREE.Vector3(...b.up),new THREE.Vector3(...b.north).negate());
    return new THREE.Quaternion().setFromRotationMatrix(basis).multiply(q);
  }
  const original=orientation(site),rebased=orientation(next);
  assert.ok(Math.abs(original.dot(rebased))>1-1e-6);delete globalThis.document;
});
