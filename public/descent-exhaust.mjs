import * as THREE from "three";

export function createDescentExhaust(lander, heightAt) {
  // The nozzle rim on the illustrative lander is 0.41 m above its origin.
  const exhaust = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(.35, 0),
      new THREE.Vector2(.59, -.16), new THREE.Vector2(.88, -.43),
      new THREE.Vector2(1.25, -.76), new THREE.Vector2(1.55, -1),
    ], 32),
    new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 }, time: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 plumeUv;
        void main() {
          plumeUv = vec2(uv.x, -position.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        uniform float strength;
        uniform float time;
        varying vec2 plumeUv;
        void main() {
          #include <logdepthbuf_fragment>
          float distance = plumeUv.y;
          float pulse = 0.85 + 0.15 * sin(distance * 25.0 - time * 24.0 + sin(plumeUv.x * 18.85));
          vec3 color = mix(vec3(1.0, 0.93, 0.70), vec3(0.95, 0.28, 0.05), smoothstep(0.03, 0.9, distance));
          gl_FragColor = vec4(color, strength * pulse * pow(1.0 - distance, 2.0));
        }
      `,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  exhaust.position.y = .39;
  lander.add(exhaust);

  // Small ballistic curtains near the ground, reset deterministically on scrubbing.
  const count = 96;
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  const dust = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xc4ad8c, size: .12, opacity: 0, transparent: true, depthWrite: false,
  }));
  dust.frustumCulled = false;
  lander.parent.add(dust);

  function hide() {
    exhaust.visible = dust.visible = false;
  }

  hide();
  return {
    hide,
    update(time, altitude) {
      const strength = THREE.MathUtils.smoothstep(altitude, 0, .8);
      exhaust.visible = strength > 0;
      exhaust.scale.y = Math.min(3.7 + .22 * Math.sin(25 * time), altitude + .25);
      exhaust.material.uniforms.strength.value = strength * .64;
      exhaust.material.uniforms.time.value = time;

      const dustStrength = strength * (1 - THREE.MathUtils.smoothstep(altitude, .7, 6));
      dust.visible = dustStrength > 0;
      if (!dust.visible) return;
      dust.material.opacity = dustStrength * .52;
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399963;
        const age = (time * .9 + i * .618034) % 1;
        const radius = age * (3 + (i % 7) * .48);
        const x = lander.position.x + Math.cos(angle) * radius;
        const z = lander.position.z + Math.sin(angle) * radius;
        const ground = heightAt(x, z) ?? lander.position.y - altitude;
        positions.setXYZ(i, x, ground + .06 + age * (1 - age) * (i % 4 + 1) * .42, z);
      }
      positions.needsUpdate = true;
    },
  };
}
