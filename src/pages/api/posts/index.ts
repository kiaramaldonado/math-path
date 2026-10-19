import type { APIRoute } from "astro";
import { createPost } from "../../../lib/db";
import { bad, body, json, str } from "../../../lib/http";

export const POST: APIRoute = async ({ locals, request }) => {
  const b = await body(request);
  const title = str(b.title, 160);
  const kind = b.kind === "blog" || b.kind === "project" ? b.kind : null;
  if (!title || !kind) return bad("kind and title are required");
  return json(await createPost(locals.runtime.env.DB, kind, title), 201);
};
