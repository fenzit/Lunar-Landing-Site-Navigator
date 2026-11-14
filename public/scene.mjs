import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { heightAt, moonCoordinates, moonDirection, skyDirection } from "/lib/geography.mjs";
import { sites } from "/lib/sites.mjs";
import { moonMaterial } from "./moon-material.mjs";

const rad = Math.PI / 180;
const relief = 3;
const referenceKm = 1737.4;
const bodyDistance = 1.95;
const bodyNames = { sun: "Солнце", earth: "Земля" };
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
  const sun = new THREE.Mesh(new THREE.SphereGeometry(.17, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xffce78 }));
  const earth = new THREE.Mesh(new THREE.SphereGeometry(.13, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0x9acaff, roughness: 1, emissive: 0x162331 }));
  world.add(sun, earth);
  return Object.fromEntries(Object.entries({ sun, earth }).map(([key, mesh]) => {
    mesh.visible = false;
    return [key, { mesh, label: makeLabel(root, bodyNames[key], `body-label ${key}`) }];
  }));
}

function labelGlobeBody(body, name, camera) {
  const { mesh, label } = body;
  label.hidden = !mesh.visible;
  if (label.hidden) return;
  const projected = mesh.position.clone().project(camera);
  const local = mesh.position.clone().applyMatrix4(camera.matrixWorldInverse);
  const ray = mesh.position.clone().sub(camera.position);
  const fraction = -camera.position.dot(ray) / ray.lengthSq();
  const occulted = fraction > 0 && fraction < 1 &&
    camera.position.clone().addScaledVector(ray, fraction).lengthSq() < 1;
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
  label.textContent = local.z >= 0 ? `${name} · позади` : `${name} ${arrow}`;
  label.style.left = `${(x + 1) * 50}%`;
  label.style.top = `${(1 - y) * 50}%`;
  label.style.transform = "translate(-50%, -50%)";
}

function makeGround() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(49, 1, 0.1, 1200);
  camera.position.set(0, 1.5, 0);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800),
    new THREE.MeshStandardMaterial({ color: 0x494c47, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground, new THREE.HemisphereLight(0xeee8da, 0x3c4240, 2));
  const light = new THREE.DirectionalLight(0xfaf0d7, 2);
  light.position.set(4, 6, -4);
  scene.add(light);

  const lander = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: 0x998058, metalness: .23, roughness: .65 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x9ca39c, metalness: .32 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.6, .73, .88, 6), foil);
  body.position.y = .87;
  lander.add(body);
  for (let i = 0; i < 4; i++) {
    const theta = Math.PI / 4 + i * Math.PI / 2;
    const foot = new THREE.Vector3(1.03 * Math.cos(theta), .06, 1.03 * Math.sin(theta));
    const joint = new THREE.Vector3(.42 * Math.cos(theta), .83, .42 * Math.sin(theta));
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, joint.distanceTo(foot), 6), frame);
    leg.position.copy(foot).lerp(joint, .5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), joint.sub(foot).normalize());
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(.16, .17, .07, 8), frame);
    pad.position.copy(foot);
    lander.add(leg, pad);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.033, .033, .4, 6), frame);
  mast.position.y = 1.44;
  lander.add(mast);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(.23, .13, 10), foil);
  dish.position.y = 1.69;
  dish.rotation.z = .35;
  lander.add(dish);
  scene.add(lander);

  const objects = {
    sun: new THREE.Mesh(new THREE.SphereGeometry(4.3, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd27d })),
    earth: new THREE.Mesh(new THREE.SphereGeometry(4.7, 24, 16), new THREE.MeshStandardMaterial({ color: 0x5b96c0, emissive: 0x1d4160 })),
  };
  scene.add(objects.sun, objects.earth);
  return { scene, camera, objects, lander };
}

