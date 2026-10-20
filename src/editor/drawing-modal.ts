// Full-screen drawing canvas. Works with mouse, finger and stylus (pressure-aware).
// When a stylus is detected, fingers scroll instead of drawing (palm rejection).
import {
  arrowHead, BACKGROUNDS, GRID, itemBounds, LINE_HEIGHT, outline, outlineToPath, polylinePath, ringsPath, TEXT_FONT, textBox, textLines,
  type Background, type DrawingData, type Point, type Ring, type Stroke, type Tool,
} from "../lib/drawing";
import { bucketFill } from "./fill";
import { figureSettings } from "./figure-popover";
import { api, closePopover, h, toast } from "./ui";

/** "delete" removes whole strokes; "eraser" rubs out parts of them. */
type Mode = Tool | "move" | "delete";

const COLORS = ["#161616", "#5c5a56", "#1e3a5f", "#2563eb", "#0e7490", "#2f6b45", "#65a30d", "#ca8a04", "#ea580c", "#b91c1c", "#be185d", "#7c3aed"];
const SIZES = [2, 4, 7, 12];
const TEXT_SIZES: Record<number, number> = { 2: 16, 4: 22, 7: 30, 12: 42 };
const ERASER_SCALE = 4;

const svgIcon = (body: string) => {
  const span = h("span", { class: "dw-icon" });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return span;
};
const ICONS = {
  move: () => svgIcon('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
  text: () => svgIcon('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  fill: () => svgIcon('<path d="M4 12 11 5l7 7-7 7z"/><path d="M8 2l3 3M4 12h14"/><path d="M20 15s2 2.4 2 3.6a2 2 0 0 1-4 0c0-1.2 2-3.6 2-3.6z"/>'),
  eraser: () => svgIcon('<path d="M7 21h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8z"/><path d="M9.5 10.5l4 4"/>'),
};
const MODES: [Mode, string | (() => HTMLElement), string][] = [
  ["move", ICONS.move, "Move (V) — drag text or any stroke"],
  ["pen", "✎", "Pen (P)"],
  ["highlighter", "▍", "Highlighter (H)"],
  ["line", "╱", "Line (L)"],
  ["arrow", "→", "Arrow (A)"],
  ["rect", "▭", "Rectangle (R)"],
  ["ellipse", "◯", "Ellipse (O)"],
  ["text", ICONS.text, "Text (T) — click to type, click a text to edit it"],
  ["fill", ICONS.fill, "Fill (B) — click inside a shape to fill it"],
  ["eraser", ICONS.eraser, "Eraser (E) — rub out parts of strokes"],
  ["delete", "⌫", "Delete stroke (X) — remove whole strokes"],
];
const KEYS: Record<string, Mode> = { v: "move", p: "pen", h: "highlighter", l: "line", a: "arrow", r: "rect", o: "ellipse", t: "text", b: "fill", e: "eraser", x: "delete" };

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

// Freehand outlines are slow to compute, so keep one Path2D per finished stroke.
const outlines = new WeakMap<Stroke, Path2D>();
const outlinePath = (s: Stroke, cache: boolean) => {
  if (!cache) return new Path2D(outlineToPath(outline(s)));
  let p = outlines.get(s);
  if (!p) outlines.set(s, (p = new Path2D(outlineToPath(outline(s)))));
  return p;
};

/** Paints one item. Fills and erasers only make sense on the (transparent) content layer. */
function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, dx = 0, dy = 0, cache = true) {
  ctx.save();
  if (dx || dy) ctx.translate(dx, dy);
  const [x1, y1] = s.points[0] ?? [0, 0];
  const [x2, y2] = s.points[s.points.length - 1] ?? [0, 0];
  if (s.tool === "pen" || s.tool === "highlighter") {
    ctx.fillStyle = s.color;
    if (s.tool === "highlighter") ctx.globalAlpha = 0.35;
    ctx.fill(outlinePath(s, cache));
  } else if (s.tool === "text") {
    ctx.fillStyle = s.color;
    ctx.font = `${s.size}px ${TEXT_FONT}`;
    textLines(s).forEach((l, i) => ctx.fillText(l, x1, y1 + s.size * (0.8 + i * LINE_HEIGHT)));
  } else if (s.tool === "fill") {
    // Under everything painted before it, so the outlines stay on top.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = s.color;
    ctx.fill(new Path2D(ringsPath(s.rings ?? [])), "evenodd");
  } else if (s.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(polylinePath(s.points)));
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

function distToSegment(px: number, py: number, [ax, ay]: number[], [bx, by]: number[]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Even-odd point-in-polygon over all rings of a fill. */
function inRings(rings: Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

let measurer: CanvasRenderingContext2D | null = null;
/** Text box using real font metrics. */
function measuredBox(s: Stroke) {
  measurer ??= document.createElement("canvas").getContext("2d")!;
  measurer.font = `${s.size}px ${TEXT_FONT}`;
  return textBox(s, (l) => measurer!.measureText(l).width);
}

function hits(s: Stroke, x: number, y: number, r: number): boolean {
  if (s.tool === "eraser") return false;
  if (s.tool === "fill") return inRings(s.rings ?? [], x, y);
  if (s.tool === "text") {
    const [x0, y0, x1, y1] = measuredBox(s);
    return x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r;
  }
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

function moved(s: Stroke, dx: number, dy: number): Stroke {
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    ...s,
    points: s.points.map(([x, y, p]) => [r(x + dx), r(y + dy), p] as Point),
    ...(s.rings ? { rings: s.rings.map((ring) => ring.map(([x, y]) => [r(x + dx), r(y + dy)] as [number, number])) } : {}),
  };
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
    let deleting = false;
    let pan: { y: number; x: number } | null = null;
    let drag: { index: number; from: Point; dx: number; dy: number } | null = null;
    let hover: Point | null = null;
    let textEdit: { box: HTMLTextAreaElement; index: number; x: number; y: number; color: string; size: number } | null = null;

    const canvas = h("canvas", { class: "dw-canvas" }) as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    // Background and content live on separate layers so erasers and fills never touch the grid.
    const bg = document.createElement("canvas");
    const bgctx = bg.getContext("2d")!;
    const base = document.createElement("canvas");
    const bctx = base.getContext("2d")!;
    const scroller = h("div", { class: "dw-scroll" }, canvas);
    let scale = 1;

    const layout = () => {
      commitText();
      const dpr = window.devicePixelRatio || 1;
      scale = Math.min(1.5, (scroller.clientWidth - 24) / data.width);
      canvas.style.width = `${data.width * scale}px`;
      canvas.style.height = `${data.height * scale}px`;
      for (const c of [canvas, bg, base]) {
        c.width = Math.round(data.width * scale * dpr);
        c.height = Math.round(data.height * scale * dpr);
      }
      for (const c of [ctx, bgctx, bctx]) c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      renderBackground();
    };
    const renderBackground = () => {
      drawBackground(bgctx, data.background, data.width, data.height);
      renderBase();
    };
    const paintContent = (c: CanvasRenderingContext2D) =>
      data.strokes.forEach((s, i) => {
        if (i === textEdit?.index) return;
        if (i === drag?.index) drawStroke(c, s, drag.dx, drag.dy);
        else drawStroke(c, s);
      });
    const renderBase = () => {
      bctx.save();
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, base.width, base.height);
      bctx.restore();
      paintContent(bctx);
      paint();
    };
    const paint = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.restore();
      if (live && live.tool !== "eraser") drawStroke(ctx, live, 0, 0, false); // still growing: don't cache
      if (drag) {
        const s = data.strokes[drag.index];
        const b = s.tool === "text" ? measuredBox(s) : itemBounds(s);
        if (b) {
          ctx.save();
          ctx.setLineDash([6 / scale, 4 / scale]);
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 1 / scale;
          ctx.strokeRect(b[0] + drag.dx - 4, b[1] + drag.dy - 4, b[2] - b[0] + 8, b[3] - b[1] + 8);
          ctx.restore();
        }
      }
      if (hover && mode === "eraser") {
        ctx.save();
        ctx.strokeStyle = "#5c5a56";
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        ctx.arc(hover[0], hover[1], (size * ERASER_SCALE) / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
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
    /** Index of the topmost item under the point (optionally only one tool), or -1. */
    const topHit = (p: Point, only?: Tool) => {
      for (let i = data.strokes.length - 1; i >= 0; i--) {
        const s = data.strokes[i];
        if ((!only || s.tool === only) && hits(s, p[0], p[1], 6 / scale)) return i;
      }
      return -1;
    };
    /** Removes the strokes under the point. Fills only go on a direct tap, not while sweeping. */
    const erase = (p: Point, tap = false) => {
      const before = data.strokes.length;
      data.strokes = data.strokes.filter((s) => s.tool === "fill" || !hits(s, p[0], p[1], 8 / scale + 4));
      const fill = tap && data.strokes.length === before ? topHit(p, "fill") : -1;
      if (fill >= 0) data.strokes.splice(fill, 1);
      if (data.strokes.length !== before) renderBase();
    };

    // ── Text ──
    function openText(x: number, y: number, index: number) {
      const existing = index >= 0 ? data.strokes[index] : null;
      const t = { index, x, y, color: existing?.color ?? color, size: existing?.size ?? TEXT_SIZES[size], box: h("textarea", { class: "dw-text", spellcheck: "false", rows: 1 }) as HTMLTextAreaElement };
      t.box.value = existing?.text ?? "";
      textEdit = t;
      styleText();
      scroller.append(t.box);
      t.box.addEventListener("input", styleText);
      t.box.addEventListener("blur", commitText);
      t.box.addEventListener("keydown", (e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          commitText();
        }
      });
      renderBase();
      // Focus during the tap itself, or tablets won't show the keyboard.
      t.box.focus();
      requestAnimationFrame(() => document.activeElement !== t.box && textEdit === t && t.box.focus());
    }
    function styleText() {
      if (!textEdit) return;
      const { box, x, y } = textEdit;
      const fs = textEdit.size * scale;
      Object.assign(box.style, {
        left: `${canvas.offsetLeft + x * scale - 3}px`,
        top: `${canvas.offsetTop + y * scale - 3}px`,
        font: `${fs}px/${LINE_HEIGHT} ${TEXT_FONT}`,
        color: textEdit.color,
      });
      const [x0, y0, x1, y1] = measuredBox({ tool: "text", color: "", size: textEdit.size, points: [[x, y, 0]], text: box.value + "\u2003" });
      box.style.width = `${(x1 - x0) * scale + 8}px`;
      box.style.height = `${(y1 - y0) * scale + 8}px`;
    }
    function commitText() {
      if (!textEdit) return;
      const t = textEdit;
      textEdit = null;
      t.box.remove();
      const text = t.box.value.replace(/\s+$/, "");
      const old = t.index >= 0 ? data.strokes[t.index] : null;
      const changed = !old || old.text !== text || old.color !== t.color || old.size !== t.size;
      if (changed && (text.trim() || old)) {
        snapshot();
        if (!text.trim()) data.strokes.splice(t.index, 1);
        else {
          const item: Stroke = { tool: "text", color: t.color, size: t.size, points: [[t.x, t.y, 0.5]], text };
          if (old) data.strokes[t.index] = item;
          else data.strokes.push(item);
        }
      }
      renderBase();
    }

    // ── Fill ──
    function fillAt(p: Point) {
      const filled = topHit(p, "fill");
      if (filled >= 0) {
        // Tapping an existing fill recolours it.
        if (data.strokes[filled].color === color) return;
        snapshot();
        data.strokes[filled] = { ...data.strokes[filled], color };
        return renderBase();
      }
      // Text doesn't stop a fill: the colour flows under it instead of leaving the letters' holes empty.
      const walls = (c: CanvasRenderingContext2D) => data.strokes.forEach((s) => s.tool !== "text" && drawStroke(c, s));
      const rings = bucketFill(walls, data.width, data.height, p[0], p[1]);
      if (!rings?.length) return;
      snapshot();
      data.strokes.push({ tool: "fill", color, size: 1, points: [], rings });
      renderBase();
    }

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "pen") penSeen = true;
      if (e.pointerType === "touch" && penSeen) {
        pan = { x: e.clientX + scroller.scrollLeft, y: e.clientY + scroller.scrollTop };
        return;
      }
      if (e.button !== 0) return;
      if (textEdit) {
        // A click outside the text box just finishes the text.
        e.preventDefault();
        commitText();
        return;
      }
      const p = point(e);
      if (mode === "text") {
        e.preventDefault(); // keep focus for the text box
        const i = topHit(p, "text");
        if (i >= 0) openText(data.strokes[i].points[0][0], data.strokes[i].points[0][1], i);
        else openText(p[0], p[1] - TEXT_SIZES[size] * 0.6, -1);
        return;
      }
      if (mode === "fill") return fillAt(p);
      canvas.setPointerCapture(e.pointerId);
      if (mode === "move") {
        const i = topHit(p);
        if (i < 0) return;
        snapshot();
        drag = { index: i, from: p, dx: 0, dy: 0 };
        renderBase();
        return;
      }
      if (mode === "delete") {
        snapshot();
        deleting = true;
        erase(p, true);
        return;
      }
      if (mode === "eraser") {
        live = { tool: "eraser", color: "#000000", size: size * ERASER_SCALE, points: [p] };
        drawStroke(bctx, live);
        paint();
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
      const p = point(e);
      if (mode === "eraser" || hover) {
        hover = e.pointerType === "touch" ? null : p;
        if (!live) paint();
      }
      if (deleting) return erase(p);
      if (drag) {
        drag.dx = p[0] - drag.from[0];
        drag.dy = p[1] - drag.from[1];
        return renderBase();
      }
      if (mode === "move") canvas.style.cursor = topHit(p) >= 0 ? "move" : "";
      if (!live) return;
      // Some browsers return an empty list instead of the event itself.
      const coalesced = e.getCoalescedEvents?.();
      const events = coalesced?.length ? coalesced : [e];
      if (live.tool === "eraser") {
        // Rub out straight away on the content layer; the full redraw happens on release.
        const prev = live.points[live.points.length - 1];
        for (const ev of events) live.points.push(point(ev));
        drawStroke(bctx, { ...live, points: [prev, ...live.points.slice(-events.length)] });
        return paint();
      }
      if (live.tool === "pen" || live.tool === "highlighter") for (const ev of events) live.points.push(point(ev));
      else live.points = [live.points[0], point(e)];
      paint();
    });
    canvas.addEventListener("pointerleave", () => {
      if (hover) (hover = null), paint();
    });
    const end = () => {
      pan = null;
      if (deleting) {
        deleting = false;
        return;
      }
      if (drag) {
        const { index, dx, dy } = drag;
        drag = null;
        if (dx || dy) data.strokes[index] = moved(data.strokes[index], dx, dy);
        else undo.pop(); // just a click: nothing changed
        syncButtons();
        return renderBase();
      }
      if (!live) return;
      const s = live;
      live = null;
      const [a, b] = [s.points[0], s.points[s.points.length - 1]];
      const tiny = s.tool !== "pen" && s.tool !== "highlighter" && s.tool !== "eraser" && Math.hypot(b[0] - a[0], b[1] - a[1]) < 3;
      if (!tiny) {
        snapshot();
        data.strokes.push(s);
      }
      renderBase();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    // ── Toolbar ──
    // Colour and size buttons don't take focus, so they can restyle the text being typed.
    const keepFocus = (e: Event) => e.preventDefault();
    const modeButtons = MODES.map(([m, icon, title]) =>
      h("button", { type: "button", class: "dw-btn", title, "aria-label": title, onclick: () => setMode(m) }, typeof icon === "string" ? icon : icon()),
    );
    const colorButtons = COLORS.map((c) =>
      h("button", { type: "button", class: "dw-swatch", style: `--c:${c}`, title: c, "aria-label": `Colour ${c}`, onmousedown: keepFocus, onclick: () => setColor(c) }),
    );
    const custom = h("input", { type: "color", class: "dw-custom", value: color, title: "Custom colour", oninput: (e: Event) => setColor((e.target as HTMLInputElement).value) }) as HTMLInputElement;
    const sizeButtons = SIZES.map((s) =>
      h("button", { type: "button", class: "dw-btn", title: `Thickness ${s}`, onmousedown: keepFocus, onclick: () => setSize(s) }, h("i", { class: "dw-dot", style: `--s:${Math.min(16, s + 2)}px` })),
    );
    const bgSelect = h(
      "select",
      { class: "dw-select", title: "Background", onchange: (e: Event) => ((data.background = (e.target as HTMLSelectElement).value as Background), (dirty = true), renderBackground()) },
      ...BACKGROUNDS.map((b) => h("option", { value: b, selected: b === data.background }, b[0].toUpperCase() + b.slice(1))),
    );
    const undoBtn = h("button", { type: "button", class: "dw-btn", title: "Undo (⌘Z)", onclick: () => doUndo() }, "↶");
    const redoBtn = h("button", { type: "button", class: "dw-btn", title: "Redo (⇧⌘Z)", onclick: () => doRedo() }, "↷");

    function setMode(m: Mode) {
      commitText();
      mode = m;
      hover = null;
      canvas.style.cursor = "";
      syncButtons();
      paint();
    }
    function setColor(c: string) {
      color = c;
      custom.value = c;
      if (textEdit) (textEdit.color = c), styleText();
      else if (mode === "eraser" || mode === "delete" || mode === "move") mode = "pen";
      syncButtons();
    }
    function setSize(s: number) {
      size = s;
      if (textEdit) (textEdit.size = TEXT_SIZES[s]), styleText();
      syncButtons();
    }
    function syncButtons() {
      modeButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(MODES[i][0] === mode)));
      colorButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(COLORS[i] === color)));
      sizeButtons.forEach((b, i) => {
        b.setAttribute("aria-pressed", String(SIZES[i] === size));
        b.title = mode === "text" ? `Text size ${TEXT_SIZES[SIZES[i]]}` : mode === "eraser" ? `Eraser size ${SIZES[i] * ERASER_SCALE}` : `Thickness ${SIZES[i]}`;
      });
      (undoBtn as HTMLButtonElement).disabled = !undo.length;
      (redoBtn as HTMLButtonElement).disabled = !redo.length;
      canvas.dataset.mode = mode;
    }
    function doUndo() {
      commitText();
      if (!undo.length) return;
      redo.push(data.strokes);
      data.strokes = undo.pop()!;
      renderBase();
      syncButtons();
    }
    function doRedo() {
      commitText();
      if (!redo.length) return;
      undo.push(data.strokes);
      data.strokes = redo.pop()!;
      renderBase();
      syncButtons();
    }

    const finish = (result: DrawingData | null) => {
      commitText();
      if (result === null && dirty && !confirm("Discard this drawing's changes?")) return;
      overlay.remove();
      window.removeEventListener("resize", layout);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = "";
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return; // typing a text: its own keys apply
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      } else if (!mod && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        const m = KEYS[e.key.toLowerCase()];
        if (m) setMode(m);
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

type Saved = { id: string; v: number; fit: number };

/** Creates a new drawing and returns its node attributes, or null if cancelled. */
export async function newDrawing(): Promise<Saved | null> {
  const data = await openCanvas();
  if (!data) return null;
  try {
    return await api<Saved>("/api/drawings", "POST", data);
  } catch (e) {
    toast((e as Error).message, "error");
    return null;
  }
}

/** Click on a drawing in the editor: settings popover with an "Edit drawing" button. */
export function editDrawing(anchor: HTMLElement, attrs: { id: string; width?: number; caption?: string }, done: (a: { v?: number; fit?: number; width?: number; caption?: string } | null) => void) {
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
          const saved = await api<Saved>(`/api/drawings/${attrs.id}`, "PUT", updated);
          done({ v: saved.v, fit: saved.fit });
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
