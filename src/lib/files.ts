// R2 helpers. Keys: "u/<uuid>.<ext>" for uploads, "drawings/<id>.svg|.json" for drawings.

export const UPLOAD_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
};
export const MAX_UPLOAD = 20 * 1024 * 1024;

export async function storeUpload(env: Env, file: File): Promise<{ key: string; url: string } | { error: string }> {
  const ext = UPLOAD_TYPES[file.type];
  if (!ext) return { error: "Only images (PNG, JPEG, GIF, WebP, AVIF) and PDFs are allowed" };
  if (file.size > MAX_UPLOAD) return { error: "File is larger than 20 MB" };
  const key = `u/${crypto.randomUUID()}.${ext}`;
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await env.DB.prepare("INSERT INTO uploads (key, name, mime, size) VALUES (?, ?, ?, ?)")
    .bind(key, file.name.slice(0, 200), file.type, file.size)
    .run();
  return { key, url: `/files/${key}` };
}

export const fileUrl = (key: string | null | undefined) => (key ? `/files/${key}` : null);
