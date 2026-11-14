import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const labelRay=new THREE.Ray(),labelInverse=new THREE.Matrix4(),labelHit=new THREE.Vector3();
const hullBounds=new THREE.Box3(new THREE.Vector3(-.95,.88,-.95),new THREE.Vector3(.95,2.35,1.02));
export function landerOccludes(lander,origin,target) {
  if(!lander.visible) return false;
  // Check the hull in local coordinates; avoid raycasting every instrument
  // triangle twice per rendered frame just to position two text labels.
  labelInverse.copy(lander.matrixWorld).invert();
  labelRay.set(origin,target.clone().sub(origin).normalize()).applyMatrix4(labelInverse);
  if(!labelRay.intersectBox(hullBounds,labelHit)) return false;
  labelHit.applyMatrix4(lander.matrixWorld);
  return origin.distanceToSquared(labelHit)<origin.distanceToSquared(target);
}

export function placeLander(lander,heightAt,{x=5,z=-8,yaw=-.45}={}) {
  const up=new THREE.Vector3(0,1,0);
  const height=(x,z)=>{
    const value=heightAt(x,z);
    if(!Number.isFinite(value)) throw new Error('Lander placement requires terrain heights');
    return value;
  };
  const normal=(x,z,r=.2)=>new THREE.Vector3(-(height(x+r,z)-height(x-r,z))/(2*r),1,-(height(x,z+r)-height(x,z-r))/(2*r)).normalize();
  lander.position.set(x,height(x,z),z);
  lander.quaternion.setFromUnitVectors(up,normal(x,z,1.2)).multiply(new THREE.Quaternion().setFromAxisAngle(up,yaw));
  lander.updateMatrixWorld(true);
  const inverse=lander.quaternion.clone().invert();
  for(const leg of lander.userData.legs) {
    const world=lander.localToWorld(new THREE.Vector3(leg.x,0,leg.z));
    world.y=height(world.x,world.z);
    leg.foot.position.copy(lander.worldToLocal(world.clone()));
    leg.foot.quaternion.copy(inverse).multiply(new THREE.Quaternion().setFromUnitVectors(up,normal(world.x,world.z)));
    lander.updateMatrixWorld(true);
    // A flat circular pad rests on the highest point under its perimeter;
    // this also avoids clipping where two DEM triangles meet.
    let lift=0;
    for(let i=0;i<20;i++) {
      const a=i/20*Math.PI*2,p=leg.foot.localToWorld(new THREE.Vector3(.3*Math.cos(a),0,.3*Math.sin(a)));
      lift=Math.max(lift,height(p.x,p.z)-p.y);
    }
    world.y+=lift+.001;
    leg.foot.position.copy(lander.worldToLocal(world));lander.updateMatrixWorld(true);
    const joint=lander.worldToLocal(leg.foot.localToWorld(new THREE.Vector3(0,.09,0)));
    positionBar(leg.main,leg.hip,joint);
    positionBar(leg.brace,leg.braceRoot,joint);
    positionBar(leg.sleeve,leg.hip.clone().lerp(joint,.65),joint);
  }
  lander.updateMatrixWorld(true);
  const body=lander.localToWorld(new THREE.Vector3(0,1.47,0));
  lander.userData.obstacles=[{x:body.x,z:body.z,radius:1},...lander.userData.legs.map(leg=>{
    const p=leg.foot.getWorldPosition(new THREE.Vector3());return {x:p.x,z:p.z,radius:.32};
  })];
}

function positionBar(object,from,to) {
  const direction=to.clone().sub(from);
  object.position.copy(from).add(to).multiplyScalar(.5);
  object.scale.y=direction.length()/object.geometry.parameters.height;
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
}

