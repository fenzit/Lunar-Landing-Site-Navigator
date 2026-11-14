import * as THREE from 'three';
import { destination, gridHeight, moonRadius, terrainLookout } from '/lib/terrain-math.mjs';
import { apiErrorMessage } from '/lib/api-errors.mjs';
import { language, t } from './i18n.mjs';
import { createRegolith } from './regolith.mjs';

const rad=Math.PI/180;
export function createSurface(ground, canvas, {message,draw,moved,aim}) {
  let site, data, request, enabled=false, keys=new Set(), last=0, frame=0, heading=0;
  const group=new THREE.Group();ground.scene.add(group);
  const status=document.querySelector('#terrain-status'), position=document.querySelector('#walk-position');
  const here=document.querySelector('#calculate-here');
  const retry=document.querySelector('#terrain-retry');
  const overviewButton=document.querySelector('#surface-overview');
  let overview=false, walkingPosition=null, landscapePending=false, lightPending=true;
  const walking=[...document.querySelectorAll('[data-walk]'),document.querySelector('#surface-reset'),document.querySelector('#surface-lookout')];
  walking.forEach(button=>{button.disabled=true;});
  const material=createRegolith();
  let seed=421;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

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
    const {size,step,heights}=grid, positions=[],uv=[],indices=[],occlusion=[];
    const radius=Math.max(1,Math.round(160/step));
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const east=(x-(size-1)/2)*step, north=((size-1)/2-y)*step, d=Math.hypot(east,north), a=d/moonRadius;
      const r=moonRadius+heights[y*size+x];
      // Horizontal coordinates use reference-sphere metres, consistently with
      // walking and DEM sampling. Vertical curvature remains in the geometry.
      positions.push(east,r*Math.cos(a)-(moonRadius+data.site.elevationMeters),-north);
      uv.push(east/32,north/32);
      let surrounding=0,count=0;
      for(const dy of [-radius,0,radius]) for(const dx of [-radius,0,radius]) {
        if(!dx&&!dy) continue;
        const sx=Math.max(0,Math.min(size-1,x+dx)),sy=Math.max(0,Math.min(size-1,y+dy));
        surrounding+=heights[sy*size+sx];count++;
      }
      // Approximate reduced sky exposure inside measured depressions. Only
      // indirect light is affected; neither elevations nor sunlight are changed.
      occlusion.push(.45+.55*Math.exp(-Math.max(0,surrounding/count-heights[y*size+x])/9));
    }
    for(let y=0;y<size-1;y++) for(let x=0;x<size-1;x++) {
      const east=(x+.5-(size-1)/2)*step, north=((size-1)/2-y-.5)*step;
      if(inner && Math.max(Math.abs(east),Math.abs(north))<inner-step) continue;
      const a=y*size+x,b=a+1,c=a+size,d=c+1;indices.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('terrainAO',new THREE.Float32BufferAttribute(occlusion,1));g.setIndex(indices);g.computeVertexNormals();return g;
  }

  function build(preserve=false) {
    clear();
    for(let i=data.grids.length-1;i>=0;i--) {
      const mesh=new THREE.Mesh(geometry(data.grids[i],i?(data.grids[i-1].size-1)*data.grids[i-1].step/2:0),material);
      mesh.receiveShadow=true;mesh.castShadow=i<2;group.add(mesh);
    }
    // Decorative stones have no role in the DEM, horizon, or window calculation.
    const stoneGeometry=new THREE.IcosahedronGeometry(1,1);
    const vertices=stoneGeometry.getAttribute('position');
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
      const factor=.85+.13*Math.sin(x*13+y*17+z*11);
      vertices.setXYZ(i,x*factor,y*factor,z*factor);
    }
    stoneGeometry.computeVertexNormals();
    const rocks=new THREE.InstancedMesh(stoneGeometry,new THREE.MeshStandardMaterial({color:0x777772,roughness:.95}),1800);
    const dummy=new THREE.Object3D();seed=421;
    for(let i=0;i<rocks.count;i++) {
      const a=random()*Math.PI*2, d=2+Math.pow(random(),.7)*90, x=Math.sin(a)*d,z=Math.cos(a)*d;
      const scale=.012+Math.pow(random(),9)*.65;
      dummy.position.set(x,localHeight(x,-z)+scale*.18,z);dummy.scale.set(scale*(1+random()*.7),scale*.55,scale);
      dummy.rotation.set(random(),random()*6,random());dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
    }
    rocks.castShadow=rocks.receiveShadow=true;group.add(rocks);
    ground.lander.position.set(5,localHeight(5,8),-8);ground.lander.rotation.y=-.45;
    ground.lander.visible=true;
    if(!preserve) ground.camera.position.set(0,localHeight(0,0)+1.7,0);
    walking.forEach(button=>{button.disabled=false;});
    updatePosition();
    overviewButton.disabled=data.grids.length<2;
  }

  function updatePosition() {
    if(!data) return;
    const {x,z}=overview&&walkingPosition?walkingPosition:ground.camera.position, coords=destination(site,x,-z);
    position.textContent=`${coords.lat.toFixed(6)}°, ${coords.lon.toFixed(6)}° · ${Math.hypot(x,z).toFixed(0)} ${t('metersFromSite')}`;
    here.disabled=overview||Math.hypot(x,z)<.5;
  }

  function localize() {
    if(data) {
      status.textContent=t('terrainQuality',{grid:Math.round(data.quality.gridMeters),height:data.site.elevationMeters.toFixed(1)})+(landscapePending?' · '+t('landscapeLoading'):'')+(lightPending?' · '+t('surfaceLightPending'):'');
      overviewButton.textContent=t(overview?'backToGround':'terrainOverview');
      updatePosition();
    }
  }

  async function load() {
    if(!site||!enabled||request||data?.grids.length>1) return;
    const controller=new AbortController();request=controller;
    retry.hidden=true;
    message('terrainLoading');status.textContent=t('terrainLoading');here.disabled=true;
    try {
      const params=new URLSearchParams({lat_deg:site.lat,lon_east_deg:site.lon,detail:'surface'});
      async function get() {
        const reply=await fetch('/api/terrain?'+params,{signal:controller.signal}),value=await reply.json();
        if(!reply.ok) throw Object.assign(new Error(),{code:value.code,params:value.params});return value;
      }
      if(!data) {
        const value=await get();if(request!==controller) return;
        data=value;landscapePending=true;build();localize();message('');draw();
      }
      params.set('detail','landscape');
      const value=await get();if(request!==controller) return;
      data=value;landscapePending=false;build(true);localize();message('');draw();
    } catch(error) {
      if(controller.signal.aborted) return;
      status.textContent=apiErrorMessage(error.code,error.params,language)||t('terrainFailed');
      retry.hidden=false;
      landscapePending=false;
      message(data?'':'terrainFailed');
    } finally {if(request===controller) request=null;}
  }

  function stop() {keys.clear();last=0;if(frame) cancelAnimationFrame(frame);frame=0;}
  function walk(now) {
    frame=0;
    if(!enabled||!data||overview||document.hidden||!keys.size) {last=0;return;}
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
    if(!enabled||overview||!['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(event.code)) return;
    event.preventDefault();keys.add(event.code);if(!frame) frame=requestAnimationFrame(walk);
  });
  canvas.addEventListener('keyup',event=>keys.delete(event.code));
  canvas.addEventListener('blur',stop);window.addEventListener('blur',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stop();});
  function returnToGround() {
    overview=false;
    ground.camera.position.copy(walkingPosition??new THREE.Vector3(0,localHeight(0,0)+1.7,0));
    walkingPosition=null;overviewButton.setAttribute('aria-pressed','false');walking.forEach(button=>{button.disabled=false;});
    aim(25,-5);localize();draw();
  }
  overviewButton.addEventListener('click',()=>{
    if(!data||data.grids.length<2) return;
    stop();
    if(overview) returnToGround();
    else {
      walkingPosition=ground.camera.position.clone();overview=true;
      ground.camera.position.set(0,2800,4000);aim(0,-35);
      overviewButton.setAttribute('aria-pressed','true');walking.forEach(button=>{button.disabled=true;});
      document.querySelector('#surface-reset').disabled=false;document.querySelector('#surface-lookout').disabled=false;localize();draw();
    }
  });
  document.querySelector('#surface-lookout').addEventListener('click',()=>{
    if(!data) return;
    if(overview) returnToGround();
    stop();const point=terrainLookout(data.grids[0]);
    if(!point) {status.textContent=t('flatTerrain');return;}
    ground.camera.position.set(point.east,localHeight(point.east,point.north)+1.7,-point.north);
    aim(point.azimuth,point.pitch);updatePosition();draw();canvas.focus();
  });
  canvas.addEventListener('wheel',event=>{
    if(!enabled||!overview) return;event.preventDefault();
    const scale=event.deltaY>0?1.12:.89;
    if(ground.camera.position.length()*scale>600&&ground.camera.position.length()*scale<15000) {ground.camera.position.multiplyScalar(scale);draw();}
  },{passive:false});
  document.querySelector('#surface-reset').addEventListener('click',()=>{if(data) {stop();returnToGround();ground.camera.position.set(0,localHeight(0,0)+1.7,0);updatePosition();draw();canvas.focus();}});
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
      request?.abort();request=null;data=null;site=next;overview=false;walkingPosition=null;landscapePending=false;overviewButton.disabled=true;overviewButton.textContent=t('terrainOverview');overviewButton.setAttribute('aria-pressed','false');stop();clear();ground.lander.visible=false;here.disabled=true;walking.forEach(button=>{button.disabled=true;});position.textContent='';aim(25,-5);load();
    },
    show(value) {enabled=value;if(value) load();else {stop();if(overview) returnToGround();}},
    update(angles,yaw) {
      heading=yaw*rad;
      if(lightPending===Boolean(angles)) {lightPending=!angles;localize();}
      if(angles) {
        const az=angles.sunAz*rad,el=angles.sunEl*rad;
        const target=overview?ground.lander.position:ground.camera.position;
        ground.light.position.set(Math.cos(el)*Math.sin(az)*2000,Math.sin(el)*2000,-Math.cos(el)*Math.cos(az)*2000).add(target);
        ground.light.target.position.copy(target);ground.light.target.updateMatrixWorld();
        ground.light.intensity=angles.sunEl>-.27?3.1:0;
      } else {
        ground.light.position.copy(ground.camera.position).add(new THREE.Vector3(800,1000,600));
        ground.light.target.position.copy(ground.camera.position);ground.light.target.updateMatrixWorld();ground.light.intensity=3.1;
      }
    },localize,
  };
}
