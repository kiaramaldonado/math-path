import type { APIRoute } from "astro";
import { DRAWING_ID, saveDrawing } from "../../../lib/drawings";
import { bad, body, json, missing } from "../../../lib/http";

/** The editable stroke data (the public only ever sees the SVG). */
export const GET: APIRoute = async ({ locals, params }) => {
  if (!DRAWING_ID.test(params.id ?? "")) return missing();
  const obj = await locals.runtime.env.FILES.get(`drawings/${params.id}.json`);
  return obj ? new Response(obj.body, { headers: { "Content-Type": "application/json" } }) : missing();
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
  if (!DRAWING_ID.test(params.id ?? "")) return missing();
  const saved = await saveDrawing(locals.runtime.env, params.id!, await body(request));
  return saved ? json(saved) : bad("Invalid drawing");
};
