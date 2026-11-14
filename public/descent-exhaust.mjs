import * as THREE from "three";

function engineJet() {
  const geometry = new THREE.PlaneGeometry(2.2, 1).translate(0, -.5, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { strength: { value: 0 }, time: { value: 0 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 plumeUv;
      void main() {
        plumeUv = vec2(position.x, -position.y);
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
        float y = plumeUv.y;
        float drift = y * (0.065 * sin(y * 17.0 - time * 16.0) + 0.035 * sin(y * 31.0 - time * 22.0));
        float radial = (plumeUv.x - drift) / mix(0.27, 0.63, y);
        float stream = exp(-3.4 * radial * radial) * pow(1.0 - y, 3.0);
        float core = exp(-13.0 * radial * radial - 10.0 * y);
        float ripple = 0.82 + 0.12 * sin(y * 36.0 - time * 21.0 + radial * 4.0)
                            + 0.06 * sin(y * 69.0 - time * 32.0 - radial * 8.0);
        vec3 color = mix(vec3(0.57, 0.66, 0.79), vec3(1.0, 0.93, 0.78), clamp(core * 1.7, 0.0, 1.0));
        gl_FragColor = vec4(color, strength * (stream * 0.18 * ripple + core * 0.46));
      }
    `,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const jet = new THREE.Mesh(geometry, material);
  jet.position.y = .395;
  const cameraInEngineFrame = new THREE.Vector3();
  const engineFrame = new THREE.Matrix4();
  jet.onBeforeRender = (_renderer, _scene, camera) => {
    cameraInEngineFrame.setFromMatrixPosition(camera.matrixWorld)
      .applyMatrix4(engineFrame.copy(jet.parent.matrixWorld).invert());
    // Turn around the thrust axis so the soft cross-section reads from any side.
    jet.rotation.y = Math.atan2(cameraInEngineFrame.x, cameraInEngineFrame.z);
    jet.updateMatrixWorld();
  };
  return jet;
}

function groundDust(count) {
  const geometry = new THREE.BufferGeometry();
  const attribute = (name, length) => {
    const buffer = new THREE.BufferAttribute(new Float32Array(count * length), length).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, buffer);
    return buffer;
  };
  const positions = attribute("position", 3);
  const opacity = attribute("opacity", 1);
  const size = attribute("size", 1);
  const material = new THREE.ShaderMaterial({
    uniforms: { viewportScale: { value: 1 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float viewportScale;
      attribute float opacity;
      attribute float size;
      varying float dustOpacity;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        dustOpacity = opacity;
        gl_PointSize = clamp(size * viewportScale / max(-viewPosition.z, 0.1), 1.0, 64.0);
        gl_Position = projectionMatrix * viewPosition;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying float dustOpacity;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 fromCenter = gl_PointCoord * 2.0 - 1.0;
        float fade = max(0.0, 1.0 - dot(fromCenter, fromCenter));
        gl_FragColor = vec4(0.70, 0.65, 0.57, fade * fade * dustOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    material.uniforms.viewportScale.value = renderer.domElement.height * camera.projectionMatrix.elements[5] * .5;
  };
  return { mesh, positions, opacity, size };
}

export function createDescentExhaust(lander, heightAt) {
  const jet = engineJet();
  lander.add(jet);

  // Particles leave the impact zone radially in a shallow sheet over the DEM.
  const count = 400;
  const dust = groundDust(count);
  lander.parent.add(dust.mesh);
  let lastTime;

  function hide() {
    jet.visible = dust.mesh.visible = false;
    lastTime = undefined;
  }

  hide();
  return {
    hide,
    update(time, altitude) {
      if (time === lastTime) return;
      lastTime = time;
      const strength = THREE.MathUtils.smoothstep(altitude, 0, .8);
      const length = Math.min(3.15 + .13 * Math.sin(time * 19), altitude + .27);
      jet.visible = strength > 0;
      jet.scale.y = length;
      jet.material.uniforms.strength.value = strength;
      jet.material.uniforms.time.value = time;

      const dustStrength = strength * (1 - THREE.MathUtils.smoothstep(altitude, .7, 8));
      dust.mesh.visible = dustStrength > 0;
      if (!dust.mesh.visible) return;
      for (let i = 0; i < count; i++) {
        const age = (time * (.42 + (i % 11) * .022) + i * .618034) % 1;
        const angle = i * 2.399963 + age * .32 * Math.sin(i * 1.15);
        const distance = .6 + age * (5 + (i % 19) * .52);
        const x = lander.position.x + Math.cos(angle) * distance;
        const z = lander.position.z + Math.sin(angle) * distance;
        const ground = heightAt(x, z) ?? lander.position.y - altitude;
        const broad = i % 4 === 0;
        const lift = .10 + age * (1 - age) * (broad ? 1.65 : .65);
        dust.positions.setXYZ(i, x, ground + lift, z);
        const band = .58 + .42 * Math.sin(angle * 5 + age * 7 - time * 2.2) ** 2;
        const life = THREE.MathUtils.smoothstep(age, 0, .13) * (1 - age) ** 1.5;
        dust.opacity.setX(i, dustStrength * life * band * (broad ? .16 : .52));
        dust.size.setX(i, broad ? .65 + age * 1.15 : .08 + age * .14);
      }
      for (const buffer of [dust.positions, dust.opacity, dust.size]) buffer.needsUpdate = true;
    },
  };
}
