import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { heightAt, moonCoordinates, moonDirection, skyDirection } from "/lib/geography.mjs";
import { sites } from "/lib/sites.mjs";
import { moonMaterial } from "./moon-material.mjs";
import { createSun } from "./sun.mjs";
import { overviewPositions } from "./overview-orbits.mjs";
import { t } from "./i18n.mjs";
import { createSurface } from './surface.mjs';
import { createLander, landerOccludes } from './lander.mjs';
import { createDescent } from "./descent.mjs";

const rad = Math.PI / 180;
const relief = 3;
const referenceKm = 1737.4;
const vector = values => new THREE.Vector3(...values);
const makeLabel = (root, text, className = "") => {
  const label = document.createElement("span");
  label.className = `sky-label ${className}`;
  label.textContent = text;
  label.hidden = true;
  root.append(label);
  return label;
};

function projectedLabel(label, point, camera, visible) {
  const p = point.clone().project(camera);
  label.hidden = !visible || p.z < -1 || p.z > 1 || Math.abs(p.x) > .92 || Math.abs(p.y) > .9;
  if (!label.hidden) {
    label.style.left = `${(p.x + 1) * 50}%`;
    label.style.top = `${(1 - p.y) * 50}%`;
  }
}

function makeGlobeGeometry(elevations) {
  const base = new THREE.IcosahedronGeometry(1, 83);
  base.deleteAttribute("uv");
  base.deleteAttribute("normal");
  const geometry = mergeVertices(base, 1e-6);
  base.dispose();
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    const { lat, lon } = moonCoordinates(point.x, point.y, point.z);
    const radius = 1 + relief * heightAt(elevations, lat, lon) / referenceKm;
    point.multiplyScalar(radius);
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeGlobeBodies(world, root) {
  const solar = createSun(9);
  const sun = solar.mesh;
  sun.userData.update = solar.update;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(3.67, 64, 48),
    new THREE.MeshStandardMaterial({ color: 0x9acaff, roughness: 1, emissive: 0x162331 }));
  world.add(sun, earth);
  return Object.fromEntries(Object.entries({ sun, earth }).map(([key, mesh]) => {
    mesh.visible = false;
    return [key, { mesh, label: makeLabel(root, t(key), `body-label ${key}`) }];
  }));
}

function labelGlobeBody(body, name, camera, moonCenter) {
  const { mesh, label } = body;
  label.hidden = !mesh.visible;
  if (label.hidden) return;
  const projected = mesh.position.clone().project(camera);
  const local = mesh.position.clone().applyMatrix4(camera.matrixWorldInverse);
  const ray = mesh.position.clone().sub(camera.position);
  const fraction = moonCenter.clone().sub(camera.position).dot(ray) / ray.lengthSq();
  const occulted = fraction > 0 && fraction < 1 &&
    camera.position.clone().addScaledVector(ray, fraction).distanceToSquared(moonCenter) < 1;
  const inFrame = local.z < 0 && Math.abs(projected.x) < .95 && Math.abs(projected.y) < .84;
  if (occulted && inFrame) {
    label.hidden = true;
    return;
  }
  if (inFrame) {
    label.textContent = name;
    label.style.left = `${THREE.MathUtils.clamp((projected.x + 1) * 50, 9, 91)}%`;
    label.style.top = `${(1 - projected.y) * 50}%`;
    label.style.transform = "translate(-50%, 14px)";
    return;
  }
  // When the body is out of view, point toward its direction in camera space.
  const scale = Math.max(Math.abs(local.x) / .82, Math.abs(local.y) / .76, .001);
  const x = local.x / scale, y = local.y / scale;
  const arrow = Math.abs(x) > Math.abs(y) ? (x > 0 ? "→" : "←") : (y > 0 ? "↑" : "↓");
  label.textContent = local.z >= 0 ? `${name} · ${t("behind")}` : `${name} ${arrow}`;
  label.style.left = `${(x + 1) * 50}%`;
  label.style.top = `${(1 - y) * 50}%`;
  label.style.transform = "translate(-50%, -50%)";
}

