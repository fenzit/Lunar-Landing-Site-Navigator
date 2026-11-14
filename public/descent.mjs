import * as THREE from "three";
import { t } from "./i18n.mjs";
import { createDescentExhaust } from "./descent-exhaust.mjs";

// An illustrative approach in local metres. Time is playback time.
export const descentSeconds = 18;
export function descentOffset(seconds) {
  const remaining = 1 - Math.max(0, Math.min(seconds / descentSeconds, 1));
  return {
    east: 14 * remaining ** 3,
    height: 32 * remaining ** 2,
    south: -18 * remaining ** 3,
  };
}

const moveKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"];

export function createDescent(camera, lander, canvas, wake, heightAt) {
  const play = document.querySelector("#descent-play");
  const scrub = document.querySelector("#descent-time");
  const readout = document.querySelector("#descent-readout");
  const recenterButton = document.querySelector("#descent-recenter");
  scrub.max = descentSeconds;
  const keys = new Set();
  const landing = new THREE.Vector3();
  const landedOrientation = new THREE.Quaternion();
  const levelOrientation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const orientation = new THREE.Euler(0, 0, 0, "YXZ");
  const exhaust = createDescentExhaust(lander, heightAt);
  let active = false, ready = false, playing = false, tracking = true, time = 0;

  function updateReadout() {
    play.textContent = t(playing ? "descentPause" : time === descentSeconds ? "descentReplay" : "descentPlay");
    scrub.value = time;
    readout.textContent = ready ? t("descentReadout", { time: time.toFixed(1), height: descentOffset(time).height.toFixed(1) }) : "";
  }

  function positionLander() {
    const { east, height, south } = descentOffset(time);
    lander.position.set(landing.x + east, landing.y + height, landing.z + south);
    lander.quaternion.copy(levelOrientation).slerp(landedOrientation, Math.max(0, 1 - height / 3));
    lander.updateMatrixWorld(true);
    exhaust.update(time, height);
    if (tracking) camera.lookAt(lander.position.x, lander.position.y + 1.5, lander.position.z);
  }

  function recenter() {
    camera.position.copy(landing).add(new THREE.Vector3(19, 12, 28));
    tracking = true;
    positionLander();
    wake();
  }

  play.addEventListener("click", () => {
    if (time === descentSeconds) time = 0;
    playing = !playing;
    positionLander();
    updateReadout();
    wake();
  });
  scrub.addEventListener("input", () => {
    playing = false;
    time = scrub.valueAsNumber;
    positionLander();
    updateReadout();
    wake();
  });
  recenterButton.addEventListener("click", () => {
    recenter();
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener("keydown", event => {
    if (!ready || !moveKeys.includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    wake();
  });
  canvas.addEventListener("keyup", event => keys.delete(event.code));
  canvas.addEventListener("blur", () => keys.clear());
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => { if (document.hidden) keys.clear(); });

  return {
    show(value) {
      if (active === value) return;
      if (!value && ready) {
        lander.position.copy(landing);
        lander.quaternion.copy(landedOrientation);
        lander.updateMatrixWorld(true);
      }
      active = value;
      exhaust.hide();
      ready = playing = false;
      keys.clear();
      time = 0;
      play.disabled = scrub.disabled = recenterButton.disabled = true;
      updateReadout();
    },
    start() {
      if (!active || ready || !lander.visible) return;
      ready = true;
      playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      landing.copy(lander.position);
      landedOrientation.copy(lander.quaternion);
      orientation.setFromQuaternion(landedOrientation);
      levelOrientation.setFromAxisAngle(up, orientation.y);
      play.disabled = scrub.disabled = recenterButton.disabled = false;
      recenter();
      updateReadout();
    },
    look(dx, dy) {
      if (!ready) return;
      tracking = false;
      orientation.setFromQuaternion(camera.quaternion);
      orientation.y -= dx;
      orientation.x = THREE.MathUtils.clamp(orientation.x + dy, -1.55, 1.55);
      camera.quaternion.setFromEuler(orientation);
      wake();
    },
    advance(dt) {
      if (!ready) return;
      if (keys.size) {
        direction.set(
          Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
          0,
          Number(keys.has("KeyS")) - Number(keys.has("KeyW")),
        ).applyQuaternion(camera.quaternion);
        direction.y += Number(keys.has("KeyE")) - Number(keys.has("KeyQ"));
        camera.position.addScaledVector(direction.normalize(), (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 36 : 9) * dt);
      }
      if (playing) {
        time = Math.min(descentSeconds, time + dt);
        if (time === descentSeconds) playing = false;
        updateReadout();
      }
      positionLander();
    },
    moving: () => ready && (playing || keys.size > 0),
    localize: updateReadout,
  };
}
