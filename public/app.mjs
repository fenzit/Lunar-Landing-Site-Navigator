import { atTime, hour, landingResult, minute, skyAtTime } from "/lib/windows.mjs";
import { apiErrorMessage } from "/lib/api-errors.mjs";
import { maxPeriodHours } from "/lib/sites.mjs";
import { drawChart } from "./chart.mjs";
import { language, localizePage, setLanguage, t } from "./i18n.mjs";

const $ = selector => document.querySelector(selector);
const form = $("#analysis-form");
const field = name => form.elements.namedItem(name);
const slider = $("#time");
field("hours").max = field("required").max = maxPeriodHours;
const mobile = matchMedia("(max-width: 760px)");
const viewInfo = {
  globe: ["CAM 01", "globeCaption"],
  ground: ["CAM 02", "groundCaption"],
  chart: ["CAM 03", "chartCaption"],
};
const sourceKeys = { demo: "saved", cache: "cached", live: "live" };
const sourceName = mode => t(sourceKeys[mode]);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const date = t => `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const duration = ms => {
  const m = Math.floor(ms / minute);
  return ms > 0 && m === 0 ? `<1 ${t("minutes")}` : `${Math.floor(m / 60)} ${t("hours")} ${String(m % 60).padStart(2, "0")} ${t("minutes")}`;
};
const angle = n => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}°`;

let config, site, analysis, comparison, renderer;
let view = "chart", selection = "odysseus", frame = 0;
let requestId = 0, compareId = 0, nextTime = null;
let request, compareRequest;
let required = 4, cursorUpdates = [], currentAngles;
let sky, skyKey, skyRequest, skyError = false, globeTime;
let statusMessage, sceneMessage;

function requestError(error) {
  if (!error.responseStatus) return t("requestFailed");
  return apiErrorMessage(error.apiCode, error.apiParams, language)
    ?? t("httpError", { status: error.responseStatus });
}

async function getJson(url, signal) {
  const reply = await fetch(url, { signal });
  const result = await reply.json();
  if (!reply.ok) {
    throw Object.assign(new Error(result.error), {
      apiCode: result.code, apiParams: result.params, responseStatus: reply.status,
    });
  }
  return result;
}

function status(key, values) {
  statusMessage = () => t(key, typeof values === "function" ? values() : values);
  renderStatus();
}

function statusRequestError(error) {
  statusMessage = () => requestError(error);
  renderStatus();
}

function renderStatus() {
  if (!statusMessage) return;
  const message = statusMessage();
  $("#analysis-status").textContent = message;
  $("#ui-status").textContent = message;
}

function showSceneMessage(key) {
  sceneMessage = key;
  $("#scene-message").textContent = key ? t(key) : "";
  $("#scene-message").hidden = !key || view === "chart";
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
    ? `${date(globeTime)} · JPL Horizons · ${t("notToScale")}`
    : t(skyError ? "skyUnavailable" : "skyLoading");
}

function renderSkyProvenance() {
  const note = $("#sky-provenance");
  note.replaceChildren();
  if (skyError) note.textContent = t("skyPeriodUnavailable");
  else if (sky) {
    const link = document.createElement("a");
    link.href = sky.source.url;
    link.textContent = t("globeDirections");
    note.append(link, ` · ${sourceName(sky.source.mode)} · MOON_ME.`);
  }
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
  } catch {
    if (skyKey !== key) return;
    skyError = true;
    skyKey = null;
  }
  renderSky();
  renderSkyProvenance();
}

function renderSite(focus) {
  if (!site) return;
  const name = site.name ?? t(selection === "random" ? "randomSite" : "selectedSite");
  $("#site-name").textContent = name;
  renderer?.setSite({ ...site, name }, focus);
}

function selectSite(next, kind, focus = true) {
  site = next;
  selection = kind;
  field("lat").value = site.lat;
  field("lon").value = site.lon;
  $("#site-coordinates").textContent = `${Math.abs(site.lat).toFixed(5)}° ${site.lat < 0 ? "S" : "N"} · ${Math.abs(site.lon).toFixed(5)}° ${site.lon < 0 ? "W" : "E"}`;
  for (const button of document.querySelectorAll("[data-site]")) {
    button.setAttribute("aria-pressed", String(button.dataset.site === kind));
  }
  $("#scene-calculate").hidden = !["custom", "random"].includes(kind);
  renderSite(focus);
}

