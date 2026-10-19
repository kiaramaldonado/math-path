import type { APIRoute } from "astro";
import { createSection, getNotebook } from "../../../lib/db";
import { bad, body, json, str } from "../../../lib/http";

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.runtime.env.DB;
  const b = await body(request);
  const title = str(b.title, 120);
  const notebook = await getNotebook(db, { id: Number(b.notebookId) }, true);
  if (!title || !notebook) return bad("notebookId and title are required");
  return json(await createSection(db, notebook.id, title), 201);
};
