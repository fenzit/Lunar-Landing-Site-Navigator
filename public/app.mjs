import { atTime, hour, landingResult, minute, skyAtTime } from "/lib/windows.mjs";
import { drawChart } from "./chart.mjs";

const $ = selector => document.querySelector(selector);
const form = $("#analysis-form");
const field = name => form.elements.namedItem(name);
const slider = $("#time");
const mobile = matchMedia("(max-width: 760px)");
const viewInfo = {
  globe: ["CAM 01", "ГЛОБУС · РЕЛЬЕФ LOLA ×3"],
  ground: ["CAM 02", "ГОРИЗОНТ 0° · СХЕМА"],
  chart: ["CAM 03", "ГРАФИК ВЫСОТ · UTC"],
};
const sourceNames = { demo: "Сохранённые данные", cache: "Локальный кэш", live: "Запрос к JPL" };
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const date = t => `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const duration = ms => {
  const m = Math.floor(ms / minute);
  return ms > 0 && m === 0 ? "<1 мин" : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
};
const angle = n => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}°`;

let config, site, analysis, comparison, renderer;
let view = "chart", selection = "odysseus", frame = 0;
let requestId = 0, compareId = 0, nextTime = null;
let request, compareRequest;
let required = 4, cursorUpdates = [], currentAngles;
let sky, skyKey, skyRequest, skyError = false, globeTime;

async function getJson(url, signal) {
  const reply = await fetch(url, { signal });
  const result = await reply.json();
  if (!reply.ok) throw new Error(result.error || `HTTP ${reply.status}`);
  return result;
}

function status(message) {
  $("#analysis-status").textContent = message;
  $("#ui-status").textContent = message;
}

function periodParams(start, hours) {
  return new URLSearchParams({ start_utc: start, duration_hours: hours, step_minutes: 30 });
}

function queryUrl(lat, lon, start, hours) {
  const params = periodParams(start, hours);
  params.set("lat_deg", lat);
  params.set("lon_east_deg", lon);
  return `/api/analysis?${params}`;
}

function renderSky() {
  const directions = sky && Number.isFinite(globeTime)
    ? skyAtTime(sky.samples, globeTime, sky.period.step * minute) : null;
  renderer?.setSky(directions);
  $("#body-controls").hidden = !directions;
  const note = $("#globe-source");
  note.hidden = view !== "globe" || !renderer;
  note.textContent = directions
    ? `${date(globeTime)} · JPL Horizons · масштаб условный`
    : skyError ? "Направления JPL недоступны · обзорная подсветка" : "Загружаем направления JPL…";
}

async function loadSky({ start, end }) {
  const params = periodParams(new Date(start).toISOString().replace(".000", ""), (end - start) / hour);
  const key = params.toString();
  if (key === skyKey) return;
  skyKey = key;
  skyError = false;
  skyRequest?.abort();
  skyRequest = new AbortController();
  renderSky();
  try {
    const data = await getJson(`/api/sky?${params}`, skyRequest.signal);
    if (skyKey !== key) return;
    sky = data;
    const link = document.createElement("a");
    link.href = sky.source.url;
    link.textContent = "Направления для глобуса";
    $("#sky-provenance").replaceChildren(link, ` · ${sourceNames[sky.source.mode]} · MOON_ME.`);
  } catch {
    if (skyKey !== key) return;
    skyError = true;
    skyKey = null;
    $("#sky-provenance").textContent = "Для выбранного периода направления глобуса недоступны.";
  }
  renderSky();
}

function selectSite(next, kind, focus = true) {
  site = next;
  selection = kind;
  field("lat").value = site.lat;
  field("lon").value = site.lon;
  $("#site-name").textContent = site.name;
  $("#site-coordinates").textContent = `${Math.abs(site.lat).toFixed(5)}° ${site.lat < 0 ? "S" : "N"} · ${Math.abs(site.lon).toFixed(5)}° ${site.lon < 0 ? "W" : "E"}`;
  for (const button of document.querySelectorAll("[data-site]")) {
    button.setAttribute("aria-pressed", String(button.dataset.site === kind));
  }
  $("#scene-calculate").hidden = !["custom", "random"].includes(kind);
  renderer?.setSite(site, focus);
}

