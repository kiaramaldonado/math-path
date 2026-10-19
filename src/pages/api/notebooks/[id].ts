import type { APIRoute } from "astro";
import { deleteRow, getNotebook, getNotebookTree, updateNotebook } from "../../../lib/db";
import { body, id, json, missing, status, str } from "../../../lib/http";

export const GET: APIRoute = async ({ locals, params }) => {
  const db = locals.runtime.env.DB;
  const nid = id(params.id);
  const notebook = nid && (await getNotebook(db, { id: nid }, true));
  if (!notebook) return missing();
  return json({ notebook, sections: await getNotebookTree(db, notebook.id, true) });
};

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const nid = id(params.id);
  if (!nid) return missing();
  const b = await body(request);
  const color = str(b.color, 9);
  const row = await updateNotebook(locals.runtime.env.DB, nid, {
    title: str(b.title, 120) || undefined,
    subject: str(b.subject, 120),
    description: str(b.description, 1000),
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined,
    slug: str(b.slug, 80) || undefined,
    status: status(b.status),
  });
  return row ? json(row) : missing();
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const nid = id(params.id);
  if (!nid) return missing();
  await deleteRow(locals.runtime.env.DB, "notebooks", nid);
  return json({ ok: true });
};
