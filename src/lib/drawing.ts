// Drawing data model + SVG export. Shared by the browser canvas and the server,
// which builds the SVG itself from the strokes (so no uploaded SVG is ever trusted).
import { getStroke } from "perfect-freehand";

export type Tool = "pen" | "highlighter" | "line" | "arrow" | "rect" | "ellipse" | "text" | "eraser" | "fill";
export type Background = "blank" | "grid" | "graph" | "dots";
export type Point = [number, number, number]; // x, y, pressure (0–1)
export type Ring = [number, number][];

/**
 * One item of the drawing, painted in order. Besides strokes and shapes:
 * - text: `points[0]` is the top-left corner, `size` the font size, `text` the content.
 * - eraser: a rubber path that wipes whatever was painted before it (`size` = width).
 * - fill: a bucket fill; `rings` is its outline (even-odd). It is painted *under* the
 *   items before it, so the lines that bound it stay crisp on top.
 */
export interface Stroke {
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
  /** True when the device reported real pen pressure. */
  pressure?: boolean;
  text?: string;
  rings?: Ring[];
}

export interface DrawingData {
  width: number;
  height: number;
  background: Background;
  strokes: Stroke[];
}

export const TOOLS: Tool[] = ["pen", "highlighter", "line", "arrow", "rect", "ellipse", "text", "eraser", "fill"];
export const BACKGROUNDS: Background[] = ["blank", "grid", "graph", "dots"];
export const GRID = 25;
export const TEXT_FONT = "Inter, Helvetica, Arial, sans-serif";
export const LINE_HEIGHT = 1.25;
const MAX_FILL_POINTS = 40000;

/** Freehand outline polygon for pen/highlighter strokes. */
export function outline(stroke: Stroke): number[][] {
  const highlighter = stroke.tool === "highlighter";
  return getStroke(stroke.points, {
    size: highlighter ? stroke.size * 3 : stroke.size,
    thinning: highlighter ? 0 : 0.55,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: !stroke.pressure && !highlighter,
    last: true,
  });
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function outlineToPath(points: number[][]): string {
  if (points.length < 2) return "";
  let d = `M${r1(points[0][0])},${r1(points[0][1])} Q`;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    d += `${r1(x0)},${r1(y0)} ${r1((x0 + x1) / 2)},${r1((y0 + y1) / 2)} `;
  }
  return d + "Z";
}

/** Arrow head as a polyline path ending at (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.max(10, size * 4);
  const a1 = angle + Math.PI - Math.PI / 7;
  const a2 = angle + Math.PI + Math.PI / 7;
  return `M${x2 + len * Math.cos(a1)},${y2 + len * Math.sin(a1)} L${x2},${y2} L${x2 + len * Math.cos(a2)},${y2 + len * Math.sin(a2)}`;
}

/** Polyline through the points (eraser paths). */
export function polylinePath(points: Point[]): string {
  const [x, y] = points[0];
  if (points.length === 1) return `M${x},${y} L${x + 0.01},${y}`;
  return `M${x},${y}` + points.slice(1).map((p) => ` L${p[0]},${p[1]}`).join("");
}

