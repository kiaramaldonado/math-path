import type { APIRoute } from "astro";
import { deleteRow, getPost, updatePost } from "../../../lib/db";
import { bad, body, docJson, id, json, missing, status, str } from "../../../lib/http";

export const GET: APIRoute = async ({ locals, params }) => {
  const pid = id(params.id);
  const post = pid && (await getPost(locals.runtime.env.DB, { id: pid }, true));
  return post ? json(post) : missing();
};

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const pid = id(params.id);
  if (!pid) return missing();
  const b = await body(request);
  if (b.content !== undefined && !docJson(b.content)) return bad("Invalid document");
  let links: string | undefined;
  if (Array.isArray(b.links)) {
    links = JSON.stringify(
      b.links
        .map((l: { label?: unknown; url?: unknown }) => ({ label: str(l?.label, 60) ?? "", url: str(l?.url, 500) ?? "" }))
        .filter((l) => l.label && /^https?:\/\//.test(l.url))
        .slice(0, 10),
    );
  }
  const cover = b.cover_key === null ? null : str(b.cover_key, 200);
  const post = await updatePost(locals.runtime.env.DB, pid, {
    title: str(b.title, 160) || undefined,
    summary: str(b.summary, 500),
    content_json: b.content !== undefined ? docJson(b.content) : undefined,
    cover_key: cover,
    links_json: links,
    tags: str(b.tags, 300),
    slug: str(b.slug, 80) || undefined,
    status: status(b.status),
  });
  return post ? json({ id: post.id, slug: post.slug, status: post.status, updated_at: post.updated_at }) : missing();
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const pid = id(params.id);
  if (!pid) return missing();
  await deleteRow(locals.runtime.env.DB, "posts", pid);
  return json({ ok: true });
};
