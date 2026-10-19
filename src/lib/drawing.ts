// Drawing data model + SVG export. Shared by the browser canvas and the server,
// which builds the SVG itself from the strokes (so no uploaded SVG is ever trusted).
import { getStroke } from "perfect-freehand";

export type Tool = "pen" | "highlighter" | "line" | "arrow" | "rect" | "ellipse";
export type Background = "blank" | "grid" | "graph" | "dots";
export type Point = [number, number, number]; // x, y, pressure (0–1)

export interface Stroke {
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
  /** True when the device reported real pen pressure. */
  pressure?: boolean;
}

export interface DrawingData {
  width: number;
  height: number;
  background: Background;
  strokes: Stroke[];
}

export const TOOLS: Tool[] = ["pen", "highlighter", "line", "arrow", "rect", "ellipse"];
export const BACKGROUNDS: Background[] = ["blank", "grid", "graph", "dots"];
export const GRID = 25;

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

export function outlineToPath(points: number[][]): string {
  if (points.length < 2) return "";
  const r = (n: number) => Math.round(n * 10) / 10;
  let d = `M${r(points[0][0])},${r(points[0][1])} Q`;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    d += `${r(x0)},${r(y0)} ${r((x0 + x1) / 2)},${r((y0 + y1) / 2)} `;
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
  for (const s of Array.isArray(d.strokes) ? d.strokes.slice(0, 5000) : []) {
    if (!s || !TOOLS.includes(s.tool) || !COLOR.test(String(s.color)) || !Array.isArray(s.points)) continue;
    const points = s.points
      .slice(0, 5000)
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [Number(p[0]) || 0, Number(p[1]) || 0, Math.min(1, Math.max(0, Number(p[2] ?? 0.5)))] as Point);
    if (!points.length) continue;
    strokes.push({ tool: s.tool, color: s.color, size: Math.min(80, Math.max(1, Number(s.size) || 4)), points, pressure: !!s.pressure });
  }
  return { width, height, background, strokes };
}

function backgroundSvg(bg: Background, w: number, h: number): string {
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
  return `<defs>${lines.join("")}</defs><rect width="${w}" height="${h}" fill="url(#bg)"/>`;
}

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
  }
}

export function toSvg(d: DrawingData): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" height="${d.height}">` +
    `<rect width="${d.width}" height="${d.height}" fill="#ffffff"/>` +
    backgroundSvg(d.background, d.width, d.height) +
    d.strokes.map(strokeSvg).join("") +
    `</svg>`
  );
}
