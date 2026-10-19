// Full-screen drawing canvas. Works with mouse, finger and stylus (pressure-aware).
// When a stylus is detected, fingers scroll instead of drawing (palm rejection).
import { arrowHead, BACKGROUNDS, GRID, outline, outlineToPath, type Background, type DrawingData, type Point, type Stroke, type Tool } from "../lib/drawing";
import { figureSettings } from "./figure-popover";
import { api, closePopover, h, toast } from "./ui";

type Mode = Tool | "eraser";

const COLORS = ["#161616", "#5c5a56", "#1e3a5f", "#2563eb", "#0e7490", "#2f6b45", "#65a30d", "#ca8a04", "#ea580c", "#b91c1c", "#be185d", "#7c3aed"];
const SIZES = [2, 4, 7, 12];
const MODES: [Mode, string, string][] = [
  ["pen", "✎", "Pen (P)"],
  ["highlighter", "▍", "Highlighter (H)"],
  ["line", "╱", "Line (L)"],
  ["arrow", "→", "Arrow (A)"],
  ["rect", "▭", "Rectangle (R)"],
  ["ellipse", "◯", "Ellipse (O)"],
  ["eraser", "⌫", "Eraser (E)"],
];

const blank = (): DrawingData => ({ width: 1000, height: 600, background: "grid", strokes: [] });