// An illustrative robotic lander, not a reconstruction of a flight vehicle.
export function createLander() {
  const lander=new THREE.Group();
  lander.userData.legs=[];
  const silver=new THREE.MeshStandardMaterial({color:0xc5cbd1,metalness:.55,roughness:.38});
  const dark=new THREE.MeshStandardMaterial({color:0x20252a,metalness:.2,roughness:.65});
  const white=new THREE.MeshStandardMaterial({color:0xe0dfd3,metalness:.08,roughness:.6});
  const lens=new THREE.MeshPhysicalMaterial({color:0x173740,metalness:.55,roughness:.1,clearcoat:1});
  const foil=new THREE.MeshStandardMaterial({color:0xd5a849,metalness:.42,roughness:.48});
  // Approximate grey ground reflections, with black sky, keep metal readable
  // without turning its shaded faces into emissive surfaces.
  const reflectionFaces=['#393934','#393934','#060708','#777369','#393934','#393934'].map(color=>{
    const face=document.createElement('canvas');face.width=face.height=16;
    const paint=face.getContext('2d');paint.fillStyle=color;paint.fillRect(0,0,16,16);return face;
  });
  const reflections=new THREE.CubeTexture(reflectionFaces);reflections.colorSpace=THREE.SRGBColorSpace;reflections.needsUpdate=true;
  for(const material of [silver,dark,lens,foil]) {material.envMap=reflections;material.envMapIntensity=.65;}
  const foilCanvas=document.createElement('canvas');foilCanvas.width=foilCanvas.height=256;
  const context=foilCanvas.getContext('2d');context.fillStyle='#b4b4b4';context.fillRect(0,0,256,256);
  let seed=19;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1600;i++) {
    const x=random()*256,y=random()*256;
    context.strokeStyle=`rgba(${random()>.5?'255,255,255':'20,20,20'},${.06+random()*.2})`;
    context.lineWidth=.3+random();context.beginPath();context.moveTo(x,y);context.lineTo(x+random()*35-17,y+random()*30-15);context.stroke();
  }
  const foilMap=new THREE.CanvasTexture(foilCanvas);foilMap.wrapS=foilMap.wrapT=THREE.RepeatWrapping;
  foil.bumpMap=foilMap;foil.bumpScale=.008;foil.roughnessMap=foilMap;

  function mesh(geometry,material,position,parent=lander) {
    const object=new THREE.Mesh(geometry,material);object.position.set(...position);parent.add(object);return object;
  }
  function bar(a,b,radius,material=silver,parent=lander) {
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b);
    const object=mesh(new THREE.CylinderGeometry(radius,radius,from.distanceTo(to),16),material,[0,0,0],parent);
    object.position.copy(from).add(to).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return object;
  }
  const busProfile = [[0,.92],[.85,.92],[.91,.96],[.91,1.02],[.85,1.94],[.83,2.02],[.78,2.06],[0,2.06]];
  mesh(new THREE.LatheGeometry(busProfile.map(([radius,y])=>new THREE.Vector2(radius,y)),8),foil,[0,0,0]);
  for (const [y,radius,material] of [[.96,.93,dark],[1.05,.91,silver],[1.96,.88,dark],[2.04,.85,silver]]) {
    mesh(new THREE.CylinderGeometry(radius,radius,.035,8),material,[0,y,0]);
  }
  mesh(new RoundedBoxGeometry(.82,.27,.7,3,.035),white,[0,2.2,0]);
  for (const [x,z] of [[-.42,-.43],[-.42,.43],[.42,-.43],[.42,.43]]) {
    mesh(new THREE.CylinderGeometry(.115,.13,.23,24),silver,[x,2.14,z]);
    mesh(new THREE.CylinderGeometry(.09,.09,.028,24),dark,[x,2.26,z]);
  }
  const bellProfile = [[.34,.408],[.365,.42],[.355,.445],[.30,.5],[.245,.58],[.194,.67],[.165,.76],[.16,.855],[.125,.855],[.122,.76],[.15,.65],[.216,.54],[.303,.43],[.34,.408]];
  const engine = new THREE.MeshStandardMaterial({color:0x625b53,metalness:.66,roughness:.46,side:THREE.DoubleSide,envMap:reflections,envMapIntensity:.45});
  mesh(new THREE.LatheGeometry(bellProfile.map(([radius,y])=>new THREE.Vector2(radius,y)),56),engine,[0,0,0]);
  const rim=mesh(new THREE.TorusGeometry(.35,.014,12,56),silver,[0,.421,0]);rim.rotation.x=Math.PI/2;
  mesh(new THREE.CylinderGeometry(.225,.18,.11,32),silver,[0,.852,0]);
  for (const side of [-1,1]) {
    const tube = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side*.19,.76,0), new THREE.Vector3(side*.34,.77,.06),
      new THREE.Vector3(side*.38,.91,.15), new THREE.Vector3(side*.32,1.04,.21),
    ]);
    mesh(new THREE.TubeGeometry(tube,20,.028,10),silver,[0,0,0]);
  }
  for(let i=0;i<4;i++) {
    const a=Math.PI/4+i*Math.PI/2,c=Math.cos(a),s=Math.sin(a);
    const foot=[c*1.65,.1,s*1.65],hip=[c*.69,1.65,s*.69];
    const main=bar(hip,foot,.045),braceRoot=[c*.5,1,s*.5];
    const brace=bar(braceRoot,foot,.027),sleeve=bar([c*1.15,.65,s*1.15],foot,.062,foil);
    mesh(new THREE.SphereGeometry(.085,24,16),silver,[c*.69,1.65,s*.69]);
    const pad=new THREE.Group();pad.position.set(foot[0],0,foot[2]);lander.add(pad);
    mesh(new THREE.CylinderGeometry(.28,.3,.06,48),silver,[0,.03,0],pad);
    mesh(new THREE.CylinderGeometry(.23,.23,.018,48),dark,[0,.069,0],pad);
    mesh(new THREE.CylinderGeometry(.07,.105,.075,24),silver,[0,.103,0],pad);
    for (let bolt=0;bolt<6;bolt++) {
      const angle=bolt*Math.PI/3;
      mesh(new THREE.CylinderGeometry(.021,.021,.014,6),silver,[.18*Math.cos(angle),.085,.18*Math.sin(angle)],pad);
    }
    lander.userData.legs.push({x:foot[0],z:foot[2],foot:pad,hip:new THREE.Vector3(...hip),braceRoot:new THREE.Vector3(...braceRoot),main,brace,sleeve});
    for(let j=0;j<3;j++) bar([c*.67,1.12+j*.17,s*.67],[c*.87,1.12+j*.17,s*.87],.012,dark);
  }
  // Front instrument bay, two optical heads and a gold-capped sampling arm.
  mesh(new RoundedBoxGeometry(.9,.42,.12,3,.04),white,[0,1.52,.84]);
  const avionics = new THREE.MeshStandardMaterial({color:0x454a4b,metalness:.45,roughness:.52});
  for (const side of [-1,1]) {
    const bay = new THREE.Group();
    bay.position.set(side*.79,1.48,.12);
    bay.rotation.y=side*Math.PI/2;
    lander.add(bay);
    mesh(new RoundedBoxGeometry(.52,.54,.09,2,.028),avionics,[0,0,0],bay);
    for (let fin=0;fin<7;fin++) {
      mesh(new RoundedBoxGeometry(.42,.023,.04,1,.008),silver,[0,-.19+fin*.063,.052],bay);
    }
    for (const x of [-.215,.215]) for (const y of [-.23,.23]) {
      const screw=mesh(new THREE.CylinderGeometry(.019,.019,.015,6),dark,[x,y,.052],bay);
      screw.rotation.x=Math.PI/2;
    }
  }
  for(const x of [-.23,.23]) {
    const ring=mesh(new THREE.CylinderGeometry(.12,.12,.09,40),dark,[x,1.56,.95]);ring.rotation.x=Math.PI/2;
    mesh(new THREE.TorusGeometry(.098,.009,10,40),silver,[x,1.56,1.001]);
    const glass=mesh(new THREE.SphereGeometry(.088,32,16),lens,[x,1.56,.989]);glass.scale.z=.22;
    mesh(new THREE.BoxGeometry(.04,.04,.03),silver,[x-.09,1.39,.91]);
    glass.rotation.z=.2;
  }
  bar([.55,1.2,.65],[.95,.78,1.1],.035);bar([.95,.78,1.1],[.9,.37,1.45],.025);
  mesh(new THREE.BoxGeometry(.18,.12,.18),foil,[.9,.33,1.45]);
  // Two framed solar arrays. Cell texture is generated once and shared.
  const panelCanvas=document.createElement('canvas');panelCanvas.width=512;panelCanvas.height=256;
  const panelContext=panelCanvas.getContext('2d');panelContext.fillStyle='#0c1624';panelContext.fillRect(0,0,512,256);
  for(let y=0;y<4;y++) for(let x=0;x<9;x++) {
    panelContext.fillStyle=(x+y)%3?'#243b52':'#2c455d';panelContext.fillRect(x*56+3,y*64+3,50,58);
    panelContext.strokeStyle='#6d8394';panelContext.lineWidth=1;
    for(let k=1;k<4;k++) {panelContext.beginPath();panelContext.moveTo(x*56+3,y*64+3+k*14);panelContext.lineTo(x*56+53,y*64+3+k*14);panelContext.stroke();}
  }
  const panelTexture=new THREE.CanvasTexture(panelCanvas);panelTexture.colorSpace=THREE.SRGBColorSpace;panelTexture.anisotropy=4;
  const cells=new THREE.MeshStandardMaterial({map:panelTexture,metalness:.35,roughness:.32,color:0xbacbda});
  for(const side of [-1,1]) {
    const wing=new THREE.Group();wing.position.set(side*1.8,1.95,0);wing.rotation.set(.35,0,-side*.1);lander.add(wing);
    mesh(new RoundedBoxGeometry(1.65,.055,1.15,2,.018),silver,[0,0,0],wing);
    const plate=mesh(new THREE.PlaneGeometry(1.57,1.07),cells,[0,.031,0],wing);plate.rotation.x=-Math.PI/2;
    bar([side*.7,1.3,0],[side*1.7,1.9,0],.025);
    mesh(new THREE.CylinderGeometry(.1,.1,.28,12),dark,[side*.85,1.98,0]).rotation.z=Math.PI/2;
  }
  // Parabolic high-gain dish with feed support; mast and radiator fins.
  bar([0,2.31,0],[0,2.68,0],.045);
  const antenna=new THREE.Group();antenna.position.set(0,2.65,0);antenna.rotation.set(.45,0,-.15);lander.add(antenna);
  const profile=[];
  for(let i=0;i<=20;i++) {const r=i/20*.39;profile.push(new THREE.Vector2(r,r*r/.72));}
  const dish=mesh(new THREE.LatheGeometry(profile,64),white,[0,0,0],antenna);dish.material=white.clone();dish.material.side=THREE.DoubleSide;
  const dishRim=mesh(new THREE.TorusGeometry(.39,.012,10,64),silver,[0,.39**2/.72,0],antenna);dishRim.rotation.x=Math.PI/2;
  for(let i=0;i<3;i++) {const a=i/3*Math.PI*2;bar([Math.cos(a)*.36,.18,Math.sin(a)*.36],[0,.44,0],.009,silver,antenna);}
  mesh(new THREE.CylinderGeometry(.035,.04,.08,12),foil,[0,.44,0],antenna);
  bar([-.49,2.17,-.2],[-.49,2.97,-.2],.012);
  mesh(new THREE.CylinderGeometry(.018,.018,.15,8),white,[-.49,3.02,-.2]);
  const radiator=mesh(new THREE.BoxGeometry(.47,.7,.06),white,[0,1.54,-.88]);
  for(let i=0;i<7;i++) mesh(new THREE.BoxGeometry(.43,.013,.018),dark,[radiator.position.x,1.25+i*.09,-.92]);
  lander.traverse(object=>{if(object.isMesh) object.castShadow=object.receiveShadow=true;});
  lander.visible=false;
  return lander;
}
