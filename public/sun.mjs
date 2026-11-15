import * as THREE from "three";

// A volumetric-looking photosphere, with smooth additive light rather than a ring.
export function createSun(radius) {
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { time }, toneMapped: false,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 point; varying vec3 normalView; varying vec3 viewDirection;
      void main() { point = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0);
        normalView = normalize(normalMatrix * normal); viewDirection = normalize(-p.xyz);
        gl_Position = projectionMatrix * p;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `precision highp float;
      #include <logdepthbuf_pars_fragment>
      uniform float time; varying vec3 point; varying vec3 normalView; varying vec3 viewDirection;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p) { vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p) { float v=0.0, a=0.5; for(int i=0;i<4;i++){v+=noise(p)*a;p=p*2.03+7.1;a*=0.5;} return v; }
      void main() { vec3 p=normalize(point); float flow=fbm(p*5.0+vec3(0,time*0.035,0));
        float cells=fbm(p*38.0+flow*2.0+time*0.022);
        float limb=pow(max(0.0,dot(normalize(normalView),normalize(viewDirection))),0.28);
        vec3 color=mix(vec3(1.0,0.22,0.018),vec3(1.0,0.84,0.38),smoothstep(0.18,0.8,cells));
        color*=0.64+0.48*limb; gl_FragColor=vec4(color,1.0);
        #include <logdepthbuf_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), material);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  const glow = context.createRadialGradient(128,128,0,128,128,128);
  glow.addColorStop(0, "rgba(255,225,160,0.65)");
  glow.addColorStop(.32, "rgba(255,166,55,0.3)");
  glow.addColorStop(.55, "rgba(255,115,20,0.09)");
  glow.addColorStop(1, "rgba(255,80,0,0)");
  context.fillStyle = glow; context.fillRect(0,0,256,256);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, toneMapped: false,
  }));
  corona.scale.setScalar(radius * 5.5);
  const viewPosition = new THREE.Vector3();
  corona.onBeforeRender = (_renderer, _scene, camera) => {
    viewPosition.setFromMatrixPosition(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    // An animated Sun can cross the camera plane. Its billboard would then
    // cover the viewport, so fade the decorative halo before it gets that close.
    corona.material.opacity = THREE.MathUtils.smoothstep(-viewPosition.z, radius * 2, radius * 4);
  };
  mesh.add(corona);
  return { mesh, update(seconds) { time.value = seconds; } };
}
