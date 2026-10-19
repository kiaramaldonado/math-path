import type { APIRoute } from "astro";
import { saveDrawing } from "../../../lib/drawings";
import { bad, body, json } from "../../../lib/http";

/** Body: DrawingData → { id, v } */
export const POST: APIRoute = async ({ locals, request }) => {
  const saved = await saveDrawing(locals.runtime.env, crypto.randomUUID(), await body(request));
  return saved ? json(saved, 201) : bad("Invalid drawing");
};
