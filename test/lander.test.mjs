import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLander,placeLander,landerOccludes } from '../public/lander.mjs';

// Geometry/placement is tested without a renderer or a browser canvas.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}})})};
function footContacts(lander) {
  lander.updateMatrixWorld(true);const points=[];
  lander.traverse(object=>{
    const p=object.geometry?.parameters;
    if(p?.radiusBottom===.3&&p.height===.06) points.push(object.localToWorld(new THREE.Vector3(0,-.03,0)));
  });
  return points;
}
test('all four lander pads contact sloping terrain for different headings',()=>{
  for(const yaw of [0,-.45,1.8]) {
    const lander=createLander(),height=(x,z)=>.18*x+.26*z;
    placeLander(lander,height,{yaw});
    const points=footContacts(lander);
    assert.equal(points.length,4);
    for(const p of points) assert.ok(Math.abs(p.y-height(p.x,p.z))<.03,`footpad gap: ${(p.y-height(p.x,p.z)).toFixed(3)} m`);
  }
});
test('feet also adapt when they straddle a terrain triangle boundary',()=>{
  const lander=createLander(),height=(x,z)=>.12*x+.1*z+.09*Math.abs(x-5);
  placeLander(lander,height);
  for(const p of footContacts(lander)) assert.ok(Math.abs(p.y-height(p.x,p.z))<.03);
});
test('a sky label is occluded by the lander instead of drawing through its hull',()=>{
  const lander=createLander();placeLander(lander,()=>0,{x:0,z:0,yaw:0});lander.visible=true;
  assert.equal(landerOccludes(lander,new THREE.Vector3(0,1.5,4),new THREE.Vector3(0,1.5,-100000)),true);
  assert.equal(landerOccludes(lander,new THREE.Vector3(0,1.5,4),new THREE.Vector3(0,100000,4)),false);
});
