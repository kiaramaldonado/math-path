export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const bad = (message: string) => json({ error: message }, 400);
export const missing = () => json({ error: "Not found" }, 404);

export async function body<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export function id(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function str(v: unknown, max = 500): string | undefined {
  return typeof v === "string" ? v.trim().slice(0, max) : undefined;
}

export function status(v: unknown): "draft" | "published" | undefined {
  return v === "draft" || v === "published" ? v : undefined;
}

/** Validates a Tiptap document posted by the editor and returns it as a string. */
export function docJson(v: unknown): string | undefined {
  if (!v || typeof v !== "object" || (v as { type?: string }).type !== "doc") return undefined;
  const s = JSON.stringify(v);
  return s.length <= 2_000_000 ? s : undefined;
}
