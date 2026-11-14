import { suitableStarts } from "/lib/windows.mjs";

const ns = "http://www.w3.org/2000/svg";

function svg(tag, attrs, content) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  return node;
}

export function drawChart(container, analysis, required, comparison = null, compact = false) {
  container.replaceChildren();
  if (!analysis) return () => {};
  const width = 720, left = 89, right = 700, top = 23, bottom = 150;
  const { start, end } = analysis.period;
  const x = time => left + (time - start) / (end - start) * (right - left);
  const values = analysis.samples.flatMap(sample => [sample.sunEl, sample.earthEl]);
  const min = Math.floor(Math.min(-1, ...values) / 2) * 2;
  const max = Math.ceil(Math.max(1, ...values) / 2) * 2;
  const y = elevation => bottom - (elevation - min) / (max - min) * (bottom - top);
  const graph = svg("svg", {
    viewBox: `0 0 ${width} ${comparison ? 333 : 308}`, role: "img",
    "aria-label": "Высота Солнца и Земли в градусах по UTC, полосы видимости и допустимых стартов",
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
  const ticks = compact ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  for (const fraction of ticks) {
    const t = start + fraction * (end - start);
    const date = new Date(t).toISOString();
    add("text", {
      x: x(t), y: 173, "text-anchor": fraction === 0 ? "start" : fraction === 1 ? "end" : "middle",
    }, `${date.slice(8, 10)}.${date.slice(5, 7)} ${date.slice(11, 16)}`);
  }

  const rows = [
    ["Солнце", analysis.windows.sun, "sun-band"],
    ["Земля", analysis.windows.earth, "earth-band"],
    ["Оба", analysis.windows.both, "both-band"],
    ["Старт", suitableStarts(analysis.windows.both, required), "start-band"],
  ];
  if (comparison) rows.push([comparison.name, comparison.analysis.windows.both, "comparison-band"]);
  rows.forEach(([label, intervals, className], index) => {
    const row = 190 + index * 25;
    add("text", { x: left - 10, y: row + 12, "text-anchor": "end" }, label);
    add("rect", { x: left, y: row, width: right - left, height: 15, rx: 2, class: "plot-bg" });
    for (const interval of intervals) {
      add("rect", {
        x: Math.min(right - 1.5, x(interval.start)), y: row,
        width: Math.max(1.5, x(interval.end) - x(interval.start)), height: 15, rx: 2, class: className,
      });
    }
  });
  const cursor = svg("line", { y1: top, y2: 190 + rows.length * 25 - 10, class: "plot-cursor" });
  graph.append(cursor);
  container.append(graph);
  return t => {
    cursor.setAttribute("x1", x(t));
    cursor.setAttribute("x2", x(t));
  };
}
