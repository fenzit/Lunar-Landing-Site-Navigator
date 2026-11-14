import { suitableStarts } from "/lib/windows.mjs";
import { t } from "./i18n.mjs";

const ns = "http://www.w3.org/2000/svg";

function svg(tag, attrs, content) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  return node;
}

export function drawChart(container, analysis, required, comparison = null) {
  container.replaceChildren();
  if (!analysis) return () => {};
  const width = Math.max(280, container.clientWidth || container.parentElement.clientWidth);
  const compact = width < 620;
  const left = 78, right = width - 10, top = 18, bottom = compact ? 116 : 150;
  const firstRow = bottom + 45, rowHeight = compact ? 21 : 25;
  const { start, end } = analysis.period;
  const x = time => left + (time - start) / (end - start) * (right - left);
  const values = analysis.samples.flatMap(sample => [sample.sunEl, sample.earthEl]);
  const min = Math.floor(Math.min(-1, ...values) / 2) * 2;
  const max = Math.ceil(Math.max(1, ...values) / 2) * 2;
  const y = elevation => bottom - (elevation - min) / (max - min) * (bottom - top);
  const graph = svg("svg", {
    viewBox: `0 0 ${width} ${firstRow + rowHeight * (comparison ? 5 : 4) + 10}`, role: "img",
    "aria-label": t("chartLabel"),
  });
  const add = (tag, attrs, content) => graph.append(svg(tag, attrs, content));
  add("rect", { x: left, y: top, width: right - left, height: bottom - top, class: "plot-bg" });
  for (const elevation of [min, 0, max]) {
    add("line", { x1: left, x2: right, y1: y(elevation), y2: y(elevation), class: elevation === 0 ? "horizon-line" : "plot-grid" });
    add("text", { x: left - 10, y: y(elevation) + 4, "text-anchor": "end" }, `${elevation}°`);
  }
  for (const [key, className] of [["sunEl", "sun-line"], ["earthEl", "earth-line"]]) {
    const points = analysis.samples.map(sample => `${x(sample.t)},${y(sample[key])}`).join(" ");
    add("polyline", { points, class: className });
  }
  const ticks = width < 390 ? [0, 1] : compact ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  for (const fraction of ticks) {
    const t = start + fraction * (end - start);
    const date = new Date(t).toISOString();
    add("text", {
      x: x(t), y: bottom + 24, "text-anchor": fraction === 0 ? "start" : fraction === 1 ? "end" : "middle",
    }, `${date.slice(8, 10)}.${date.slice(5, 7)} ${date.slice(11, 16)}`);
  }

  const rows = [
    [t("sun"), analysis.windows.sun, "sun-band"],
    [t("earth"), analysis.windows.earth, "earth-band"],
    [t("both"), analysis.windows.both, "both-band"],
    [t("start"), suitableStarts(analysis.windows.both, required), "start-band"],
  ];
  if (comparison) rows.push([comparison.name, comparison.analysis.windows.both, "comparison-band"]);
  rows.forEach(([label, intervals, className], index) => {
    const row = firstRow + index * rowHeight;
    add("text", { x: left - 10, y: row + 12, "text-anchor": "end" }, label);
    add("rect", { x: left, y: row, width: right - left, height: 15, rx: 2, class: "plot-bg" });
    for (const interval of intervals) {
      add("rect", {
        x: Math.min(right - 1.5, x(interval.start)), y: row,
        width: Math.max(1.5, x(interval.end) - x(interval.start)), height: 15, rx: 2, class: className,
      });
    }
  });
  const cursor = svg("line", { y1: top, y2: firstRow + (rows.length - 1) * rowHeight + 15, class: "plot-cursor" });
  graph.append(cursor);
  container.append(graph);
  return t => {
    cursor.setAttribute("x1", x(t));
    cursor.setAttribute("x2", x(t));
  };
}
