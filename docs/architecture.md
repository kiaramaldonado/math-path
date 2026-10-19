# Architecture

```
Browser ──> Cloudflare Worker (Astro 5, server-rendered)
              ├─ public pages        read published rows from D1
              ├─ /<ADMIN_PATH>/*     admin UI   (rewritten to /admin/*; 404 without the secret path)
              ├─ /api/*              JSON API   (404 without a session)
              ├─ /files/*            public files from R2 (uploads, drawing SVGs)
              ├─ D1  "DB"            notebooks, sections, pages, posts, certificates, roadmap, sessions
              └─ R2  "FILES"         u/<uuid>.<ext> uploads, drawings/<id>.svg + .json
```

Content lives in the database, not in the repository, so writing from a phone never involves git.

## Folders

| Path | Contents |
| --- | --- |
| `src/middleware.ts` | Session lookup, hides `/admin` and `/api`, rewrites the secret path, security headers |
| `src/lib/auth.ts`, `password.ts`, `totp.ts`, `guard.ts` | Sessions, PBKDF2 passwords, TOTP codes, route classification |
| `src/lib/db.ts` | Every SQL query. `drafts=true` only for signed-in requests |
| `src/lib/render.ts` | Turns editor JSON into HTML on the server (with KaTeX) |
| `src/lib/drawing.ts` | Drawing data model and SVG export, shared by browser and server |
| `src/pages/` | Public pages, `admin/` pages, `api/` endpoints, `files/` |
| `src/editor/` | Browser-only code: Tiptap editor, custom nodes, drawing canvas, popovers |
| `migrations/` | D1 schema |
| `tests/` | Vitest tests (with an in-memory SQLite stand-in for D1) |

## Data model

- `notebooks` → `sections` → `pages` (`content_json` holds the page).
- `posts` (`kind` = `blog` or `project`), `certificates`, `roadmap_items`.
- `drawings` and `uploads` index what is stored in R2.
- `sessions` (hashed tokens) and `login_attempts` (rate limiting).
- Every content table has `status` = `draft` or `published`.

## Editor and rendering

Pages are edited with [Tiptap 3](https://tiptap.dev) (ProseMirror) and stored as Tiptap JSON.
Custom nodes live in `src/editor/extensions.ts`: `inlineMath`, `blockMath`, `callout`, `image`
(with width and caption), `drawing` and `embed`.

The public site never runs the editor. `src/lib/render.ts` walks the JSON on the server and
outputs HTML, rendering formulas with KaTeX. The editor and the public pages share the same
stylesheet (`src/styles/content.css`), so a page looks the same in both places.

**Rule:** any new node or mark added to the editor must also be handled in `render.ts`,
otherwise it won't appear on the public site.

The renderer only lets through safe values: http(s)/mailto/relative links, hex/rgb colours,
images from `/files/` or https, and embeds from YouTube, Desmos and GeoGebra.

## Drawings

The canvas (`src/editor/drawing-modal.ts`) records strokes as points with pressure. On save the
browser sends only the stroke data; the **server** validates it and builds the SVG itself
(`src/lib/drawings.ts`), so no uploaded SVG is ever trusted. The stroke JSON stays private
(used to re-edit); the SVG is public.