function resetAnalysis() {
  stopPlayback();
  request?.abort();
  compareRequest?.abort();
  requestId++;
  compareId++;
  analysis = comparison = currentAngles = null;
  $("#compare").textContent = t("compare");
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
  const visibility = t(el > 0 ? "above" : el < 0 ? "below" : "onHorizon");
  $(`#${name}-signal`).classList.toggle("lost", el <= 0);
  $(`#${name}-detail`).textContent = `${angle(el)} · ${visibility}\n${t("azimuth")} ${az.toFixed(1)}°`;
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
  $("#stage").textContent = t(result.sufficient ? "enough" : result.clipped ? "unconfirmed" : "insufficient");
  $("#stage").classList.toggle("warning", !result.sufficient);
  $("#required-display").textContent = required.toLocaleString(language);
  updateSignal("sun", currentAngles.sunEl, currentAngles.sunAz);
  updateSignal("earth", currentAngles.earthEl, currentAngles.earthAz);

  nextTime = result.sufficient ? null : result.next;
  $("#next").hidden = nextTime === null;
  const next = nextTime === null ? t("noStart") : t("nextStart", { time: date(nextTime) });
  const coverage = result.clipped ? ` ${t("coverage")}` : "";
  $("#outcome").textContent = (result.sufficient ? t("windowSufficient") : next) + coverage;
  for (const update of cursorUpdates) update(time);
  renderer?.setAngles(currentAngles);
  renderSky();
}

function drawPlots() {
  cursorUpdates = [
    drawChart($("#main-plot"), analysis, required, comparison),
    drawChart($("#detail-plot"), analysis, required, comparison),
  ];
  renderTime();
}

function renderAnalysisText() {
  if (!analysis) return;
  const data = analysis;
  const { start, end, stepMinutes } = data.period;
  $("#source").replaceChildren("JPL HORIZONS", document.createElement("br"));
  const tag = document.createElement("span");
  tag.textContent = sourceName(data.source.mode);
  $("#source").append(tag);
  $("#summary").textContent = t("summary", { total: duration(data.summary.totalMs), longest: duration(data.summary.longestMs) });
  if (comparison) {
    $("#summary").textContent += ` ${t("compareSummary", { name: comparison.name, total: duration(comparison.analysis.summary.totalMs) })}`;
  }
  const provenance = $("#provenance");
  provenance.replaceChildren(`NASA/JPL Horizons · ${sourceName(data.source.mode)} · ${stepMinutes} ${t("minutes")} · ${date(start)} — ${date(end)}. `);
  for (const target of ["sun", "earth"]) {
    const record = data.source.records[target];
    const link = document.createElement("a");
    link.href = record.url;
    link.textContent = `${t(target)} (API ${record.version})`;
    provenance.append(link, ` · ${t("retrieved", { time: date(Date.parse(record.retrievedUtc)) })} `);
  }
}

function renderAnalysis(data, keepTime = null) {
  analysis = data;
  const { start, end } = data.period;
  slider.max = (end - start) / minute;
  slider.value = keepTime !== null && keepTime >= start && keepTime <= end ? (keepTime - start) / minute : 0;
  slider.disabled = $("#play").disabled = $("#reset").disabled = false;
  $("#compare").disabled = false;
  $("#timeline-end").textContent = date(end).slice(5, 16);
  renderAnalysisText();
  drawPlots();
  loadSky(data.period);
}

async function loadAnalysis(url, keepTime = null) {
  resetAnalysis();
  const id = requestId;
  request = new AbortController();
  status("ephemerisLoading");
  try {
    const data = await getJson(url, request.signal);
    if (id !== requestId) return;
    selectSite({ ...site, lat: data.site.lat, lon: data.site.lon }, selection, false);
    renderAnalysis(data, keepTime);
    status(sourceKeys[data.source.mode]);
  } catch (error) {
    if (id === requestId) statusRequestError(error);
  }
}