export function createScene(root, { pick, message }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "3D-сцена. На глобусе используйте стрелки для вращения, плюс и минус для зума, Enter для выбора точки.");
  root.append(canvas);

  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, .05, 100);
  camera.position.set(0, 0, 3.7);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minDistance = 1.28;
  controls.maxDistance = 7.5;
  controls.autoRotateSpeed = .55;
  const light = new THREE.DirectionalLight(0xfff5e5, 2.65);
  light.position.set(-2, 3, 4);
  const fill = new THREE.AmbientLight(0xcad9fa, .58);
  world.add(light, fill);
  const bodies = makeGlobeBodies(world, root);
  const ground = makeGround();
  const textureLoader = new THREE.TextureLoader();
  const labels = sites.map(site => makeLabel(root, site.name, "map-label"));
  const pickedLabel = makeLabel(root, "", "map-label");
  const skyLabels = { sun: makeLabel(root, "Солнце"), earth: makeLabel(root, "Земля") };
  const markers = new THREE.Group();
  world.add(markers);
  const ray = new THREE.Raycaster();
  let globe, surface, slopeMap, loading, selected, angles, sky, view = "chart";
  let frame = 0, yaw = 0, pitch = 0, faceTarget = null, slopeEnabled = false;
  const pins = [...sites.map((site, index) => ({ site, label: labels[index], color: 0xb1c79d })),
    { site: null, label: pickedLabel, color: 0xd9efad }];

  function pinPosition(site) {
    const direction = vector(moonDirection(site.lat, site.lon));
    if (!globe) return direction;
    ray.set(direction.clone().multiplyScalar(2), direction.clone().negate());
    const surface = ray.intersectObject(globe)[0];
    return surface ? surface.point.addScaledVector(direction, .012) : direction.multiplyScalar(1.02);
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
    message("Загружаем глобус LRO и LOLA…");
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
      world.add(globe);
      globe.updateMatrixWorld();
      positionPins();
      if (view === "globe") message("");
      render();
      texture("/assets/earth.webp").then(map => {
        bodies.earth.mesh.material.color.set(0xffffff);
        bodies.earth.mesh.material.map = map;
        bodies.earth.mesh.material.needsUpdate = true;
        if (view === "globe") render();
      }).catch(() => {});
    } catch {
      if (view === "globe") message("Глобус недоступен. Можно выбрать координаты в параметрах анализа.");
    }
  }

  function updateGround() {
    for (const key of ["sun", "earth"]) {
      const object = ground.objects[key];
      const elevation = angles?.[`${key}El`];
      object.visible = elevation > 0;
      if (object.visible) {
        object.position.copy(vector(skyDirection(angles[`${key}Az`], elevation)).multiplyScalar(165)).add(ground.camera.position);
      }
    }
    if (faceTarget && angles) {
      yaw = angles[`${faceTarget}Az`];
      pitch = Math.max(0, angles[`${faceTarget}El`] * .6);
    }
    ground.camera.lookAt(ground.camera.position.clone().add(vector(skyDirection(yaw, pitch))));
    ground.lander.position.copy(vector(skyDirection(yaw + 16, 0)).multiplyScalar(4.5));
    ground.lander.rotation.y = -yaw * rad;
  }

  function render() {
    if (view === "chart") return;
    const width = root.clientWidth, height = root.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const currentCamera = view === "globe" ? camera : ground.camera;
    currentCamera.aspect = aspect;
    currentCamera.updateProjectionMatrix();
    if (view === "globe") {
      renderer.render(world, camera);
      for (const pin of pins) {
        const marker = pin.mesh;
        const visible = marker?.visible && marker.position.dot(camera.position) > marker.position.lengthSq();
        if (marker) projectedLabel(pin.label, marker.position, camera, visible);
      }
      for (const [key, body] of Object.entries(bodies)) labelGlobeBody(body, bodyNames[key], camera);
    } else {
      updateGround();
      renderer.render(ground.scene, ground.camera);
      for (const [key, object] of Object.entries(ground.objects)) {
        projectedLabel(skyLabels[key], object.position, ground.camera, object.visible);
      }
    }
  }

  function resize() {
    if (!root.clientWidth || !root.clientHeight) return;
    renderer.setSize(root.clientWidth, root.clientHeight, false);
    render();
  }
  new ResizeObserver(resize).observe(root);
  controls.addEventListener("change", render);

  function animate() {
    frame = 0;
    if (view !== "globe" || !controls.autoRotate) return;
    controls.update();
    frame = requestAnimationFrame(animate);
  }

  function pickAt(x, y) {
    if (!globe || view !== "globe") return;
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const hit = ray.intersectObject(globe)[0];
    if (!hit) return;
    const visibleBodies = Object.values(bodies).map(body => body.mesh).filter(mesh => mesh.visible);
    if (ray.intersectObjects(visibleBodies)[0]?.distance < hit.distance) return;
    const coords = moonCoordinates(hit.point.x, hit.point.y, hit.point.z);
    coords.lat = Math.max(-89.999999, Math.min(89.999999, coords.lat));
    pick(coords);
  }

  let pointer = null;
  canvas.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) { pointer = null; return; }
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    if (view === "ground") canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 5) pointer.dragged = true;
    if (view === "ground" && pointer.dragged) {
      faceTarget = null;
      yaw -= dx * .21;
      pitch = THREE.MathUtils.clamp(pitch + dy * .17, -23, 75);
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
      const spherical = new THREE.Spherical().setFromVector3(camera.position);
      if (event.key === "ArrowLeft") spherical.theta -= .12;
      else if (event.key === "ArrowRight") spherical.theta += .12;
      else if (event.key === "ArrowUp") spherical.phi -= .12;
      else if (event.key === "ArrowDown") spherical.phi += .12;
      else if (["+", "="].includes(event.key)) spherical.radius = Math.max(controls.minDistance, spherical.radius * .9);
      else if (event.key === "-") spherical.radius = Math.min(controls.maxDistance, spherical.radius * 1.1);
      else if (event.key === "Enter") pickAt(0, 0);
      else return;
      camera.position.setFromSpherical(spherical.makeSafe());
      controls.update();
    } else if (view === "ground" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      faceTarget = null;
      yaw += event.key === "ArrowLeft" ? -9 : event.key === "ArrowRight" ? 9 : 0;
      pitch = THREE.MathUtils.clamp(pitch + (event.key === "ArrowUp" ? 6 : event.key === "ArrowDown" ? -6 : 0), -23, 75);
      render();
    } else return;
    event.preventDefault();
  });

  return {
    show(next) {
      view = next;
      for (const label of [...labels, pickedLabel, ...Object.values(skyLabels),
        ...Object.values(bodies).map(body => body.label)]) label.hidden = true;
      controls.enabled = view === "globe";
      if (view === "globe" && !loading) loading = loadGlobe();
      if (view === "ground") {
        faceTarget = angles ? (angles.sunEl > 0 ? "sun" : "earth") : null;
        message("Условная модель аппарата и размеры объектов");
      }
      resize();
      if (view === "globe" && controls.autoRotate && !frame) animate();
    },
    setSite(site, focus) {
      selected = site;
      pins.at(-1).site = site;
      pickedLabel.textContent = site.name;
      if (focus) {
        const distance = Math.max(3.45, camera.position.length());
        const lat = site.lat * .82;
        camera.position.copy(vector(moonDirection(lat, site.lon)).multiplyScalar(distance));
        controls.update();
      }
      positionPins();
      render();
    },
    setAngles(value) {
      angles = value;
      if (view === "ground") render();
    },
    setSky(value) {
      sky = value;
      for (const [key, { mesh }] of Object.entries(bodies)) {
        mesh.visible = Boolean(sky);
        if (sky) mesh.position.copy(vector(moonDirection(sky[`${key}Lat`], sky[`${key}Lon`])).multiplyScalar(bodyDistance));
      }
      // Directional light uses the true angular direction, independent of the display orbit.
      light.position.copy(sky ? bodies.sun.mesh.position : new THREE.Vector3(-2, 3, 4));
      fill.intensity = sky ? .17 : .58;
      if (view === "globe") render();
    },
    faceGlobe(target) {
      if (!sky || view !== "globe") return;
      controls.autoRotate = false;
      const lon = sky[`${target}Lon`] + (target === "sun" ? -57 : 57);
      const distance = Math.min(controls.maxDistance, Math.max(5.1, 6.8 / camera.aspect));
      camera.position.copy(vector(moonDirection(sky[`${target}Lat`], lon)).multiplyScalar(distance));
      controls.update();
      render();
    },
    toggleRotation() {
      controls.autoRotate = !controls.autoRotate;
      if (controls.autoRotate && !frame) animate();
      return controls.autoRotate;
    },
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
        message("Текстура уклонов недоступна.");
        return false;
      }
    },
    face(target) {
      faceTarget = target;
      render();
    },
  };
}
