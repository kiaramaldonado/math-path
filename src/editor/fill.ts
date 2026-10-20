// Bucket fill: paints the drawing off-screen, flood-fills the empty area around the tapped point,
// then traces that area back into vector outlines (rings) so the saved SVG stays crisp.
import type { Ring } from "../lib/drawing";

const WALL = 40; // pixels more opaque than this (0–255) stop the fill
const MAX_PIXELS = 4_000_000;
const MAX_POINTS = 40_000;

/** Returns the outline of the filled area in drawing units, or null if the point is on a line. */
export function bucketFill(paint: (ctx: CanvasRenderingContext2D) => void, width: number, height: number, x: number, y: number): Ring[] | null {
  const k = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));
  const W = Math.ceil(width * k);
  const H = Math.ceil(height * k);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.scale(k, k);
  paint(ctx);
  const px = ctx.getImageData(0, 0, W, H).data;
  const sx = Math.floor(x * k);
  const sy = Math.floor(y * k);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  const open = (i: number) => px[i * 4 + 3] <= WALL;
  if (!open(sy * W + sx)) return null;

  // Scanline flood fill.
  const mask = new Uint8Array(W * H);
  const stack = [sy * W + sx];
  while (stack.length) {
    const i = stack.pop()!;
    if (mask[i]) continue;
    const row = Math.floor(i / W) * W;
    let l = i;
    let r = i;
    while (l > row && !mask[l - 1] && open(l - 1)) l--;
    while (r < row + W - 1 && !mask[r + 1] && open(r + 1)) r++;
    mask.fill(1, l, r + 1);
    for (const step of [-W, W]) {
      if (row + step < 0 || row + step >= W * H) continue;
      let run = false;
      for (let j = l + step; j <= r + step; j++) {
        const ok = !mask[j] && open(j);
        if (ok && !run) stack.push(j);
        run = ok;
      }
    }
  }

  // Grow a little so the fill tucks under the soft edge of the lines around it.
  for (let n = Math.max(1, Math.round(2 * k)); n > 0; n--) {
    const grown = mask.slice();
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) continue;
      const c = i % W;
      if ((c > 0 && mask[i - 1]) || (c < W - 1 && mask[i + 1]) || mask[i - W] || mask[i + W]) grown[i] = 1;
    }
    mask.set(grown);
  }

  const loops = trace(mask, W, H);
  for (let tolerance = 0.75; ; tolerance *= 2) {
    const rings = loops.map((l) => simplify(l, tolerance)).filter((l) => l.length >= 3);
    if (rings.reduce((n, l) => n + l.length, 0) <= MAX_POINTS || tolerance > 50) {
      const r = (n: number) => Math.round((n / k) * 10) / 10;
      return rings.map((l) => l.map(([px, py]) => [r(px), r(py)] as [number, number]));
    }
  }
}

/** Pixel-edge outlines of the mask. With the even-odd rule they fill exactly the mask. */
function trace(mask: Uint8Array, W: number, H: number): [number, number][][] {
  const V = W + 1;
  const out = new Map<number, number[]>();
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const from = y1 * V + x1;
    const list = out.get(from);
    if (list) list.push(y2 * V + x2);
    else out.set(from, [y2 * V + x2]);
  };
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      if (!at(x, y - 1)) edge(x, y, x + 1, y);
      if (!at(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) edge(x, y + 1, x, y);
    }
  const loops: [number, number][][] = [];
  for (const start of out.keys()) {
    while (out.get(start)?.length) {
      const loop: [number, number][] = [];
      let v = start;
      do {
        loop.push([v % V, Math.floor(v / V)]);
        const list = out.get(v)!;
        const next = list.pop()!;
        if (!list.length) out.delete(v);
        v = next;
      } while (v !== start);
      loops.push(loop);
    }
  }
  return loops;
}

/** Drops straight-run points, then Douglas–Peucker on the closed loop. */
function simplify(loop: [number, number][], tolerance: number): [number, number][] {
  const n = loop.length;
  const corners = loop.filter((p, i) => {
    const a = loop[(i + n - 1) % n];
    const b = loop[(i + 1) % n];
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
  });
  if (corners.length < 4) return corners;
  const pts = [...corners, corners[0]];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  // Split at the point farthest from the start so the loop has two real halves.
  let far = 1;
  for (let i = 1; i < pts.length - 1; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
  keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let dist = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > dist) (dist = d), (best = i);
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.slice(0, -1).filter((_, i) => keep[i]);
}
