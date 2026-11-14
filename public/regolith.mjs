import * as THREE from 'three';

// Decorative millimetre-scale dust shading only. The DEM mesh is untouched.
export function createRegolith() {
  const material=new THREE.MeshStandardMaterial({color:0xa6a39c,roughness:1,metalness:0});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float terrainAO; varying float terrainOcclusion; varying vec3 terrainPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nterrainPosition=position;terrainOcclusion=terrainAO;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 terrainPosition;
      varying float terrainOcclusion;
      float dustHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float dustNoise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(dustHash(i),dustHash(i+vec2(1,0)),f.x),mix(dustHash(i+vec2(0,1)),dustHash(i+vec2(1)),f.x),f.y);
      }
      vec3 dustNormal(vec3 n,float h) {
        vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
        vec3 rx=cross(sy,n),ry=cross(n,sx);float det=dot(sx,rx);
        return normalize(abs(det)*n-sign(det)*(dFdx(h)*rx+dFdy(h)*ry));
      }
    `).replace('#include <color_fragment>',`#include <color_fragment>
      vec2 dustP=terrainPosition.xz;
      float pixelFootprint=length(fwidth(dustP));
      float grainFade=1.0-smoothstep(.004,.025,pixelFootprint);
      float grain=dustNoise(dustP*115.0);
      float patches=dustNoise(dustP*.075)*.65+dustNoise(dustP*.32)*.35;
      float fines=dustNoise(dustP*9.0);
      diffuseColor.rgb*=.83+.22*patches+.045*(fines-.5)*(1.0-smoothstep(.05,.3,pixelFootprint))+.055*(grain-.5)*grainFade;
    `).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      float dustHeight=(grain*.0012*grainFade+fines*.002*(1.0-smoothstep(.05,.3,pixelFootprint)));
      normal=dustNormal(normal,dustHeight);
    `).replace('#include <aomap_fragment>',`#include <aomap_fragment>
      reflectedLight.indirectDiffuse*=terrainOcclusion;
      reflectedLight.indirectSpecular*=terrainOcclusion;
    `);
  };
  material.customProgramCacheKey=()=> 'regolith-dust-v1';
  return material;
}