export function ringsPath(rings: Ring[]): string {
  return rings.map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join(" L")}Z`).join(" ");
}

export const textLines = (s: Stroke) => (s.text ?? "").split("\n");

/** Text box. `measure` gives real widths in the browser; the server estimates. */
export function textBox(s: Stroke, measure?: (line: string) => number): [number, number, number, number] {
  const [x, y] = s.points[0];
  const lines = textLines(s);
  const width = Math.max(...lines.map((l) => (measure ? measure(l) : l.length * s.size * 0.58)));
  return [x, y, x + width, y + lines.length * s.size * LINE_HEIGHT];
}

/** Area an item covers (minX, minY, maxX, maxY), or null for erasers. */
export function itemBounds(s: Stroke): [number, number, number, number] | null {
  if (s.tool === "eraser") return null;
  if (s.tool === "text") return textBox(s);
  const pts: number[][] = s.tool === "fill" ? (s.rings ?? []).flat() : s.points;
  if (!pts.length) return null;
  const pad = s.tool === "fill" ? 0 : s.tool === "highlighter" ? s.size * 1.5 : s.tool === "arrow" ? Math.max(10, s.size * 4) : s.size;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

/**
 * The part of the canvas that is actually drawn on, plus a margin, snapped to the grid.
 * The public SVG shows only this area, so a small sketch isn't shown on a huge blank canvas.
 */
export function contentArea(d: DrawingData): { x: number; y: number; w: number; h: number } {
  const boxes = d.strokes.map(itemBounds).filter((b) => b !== null);
  if (!boxes.length) return { x: 0, y: 0, w: d.width, h: d.height };
  const margin = 20;
  let x0 = Math.floor((Math.min(...boxes.map((b) => b[0])) - margin) / GRID) * GRID;
  let y0 = Math.floor((Math.min(...boxes.map((b) => b[1])) - margin) / GRID) * GRID;
  let x1 = Math.ceil((Math.max(...boxes.map((b) => b[2])) + margin) / GRID) * GRID;
  let y1 = Math.ceil((Math.max(...boxes.map((b) => b[3])) + margin) / GRID) * GRID;
  // Never smaller than 200×100, never outside the canvas.
  const grow = (a: number, b: number, min: number, max: number): [number, number] => {
    const extra = Math.max(0, min - (b - a));
    a -= Math.ceil(extra / 2 / GRID) * GRID;
    b += Math.ceil(extra / 2 / GRID) * GRID;
    if (a < 0) (b -= a), (a = 0);
    if (b > max) (a = Math.max(0, a - (b - max))), (b = max);
    return [a, b];
  };
  [x0, x1] = grow(x0, x1, 200, d.width);
  [y0, y1] = grow(y0, y1, 100, d.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const COLOR = /^#[0-9a-f]{3,8}$/i;

/** Validates and clamps untrusted drawing data. Returns null when unusable. */
export function cleanDrawing(input: unknown): DrawingData | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Partial<DrawingData>;
  const width = Math.round(Number(d.width));
  const height = Math.round(Number(d.height));
  if (!(width >= 100 && width <= 4000 && height >= 100 && height <= 8000)) return null;
  const background = BACKGROUNDS.includes(d.background as Background) ? (d.background as Background) : "blank";
  const strokes: Stroke[] = [];
  let fillPoints = 0;
  for (const s of Array.isArray(d.strokes) ? d.strokes.slice(0, 5000) : []) {
    if (!s || !TOOLS.includes(s.tool) || !COLOR.test(String(s.color)) || !Array.isArray(s.points)) continue;
    const points = s.points
      .slice(0, 5000)
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [Number(p[0]) || 0, Number(p[1]) || 0, Math.min(1, Math.max(0, Number(p[2] ?? 0.5)))] as Point);
    const out: Stroke = { tool: s.tool, color: s.color, size: Math.min(80, Math.max(1, Number(s.size) || 4)), points, pressure: !!s.pressure };
    if (s.tool === "text") {
      // eslint-disable-next-line no-control-regex
      const text = String(s.text ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").slice(0, 2000);
      if (!text.trim() || !points.length) continue;
      out.text = text;
      out.points = [points[0]];
    } else if (s.tool === "fill") {
      const rings: Ring[] = [];
      for (const ring of Array.isArray(s.rings) ? s.rings : []) {
        if (!Array.isArray(ring) || ring.length < 3 || fillPoints + ring.length > MAX_FILL_POINTS) continue;
        fillPoints += ring.length;
        rings.push(ring.map((p) => [r1(Number(p?.[0]) || 0), r1(Number(p?.[1]) || 0)]));
      }
      if (!rings.length) continue;
      out.rings = rings;
      out.points = [];
    } else if (!points.length) continue;
    strokes.push(out);
  }
  return { width, height, background, strokes };
}

function backgroundSvg(bg: Background, area: { x: number; y: number; w: number; h: number }): string {
  if (bg === "blank") return "";
  const lines: string[] = [];
  if (bg === "dots") {
    lines.push(`<pattern id="bg" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><circle cx="${GRID / 2}" cy="${GRID / 2}" r="1.2" fill="#cfccc6"/></pattern>`);
  } else {
    const step = bg === "graph" ? GRID / 5 : GRID;
    const minor = bg === "graph" ? `<path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#eceae6" stroke-width="0.6"/>` : "";
    lines.push(`<pattern id="minor" width="${step}" height="${step}" patternUnits="userSpaceOnUse">${minor}</pattern>`);
    lines.push(`<pattern id="bg" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><rect width="${GRID}" height="${GRID}" fill="url(#minor)"/><path d="M ${GRID} 0 L 0 0 0 ${GRID}" fill="none" stroke="#dedbd5" stroke-width="1"/></pattern>`);
  }
  return `<defs>${lines.join("")}</defs><rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="url(#bg)"/>`;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function strokeSvg(s: Stroke): string {
  const first = s.points[0];
  const last = s.points[s.points.length - 1];
  const line = `fill="none" stroke="${s.color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (s.tool) {
    case "pen":
      return `<path d="${outlineToPath(outline(s))}" fill="${s.color}"/>`;
    case "highlighter":
      return `<path d="${outlineToPath(outline(s))}" fill="${s.color}" fill-opacity="0.35"/>`;
    case "line":
      return `<line x1="${first[0]}" y1="${first[1]}" x2="${last[0]}" y2="${last[1]}" ${line}/>`;
    case "arrow":
      return `<g ${line}><line x1="${first[0]}" y1="${first[1]}" x2="${last[0]}" y2="${last[1]}"/><path d="${arrowHead(first[0], first[1], last[0], last[1], s.size)}"/></g>`;
    case "rect": {
      const x = Math.min(first[0], last[0]);
      const y = Math.min(first[1], last[1]);
      return `<rect x="${x}" y="${y}" width="${Math.abs(last[0] - first[0])}" height="${Math.abs(last[1] - first[1])}" ${line}/>`;
    }
    case "ellipse":
      return `<ellipse cx="${(first[0] + last[0]) / 2}" cy="${(first[1] + last[1]) / 2}" rx="${Math.abs(last[0] - first[0]) / 2}" ry="${Math.abs(last[1] - first[1]) / 2}" ${line}/>`;
    case "text": {
      const [x, y] = first;
      const spans = textLines(s).map((l, i) => `<tspan x="${x}" y="${r1(y + s.size * (0.8 + i * LINE_HEIGHT))}">${xml(l) || " "}</tspan>`);
      return `<text font-family="${TEXT_FONT}" font-size="${s.size}" fill="${s.color}" xml:space="preserve">${spans.join("")}</text>`;
    }
    case "fill":
      return `<path d="${ringsPath(s.rings ?? [])}" fill="${s.color}" fill-rule="evenodd"/>`;
    case "eraser":
      return `<path d="${polylinePath(s.points)}" fill="none" stroke="#000" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

/** Paints items in order: fills go under what came before, erasers mask what came before. */
function contentSvg(d: DrawingData, area: { x: number; y: number; w: number; h: number }): string {
  let out = "";
  let masks = 0;
  for (let i = 0; i < d.strokes.length; i++) {
    const s = d.strokes[i];
    if (s.tool === "fill") out = strokeSvg(s) + out;
    else if (s.tool === "eraser") {
      let paths = "";
      for (; i < d.strokes.length && d.strokes[i].tool === "eraser"; i++) paths += strokeSvg(d.strokes[i]);
      i--;
      const id = `e${masks++}`;
      out = `<mask id="${id}" maskUnits="userSpaceOnUse" x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}"><rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="#fff"/>${paths}</mask><g mask="url(#${id})">${out}</g>`;
    } else out += strokeSvg(s);
  }
  return out;
}

export function toSvg(d: DrawingData, area = contentArea(d)): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${area.x} ${area.y} ${area.w} ${area.h}" width="${area.w}" height="${area.h}">` +
    `<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="#ffffff"/>` +
    backgroundSvg(d.background, area) +
    contentSvg(d, area) +
    `</svg>`
  );
}
