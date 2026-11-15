import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSun} from '../public/sun.mjs';

test('animated corona fades near and behind the camera, then returns at a safe distance',t=>{
  const originalDocument=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({
    createRadialGradient:()=>({addColorStop(){}}),fillRect(){},
  })})};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;});
  const {mesh}=createSun(9),corona=mesh.children[0],world=new THREE.Scene();
  world.add(mesh);
  const camera=new THREE.PerspectiveCamera(43,1,.05,1200);
  camera.position.set(0,0,55);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const drawAt=z=>{
    mesh.position.set(0,0,z);world.updateMatrixWorld(true);
    corona.onBeforeRender(null,world,camera,null,corona.material,null);
    return corona.material.opacity;
  };
  assert.equal(drawAt(52),0,'A near-camera corona must not flood the viewport');
  const fading=drawAt(28);
  assert.ok(fading>0&&fading<1,'The halo must fade smoothly instead of flashing on');
  assert.equal(drawAt(60),0,'A Sun behind the camera must not contribute a halo');
  assert.equal(drawAt(0),1,'Normal solar glow must return after the Sun moves away');
});
