import * as THREE from 'three';
import { destination, gridHeight, moonRadius } from '/lib/terrain-math.mjs';
import { apiErrorMessage } from '/lib/api-errors.mjs';
import { language, t } from './i18n.mjs';

const rad=Math.PI/180;
export function createSurface(ground, canvas, {message,draw,moved}) {
  let site, data, request, enabled=false, keys=new Set(), last=0, frame=0, heading=0;
  const group=new THREE.Group();ground.scene.add(group);
  const status=document.querySelector('#terrain-status'), position=document.querySelector('#walk-position');
  const here=document.querySelector('#calculate-here');
  const retry=document.querySelector('#terrain-retry');
  const walking=[...document.querySelectorAll('[data-walk]'),document.querySelector('#surface-reset')];
  walking.forEach(button=>{button.disabled=true;});
  const material=new THREE.MeshStandardMaterial({color:0x858078,roughness:1,bumpScale:.055});
  let seed=421;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const image=document.createElement('canvas');image.width=image.height=512;
  const ctx=image.getContext('2d'), pixels=ctx.createImageData(512,512);
  for(let i=0;i<pixels.data.length;i+=4) {
    const value=100+Math.floor(random()*100);
    pixels.data.set([value,value,value,255],i);
  }
  ctx.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(image);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=4;texture.colorSpace=THREE.SRGBColorSpace;
  material.map=texture;material.bumpMap=texture;

  function localHeight(east,north) {
    if(!data) return null;
    const height=gridHeight(data.grids[0],east,north);
    return height===null?null:(moonRadius+height)*Math.cos(Math.hypot(east,north)/moonRadius)-(moonRadius+data.site.elevationMeters);
  }

  function clear() {
    for(const child of [...group.children]) {
      group.remove(child);child.geometry.dispose();
      if(child.material!==material) child.material.dispose();
      child.dispose?.();
    }
  }

  function geometry(grid, inner) {
    const {size,step,heights}=grid, positions=[],uv=[],indices=[];
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const east=(x-(size-1)/2)*step, north=((size-1)/2-y)*step, d=Math.hypot(east,north), a=d/moonRadius;
      const r=moonRadius+heights[y*size+x];
      // Horizontal coordinates use reference-sphere metres, consistently with
      // walking and DEM sampling. Vertical curvature remains in the geometry.
      positions.push(east,r*Math.cos(a)-(moonRadius+data.site.elevationMeters),-north);
      uv.push(east/32,north/32);
    }
    for(let y=0;y<size-1;y++) for(let x=0;x<size-1;x++) {
      const east=(x+.5-(size-1)/2)*step, north=((size-1)/2-y-.5)*step;
      if(inner && Math.max(Math.abs(east),Math.abs(north))<inner-step) continue;
      const a=y*size+x,b=a+1,c=a+size,d=c+1;indices.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }

  function build() {
    clear();
    for(let i=data.grids.length-1;i>=0;i--) {
      const mesh=new THREE.Mesh(geometry(data.grids[i],i?(data.grids[i-1].size-1)*data.grids[i-1].step/2:0),material);
      mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);
    }
    // Decorative stones have no role in the DEM, horizon, or window calculation.
    const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x77746e,roughness:1}),700);
    const dummy=new THREE.Object3D();seed=421;
    for(let i=0;i<rocks.count;i++) {
      const a=random()*Math.PI*2, d=3+Math.sqrt(random())*130, x=Math.sin(a)*d,z=Math.cos(a)*d;
      const scale=.04+Math.pow(random(),4)*.5;
      dummy.position.set(x,localHeight(x,-z)+scale*.25,z);dummy.scale.set(scale*(1+random()),scale*.65,scale);
      dummy.rotation.set(random(),random()*6,random());dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
    }
    rocks.castShadow=rocks.receiveShadow=true;group.add(rocks);
    ground.lander.position.set(4,localHeight(4,5),-5);ground.lander.rotation.y=.5;
    ground.lander.visible=true;
    ground.camera.position.set(0,1.7,0);
    walking.forEach(button=>{button.disabled=false;});
    updatePosition();
  }

  function updatePosition() {
    if(!data) return;
    const {x,z}=ground.camera.position, coords=destination(site,x,-z);
    position.textContent=`${coords.lat.toFixed(6)}°, ${coords.lon.toFixed(6)}° · ${Math.hypot(x,z).toFixed(0)} ${t('metersFromSite')}`;
    here.disabled=Math.hypot(x,z)<.5;
  }

  function localize() {
    if(data) {
      status.textContent=t('terrainQuality',{grid:Math.round(data.quality.gridMeters),height:data.site.elevationMeters.toFixed(1)});
      updatePosition();
    }
  }

  async function load() {
    if(!site||!enabled||request||data) return;
    const controller=new AbortController();request=controller;
    retry.hidden=true;
    message('terrainLoading');status.textContent=t('terrainLoading');here.disabled=true;
    try {
      const params=new URLSearchParams({lat_deg:site.lat,lon_east_deg:site.lon,receiver_height_m:document.querySelector('[name=receiver]').value});
      const reply=await fetch('/api/terrain?'+params,{signal:controller.signal});const value=await reply.json();
      if(!reply.ok) throw Object.assign(new Error(),{code:value.code,params:value.params});
      if(request!==controller) return;
      data=value;build();localize();message('');draw();
    } catch(error) {
      if(controller.signal.aborted) return;
      status.textContent=apiErrorMessage(error.code,error.params,language)||t('terrainFailed');
      retry.hidden=false;
      message('terrainFailed');
    } finally {if(request===controller) request=null;}
  }

  function stop() {keys.clear();last=0;if(frame) cancelAnimationFrame(frame);frame=0;}
  function walk(now) {
    frame=0;
    if(!enabled||!data||document.hidden||!keys.size) {last=0;return;}
    const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
    let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const length=Math.hypot(forward,side)||1;forward/=length;side/=length;
    const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?6:1.6)*dt;
    const camera=ground.camera, limit=(data.grids[0].size-1)*data.grids[0].step*.43;
    const x=THREE.MathUtils.clamp(camera.position.x+(Math.sin(heading)*forward+Math.cos(heading)*side)*speed,-limit,limit);
    const z=THREE.MathUtils.clamp(camera.position.z+(-Math.cos(heading)*forward+Math.sin(heading)*side)*speed,-limit,limit);
    camera.position.set(x,localHeight(x,-z)+1.7,z);updatePosition();draw();frame=requestAnimationFrame(walk);
  }
  canvas.addEventListener('keydown',event=>{
    if(!enabled||!['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(event.code)) return;
    event.preventDefault();keys.add(event.code);if(!frame) frame=requestAnimationFrame(walk);
  });
  canvas.addEventListener('keyup',event=>keys.delete(event.code));
  canvas.addEventListener('blur',stop);window.addEventListener('blur',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stop();});
  document.querySelector('#surface-reset').addEventListener('click',()=>{if(data) {stop();ground.camera.position.set(0,1.7,0);updatePosition();draw();canvas.focus();}});
  retry.addEventListener('click',load);
  here.addEventListener('click',()=>{if(!data) return;const coords=destination(site,ground.camera.position.x,-ground.camera.position.z);moved({lat:Number(coords.lat.toFixed(6)),lon:Number(coords.lon.toFixed(6))});});
  for(const button of document.querySelectorAll('[data-walk]')) {
    const release=()=>{keys.delete(button.dataset.walk);};
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(button.dataset.walk);if(!frame) frame=requestAnimationFrame(walk);});
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  }
  return {
    setSite(next) {
      if(site?.lat===next.lat&&site?.lon===next.lon) return;
      request?.abort();request=null;data=null;site=next;stop();clear();ground.lander.visible=false;here.disabled=true;walking.forEach(button=>{button.disabled=true;});position.textContent='';load();
    },
    show(value) {enabled=value;if(value) load();else stop();},
    update(angles,yaw) {
      heading=yaw*rad;
      if(angles) {
        const az=angles.sunAz*rad,el=angles.sunEl*rad;
        ground.light.position.set(Math.cos(el)*Math.sin(az)*2000,Math.sin(el)*2000,-Math.cos(el)*Math.cos(az)*2000).add(ground.camera.position);
        ground.light.target.position.copy(ground.camera.position);ground.light.target.updateMatrixWorld();
        ground.light.intensity=angles.sunEl>-.27?3.1:0;
      }
    },localize,
  };
}
