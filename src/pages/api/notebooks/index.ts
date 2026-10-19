import type { APIRoute } from "astro";
import { createNotebook, listNotebooks, reorderNotebooks } from "../../../lib/db";
import { bad, body, json, str } from "../../../lib/http";

export const GET: APIRoute = async ({ locals }) => json(await listNotebooks(locals.runtime.env.DB, true));

export const POST: APIRoute = async ({ locals, request }) => {
  const b = await body(request);
  const title = str(b.title, 120);
  if (!title) return bad("Title is required");
  return json(await createNotebook(locals.runtime.env.DB, title, str(b.subject, 120) ?? ""), 201);
};

/** Reorder: { ids: [3, 1, 2] } */
export const PUT: APIRoute = async ({ locals, request }) => {
  const { ids } = await body<{ ids?: unknown }>(request);
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n))) return bad("ids must be integers");
  await reorderNotebooks(locals.runtime.env.DB, ids as number[]);
  return json({ ok: true });
};
