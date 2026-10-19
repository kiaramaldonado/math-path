import type { APIRoute } from "astro";
import { deleteRow, moveSection, updateSection } from "../../../lib/db";
import { body, id, json, missing, status, str } from "../../../lib/http";

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const db = locals.runtime.env.DB;
  const sid = id(params.id);
  if (!sid) return missing();
  const b = await body(request);
  if (Number.isInteger(b.position) && !(await moveSection(db, sid, b.position as number))) return missing();
  const row = await updateSection(db, sid, { title: str(b.title, 120) || undefined, status: status(b.status) });
  return row ? json(row) : missing();
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const sid = id(params.id);
  if (!sid) return missing();
  await deleteRow(locals.runtime.env.DB, "sections", sid);
  return json({ ok: true });
};
