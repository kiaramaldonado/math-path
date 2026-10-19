import type { APIRoute } from "astro";
import { listPosts, recentPages } from "../lib/db";
import { esc } from "../lib/render";

/** Published blog posts, projects and notebook pages, newest first. */
export const GET: APIRoute = async ({ locals, site }) => {
  const db = locals.runtime.env.DB;
  const origin = site!.origin;
  const [blog, projects, pages] = await Promise.all([listPosts(db, "blog", false, 30), listPosts(db, "project", false, 30), recentPages(db, 30, false)]);
  const items = [
    ...blog.map((p) => ({ title: p.title, link: `${origin}/blog/${p.slug}`, date: p.published_at ?? p.updated_at, text: p.summary })),
    ...projects.map((p) => ({ title: `Project: ${p.title}`, link: `${origin}/projects/${p.slug}`, date: p.published_at ?? p.updated_at, text: p.summary })),
    ...pages.map((p) => ({ title: `${p.notebook_title}: ${p.title}`, link: `${origin}/notebooks/${p.notebook_slug}/${p.section_slug}/${p.slug}`, date: p.updated_at, text: `New notes in ${p.section_title}.` })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40);
  const rfc = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00Z` : d.replace(" ", "T") + "Z").toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Math Path · Kiara Maldonado</title>
<link>${origin}</link>
<description>A public journal of my path learning mathematics.</description>
<language>en</language>
${items.map((i) => `<item><title>${esc(i.title)}</title><link>${esc(i.link)}</link><guid>${esc(i.link)}</guid><pubDate>${rfc(i.date)}</pubDate><description>${esc(i.text)}</description></item>`).join("\n")}
</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
