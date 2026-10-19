import { cleanDrawing, toSvg } from "./drawing";

export const DRAWING_ID = /^[a-z0-9-]{8,64}$/;

/** Stores the strokes (for re-editing) and a server-built SVG (for display). */
export async function saveDrawing(env: Env, id: string, input: unknown): Promise<{ id: string; v: number } | null> {
  const data = cleanDrawing(input);
  if (!data || !DRAWING_ID.test(id)) return null;
  await Promise.all([
    env.FILES.put(`drawings/${id}.json`, JSON.stringify(data), { httpMetadata: { contentType: "application/json" } }),
    env.FILES.put(`drawings/${id}.svg`, toSvg(data), { httpMetadata: { contentType: "image/svg+xml" } }),
  ]);
  await env.DB.prepare(
    `INSERT INTO drawings (id, width, height) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET width = excluded.width, height = excluded.height, updated_at = datetime('now')`,
  )
    .bind(id, data.width, data.height)
    .run();
  return { id, v: Date.now() };
}