function submit() {
  const lat = Number(field("lat").value), lon = Number(field("lon").value);
  const preset = config.sites.find(point => point.lat === lat && point.lon === lon);
  const keepTime = currentAngles?.t ?? null;
  const moved = lat !== site.lat || lon !== site.lon;
  const kind = selection === "random" && !moved ? "random" : "custom";
  selectSite(preset || { lat, lon },
    preset?.id || kind, moved);
  loadAnalysis(queryUrl(lat, lon, `${field("start").value}Z`, field("hours").value), keepTime);
}

function pickSite(coords) {
  resetAnalysis();
  selectSite(coords, "custom", false);
  $("#viewport").classList.remove("picking");
  status("picked");
  if (mobile.matches) {
    $("#conditions-toggle").setAttribute("aria-expanded", "true");
    $("#conditions-panel").classList.add("open");
  }
}

async function showView(next) {
  view = next;
  $("#view-number").textContent = viewInfo[view][0];
  $("#view-label").textContent = t(viewInfo[view][1]);
  $("#main-plot").hidden = view !== "chart";
  $("#viewport").hidden = view === "chart";
  $("#map-tools").hidden = view !== "globe";
  $("#sky-tools").hidden = view !== "ground";
  renderSky();
  showSceneMessage(null);
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
        message: showSceneMessage,
      });
      renderSite(true);
      renderer.setAngles(currentAngles);
    }
    renderer.show(view);
    renderSky();
  } catch {
    showSceneMessage("no3d");
    $("#map-tools").hidden = $("#sky-tools").hidden = true;
    $("#globe-source").hidden = true;
  }
}

function stopPlayback() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  $("#play span").textContent = t("play");
}

function play() {
  if (frame) return stopPlayback();
  if (slider.value === slider.max) slider.value = 0;
  const from = Number(slider.value), to = Number(slider.max);
  const started = performance.now();
  $("#play span").textContent = t("pause");
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
    $("#compare").textContent = t("compare");
    if (analysis) renderAnalysis(analysis, currentAngles.t);
    return;
  }
  const other = config.sites.find(point => point.id !== site.id);
  const { start, end } = analysis.period;
  const id = ++compareId;
  compareRequest = new AbortController();
  $("#compare").disabled = true;
  status("comparing", { name: other.name });
  try {
    const data = await getJson(queryUrl(other.lat, other.lon, new Date(start).toISOString().replace(".000", ""),
      (end - start) / hour), compareRequest.signal);
    if (id !== compareId) return;
    comparison = { name: other.name, analysis: data };
    $("#compare").textContent = t("hideComparison");
    renderAnalysis(analysis, currentAngles.t);
    status("compared", () => ({ name: other.name, source: sourceName(data.source.mode) }));
  } catch (error) {
    if (id === compareId) statusRequestError(error);
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
      selectSite({ lat, lon }, kind);
      showView("globe");
      status("randomPicked");
    } else {
      showView("globe");
      $("#viewport").classList.add("picking");
      status("pickHint");
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
    $("#required-display").textContent = required.toLocaleString(language);
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
  window.addEventListener("resize", drawPlots);
  showView(mobile.matches ? "chart" : "globe");
  await loadAnalysis("/api/demo/odysseus");
}

function refreshLanguage() {
  localizePage();
  $("#view-label").textContent = t(viewInfo[view][1]);
  $("#play span").textContent = t(frame ? "pause" : "play");
  $("#compare").textContent = t(comparison ? "hideComparison" : "compare");
  $("#required-display").textContent = required.toLocaleString(language);
  renderSite(false);
  renderAnalysisText();
  renderStatus();
  renderSkyProvenance();
  showSceneMessage(sceneMessage);
  renderer?.localize();
  drawPlots();
  renderSky();
}

for (const button of document.querySelectorAll("[data-language]")) {
  button.addEventListener("click", () => {
    setLanguage(button.dataset.language);
    refreshLanguage();
  });
}
refreshLanguage();
init().catch(error => status("loadFailed", () => ({ error: requestError(error) })));
