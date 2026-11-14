import * as THREE from 'three';
import { nearbyScatterCells,scatterCell,scatterKey } from '../lib/lunar-scatter.mjs';
import { changeDirection,lunarBasis,surfaceOffset } from '../lib/surface-world.mjs';

function fadeMaterial(material,near,far) {
  const original=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    original.call(material,shader);
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
      float detailFade=1.0-smoothstep(${near.toFixed(1)},${far.toFixed(1)},length(vViewPosition));
      float coverage=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
      if(coverage>detailFade) discard;
    `);
  };
  material.customProgramCacheKey=()=>`scatter-${near}-${far}`;return material;
}
function stoneGeometry(detail) {
  const geometry=new THREE.IcosahedronGeometry(1,detail),positions=geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),f=.85+.13*Math.sin(x*13+y*17+z*11);
    positions.setXYZ(i,x*f,y*f,z*f);
  }
  geometry.computeVertexNormals();return geometry;
}
function impactMaterial() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const context=canvas.getContext('2d'),pixels=context.createImageData(128,128);
  for(let y=0;y<128;y++) for(let x=0;x<128;x++) {
    const dx=(x-63.5)/63.5,dy=(y-63.5)/63.5,a=Math.atan2(dy,dx),r=Math.hypot(dx,dy)*(1+.025*Math.sin(a*7)+.02*Math.sin(a*13));
    const rim=Math.exp(-Math.pow((r-.7)/.09,2)),floor=Math.exp(-Math.pow(r/.55,4)),edge=Math.max(0,Math.min(1,(1-r)*8));
    const value=Math.round(110+rim*105-floor*35),i=(y*128+x)*4;
    pixels.data.set([value,value,value,Math.round(edge*(.25+rim*.35)*255)],i);
  }
  context.putImageData(pixels,0,0);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const bump=map.clone();bump.colorSpace=THREE.NoColorSpace;bump.needsUpdate=true;
  return fadeMaterial(new THREE.MeshStandardMaterial({map,bumpMap:bump,bumpScale:.018,roughness:1,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),65,100);
}

export function createRockField(parent) {
  const group=new THREE.Group();parent.add(group);
  const configs={pebble:{capacity:4000,range:85,near:40,far:60,detail:0},rock:{capacity:4000,range:225,near:155,far:190,detail:0},boulder:{capacity:256,range:250,near:190,far:220,detail:1},mark:{capacity:128,range:125,near:65,far:100,detail:0}};
  const meshes={};
  for(const [kind,config] of Object.entries(configs)) {
    const material=kind==='mark'?impactMaterial():fadeMaterial(new THREE.MeshStandardMaterial({color:0x83827c,roughness:.96}),config.near,config.far);
    const mesh=new THREE.InstancedMesh(kind==='mark'?new THREE.PlaneGeometry(2,2):stoneGeometry(config.detail),material,config.capacity);
    mesh.frustumCulled=false;mesh.count=0;mesh.castShadow=kind==='rock'||kind==='boulder';mesh.receiveShadow=true;group.add(mesh);meshes[kind]=mesh;
  }
  const cache=new Map(),dummy=new THREE.Object3D(),color=new THREE.Color(),up=new THREE.Vector3(0,0,1);
  const axes=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],rotationMatrix=new THREE.Matrix4(),tilt=new THREE.Quaternion(),euler=new THREE.Euler();
  let previous=null,obstacles=[];
  function update(site,frame,heightAt,{force=false,clearance=null}={}) {
    if(!force&&previous) {const p=surfaceOffset(previous,site);if(Math.hypot(p.east,p.north)<16) return;}
    previous={...site};obstacles=[];
    const frameBasis=lunarBasis(frame),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const counts={pebble:0,rock:0,boulder:0,mark:0},visible=[];
    for(const cell of nearbyScatterCells(site,250)) {
      const key=scatterKey(cell);let objects=cache.get(key);
      if(!objects) {objects=scatterCell(cell);cache.set(key,objects);} else {cache.delete(key);cache.set(key,objects);}
      for(const object of objects) {
        const p=surfaceOffset(site,object),config=configs[object.kind];
        if(Math.hypot(p.east,p.north)>config.range) continue;
        const offset=surfaceOffset(frame,object),x=offset.east,z=-offset.north,h=heightAt(x,z);
        if(h===null||!Number.isFinite(h)) continue;
        if(clearance&&Math.hypot(x-clearance.x,z-clearance.z)<2.5+object.radius) continue;
        visible.push({...object,x,z,h,distance:Math.hypot(p.east,p.north)});
      }
    }
    // Prefer nearby details if a very dense area reaches a fixed GPU budget.
    visible.sort((a,b)=>a.distance-b.distance);
    for(const object of visible) {
      const {kind,x,z,h,radius}=object,config=configs[kind],index=counts[kind];
      if(index>=config.capacity) continue;
      if(kind==='mark') {
        const delta=.3,hx=heightAt(x+delta,z),hz=heightAt(x,z+delta);
        if(hx===null||hz===null) continue;
        dummy.position.set(x,h+.008,z);dummy.scale.set(radius,radius,1);
        dummy.quaternion.setFromUnitVectors(up,new THREE.Vector3(-(hx-h)/delta,1,-(hz-h)/delta).normalize());
        dummy.rotateZ(changeDirection(object.angle*180/Math.PI,0,object,frame).azimuth*Math.PI/180);
      } else {
        dummy.position.set(x,h+radius*.28,z);dummy.scale.set(radius*object.stretch,radius*.72,radius);
        const basis=lunarBasis(object);
        for(const [i,axis] of [basis.east,basis.up,basis.north.map(v=>-v)].entries()) axes[i].set(dot(frameBasis.east,axis),dot(frameBasis.up,axis),-dot(frameBasis.north,axis));
        rotationMatrix.makeBasis(...axes);dummy.quaternion.setFromRotationMatrix(rotationMatrix);
        tilt.setFromEuler(euler.set(object.tilt,object.angle,object.tilt*.5));dummy.quaternion.multiply(tilt);
      }
      dummy.updateMatrix();meshes[kind].setMatrixAt(index,dummy.matrix);
      if(kind!=='mark') {color.setScalar(object.color);meshes[kind].setColorAt(index,color);}
      if(kind==='boulder') obstacles.push({x,z,radius:radius*Math.max(1,object.stretch)});
      counts[kind]++;
    }
    for(const [kind,mesh] of Object.entries(meshes)) {
      mesh.count=counts[kind];mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
    }
    while(cache.size>512) cache.delete(cache.keys().next().value);
  }
  return {update,obstacles:()=>obstacles,clear(){previous=null;obstacles=[];for(const mesh of Object.values(meshes)) mesh.count=0;},stats:()=>({cells:cache.size,instances:Object.values(meshes).reduce((n,m)=>n+m.count,0)})};
}
