import * as THREE from "three";

const uniformsCode = /* glsl */ `
  varying vec3 moonPosition;
  uniform sampler2D northAlbedo;
  uniform sampler2D southAlbedo;
  uniform sampler2D slopeMap;
  uniform float slopeOpacity;

  vec4 sampleGlobe(sampler2D tex, vec2 uv, vec2 dx, vec2 dy) {
    return textureGrad(tex, uv, dx, dy);
  }
`;

const sampleCode = /* glsl */ `
  vec3 direction = normalize(moonPosition);
  float horizontal = length(direction.xz);
  float longitude = horizontal > 1e-7 ? atan(direction.x, direction.z) : 0.0;
  float latitude = atan(direction.y, horizontal);
  vec2 uv = vec2(0.5 + longitude / 6.2831853072, 0.5 + latitude / 3.1415926536);
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  // Keep the texture filter footprint local on either side of ±180°.
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);

  vec3 albedo = sampleGlobe(map, uv, dx, dy).rgb;
  float polarWeight = smoothstep(0.9702957263, 0.9925461516, abs(direction.y)); // 76° to 83°
  // Spherical polar stereographic projection, central meridian 0°.
  float pole = direction.y >= 0.0 ? 1.0 : -1.0;
  vec2 polarUV = 0.5 + (3474.8 / 1024.0) * vec2(direction.x, -pole * direction.z)
    / (1.0 + abs(direction.y));
  vec2 polarDX = dFdx(polarUV);
  vec2 polarDY = dFdy(polarUV);
  if (polarWeight > 0.0) {
    vec3 polar = pole > 0.0 ? textureGrad(northAlbedo, polarUV, polarDX, polarDY).rgb
      : textureGrad(southAlbedo, polarUV, polarDX, polarDY).rgb;
    albedo = mix(albedo, polar, polarWeight);
  }
  if (slopeOpacity > 0.0) {
    vec4 slope = sampleGlobe(slopeMap, uv, dx, dy);
    albedo = mix(albedo, slope.rgb, slopeOpacity * slope.a);
  }
  diffuseColor.rgb *= albedo;
`;

export function moonMaterial(map, north, south) {
  const material = new THREE.MeshStandardMaterial({ map, roughness: 1 });
  const slopeMap = { value: map };
  const slopeOpacity = { value: 0 };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      northAlbedo: { value: north }, southAlbedo: { value: south }, slopeMap, slopeOpacity,
    });
    shader.vertexShader = "varying vec3 moonPosition;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nmoonPosition = position;",
    );
    shader.fragmentShader = uniformsCode + shader.fragmentShader.replace("#include <map_fragment>", sampleCode);
  };
  return {
    material,
    showSlope(map, visible) {
      slopeMap.value = map;
      slopeOpacity.value = visible ? .65 : 0;
    },
  };
}
