import type { APIRoute } from "astro";
import { storeUpload } from "../../lib/files";
import { bad, json } from "../../lib/http";

/** multipart/form-data with a "file" field → { key, url } */
export const POST: APIRoute = async ({ locals, request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return bad("No file");
  const result = await storeUpload(locals.runtime.env, file);
  return "error" in result ? bad(result.error) : json(result, 201);
};
