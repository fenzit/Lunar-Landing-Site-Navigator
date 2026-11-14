import * as THREE from 'three';
import { destination } from '../lib/terrain-math.mjs';
import { surfaceOffset,frameHeight,patchKey } from '../lib/surface-world.mjs';

export function terrainGeometry(grid,source,frame,{inner=0,innerAtFrame=false}={}) {
  const {size,step,heights}=grid,positions=[],indices=[],occlusion=[],radius=Math.max(1,Math.round(160/step));
  const same=patchKey(source)===patchKey(frame);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const east=(x-(size-1)/2)*step,north=((size-1)/2-y)*step;
    const p=same?{east,north}:surfaceOffset(frame,destination(source,east,north));
    positions.push(p.east,frameHeight(heights[y*size+x],Math.hypot(p.east,p.north),frame.elevationMeters),-p.north);
    let surrounding=0,count=0;
    for(const dy of [-radius,0,radius]) for(const dx of [-radius,0,radius]) {
      if(!dx&&!dy) continue;surrounding+=heights[Math.max(0,Math.min(size-1,y+dy))*size+Math.max(0,Math.min(size-1,x+dx))];count++;
    }
    occlusion.push(.45+.55*Math.exp(-Math.max(0,surrounding/count-heights[y*size+x])/9));
  }
  for(let y=0;y<size-1;y++) for(let x=0;x<size-1;x++) {
    const a=y*size+x,b=a+1,c=a+size,d=c+1;
    const east=innerAtFrame?(positions[a*3]+positions[d*3])/2:(x+.5-(size-1)/2)*step;
    const north=innerAtFrame?-(positions[a*3+2]+positions[d*3+2])/2:((size-1)/2-y-.5)*step;
    if(inner&&Math.max(Math.abs(east),Math.abs(north))<inner-step) continue;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('terrainAO',new THREE.Float32BufferAttribute(occlusion,1));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