function resetAnalysis() {
  stopPlayback();
  request?.abort();
  compareRequest?.abort();
  requestId++;
  compareId++;
  analysis = comparison = currentAngles = null;
  $("#compare").textContent = "Сравнить с другой площадкой";
  slider.disabled = $("#play").disabled = $("#reset").disabled = $("#compare").disabled = true;
  $("#sun-signal").classList.remove("lost");
  $("#earth-signal").classList.remove("lost");
  $("#remaining").textContent = $("#stage").textContent = $("#sun-detail").textContent = $("#earth-detail").textContent = "—";
  $("#time-label").textContent = "— UTC";
  $("#outcome").textContent = $("#summary").textContent = $("#provenance").textContent = "";
  $("#source").textContent = "JPL HORIZONS";
  $("#timeline-end").textContent = "UTC";
  $("#next").hidden = true;
  drawPlots();
  renderer?.setAngles(null);
}

function fillPeriod() {
  field("start").value = config.demo.start.slice(0, 16);
  field("hours").value = config.demo.hours;
}

function updateSignal(name, el, az) {
  const visibility = el > 0 ? "выше 0°" : el < 0 ? "ниже 0°" : "на 0°";
  $(`#${name}-signal`).classList.toggle("lost", el <= 0);
  $(`#${name}-detail`).textContent = `${angle(el)} · ${visibility} · аз. ${az.toFixed(1)}°`;
}

function renderTime() {
  if (!analysis) return;
  const time = analysis.period.start + Number(slider.value) * minute;
  currentAngles = atTime(analysis.samples, time, analysis.period.stepMinutes * minute);
  globeTime = time;
  const result = landingResult(analysis.windows.both, time, required);
  $("#time-label").textContent = date(time);
  slider.setAttribute("aria-valuetext", date(time));
  $("#remaining").textContent = `${result.clipped ? "≥ " : ""}${duration(result.remaining)}`;
  $("#stage").textContent = result.sufficient ? "ХВАТАЕТ" : result.clipped ? "НЕ ПОДТВЕРЖДЕНО" : "НЕ ХВАТАЕТ";
  $("#stage").classList.toggle("warning", !result.sufficient);
  $("#required-display").textContent = required.toLocaleString("ru");
  updateSignal("sun", currentAngles.sunEl, currentAngles.sunAz);
  updateSignal("earth", currentAngles.earthEl, currentAngles.earthAz);

  nextTime = result.sufficient ? null : result.next;
  $("#next").hidden = nextTime === null;
  const next = nextTime === null ? "Подходящего старта в оставшемся периоде нет." : `Ближайший старт ≈ ${date(nextTime)}.`;
  const coverage = result.clipped ? " Видимость подтверждена до конца расчётного периода." : "";
  $("#outcome").textContent = (result.sufficient ? "Окно покрывает нужное время." : next) + coverage;
  for (const update of cursorUpdates) update(time);
  renderer?.setAngles(currentAngles);
  renderSky();
}

function drawPlots() {
  cursorUpdates = [
    drawChart($("#main-plot"), analysis, required, comparison, mobile.matches),
    drawChart($("#detail-plot"), analysis, required, comparison, mobile.matches),
  ];
  renderTime();
}

function renderAnalysis(data, keepTime = null) {
  analysis = data;
  const { start, end, stepMinutes } = data.period;
  slider.max = (end - start) / minute;
  slider.value = keepTime !== null && keepTime >= start && keepTime <= end ? (keepTime - start) / minute : 0;
  slider.disabled = $("#play").disabled = $("#reset").disabled = false;
  $("#compare").disabled = false;
  $("#timeline-end").textContent = date(end).slice(5, 16);
  $("#source").replaceChildren("JPL HORIZONS", document.createElement("br"));
  const tag = document.createElement("span");
  tag.textContent = sourceNames[data.source.mode];
  $("#source").append(tag);
  $("#summary").textContent = `Общее время видимости ${duration(data.summary.totalMs)}. Самое длинное окно в периоде ${duration(data.summary.longestMs)}.`;
  if (comparison) {
    $("#summary").textContent += ` ${comparison.name}: общее время ${duration(comparison.analysis.summary.totalMs)}.`;
  }
  const provenance = $("#provenance");
  provenance.replaceChildren(`NASA/JPL Horizons · ${sourceNames[data.source.mode]} · ${stepMinutes} мин · ${date(start)} — ${date(end)}. `);
  for (const [target, label] of [["sun", "Солнце"], ["earth", "Земля"]]) {
    const record = data.source.records[target];
    const link = document.createElement("a");
    link.href = record.url;
    link.textContent = `${label} (API ${record.version})`;
    provenance.append(link, ` · получено ${date(Date.parse(record.retrievedUtc))}. `);
  }
  drawPlots();
  loadSky(data.period);
}