function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, w: number, hgt: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, hgt);
  if (bg === "blank") return;
  if (bg === "dots") {
    ctx.fillStyle = "#cfccc6";
    for (let x = GRID / 2; x < w; x += GRID) for (let y = GRID / 2; y < hgt; y += GRID) ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    return;
  }
  const line = (step: number, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = step; x < w; x += step) (ctx.moveTo(x, 0), ctx.lineTo(x, hgt));
    for (let y = step; y < hgt; y += step) (ctx.moveTo(0, y), ctx.lineTo(w, y));
    ctx.stroke();
  };
  if (bg === "graph") line(GRID / 5, "#eceae6", 0.6);
  line(GRID, "#dedbd5", 1);
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const [x1, y1] = s.points[0];
  const [x2, y2] = s.points[s.points.length - 1];
  ctx.save();
  if (s.tool === "pen" || s.tool === "highlighter") {
    ctx.fillStyle = s.color;
    if (s.tool === "highlighter") ctx.globalAlpha = 0.35;
    ctx.fill(new Path2D(outlineToPath(outline(s))));
  } else {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (s.tool === "line" || s.tool === "arrow") {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (s.tool === "arrow") ctx.stroke(new Path2D(arrowHead(x1, y1, x2, y2, s.size)));
    } else if (s.tool === "rect") {
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else {
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function distToSegment(px: number, py: number, [ax, ay]: Point, [bx, by]: Point) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hits(s: Stroke, x: number, y: number, r: number): boolean {
  const a = s.points[0];
  const b = s.points[s.points.length - 1];
  const reach = r + s.size / 2;
  if (s.tool === "line" || s.tool === "arrow") return distToSegment(x, y, a, b) < reach;
  if (s.tool === "rect") {
    const c: Point = [a[0], b[1], 0];
    const d: Point = [b[0], a[1], 0];
    return [distToSegment(x, y, a, c), distToSegment(x, y, c, b), distToSegment(x, y, b, d), distToSegment(x, y, d, a)].some((v) => v < reach);
  }
  if (s.tool === "ellipse") {
    const rx = Math.abs(b[0] - a[0]) / 2 || 1;
    const ry = Math.abs(b[1] - a[1]) / 2 || 1;
    const nx = (x - (a[0] + b[0]) / 2) / rx;
    const ny = (y - (a[1] + b[1]) / 2) / ry;
    return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry) < reach;
  }
  for (let i = 1; i < s.points.length; i++) if (distToSegment(x, y, s.points[i - 1], s.points[i]) < reach) return true;
  return s.points.length === 1 && Math.hypot(x - a[0], y - a[1]) < reach;
}

/** Opens the canvas. Resolves with the new drawing, or null if cancelled. */
export function openCanvas(initial?: DrawingData): Promise<DrawingData | null> {
  return new Promise((resolve) => {
    const data: DrawingData = initial ? structuredClone(initial) : blank();
    let mode: Mode = "pen";
    let color = COLORS[0];
    let size = SIZES[1];
    const undo: Stroke[][] = [];
    const redo: Stroke[][] = [];
    let dirty = false;
    let penSeen = false;
    let live: Stroke | null = null;
    let erasing = false;
    let pan: { y: number; x: number } | null = null;

    const canvas = h("canvas", { class: "dw-canvas" }) as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const base = document.createElement("canvas");
    const bctx = base.getContext("2d")!;
    const scroller = h("div", { class: "dw-scroll" }, canvas);
    let scale = 1;

    const layout = () => {
      const dpr = window.devicePixelRatio || 1;
      scale = Math.min(1.5, (scroller.clientWidth - 24) / data.width);
      canvas.style.width = `${data.width * scale}px`;
      canvas.style.height = `${data.height * scale}px`;
      for (const c of [canvas, base]) {
        c.width = Math.round(data.width * scale * dpr);
        c.height = Math.round(data.height * scale * dpr);
      }
      for (const c of [ctx, bctx]) c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      renderBase();
    };
    const renderBase = () => {
      drawBackground(bctx, data.background, data.width, data.height);
      for (const s of data.strokes) drawStroke(bctx, s);
      paint();
    };
    const paint = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.restore();
      if (live) drawStroke(ctx, live);
    };
    const snapshot = () => {
      undo.push(data.strokes.slice());
      redo.length = 0;
      dirty = true;
      syncButtons();
    };

    const point = (e: PointerEvent): Point => {
      const r = canvas.getBoundingClientRect();
      const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
      return [Math.round(((e.clientX - r.left) / scale) * 10) / 10, Math.round(((e.clientY - r.top) / scale) * 10) / 10, pressure];
    };
    const erase = (p: Point) => {
      const before = data.strokes.length;
      data.strokes = data.strokes.filter((s) => !hits(s, p[0], p[1], 8 / scale + 4));
      if (data.strokes.length !== before) renderBase();
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "pen") penSeen = true;
      if (e.pointerType === "touch" && penSeen) {
        pan = { x: e.clientX + scroller.scrollLeft, y: e.clientY + scroller.scrollTop };
        return;
      }
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      const p = point(e);
      if (mode === "eraser") {
        snapshot();
        erasing = true;
        erase(p);
        return;
      }
      live = { tool: mode, color, size, points: [p], pressure: e.pointerType === "pen" };
      paint();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (pan && e.pointerType === "touch") {
        scroller.scrollTo(pan.x - e.clientX, pan.y - e.clientY);
        return;
      }
      if (erasing) return erase(point(e));
      if (!live) return;
      const events = e.getCoalescedEvents?.() ?? [e];
      if (live.tool === "pen" || live.tool === "highlighter") for (const ev of events) live.points.push(point(ev));
      else live.points = [live.points[0], point(e)];
      paint();
    });
    const end = () => {
      pan = null;
      if (erasing) {
        erasing = false;
        return;
      }
      if (!live) return;
      const s = live;
      live = null;
      const [a, b] = [s.points[0], s.points[s.points.length - 1]];
      const tiny = s.tool !== "pen" && s.tool !== "highlighter" && Math.hypot(b[0] - a[0], b[1] - a[1]) < 3;
      if (!tiny) {
        snapshot();
        data.strokes.push(s);
      }
      renderBase();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    // ── Toolbar ──
    const modeButtons = MODES.map(([m, icon, title]) =>
      h("button", { type: "button", class: "dw-btn", title, "aria-label": title, onclick: () => ((mode = m), syncButtons()) }, icon),
    );
    const colorButtons = COLORS.map((c) =>
      h("button", { type: "button", class: "dw-swatch", style: `--c:${c}`, title: c, "aria-label": `Colour ${c}`, onclick: () => setColor(c) }),
    );
    const custom = h("input", { type: "color", class: "dw-custom", value: color, title: "Custom colour", oninput: (e: Event) => setColor((e.target as HTMLInputElement).value) }) as HTMLInputElement;
    const sizeButtons = SIZES.map((s) =>
      h("button", { type: "button", class: "dw-btn", title: `Thickness ${s}`, onclick: () => ((size = s), syncButtons()) }, h("i", { class: "dw-dot", style: `--s:${Math.min(16, s + 2)}px` })),
    );
    const bgSelect = h(
      "select",
      { class: "dw-select", title: "Background", onchange: (e: Event) => ((data.background = (e.target as HTMLSelectElement).value as Background), (dirty = true), renderBase()) },
      ...BACKGROUNDS.map((b) => h("option", { value: b, selected: b === data.background }, b[0].toUpperCase() + b.slice(1))),
    );
    const undoBtn = h("button", { type: "button", class: "dw-btn", title: "Undo (⌘Z)", onclick: () => doUndo() }, "↶");
    const redoBtn = h("button", { type: "button", class: "dw-btn", title: "Redo (⇧⌘Z)", onclick: () => doRedo() }, "↷");

    function setColor(c: string) {
      color = c;
      custom.value = c;
      if (mode === "eraser") mode = "pen";
      syncButtons();
    }
    function syncButtons() {
      modeButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(MODES[i][0] === mode)));
      colorButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(COLORS[i] === color)));
      sizeButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(SIZES[i] === size)));
      (undoBtn as HTMLButtonElement).disabled = !undo.length;
      (redoBtn as HTMLButtonElement).disabled = !redo.length;
      canvas.dataset.mode = mode;
    }
    function doUndo() {
      if (!undo.length) return;
      redo.push(data.strokes);
      data.strokes = undo.pop()!;
      renderBase();
      syncButtons();
    }
    function doRedo() {
      if (!redo.length) return;
      undo.push(data.strokes);
      data.strokes = redo.pop()!;
      renderBase();
      syncButtons();
    }

    const finish = (result: DrawingData | null) => {
      if (result === null && dirty && !confirm("Discard this drawing's changes?")) return;
      overlay.remove();
      window.removeEventListener("resize", layout);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = "";
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      } else if (!mod && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        const m = ({ p: "pen", h: "highlighter", l: "line", a: "arrow", r: "rect", o: "ellipse", e: "eraser" } as Record<string, Mode>)[e.key.toLowerCase()];
        if (m) ((mode = m), syncButtons());
      }
    };

    const overlay = h(
      "div",
      { class: "dw-overlay", role: "dialog", "aria-label": "Drawing" },
      h(
        "div",
        { class: "dw-toolbar" },
        h("div", { class: "dw-group" }, ...modeButtons),
        h("div", { class: "dw-group" }, ...colorButtons, custom),
        h("div", { class: "dw-group" }, ...sizeButtons),
        h(
          "div",
          { class: "dw-group" },
          bgSelect,
          h("button", { type: "button", class: "dw-btn wide", title: "Add more space below", onclick: () => ((data.height = Math.min(8000, data.height + 400)), (dirty = true), layout()) }, "+ Space"),
          undoBtn,
          redoBtn,
          h("button", { type: "button", class: "dw-btn wide", title: "Erase everything", onclick: () => data.strokes.length && confirm("Clear the whole drawing?") && (snapshot(), (data.strokes = []), renderBase()) }, "Clear"),
        ),
        h("span", { class: "dw-spacer" }),
        h("div", { class: "dw-group" },
          h("button", { type: "button", class: "btn btn-sm", onclick: () => finish(null) }, "Cancel"),
          h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => finish(data) }, "Save drawing"),
        ),
      ),
      scroller,
    );

    document.body.append(overlay);
    document.body.style.overflow = "hidden";
    window.addEventListener("resize", layout);
    document.addEventListener("keydown", onKey, true);
    syncButtons();
    layout();
  });
}