function makeGround() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, .1, 400000);
  camera.position.set(0, 1.7, 0);
  scene.add(new THREE.HemisphereLight(0xd8dfeb, 0x686359, .95));
  const light = new THREE.DirectionalLight(0xfff4de, 3.1);
  light.position.set(8,10,6);
  light.castShadow=true;light.shadow.mapSize.set(2048,2048);
  Object.assign(light.shadow.camera,{left:-90,right:90,top:90,bottom:-90,near:1,far:4500});
  light.shadow.normalBias=.12;light.shadow.bias=-.00002;
  scene.add(light,light.target);

  const lander = createLander();
  scene.add(lander);
  const solar = createSun(462);
  const objects = {
    sun: solar.mesh,
    earth: new THREE.Mesh(new THREE.SphereGeometry(1660, 48, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness:1 })),
  };
  scene.add(objects.sun, objects.earth);
  return { scene, camera, objects, lander, light, updateSun: solar.update };
}

export function createScene(root, { pick, message, moved }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer:true });
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", t("sceneLabel"));
  root.append(canvas);

  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .05, 1200);
  camera.position.set(0, 0, 3.7);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minDistance = 1.28;
  controls.maxDistance = 600;
  controls.autoRotateSpeed = .55;
  const light = new THREE.DirectionalLight(0xfff5e5, 2.65);
  light.position.set(-2, 3, 4);
  const fill = new THREE.AmbientLight(0xcad9fa, .58);
  world.add(light, light.target, fill);
  const bodies = makeGlobeBodies(world, root);
  const lunarFrame = new THREE.Group();
  world.add(lunarFrame);
  const spin = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const markerWorld = new THREE.Vector3();
  const ground = makeGround();
  const descent = createDescent(ground.camera, ground.lander, canvas, startAnimation, (x, z) => surfaceView.heightAt(x, z));
  const surfaceView=createSurface(ground,canvas,{
    message:key=>{if(view==="ground"||view==="descent") message(key);},
    draw:()=>{if(view==="descent") descent.start();if(view==="ground"||view==="descent") render();},
    aim:(az,el)=>{faceTarget=null;yaw=az;pitch=el;},moved,
  });
  const textureLoader = new THREE.TextureLoader();
  const labels = sites.map(site => makeLabel(root, site.name, "map-label"));
  const pickedLabel = makeLabel(root, "", "map-label");
  const moonLabel = makeLabel(root, t("moon"), "body-label moon");
  const skyLabels = Object.fromEntries(["sun", "earth"].map(key => [key, makeLabel(root, t(key), `ground-body-label ${key}`)]));
  const markers = new THREE.Group();
  lunarFrame.add(markers);
  const ray = new THREE.Raycaster();
  let globe, surface, slopeMap, loading, selected, angles, sky, view = "chart";
  let descentAngles;
  let frame = 0, yaw = 0, pitch = 0, faceTarget = null, slopeEnabled = false;
  let inViewport = true, updatingOrbit = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let animated = !reducedMotion.matches, seconds = 0, lastFrame = 0, flight = null, focusBody = "system";
  const starsGeometry = new THREE.BufferGeometry();
  const starsPositions = [];
  let starSeed = 73;
  const random = () => { starSeed = (Math.imul(starSeed, 1664525) + 1013904223) >>> 0; return starSeed / 4294967296; };
  for (let i = 0; i < 550; i++) {
    const y = random() * 2 - 1, a = random() * Math.PI * 2, h = Math.sqrt(1-y*y);
    starsPositions.push(450*h*Math.cos(a),450*y,450*h*Math.sin(a));
  }
  starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starsPositions, 3));
  world.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xb8c7d4, size: 1, sizeAttenuation: false, transparent: true, opacity: .55 })));
  const pins = [...sites.map((site, index) => ({ site, label: labels[index], color: 0xb1c79d })),
    { site: null, label: pickedLabel, color: 0xd9efad }];

  function pinPosition(site) {
    const direction = vector(moonDirection(site.lat, site.lon));
    if (!globe) return direction;
    const worldDirection = direction.clone().applyQuaternion(spin);
    lunarFrame.updateMatrixWorld(true);
    ray.set(worldDirection.clone().multiplyScalar(2).add(lunarFrame.position), worldDirection.clone().negate());
    const surface = ray.intersectObject(globe)[0];
    return surface ? lunarFrame.worldToLocal(surface.point).addScaledVector(direction, .012) : direction.multiplyScalar(1.02);
  }

  function positionPins() {
    for (const pin of pins) {
      if (!pin.site || !globe) continue;
      if (!pin.mesh) {
        pin.mesh = new THREE.Mesh(new THREE.SphereGeometry(.018, 12, 8), new THREE.MeshBasicMaterial({ color: pin.color }));
        markers.add(pin.mesh);
      }
      pin.mesh.position.copy(pinPosition(pin.site));
      pin.mesh.visible = pin.site.id !== selected?.id || pin === pins.at(-1);
    }
  }

  async function texture(path) {
    const map = await textureLoader.loadAsync(path);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return map;
  }

  async function loadGlobe() {
    message("globeLoading");
    try {
      const [map, north, south, reply] = await Promise.all([
        texture("/assets/moon.webp"), texture("/assets/lola-north.webp"),
        texture("/assets/lola-south.webp"), fetch("/assets/lola-km.bin"),
      ]);
      if (!reply.ok) throw new Error("LOLA asset unavailable");
      const buffer = await reply.arrayBuffer();
      if (buffer.byteLength !== 1440 * 720 * 4) throw new Error("Unexpected LOLA size");
      const elevations = new Float32Array(buffer);
      const geometry = makeGlobeGeometry(elevations);
      north.wrapS = south.wrapS = THREE.ClampToEdgeWrapping;
      surface = moonMaterial(map, north, south);
      globe = new THREE.Mesh(geometry, surface.material);
      lunarFrame.add(globe);
      globe.updateMatrixWorld();
      positionPins();
      if (view === "globe") message("");
      render();
      texture("/assets/earth.webp").then(map => {
        bodies.earth.mesh.material.color.set(0xffffff);
        bodies.earth.mesh.material.map = map;
        bodies.earth.mesh.material.needsUpdate = true;
        ground.objects.earth.material.map=map;ground.objects.earth.material.needsUpdate=true;
        if (view === "globe") render();
      }).catch(() => {});
    } catch {
      if (view === "globe") message("globeUnavailable");
    }
  }

  function updateGround() {
    const localAngles=surfaceView.localAngles(view==="descent"?descentAngles:angles);
    for (const key of ["sun", "earth"]) {
      const object = ground.objects[key];
      const elevation = localAngles?.[`${key}El`];
      object.visible = Number.isFinite(elevation);
      if (object.visible) {
        object.position.copy(vector(skyDirection(localAngles[`${key}Az`], elevation)).multiplyScalar(100000)).add(ground.camera.position);
      }
    }
    if (faceTarget && localAngles) {
      yaw = localAngles[`${faceTarget}Az`];
      pitch = THREE.MathUtils.clamp(localAngles[`${faceTarget}El`]*.6,-45,75);
    }
    if (view==="ground") ground.camera.lookAt(ground.camera.position.clone().add(vector(skyDirection(yaw, pitch))));
    surfaceView.update(localAngles,yaw,pitch);
  }

  function render() {
    if (view === "chart" || !inViewport || document.hidden) return;
    const width = root.clientWidth, height = root.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const currentCamera = view === "globe" ? camera : ground.camera;
    currentCamera.aspect = aspect;
    currentCamera.updateProjectionMatrix();
    if (view === "globe") {
      renderer.render(world, camera);
      projectedLabel(moonLabel, lunarFrame.position.clone().add(new THREE.Vector3(0, 1.5, 0)), camera, Boolean(globe) && focusBody === "system");
      for (const pin of pins) {
        const marker = pin.mesh;
        if (marker) {
          marker.getWorldPosition(markerWorld);
          const relativeMarker = markerWorld.clone().sub(lunarFrame.position);
          const relativeCamera = camera.position.clone().sub(lunarFrame.position);
          const visible = marker.visible && relativeMarker.dot(relativeCamera) > relativeMarker.lengthSq();
          projectedLabel(pin.label, markerWorld, camera, visible);
        }
      }
      for (const [key, body] of Object.entries(bodies)) labelGlobeBody(body, t(key), camera, lunarFrame.position);
    } else {
      updateGround();
      ground.updateSun(seconds);
      ground.objects.earth.rotation.y=seconds*.18;
      renderer.render(ground.scene, ground.camera);
      for (const [key, object] of Object.entries(ground.objects)) {
        projectedLabel(skyLabels[key], object.position, ground.camera, object.visible&&!landerOccludes(ground.lander,ground.camera.position,object.position));
      }
    }
  }

  function resize() {
    if (!root.clientWidth || !root.clientHeight) return;
    renderer.setSize(root.clientWidth, root.clientHeight, false);
    render();
  }
  new ResizeObserver(resize).observe(root);
  controls.addEventListener("change", () => { if (!updatingOrbit) render(); });
  new IntersectionObserver(([entry]) => {
    if (inViewport === entry.isIntersecting) return;
    inViewport = entry.isIntersecting;
    lastFrame = 0;
    if (!inViewport) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    render();
    startAnimation();
  }).observe(root);

  function focusTarget(key = focusBody) {
    return key === "moon" ? lunarFrame.position : bodies[key === "system" ? "sun" : key].mesh.position;
  }

  function updateBodies() {
    const previousTarget = focusBody === "system" ? null : focusTarget().clone();
    lunarFrame.rotation.y = seconds * .018;
    spin.setFromAxisAngle(axis, lunarFrame.rotation.y);
    bodies.earth.mesh.rotation.y = seconds * .18;
    bodies.sun.mesh.rotation.y = seconds * .055;
    bodies.sun.mesh.userData.update(seconds);
    if (sky) {
      const positions = overviewPositions(sky, lunarFrame.rotation.y);
      lunarFrame.position.fromArray(positions.moon);
      for (const [key, { mesh }] of Object.entries(bodies)) {
        mesh.position.fromArray(positions[key]);
      }
      light.position.copy(bodies.sun.mesh.position);
      light.target.position.copy(lunarFrame.position);
    } else {
      lunarFrame.position.set(0,0,0);
      light.position.set(-2,3,4);
      light.target.position.set(0,0,0);
    }
    if (previousTarget && !flight) {
      const delta = focusTarget().clone().sub(previousTarget);
      controls.target.add(delta); camera.position.add(delta);
    }
  }

  function animate(now = performance.now()) {
    frame = 0;
    if (view === "chart" || !inViewport || document.hidden) { lastFrame = 0; return; }
    const dt = lastFrame ? Math.min((now-lastFrame)/1000, .05) : 0;
    lastFrame = now;
    if (animated) seconds += dt;
    if(view==='globe') updateBodies();
    if (flight) {
      // Keep the destination attached to the body while UTC playback moves it.
      const delta = focusTarget().clone().sub(flight.target);
      flight.target.add(delta);
      flight.to.add(delta);
      const t = reducedMotion.matches ? 1 : Math.min(1, (now-flight.start)/850);
      const ease = t*t*(3-2*t);
      camera.position.lerpVectors(flight.from, flight.to, ease);
      controls.target.lerpVectors(flight.fromTarget, flight.target, ease);
      if (t === 1) flight = null;
    }
    if (view === "globe") {
      // OrbitControls emits "change" here; this frame already renders below.
      updatingOrbit = true;
      try { controls.update(dt); } finally { updatingOrbit = false; }
    }
    if(view==="descent") descent.advance(dt);
    render();
    if (animated || (view==="descent" && descent.moving()) || (view==='globe'&&(controls.autoRotate || flight))) frame = requestAnimationFrame(animate);
    else lastFrame = 0;
  }

  function startAnimation() { if (!frame && inViewport && view !== "chart" && !document.hidden) frame = requestAnimationFrame(animate); }
  function focus(key, smooth = true) {
    focusBody = key;
    const target = focusTarget(key).clone();
    const aspect = root.clientWidth / Math.max(1, root.clientHeight);
    const radius = key === "sun" ? 9 : key === "earth" ? 3.67 : 1;
    let distance = Math.max(radius*3.8, radius*3.5/Math.max(aspect,.5));
    if (key === "system") {
      let radius = lunarFrame.position.distanceTo(target) + 1;
      for (const [name, body] of Object.entries(bodies)) {
        if (!body.mesh.visible) continue;
        const r = name === "sun" ? 9 : 3.67;
        radius = Math.max(radius, body.mesh.position.distanceTo(target) + r);
      }
      const halfFov = Math.min(camera.fov*rad/2, Math.atan(Math.tan(camera.fov*rad/2)*aspect));
      distance = radius / Math.sin(halfFov) * 1.12;
    }
    let direction = camera.position.clone().sub(controls.target).normalize();
    if (key === "system" && sky) {
      direction.copy(bodies.sun.mesh.position).sub(lunarFrame.position).normalize().add(new THREE.Vector3(0,.4,1)).normalize();
    }
    const to = target.clone().addScaledVector(direction, distance);
    controls.minDistance = (key === "system" && bodies.sun.mesh.visible ? 9 : radius) * 1.18;
    flight = { start: performance.now(), from: camera.position.clone(), fromTarget: controls.target.clone(), to, target };
    if (!smooth || reducedMotion.matches) { camera.position.copy(to); controls.target.copy(target); flight = null; controls.update(); render(); }
    startAnimation();
    for (const button of document.querySelectorAll("[data-focus-body]")) button.setAttribute("aria-pressed", String(button.dataset.focusBody === key));
  }
  controls.addEventListener("start", () => { flight = null; });
  document.addEventListener("visibilitychange", () => { lastFrame = 0; if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; } else startAnimation(); });
  reducedMotion.addEventListener("change", () => { animated = !reducedMotion.matches; if (reducedMotion.matches) controls.autoRotate = false; document.querySelector("#animate-bodies")?.setAttribute("aria-pressed", String(animated)); startAnimation(); });

  function pickAt(x, y) {
    if (!globe || view !== "globe") return;
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const hit = ray.intersectObject(globe)[0];
    const visibleBodies = Object.values(bodies).map(body => body.mesh).filter(mesh => mesh.visible);
    const bodyHit = ray.intersectObjects(visibleBodies)[0];
    if (bodyHit && (!hit || bodyHit.distance < hit.distance)) { focus(Object.keys(bodies).find(key => bodies[key].mesh === bodyHit.object)); return; }
    if (!hit) return;
    if (focusBody !== "moon") { focus("moon"); return; }
    const local = lunarFrame.worldToLocal(hit.point.clone());
    const coords = moonCoordinates(local.x, local.y, local.z);
    coords.lat = Math.max(-89.999999, Math.min(89.999999, coords.lat));
    pick(coords);
  }

  let pointer = null;
  canvas.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) { pointer = null; return; }
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    canvas.focus({preventScroll:true});
    if (view === "ground" || view === "descent") canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 5) pointer.dragged = true;
    if ((view === "ground" || view === "descent") && pointer.dragged) {
      if (view === "descent") descent.look(dx * .21 * rad, -dy * .17 * rad);
      else {
        faceTarget = null;
        yaw -= dx * .21;
        pitch = THREE.MathUtils.clamp(pitch + dy * .17, -80, 85);
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      render();
    }
  });
  canvas.addEventListener("pointercancel", () => { pointer = null; });
  canvas.addEventListener("pointerup", event => {
    if (pointer?.id === event.pointerId && !pointer.dragged) {
      const box = canvas.getBoundingClientRect();
      pickAt(2 * (event.clientX - box.left) / box.width - 1, 1 - 2 * (event.clientY - box.top) / box.height);
    }
    pointer = null;
  });
  canvas.addEventListener("keydown", event => {
    if (view === "globe") {
      flight = null;
      const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      if (event.key === "ArrowLeft") spherical.theta -= .12;
      else if (event.key === "ArrowRight") spherical.theta += .12;
      else if (event.key === "ArrowUp") spherical.phi -= .12;
      else if (event.key === "ArrowDown") spherical.phi += .12;
      else if (["+", "="].includes(event.key)) spherical.radius = Math.max(controls.minDistance, spherical.radius * .9);
      else if (event.key === "-") spherical.radius = Math.min(controls.maxDistance, spherical.radius * 1.1);
      else if (event.key === "Enter") pickAt(0, 0);
      else return;
      camera.position.setFromSpherical(spherical.makeSafe()).add(controls.target);
      controls.update();
    } else if (view === "descent" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      descent.look(event.key === "ArrowLeft" ? -0.13 : event.key === "ArrowRight" ? 0.13 : 0,
        event.key === "ArrowUp" ? 0.1 : event.key === "ArrowDown" ? -0.1 : 0);
    } else if (view === "ground" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      faceTarget = null;
      yaw += event.key === "ArrowLeft" ? -9 : event.key === "ArrowRight" ? 9 : 0;
      pitch = THREE.MathUtils.clamp(pitch + (event.key === "ArrowUp" ? 6 : event.key === "ArrowDown" ? -6 : 0), -85, 85);
      render();
    } else return;
    event.preventDefault();
  });

  return {
    show(next, touchdownAngles) {
      view = next;
      descentAngles = touchdownAngles;
      descent.show(view==="descent");
      canvas.setAttribute('aria-label',t(view==="descent"?"descentControls":view==='ground'?'surfaceSceneLabel':'sceneLabel'));
      for (const label of [...labels, pickedLabel, moonLabel, ...Object.values(skyLabels),
        ...Object.values(bodies).map(body => body.label)]) label.hidden = true;
      controls.enabled = view === "globe";
      surfaceView.show(view==='ground'||view==="descent",view==="descent");
      if (view === "globe" && !loading) loading = loadGlobe();
      if (view === "ground") {
        faceTarget = null;
        yaw=25;pitch=-5;
        startAnimation();
      }
      resize();
      if (view === "globe") { if (focusBody === "system") focus("system", false); startAnimation(); }
    },
    setSite(site, focus) {
      selected = site;
      surfaceView.setSite(site);
      pins.at(-1).site = site;
      pickedLabel.textContent = site.name;
      if (focus && focusBody === "moon") {
        const distance = Math.max(3.45, camera.position.distanceTo(lunarFrame.position));
        const lat = site.lat * .82;
        camera.position.copy(vector(moonDirection(lat, site.lon)).applyQuaternion(spin).multiplyScalar(Math.min(distance, 5))).add(lunarFrame.position);
        controls.target.copy(lunarFrame.position);
        controls.update();
      }
      positionPins();
      render();
    },
    localize() {
      surfaceView.localize();
      moonLabel.textContent = t("moon");
      canvas.setAttribute("aria-label", t(view==="descent"?"descentControls":view==='ground'?'surfaceSceneLabel':'sceneLabel'));
      descent.localize();
      for (const [key, label] of Object.entries(skyLabels)) label.textContent = t(key);
      render();
    },
    setAngles(value) {
      angles = value;
      if (view === "ground") render();
    },
    setSky(value) {
      const hadSky = Boolean(sky);
      sky = value;
      for (const [key, { mesh }] of Object.entries(bodies)) {
        mesh.visible = Boolean(sky);
      }
      fill.intensity = sky ? .3 : .58;
      updateBodies();
      if (!hadSky && sky && focusBody === "system") focus("system", false);
      if (view === "globe") render();
    },
    faceGlobe(target) {
      if (!sky || view !== "globe") return;
      controls.autoRotate = false;
      focus(target);
    },
    toggleRotation() {
      controls.autoRotate = !controls.autoRotate;
      startAnimation();
      return controls.autoRotate;
    },
    focusBody: focus,
    toggleAnimation() { animated = !animated; startAnimation(); return animated; },
    async toggleSlope() {
      await loading;
      if (!globe) return false;
      try {
        slopeMap ??= await texture("/assets/slope.webp");
        slopeEnabled = !slopeEnabled;
        surface.showSlope(slopeMap, slopeEnabled);
        render();
        return slopeEnabled;
      } catch {
        message("slopeUnavailable");
        return false;
      }
    },
    face(target) {
      faceTarget = target;
      render();
    },
  };
}
