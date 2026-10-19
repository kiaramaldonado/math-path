import type { APIRoute } from "astro";
import { deleteRow, getPageById, movePage, updatePage } from "../../../lib/db";
import { bad, body, docJson, id, json, missing, status, str } from "../../../lib/http";

export const GET: APIRoute = async ({ locals, params }) => {
  const pid = id(params.id);
  const page = pid && (await getPageById(locals.runtime.env.DB, pid));
  return page ? json(page) : missing();
};

/** Any of: { title, content, status, sectionId + position } */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const db = locals.runtime.env.DB;
  const pid = id(params.id);
  if (!pid) return missing();
  const b = await body(request);
  if (b.content !== undefined && !docJson(b.content)) return bad("Invalid document");
  if (b.sectionId !== undefined) {
    const moved = await movePage(db, pid, Number(b.sectionId), Number.isInteger(b.position) ? (b.position as number) : 1e9);
    if (!moved) return bad("Unknown page or section");
  }
  const page = await updatePage(db, pid, {
    title: str(b.title, 160) || undefined,
    content_json: b.content !== undefined ? docJson(b.content) : undefined,
    status: status(b.status),
  });
  return page ? json({ id: page.id, slug: page.slug, title: page.title, status: page.status, section_id: page.section_id, updated_at: page.updated_at }) : missing();
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const pid = id(params.id);
  if (!pid) return missing();
  await deleteRow(locals.runtime.env.DB, "pages", pid);
  return json({ ok: true });
};
