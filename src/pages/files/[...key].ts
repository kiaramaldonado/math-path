import type { APIRoute } from "astro";

// Public file serving from R2. Keys are random UUIDs; drawing stroke data (.json) stays private.
const PUBLIC_KEY = /^(u\/[0-9a-f-]{36}\.(png|jpg|gif|webp|avif|pdf)|drawings\/[a-z0-9-]{8,64}\.svg)$/;

export const GET: APIRoute = async ({ locals, params, request }) => {
  const key = params.key ?? "";
  if (!PUBLIC_KEY.test(key)) return new Response("Not found", { status: 404 });
  const obj = await locals.runtime.env.FILES.get(key, { onlyIf: request.headers });
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  // SVGs could carry scripts; never let them run. (Chrome refuses to show sandboxed PDFs, so skip those.)
  if (!key.endsWith(".pdf")) headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  // Drawings can be re-saved under the same key (the page adds ?v=), uploads never change.
  headers.set("Cache-Control", key.startsWith("drawings/") ? "public, max-age=300" : "public, max-age=31536000, immutable");
  if (!("body" in obj)) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
};
