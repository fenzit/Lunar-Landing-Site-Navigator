import * as THREE from 'three';
import { destination,gridHeight,terrainLookout } from '../lib/terrain-math.mjs';
import { changeDirection,frameHeight,patchKey,surfaceOffset,walkingCoordinates } from '../lib/surface-world.mjs';
import { SurfaceStream } from '../lib/surface-stream.mjs';
import { moveWalker } from '../lib/walking.mjs';
import { apiErrorMessage } from '../lib/api-errors.mjs';
import { language,t } from './i18n.mjs';
import { createRegolith } from './regolith.mjs';
import { placeLander } from './lander.mjs';
import { createRockField } from './rock-field.mjs';
import { terrainGeometry } from './terrain-mesh.mjs';

const rad=Math.PI/180;
export function createSurface(ground,canvas,{message,draw,moved,aim,makeDetails=createRockField}) {
  let site,data,initial,initialLandscape,landscape,request,landscapeRequest,enabled=false;
  let keys=new Set(),last=0,frame=0,heading=25*rad,viewPitch=-5,overview=false,walkingPosition=null;
  let lightPending=true,landscapePending=false,loadError=null,blocked=false,streamState={loading:false,error:null};
  const $=selector=>document.querySelector(selector);
  const status=$('#terrain-status'),position=$('#walk-position'),here=$('#calculate-here'),retry=$('#terrain-retry'),overviewButton=$('#surface-overview');
  const walking=[...document.querySelectorAll('[data-walk]'),$('#surface-reset'),$('#surface-lookout')];
  const group=new THREE.Group();ground.scene.add(group);
  const material=createRegolith(),details=makeDetails(ground.scene);
  const stream=new SurfaceStream({load:fetchSurface,onPatch:adopt,onState:state=>{streamState=state;if(data) localize();}});
  walking.forEach(button=>{button.disabled=true;});

  async function fetchSurface(point,signal,detail='surface') {
    const params=new URLSearchParams({lat_deg:point.lat,lon_east_deg:point.lon,detail});
    const reply=await fetch('/api/terrain?'+params,{signal}),value=await reply.json();
    if(!reply.ok) throw Object.assign(new Error(),{code:value.code,params:value.params});return value;
  }
  function coordinates() {return data?walkingCoordinates(data.site,overview&&walkingPosition?walkingPosition:ground.camera.position):site;}
  function heightFrom(patch,x,z) {
    if(!data||!patch) return null;
    const same=patchKey(patch.site)===patchKey(data.site);
    const offset=same?{east:x,north:-z}:surfaceOffset(patch.site,destination(data.site,x,-z));
    const height=gridHeight(patch.grids[0],offset.east,offset.north);
    return height===null?null:frameHeight(height,Math.hypot(x,z),data.site.elevationMeters);
  }
  const localHeight=(x,z)=>heightFrom(data,x,z);
  function clearTerrain() {for(const mesh of [...group.children]) {group.remove(mesh);mesh.geometry.dispose();}}
  function buildTerrain() {
    clearTerrain();if(!data) return;
    const near=data.grids[0],half=(near.size-1)*near.step/2;
    if(landscape) for(let i=landscape.grids.length-1;i>=1;i--) {
      const previous=landscape.grids[i-1];
      const mesh=new THREE.Mesh(terrainGeometry(landscape.grids[i],landscape.site,data.site,{inner:i===1?half:(previous.size-1)*previous.step/2,innerAtFrame:i===1}),material);
      mesh.receiveShadow=true;mesh.castShadow=i===1;group.add(mesh);
    }
    const mesh=new THREE.Mesh(terrainGeometry(near,data.site,data.site),material);mesh.receiveShadow=mesh.castShadow=true;group.add(mesh);
    overviewButton.disabled=!landscape;
  }
  function updateLander() {
    if(!data||!initial) return;
    const anchor=destination(site,5,8),offset=surfaceOffset(data.site,anchor);
    const distance=Math.hypot(offset.east-ground.camera.position.x,-offset.north-ground.camera.position.z);
    ground.lander.visible=distance<2500;
    if(!ground.lander.visible) {ground.lander.userData.obstacles=[];return;}
    const direction=changeDirection(180-.45/rad,0,site,data.site);
    placeLander(ground.lander,(x,z)=>heightFrom(initial,x,z),{x:offset.east,z:-offset.north,yaw:(direction.azimuth-180)*rad});
  }
  function updateDetails(force=false) {
    if(!data||overview) return;
    details.update(coordinates(),data.site,localHeight,{force,clearance:ground.lander.visible?ground.lander.position:null});
  }
  function obstacles() {return [...(ground.lander.userData.obstacles??[]),...details.obstacles()];}
  function settleCamera() {
    const p=moveWalker(ground.camera.position,0,0,Infinity,obstacles()),height=localHeight(p.x,p.z);
    if(height!==null) ground.camera.position.set(p.x,height+1.7,p.z);
  }
  function adopt(patch) {
    if(!data||overview) return;
    const previous=data.site,geo=coordinates(),direction=changeDirection(heading/rad,viewPitch,previous,patch.site);
    data=patch;const offset=surfaceOffset(data.site,geo);
    ground.camera.position.set(offset.east,localHeight(offset.east,-offset.north)+1.7,-offset.north);
    heading=direction.azimuth*rad;viewPitch=direction.elevation;aim(direction.azimuth,direction.elevation);
    blocked=false;buildTerrain();updateLander();updateDetails(true);settleCamera();localize();draw();loadLandscape(patch);
  }
  async function loadLandscape(patch) {
    landscapeRequest?.abort();const controller=new AbortController();landscapeRequest=controller;
    landscapePending=true;localize();
    try {
      const value=await fetchSurface(patch.site,controller.signal,'landscape');
      if(controller!==landscapeRequest||!data||patchKey(patch.site)!==patchKey(data.site)) return;
      landscape=value;if(initial&&patchKey(value.site)===patchKey(initial.site)) initialLandscape=value;
      loadError=null;landscapePending=false;buildTerrain();localize();draw();
    } catch(error) {
      if(controller.signal.aborted) return;loadError=error;landscapePending=false;localize();
    } finally {if(landscapeRequest===controller) landscapeRequest=null;}
  }
  function updatePosition() {
    if(!data) return;
    const geo=coordinates(),offset=surfaceOffset(site,geo),distance=Math.hypot(offset.east,offset.north);
    position.textContent=`${geo.lat.toFixed(6)}°, ${geo.lon.toFixed(6)}° · ${distance.toFixed(0)} ${t('metersFromSite')}`;
    here.disabled=overview||distance<.5;
  }
  function localize() {
    if(!data) return;
    const p=overview&&walkingPosition?walkingPosition:ground.camera.position;
    const height=gridHeight(data.grids[0],p.x,-p.z)??data.site.elevationMeters;
    let text=t('terrainQuality',{grid:Math.round(data.quality.gridMeters),height:height.toFixed(1)});
    if(blocked) text+=' · '+t('streamBoundary');
    else if(streamState.loading) text+=' · '+t('streamAhead');
    else if(landscapePending) text+=' · '+t('landscapeLoading');
    if(lightPending) text+=' · '+t('surfaceLightPending');
    if(loadError||streamState.error) text+=' · '+t('streamRetry');
    status.textContent=text;retry.hidden=!(loadError||streamState.error);
    overviewButton.textContent=t(overview?'backToGround':'terrainOverview');updatePosition();
  }
  async function load() {
    if(!site||!enabled||request||data) return;
    const controller=new AbortController();request=controller;loadError=null;
    message('terrainLoading');status.textContent=t('terrainLoading');retry.hidden=true;
    try {
      const value=await fetchSurface(site,controller.signal);
      if(request!==controller) return;
      data=initial=value;landscape=null;stream.reset(value);
      ground.camera.position.set(0,localHeight(0,0)+1.7,0);
      buildTerrain();updateLander();updateDetails(true);settleCamera();walking.forEach(button=>{button.disabled=false;});
      localize();message('');draw();loadLandscape(value);
    } catch(error) {
      if(controller.signal.aborted) return;loadError=error;
      status.textContent=apiErrorMessage(error.code,error.params,language)||t('terrainFailed');retry.hidden=false;message('terrainFailed');
    } finally {if(request===controller) request=null;}
  }
  function stop() {keys.clear();last=0;if(frame) cancelAnimationFrame(frame);frame=0;}
  function walk(now) {
    frame=0;if(!enabled||!data||overview||document.hidden||!keys.size) {last=0;return;}
    const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
    let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const length=Math.hypot(forward,side)||1;forward/=length;side/=length;
    const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?6:1.6)*dt,camera=ground.camera;
    const p=moveWalker(camera.position,(Math.sin(heading)*forward+Math.cos(heading)*side)*speed,(-Math.cos(heading)*forward+Math.sin(heading)*side)*speed,Infinity,obstacles());
    const grid=data.grids[0],limit=(grid.size-1)*grid.step/2-Math.max(grid.step*2,4);
    const x=THREE.MathUtils.clamp(p.x,-limit,limit),z=THREE.MathUtils.clamp(p.z,-limit,limit);
    blocked=Math.abs(x-p.x)>.001||Math.abs(z-p.z)>.001;
    const h=localHeight(x,z);if(h!==null) camera.position.set(x,h+1.7,z);
    updateDetails();stream.update(coordinates());localize();draw();frame=requestAnimationFrame(walk);
  }
  canvas.addEventListener('keydown',event=>{
    if(!enabled||overview||!['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(event.code)) return;
    event.preventDefault();keys.add(event.code);if(!frame) frame=requestAnimationFrame(walk);
  });
  canvas.addEventListener('keyup',event=>keys.delete(event.code));canvas.addEventListener('blur',stop);window.addEventListener('blur',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stop();});
  function returnToGround() {
    overview=false;ground.camera.position.copy(walkingPosition??new THREE.Vector3(0,localHeight(0,0)+1.7,0));walkingPosition=null;
    overviewButton.setAttribute('aria-pressed','false');walking.forEach(button=>{button.disabled=false;});
    aim(25,-5);heading=25*rad;viewPitch=-5;updateDetails(true);stream.update(coordinates());localize();draw();
  }
  overviewButton.addEventListener('click',()=>{
    if(!data||!landscape) return;stop();
    if(overview) returnToGround();else {
      walkingPosition=ground.camera.position.clone();overview=true;stream.update(coordinates(),{paused:true});
      ground.camera.position.set(0,2800,4000);aim(0,-35);overviewButton.setAttribute('aria-pressed','true');
      walking.forEach(button=>{button.disabled=true;});$('#surface-reset').disabled=$('#surface-lookout').disabled=false;localize();draw();
    }
  });
  $('#surface-lookout').addEventListener('click',()=>{
    if(!data) return;if(overview) returnToGround();stop();const point=terrainLookout(data.grids[0]);
    if(!point) {status.textContent=t('flatTerrain');return;}
    ground.camera.position.set(point.east,localHeight(point.east,-point.north)+1.7,-point.north);
    heading=point.azimuth*rad;viewPitch=point.pitch;aim(point.azimuth,point.pitch);
    updateDetails(true);settleCamera();stream.update(coordinates());localize();draw();canvas.focus();
  });
  canvas.addEventListener('wheel',event=>{
    if(!enabled||!overview) return;event.preventDefault();const scale=event.deltaY>0?1.12:.89;
    if(ground.camera.position.length()*scale>600&&ground.camera.position.length()*scale<15000) {ground.camera.position.multiplyScalar(scale);draw();}
  },{passive:false});
  $('#surface-reset').addEventListener('click',()=>{
    if(!initial) return;stop();landscapeRequest?.abort();landscapeRequest=null;landscapePending=false;loadError=null;
    overview=false;walkingPosition=null;data=initial;landscape=initialLandscape;blocked=false;stream.reset(initial);
    ground.camera.position.set(0,localHeight(0,0)+1.7,0);overviewButton.setAttribute('aria-pressed','false');
    buildTerrain();updateLander();updateDetails(true);settleCamera();walking.forEach(button=>{button.disabled=false;});
    heading=25*rad;viewPitch=-5;aim(25,-5);localize();draw();canvas.focus();if(!landscape) loadLandscape(data);
  });
  retry.addEventListener('click',()=>{if(!data) load();else {stream.retry();if(loadError) {loadError=null;loadLandscape(data);}}});
  here.addEventListener('click',()=>{if(!data||overview) return;const point=coordinates();moved({lat:Number(point.lat.toFixed(6)),lon:Number(point.lon.toFixed(6))});});
  for(const button of document.querySelectorAll('[data-walk]')) {
    const release=()=>keys.delete(button.dataset.walk);
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(button.dataset.walk);if(!frame) frame=requestAnimationFrame(walk);});
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  }
  return {
    setSite(next) {
      if(site?.lat===next.lat&&site?.lon===next.lon) return;
      request?.abort();request=null;landscapeRequest?.abort();landscapeRequest=null;stream.reset(null);
      data=initial=initialLandscape=landscape=null;site=next;overview=false;walkingPosition=null;landscapePending=false;blocked=false;loadError=null;
      overviewButton.disabled=true;overviewButton.textContent=t('terrainOverview');overviewButton.setAttribute('aria-pressed','false');
      stop();clearTerrain();details.clear();ground.lander.visible=false;ground.lander.userData.obstacles=[];here.disabled=true;
      walking.forEach(button=>{button.disabled=true;});position.textContent='';aim(25,-5);load();
    },
    show(value) {enabled=value;if(value) {if(data) stream.update(coordinates());else load();}else {stop();if(overview) returnToGround();stream.update(coordinates(),{paused:true});}},
    localAngles(value) {
      if(!value||!data) return value;const result={...value};
      for(const body of ['sun','earth']) {const angle=changeDirection(value[body+'Az'],value[body+'El'],site,data.site);result[body+'Az']=angle.azimuth;result[body+'El']=angle.elevation;}
      return result;
    },
    update(angles,yaw,pitch) {
      heading=yaw*rad;viewPitch=pitch;
      if(lightPending===Boolean(angles)) {lightPending=!angles;localize();}
      const target=overview?new THREE.Vector3(0,0,0):ground.camera.position;
      if(angles) {
        const az=angles.sunAz*rad,el=angles.sunEl*rad;
        ground.light.position.set(Math.cos(el)*Math.sin(az)*2000,Math.sin(el)*2000,-Math.cos(el)*Math.cos(az)*2000).add(target);
        ground.light.target.position.copy(target);ground.light.target.updateMatrixWorld();ground.light.intensity=angles.sunEl>-.27?3.1:0;
      } else {ground.light.position.copy(target).add(new THREE.Vector3(800,1000,600));ground.light.target.position.copy(target);ground.light.target.updateMatrixWorld();ground.light.intensity=3.1;}
    },localize,
  };
}
