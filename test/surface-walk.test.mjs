import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSurface } from '../public/surface.mjs';
import { createLander } from '../public/lander.mjs';
import { surfaceOffset } from '../lib/surface-world.mjs';

class Node extends EventTarget {
  constructor(){super();this.dataset={};this.disabled=false;this.hidden=false;this.textContent='';}
  setAttribute(){} focus(){} setPointerCapture(){}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({stall=false}={}) {
  const previous=Object.fromEntries(['document','window','fetch','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,globalThis[key]]));
  const nodes=new Map(),buttons=['KeyW','KeyA','KeyS','KeyD'].map(code=>{const node=new Node();node.dataset.walk=code;return node;});
  const document=new Node();document.hidden=false;
  document.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};
  document.querySelectorAll=()=>buttons;
  document.createElement=()=>({width:0,height:0,getContext:()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}})});
  globalThis.document=document;globalThis.window=new Node();
  let calls=0,id=0,time=0,captured=null;const frames=new Map();
  globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.fetch=async url=>{
    const params=new URL(url,'http://localhost').searchParams;
    const site={lat:+params.get('lat_deg'),lon:+params.get('lon_east_deg'),elevationMeters:100};
    const landscape=params.get('detail')==='landscape';if(!landscape)calls++;
    if(stall&&!landscape&&calls>1)return new Promise(()=>{});
    return {ok:true,json:async()=>({site,quality:{gridMeters:20},grids:[{size:129,step:20,heights:Array(129*129).fill(100)},...(landscape?[{size:65,step:80,heights:Array(65*65).fill(100)}]:[])]})};
  };
  const canvas=new Node(),ground={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),light:new THREE.DirectionalLight(),lander:createLander()};
  const controller=createSurface(ground,canvas,{message(){},draw(){},aim(){},moved:p=>{captured=p;},makeDetails:()=>({update(){},clear(){},obstacles:()=>[]})});
  const origin={lat:-80.1276,lon:1.4367};controller.setSite(origin);controller.show(true);await tick();await tick();
  controller.update(null,90,0);
  function key(code){const event=new Event('keydown',{cancelable:true});event.code=code;canvas.dispatchEvent(event);}
  key('ShiftLeft');key('KeyW');
  return {nodes,ground,origin,get calls(){return calls;},get captured(){return captured;},async run(count){
    for(let i=0;i<count;i++){time+=50;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(time);if(i%50===0)await tick();}
    await tick();
  },close(){controller.show(false);controller.setSite({lat:0,lon:0});for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}

test('actual walking controller travels over two kilometres while preserving the analysis point',async()=>{
  const app=await setup();try {
    await app.run(7200);
    app.nodes.get('#calculate-here').dispatchEvent(new Event('click'));
    const distance=surfaceOffset(app.origin,app.captured);
    assert.ok(Math.hypot(distance.east,distance.north)>2000);
    assert.ok(app.calls>=4);assert.deepEqual(app.origin,{lat:-80.1276,lon:1.4367});
  } finally {app.close();}
});
test('walking waits inside measured ground if the next terrain request stalls',async()=>{
  const app=await setup({stall:true});try {
    await app.run(7200);
    app.nodes.get('#calculate-here').dispatchEvent(new Event('click'));
    const p=surfaceOffset(app.origin,app.captured);
    assert.ok(p.east>1200&&p.east<=1241);
    assert.match(app.nodes.get('#terrain-status').textContent,/waiting for measured ground/);
    assert.ok(Number.isFinite(app.ground.camera.position.y));
  } finally {app.close();}
});