/** Creates a new drawing and returns its node attributes, or null if cancelled. */
export async function newDrawing(): Promise<{ id: string; v: number } | null> {
  const data = await openCanvas();
  if (!data) return null;
  try {
    return await api<{ id: string; v: number }>("/api/drawings", "POST", data);
  } catch (e) {
    toast((e as Error).message, "error");
    return null;
  }
}

/** Click on a drawing in the editor: settings popover with an "Edit drawing" button. */
export function editDrawing(anchor: HTMLElement, attrs: { id: string; width?: number; caption?: string }, done: (a: { v?: number; width?: number; caption?: string } | null) => void) {
  let editing = false;
  const edit = h(
    "button",
    {
      type: "button",
      class: "btn btn-primary",
      style: "width:100%;margin-bottom:1rem",
      onclick: async () => {
        editing = true;
        closePopover();
        try {
          const data = await api<DrawingData>(`/api/drawings/${attrs.id}`);
          const updated = await openCanvas(data);
          if (!updated) return;
          const saved = await api<{ v: number }>(`/api/drawings/${attrs.id}`, "PUT", updated);
          done({ v: saved.v });
        } catch (e) {
          toast((e as Error).message, "error");
        }
      },
    },
    "✎ Edit drawing",
  );
  figureSettings(anchor, attrs, { alt: false, extra: edit }, (a) => {
    if (!editing) done(a);
  });
}
