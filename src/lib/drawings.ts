import { cleanDrawing, contentArea, toSvg } from "./drawing";

export const DRAWING_ID = /^[a-z0-9-]{8,64}$/;

/**
 * Stores the strokes (for re-editing) and a server-built SVG (for display). The SVG is cropped
 * to the drawn area; `fit` is its width as a share of the canvas, so pages show it at the same
 * scale as the canvas instead of stretching it to full width.
 */
export async function saveDrawing(env: Env, id: string, input: unknown): Promise<{ id: string; v: number; fit: number } | null> {
  const data = cleanDrawing(input);
  if (!data || !DRAWING_ID.test(id)) return null;
  const area = contentArea(data);
  await Promise.all([
    env.FILES.put(`drawings/${id}.json`, JSON.stringify(data), { httpMetadata: { contentType: "application/json" } }),
    env.FILES.put(`drawings/${id}.svg`, toSvg(data, area), { httpMetadata: { contentType: "image/svg+xml" } }),
  ]);
  await env.DB.prepare(
    `INSERT INTO drawings (id, width, height) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET width = excluded.width, height = excluded.height, updated_at = datetime('now')`,
  )
    .bind(id, data.width, data.height)
    .run();
  return { id, v: Date.now(), fit: Math.round((area.w / data.width) * 1000) / 1000 };
}
