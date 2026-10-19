import type { APIRoute } from "astro";
import { listNotebooks, listPosts, recentPages } from "../lib/db";
import { esc } from "../lib/render";

/** Published content only. The admin never appears here. */
export const GET: APIRoute = async ({ locals, site }) => {
  const db = locals.runtime.env.DB;
  const origin = site!.origin;
  const [notebooks, pages, blog, projects] = await Promise.all([
    listNotebooks(db, false),
    recentPages(db, 5000, false),
    listPosts(db, "blog", false, 5000),
    listPosts(db, "project", false, 5000),
  ]);
  const urls = [
    ...["/", "/notebooks", "/blog", "/projects", "/certificates", "/roadmap"].map((p) => ({ loc: p, mod: "" })),
    ...notebooks.map((n) => ({ loc: `/notebooks/${n.slug}`, mod: n.updated_at })),
    ...pages.map((p) => ({ loc: `/notebooks/${p.notebook_slug}/${p.section_slug}/${p.slug}`, mod: p.updated_at })),
    ...blog.map((p) => ({ loc: `/blog/${p.slug}`, mod: p.updated_at })),
    ...projects.map((p) => ({ loc: `/projects/${p.slug}`, mod: p.updated_at })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(origin + u.loc)}</loc>${u.mod ? `<lastmod>${u.mod.slice(0, 10)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
