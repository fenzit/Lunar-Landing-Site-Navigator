import * as THREE from 'three';

// An illustrative robotic lander, not a reconstruction of a flight vehicle.
export function createLander() {
  const lander=new THREE.Group();
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
    const object=mesh(new THREE.CylinderGeometry(radius,radius,from.distanceTo(to),8),material,[0,0,0],parent);
    object.position.copy(from).add(to).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return object;
  }
  mesh(new THREE.CylinderGeometry(.82,.9,1.05,8),foil,[0,1.47,0]);
  mesh(new THREE.CylinderGeometry(.88,.88,.09,8),silver,[0,2.04,0]);
  mesh(new THREE.CylinderGeometry(.94,.94,.1,8),dark,[0,.94,0]);
  mesh(new THREE.BoxGeometry(.82,.27,.7),white,[0,2.2,0]);
  // Engine bell, plumbing and heat shield.
  mesh(new THREE.CylinderGeometry(.17,.36,.48,24,1,true),silver,[0,.65,0]);
  mesh(new THREE.CylinderGeometry(.31,.31,.018,24),dark,[0,.402,0]);
  const rim=mesh(new THREE.TorusGeometry(.35,.022,8,32),dark,[0,.41,0]);rim.rotation.x=Math.PI/2;
  for(let i=0;i<4;i++) {
    const a=Math.PI/4+i*Math.PI/2,c=Math.cos(a),s=Math.sin(a);
    const foot=[c*1.65,.1,s*1.65],hip=[c*.69,1.65,s*.69];
    bar(hip,foot,.045);bar([c*.5,1,s*.5],[c*1.38,.36,s*1.38],.027);
    bar([c*1.15,.65,s*1.15],foot,.062,foil);
    mesh(new THREE.SphereGeometry(.085,12,8),silver,[c*.69,1.65,s*.69]);
    mesh(new THREE.CylinderGeometry(.28,.3,.06,20),silver,[foot[0],.045,foot[2]]);
    mesh(new THREE.CylinderGeometry(.23,.23,.018,20),dark,[foot[0],.084,foot[2]]);
    for(let j=0;j<3;j++) bar([c*.67,1.12+j*.17,s*.67],[c*.87,1.12+j*.17,s*.87],.012,dark);
  }
  // Front instrument bay, two optical heads and a gold-capped sampling arm.
  mesh(new THREE.BoxGeometry(.9,.42,.12),white,[0,1.52,.84]);
  for(const x of [-.23,.23]) {
    const ring=mesh(new THREE.CylinderGeometry(.12,.12,.09,24),dark,[x,1.56,.95]);ring.rotation.x=Math.PI/2;
    const glass=mesh(new THREE.CircleGeometry(.085,24),lens,[x,1.56,1.001]);
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
    mesh(new THREE.BoxGeometry(1.65,.055,1.15),silver,[0,0,0],wing);
    const plate=mesh(new THREE.PlaneGeometry(1.57,1.07),cells,[0,.031,0],wing);plate.rotation.x=-Math.PI/2;
    bar([side*.7,1.3,0],[side*1.7,1.9,0],.025);
    mesh(new THREE.CylinderGeometry(.1,.1,.28,12),dark,[side*.85,1.98,0]).rotation.z=Math.PI/2;
  }
  // Parabolic high-gain dish with feed support; mast and radiator fins.
  bar([0,2.31,0],[0,2.68,0],.045);
  const antenna=new THREE.Group();antenna.position.set(0,2.65,0);antenna.rotation.set(.45,0,-.15);lander.add(antenna);
  const profile=[];
  for(let i=0;i<=20;i++) {const r=i/20*.39;profile.push(new THREE.Vector2(r,r*r/.72));}
  const dish=mesh(new THREE.LatheGeometry(profile,40),white,[0,0,0],antenna);dish.material=white.clone();dish.material.side=THREE.DoubleSide;
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