async function loadAnalysis(url, keepTime = null) {
  resetAnalysis();
  const id = requestId;
  request = new AbortController();
  status("Загружаем эфемериды…");
  try {
    const data = await getJson(url, request.signal);
    if (id !== requestId) return;
    selectSite({ ...site, lat: data.site.lat, lon: data.site.lon }, selection, false);
    renderAnalysis(data, keepTime);
    status(sourceNames[data.source.mode]);
  } catch (error) {
    if (id === requestId) status(error.message);
  }
}

function submit() {
  const lat = Number(field("lat").value), lon = Number(field("lon").value);
  const preset = config.sites.find(point => point.lat === lat && point.lon === lon);
  const keepTime = currentAngles?.t ?? null;
  const moved = lat !== site.lat || lon !== site.lon;
  const kind = selection === "random" && !moved ? "random" : "custom";
  selectSite(preset || { name: kind === "random" ? "Случайная точка" : "Выбранная точка", lat, lon },
    preset?.id || kind, moved);
  loadAnalysis(queryUrl(lat, lon, `${field("start").value}Z`, field("hours").value), keepTime);
}

function pickSite(coords) {
  resetAnalysis();
  selectSite({ ...coords, name: "Выбранная точка" }, "custom", false);
  $("#viewport").classList.remove("picking");
  status("Точка выбрана. Нажмите «Рассчитать для точки».");
  if (mobile.matches) {
    $("#conditions-toggle").setAttribute("aria-expanded", "true");
    $("#conditions-panel").classList.add("open");
  }
}

async function showView(next) {
  view = next;
  $("#view-number").textContent = viewInfo[view][0];
  $("#view-label").textContent = viewInfo[view][1];
  $("#main-plot").hidden = view !== "chart";
  $("#viewport").hidden = view === "chart";
  $("#map-tools").hidden = view !== "globe";
  $("#sky-tools").hidden = view !== "ground";
  renderSky();
  $("#scene-message").hidden = true;
  for (const button of document.querySelectorAll("[data-view]")) {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  }
  if (view === "chart") {
    renderer?.show("chart");
    return;
  }
  try {
    if (!renderer) {
      const { createScene } = await import("./scene.mjs");
      renderer ??= createScene($("#viewport"), {
        pick: pickSite,
        message: text => {
          $("#scene-message").textContent = text;
          $("#scene-message").hidden = !text || view === "chart";
        },
      });
      renderer.setSite(site, true);
      renderer.setAngles(currentAngles);
    }
    renderer.show(view);
    renderSky();
  } catch {
    $("#scene-message").textContent = "3D недоступно. График и ручной выбор координат работают.";
    $("#scene-message").hidden = false;
    $("#map-tools").hidden = $("#sky-tools").hidden = true;
    $("#globe-source").hidden = true;
  }
}

function stopPlayback() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  $("#play span").textContent = "Прокрутить время";
}

function play() {
  if (frame) return stopPlayback();
  if (slider.value === slider.max) slider.value = 0;
  const from = Number(slider.value), to = Number(slider.max);
  const started = performance.now();
  $("#play span").textContent = "Пауза";
  function tick(now) {
    const fraction = Math.min(1, (now - started) / 20000);
    const minuteIndex = Math.round(from + (to - from) * fraction);
    const shown = reducedMotion.matches && fraction < 1 ? from + Math.floor((minuteIndex - from) / 60) * 60 : minuteIndex;
    if (Number(slider.value) !== shown) {
      slider.value = shown;
      renderTime();
    }
    if (fraction < 1) frame = requestAnimationFrame(tick);
    else stopPlayback();
  }
  frame = requestAnimationFrame(tick);
}

