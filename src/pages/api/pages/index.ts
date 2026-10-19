import type { APIRoute } from "astro";
import { createPage, searchPages } from "../../../lib/db";
import { bad, body, json, str } from "../../../lib/http";

/** Search pages by title (for linking between notes): ?q=vectors */
export const GET: APIRoute = async ({ locals, url }) => {
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const rows = await searchPages(locals.runtime.env.DB, q);
  return json(
    rows.map((p) => ({
      id: p.id,
      title: p.title,
      where: `${p.notebook_title} › ${p.section_title}`,
      href: `/notebooks/${p.notebook_slug}/${p.section_slug}/${p.slug}`,
    })),
  );
};

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.runtime.env.DB;
  const b = await body(request);
  const title = str(b.title, 160);
  const sectionId = Number(b.sectionId);
  if (!title || !Number.isInteger(sectionId)) return bad("sectionId and title are required");
  const exists = await db.prepare("SELECT 1 FROM sections WHERE id = ?").bind(sectionId).first();
  if (!exists) return bad("Unknown section");
  return json(await createPage(db, sectionId, title), 201);
};
