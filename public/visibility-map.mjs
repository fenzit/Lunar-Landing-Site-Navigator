import { runVisibilityBatch, visibilityGrid } from "/lib/visibility-batch.mjs";
import { t } from "./i18n.mjs";

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
  const spacingInput = root.querySelector("#map-spacing");
  const spacingError = root.querySelector("#map-spacing-error");
  const retry = root.querySelector("#map-retry");
  const cancel = root.querySelector("#map-cancel");
  const grid = root.querySelector("#visibility-grid");
  const snapshotLabel = root.querySelector("#map-snapshot");
  const progress = root.querySelector("#map-progress");
  const stale = root.querySelector("#map-stale");
  const legend = root.querySelector("#map-legend");
  const detail = root.querySelector("#map-point");
  const resultPanel = root.querySelector("#map-result");

  let current = {}, snapshot, job;
  let cells = [], selected = centerIndex;

  function updateButtons() {
    const running = Boolean(job) && !job.signal.aborted;
    const spacingValid = spacingInput.validity.valid && Number.isSafeInteger(spacingInput.valueAsNumber);
    spacingError.hidden = spacingValid;
    spacingInput.setAttribute("aria-invalid", String(!spacingValid));
    calculate.disabled = Boolean(job) || !spacingValid || !current.analysis?.terrain ||
      !Number.isFinite(current.time) || !Number.isFinite(current.height) || current.height < 0 || current.height > 100;
    cancel.hidden = !running;
    const outdated = snapshot && (
      current.analysis !== snapshot.analysis || current.time !== snapshot.time || current.height !== snapshot.height ||
      !spacingValid || spacingInput.valueAsNumber !== snapshot.spacing
    );
    stale.hidden = !outdated;
    retry.hidden = !snapshot || outdated || Boolean(job) || cells.every(({ result }) => result?.bodies);
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
      time: date(snapshot.time), center: coordinates(snapshot.analysis.site), height: snapshot.height, spacing: snapshot.spacing,
    });
    const completed = cells.filter(({ result }) => result).length;
    const available = cells.filter(({ result }) => result?.bodies).length;
    const status = completed === cells.length ? "mapDone" : job && !job.signal.aborted ? "mapProgress" : "mapCancelled";
    progress.textContent = t(status, { completed, available, total: cells.length });
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

  calculate.addEventListener("click", () => {
    snapshot = { ...current, spacing: spacingInput.valueAsNumber };
    const points = visibilityGrid(snapshot.analysis.site, snapshot.spacing);
    selected = centerIndex;
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
    const orderedCells = [cells[centerIndex], ...cells.filter((_, index) => index !== centerIndex)];
    run(orderedCells);
  });

  async function run(pending) {
    const { analysis, time, height } = snapshot;
    const center = cells[centerIndex].point;
    const byPoint = new Map(pending.map(cell => [cell.point, cell]));
    for (const cell of pending) cell.result = undefined;
    job = new AbortController();
    render();
    cancel.focus({ preventScroll: true });
    try {
      await runVisibilityBatch(pending.map(cell => cell.point), time, (point, signal) =>
        point === center && height === analysis.terrain.receiverHeight
          ? analysis
          : loadPoint(point, snapshot, signal), {
        signal: job.signal,
        onPoint: result => {
          byPoint.get(result.point).result = result;
          render();
        },
      });
    } finally {
      const restoreFocus = document.activeElement === cancel;
      job = null;
      render();
      const nextAction = retry.hidden ? calculate : retry;
      if (restoreFocus && !nextAction.disabled) nextAction.focus({ preventScroll: true });
    }
  }

  retry.addEventListener("click", () => {
    run(cells.filter(({ result }) => !result?.bodies));
  });
  cancel.addEventListener("click", () => {
    job?.abort();
  });
  spacingInput.addEventListener("input", updateButtons);

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