async function compare() {
  if (!analysis || comparison) {
    comparison = null;
    $("#compare").textContent = "Сравнить с другой площадкой";
    if (analysis) renderAnalysis(analysis, currentAngles.t);
    return;
  }
  const other = config.sites.find(point => point.id !== site.id);
  const { start, end } = analysis.period;
  const id = ++compareId;
  compareRequest = new AbortController();
  $("#compare").disabled = true;
  status(`Загружаем ${other.name} на ту же шкалу UTC…`);
  try {
    const data = await getJson(queryUrl(other.lat, other.lon, new Date(start).toISOString().replace(".000", ""),
      (end - start) / hour), compareRequest.signal);
    if (id !== compareId) return;
    comparison = { name: other.name, analysis: data };
    $("#compare").textContent = "Скрыть сравнение";
    renderAnalysis(analysis, currentAngles.t);
    status(`Сравнение с ${other.name} · ${sourceNames[data.source.mode]}`);
  } catch (error) {
    if (id === compareId) status(error.message);
  } finally {
    if (id === compareId) $("#compare").disabled = false;
  }
}

async function init() {
  config = await getJson("/api/sites");
  fillPeriod();
  selectSite(config.sites[0], config.sites[0].id);
  for (const button of document.querySelectorAll("[data-site]")) button.addEventListener("click", () => {
    const kind = button.dataset.site;
    const preset = config.sites.find(point => point.id === kind);
    if (preset) {
      selectSite(preset, kind);
      form.requestSubmit();
    } else if (kind === "random") {
      resetAnalysis();
      const latitude = Math.asin(2 * Math.random() - 1) * 180 / Math.PI;
      const lat = Math.max(-89.999999, Math.min(89.999999, Number(latitude.toFixed(6))));
      const lon = Number((360 * Math.random() - 180).toFixed(6));
      selectSite({ name: "Случайная точка", lat, lon }, kind);
      showView("globe");
      status("Случайная точка выбрана. Нажмите «Рассчитать для точки».");
    } else {
      showView("globe");
      $("#viewport").classList.add("picking");
      status("Нажмите на глобус или введите координаты в параметрах анализа.");
      $("#conditions-toggle").setAttribute("aria-expanded", "false");
      $("#conditions-panel").classList.remove("open");
    }
  });
  form.addEventListener("submit", event => { event.preventDefault(); submit(); });
  $("#scene-calculate").addEventListener("click", () => form.requestSubmit());
  $("#demo").addEventListener("click", () => {
    const preset = config.sites.find(point => point.id === site.id) || config.sites[0];
    fillPeriod();
    selectSite(preset, preset.id);
    loadAnalysis(`/api/demo/${preset.id}`);
  });
  $("#compare").addEventListener("click", compare);
  $("#next").addEventListener("click", () => {
    slider.value = (nextTime - analysis.period.start) / minute;
    renderTime();
  });
  $("#required").addEventListener("input", event => {
    if (!event.target.validity.valid) return;
    required = event.target.valueAsNumber;
    $("#required-display").textContent = required.toLocaleString("ru");
    drawPlots();
  });
  slider.addEventListener("input", () => { stopPlayback(); renderTime(); });
  $("#reset").addEventListener("click", () => { stopPlayback(); slider.value = 0; renderTime(); });
  $("#play").addEventListener("click", play);
  $("#conditions-toggle").addEventListener("click", event => {
    const open = event.currentTarget.getAttribute("aria-expanded") !== "true";
    event.currentTarget.setAttribute("aria-expanded", String(open));
    $("#conditions-panel").classList.toggle("open", open);
  });
  for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => showView(button.dataset.view));
  $("#rotate").addEventListener("click", event => event.currentTarget.setAttribute("aria-pressed", String(renderer?.toggleRotation())));
  $("#slope").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    const enabled = await renderer?.toggleSlope();
    button.setAttribute("aria-pressed", String(Boolean(enabled)));
    $("#slope-key").hidden = !enabled;
    button.disabled = false;
  });
  $("#face-sun").addEventListener("click", () => renderer?.face("sun"));
  $("#face-earth").addEventListener("click", () => renderer?.face("earth"));
  for (const target of ["sun", "earth"]) {
    $(`#globe-${target}`).addEventListener("click", () => {
      renderer?.faceGlobe(target);
      $("#rotate").setAttribute("aria-pressed", "false");
    });
  }
  mobile.addEventListener("change", drawPlots);
  if (!mobile.matches) showView("globe");
  await loadAnalysis("/api/demo/odysseus");
}

init().catch(error => status(`Приложение не загрузилось. ${error.message}`));
