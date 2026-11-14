import { runVisibilityBatch, visibilityGrid } from "/lib/visibility-batch.mjs";
import { t } from "./i18n.mjs";

const spacing = 400;
const centerIndex = 4;
const marker = {
  mapBoth: "◉",
  mapSun: "☀",
  mapEarth: "⊕",
  mapNeither: "○",
  mapNoData: "?",
  mapWaiting: "…",
  mapSkipped: "–",
};
const states = [
  ["mapNeither", "mapEarth"],
  ["mapSun", "mapBoth"],
];

function pointState(result, running) {
  if (!result) return running ? "mapWaiting" : "mapSkipped";
  if (!result.bodies) return "mapNoData";
  return states[Number(result.bodies.sun.visible)][Number(result.bodies.earth.visible)];
}

function coordinates(point) {
  return `${point.lat.toFixed(5)}°, ${point.lon.toFixed(5)}°`;
}

export function createVisibilityMap(root, { date, loadPoint, describeError }) {
  const calculate = root.querySelector("#map-calculate");
  const cancel = root.querySelector("#map-cancel");
  const grid = root.querySelector("#visibility-grid");
  const snapshotLabel = root.querySelector("#map-snapshot");
  const progress = root.querySelector("#map-progress");
  const stale = root.querySelector("#map-stale");
  const legend = root.querySelector("#map-legend");
  const detail = root.querySelector("#map-point");
  const resultPanel = root.querySelector("#map-result");

  let current = {}, snapshot, job;
  let cells = [], selected = centerIndex, completed = 0;

  function updateButtons() {
    const running = Boolean(job) && !job.signal.aborted;
    calculate.disabled = Boolean(job) || !current.analysis?.terrain ||
      !Number.isFinite(current.time) || !Number.isFinite(current.height) || current.height < 0 || current.height > 100;
    cancel.hidden = !running;
    const outdated = snapshot && (
      current.analysis !== snapshot.analysis || current.time !== snapshot.time || current.height !== snapshot.height
    );
    stale.hidden = !outdated;
  }

  function renderPoint() {
    const { point, result } = cells[selected];
    const state = pointState(result, Boolean(job) && !job.signal.aborted);
    const label = selected === centerIndex ? t("mapCenter") : t("mapPoint");
    const summary = `${label} · ${coordinates(point)} · ${t(state)}`;
    if (!result?.bodies) {
      detail.textContent = result ? `${summary}. ${describeError(result.error)}` : summary;
      return;
    }
    const bodies = ["sun", "earth"].map(body => {
      const { visible, clearance } = result.bodies[body];
      return `${t(body)} · ${t(visible ? "terrainVisible" : "terrainBlocked")} · Δ ${clearance.toFixed(2)}°`;
    });
    detail.replaceChildren(summary, ...bodies.flatMap(text => [document.createElement("br"), text]));
  }

  function render() {
    updateButtons();
    if (!snapshot) return;
    snapshotLabel.textContent = t("mapSnapshot", {
      time: date(snapshot.time), center: coordinates(snapshot.analysis.site), height: snapshot.height, spacing,
    });
    const status = completed === cells.length ? "mapDone" : job && !job.signal.aborted ? "mapProgress" : "mapCancelled";
    progress.textContent = t(status, { completed, total: cells.length });
    for (const [index, { point, result, button }] of cells.entries()) {
      const state = pointState(result, Boolean(job) && !job.signal.aborted);
      button.dataset.state = state;
      button.textContent = marker[state];
      button.setAttribute("aria-pressed", String(index === selected));
      const label = index === centerIndex ? t("mapCenter") : t("mapPoint");
      button.setAttribute("aria-label", `${label} · ${coordinates(point)} · ${t(state)}`);
    }
    renderPoint();
  }

  calculate.addEventListener("click", async () => {
    snapshot = current;
    const { analysis, time, height } = snapshot;
    const points = visibilityGrid(analysis.site, spacing);
    selected = centerIndex;
    completed = 0;
    cells = points.map((point, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.center = String(index === centerIndex);
      button.addEventListener("click", () => {
        selected = index;
        render();
      });
      return { point, button };
    });
    grid.replaceChildren(...cells.map(cell => cell.button));
    resultPanel.hidden = snapshotLabel.hidden = progress.hidden = false;

    job = new AbortController();
    render();
    cancel.focus({ preventScroll: true });
    const orderedPoints = [points[centerIndex], ...points.filter((_, index) => index !== centerIndex)];
    try {
      await runVisibilityBatch(orderedPoints, time, (point, signal) =>
        point === points[centerIndex] && height === analysis.terrain.receiverHeight
          ? analysis
          : loadPoint(point, snapshot, signal), {
        signal: job.signal,
        onPoint: result => {
          cells[points.indexOf(result.point)].result = result;
          completed++;
          render();
        },
      });
    } finally {
      const restoreFocus = document.activeElement === cancel;
      job = null;
      render();
      if (restoreFocus && !calculate.disabled) calculate.focus({ preventScroll: true });
    }
  });
  cancel.addEventListener("click", () => {
    job?.abort();
  });

  function localize() {
    legend.replaceChildren(...Object.entries(marker).slice(0, 5).map(([state, symbol]) => {
      const item = document.createElement("li");
      item.dataset.state = state;
      item.textContent = `${symbol} ${t(state)}`;
      return item;
    }));
    render();
  }

  return {
    update(analysis, time, height) {
      current = { analysis, time, height };
      updateButtons();
    },
    localize,
  };
}
