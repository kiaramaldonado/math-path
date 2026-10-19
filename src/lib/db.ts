// All SQL lives here. `drafts` = include draft rows (only ever true for a logged-in request).

export type Status = "draft" | "published";

export interface Notebook {
  id: number;
  slug: string;
  title: string;
  subject: string;
  description: string;
  color: string;
  position: number;
  status: Status;
  updated_at: string;
  page_count?: number;
}
export interface Section {
  id: number;
  notebook_id: number;
  slug: string;
  title: string;
  position: number;
  status: Status;
}
export interface PageMeta {
  id: number;
  section_id: number;
  slug: string;
  title: string;
  position: number;
  status: Status;
  updated_at: string;
}
export interface Page extends PageMeta {
  content_json: string;
  created_at: string;
}
export interface SectionWithPages extends Section {
  pages: PageMeta[];
}
export interface Post {
  id: number;
  kind: "blog" | "project";
  slug: string;
  title: string;
  summary: string;
  content_json: string;
  cover_key: string | null;
  links_json: string;
  tags: string;
  status: Status;
  published_at: string | null;
  updated_at: string;
}
export interface Certificate {
  id: number;
  title: string;
  issuer: string;
  issued_on: string | null;
  url: string;
  file_key: string | null;
  notebook_id: number | null;
  status: Status;
}
export interface RoadmapItem {
  id: number;
  kind: "course" | "book" | "topic" | "milestone";
  title: string;
  progress: "planned" | "in_progress" | "done";
  started_on: string | null;
  finished_on: string | null;
  notes: string;
  url: string;
  notebook_id: number | null;
  position: number;
  status: Status;
}

const pub = (alias: string, drafts: boolean) => (drafts ? "" : ` AND ${alias}.status = 'published'`);

export function slugify(text: string): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "untitled";
}

/** Finds a free slug by appending -2, -3… `scope` limits uniqueness, e.g. within one section. */
export async function uniqueSlug(
  db: D1Database,
  table: "notebooks" | "sections" | "pages" | "posts",
  title: string,
  scope?: { column: string; value: string | number },
  exceptId?: number,
): Promise<string> {
  const base = slugify(title);
  const where = scope ? ` AND ${scope.column} = ?` : "";
  const except = exceptId ? " AND id != ?" : "";
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const binds: (string | number)[] = [slug];
    if (scope) binds.push(scope.value);
    if (exceptId) binds.push(exceptId);
    const hit = await db.prepare(`SELECT 1 FROM ${table} WHERE slug = ?${where}${except}`).bind(...binds).first();
    if (!hit) return slug;
  }
}

async function nextPosition(db: D1Database, table: string, column?: string, value?: number): Promise<number> {
  const where = column ? ` WHERE ${column} = ?` : "";
  const stmt = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ${table}${where}`);
  const row = await (column ? stmt.bind(value) : stmt).first<{ p: number }>();
  return row?.p ?? 0;
}

// ───────────────────────── Notebooks ─────────────────────────

export async function listNotebooks(db: D1Database, drafts: boolean): Promise<Notebook[]> {
  const { results } = await db
    .prepare(
      `SELECT n.*, (SELECT COUNT(*) FROM pages p JOIN sections s ON s.id = p.section_id
                    WHERE s.notebook_id = n.id${pub("p", drafts)}${pub("s", drafts)}) AS page_count
       FROM notebooks n WHERE 1=1${pub("n", drafts)} ORDER BY n.position, n.id`,
    )
    .all<Notebook>();
  return results;
}

export async function getNotebook(db: D1Database, by: { id?: number; slug?: string }, drafts: boolean) {
  const [col, val] = by.id !== undefined ? ["id", by.id] : ["slug", by.slug];
  return db.prepare(`SELECT * FROM notebooks n WHERE n.${col} = ?${pub("n", drafts)}`).bind(val).first<Notebook>();
}

export async function getNotebookTree(db: D1Database, notebookId: number, drafts: boolean): Promise<SectionWithPages[]> {
  const [sections, pages] = await db.batch<Section | PageMeta>([
    db.prepare(`SELECT * FROM sections s WHERE s.notebook_id = ?${pub("s", drafts)} ORDER BY s.position, s.id`).bind(notebookId),
    db
      .prepare(
        `SELECT p.id, p.section_id, p.slug, p.title, p.position, p.status, p.updated_at
         FROM pages p JOIN sections s ON s.id = p.section_id
         WHERE s.notebook_id = ?${pub("p", drafts)} ORDER BY p.position, p.id`,
      )
      .bind(notebookId),
  ]);
  const bySection = new Map<number, PageMeta[]>();
  for (const p of pages.results as PageMeta[]) {
    if (!bySection.has(p.section_id)) bySection.set(p.section_id, []);
    bySection.get(p.section_id)!.push(p);
  }
  return (sections.results as Section[]).map((s) => ({ ...s, pages: bySection.get(s.id) ?? [] }));
}

export async function createNotebook(db: D1Database, title: string, subject = ""): Promise<Notebook> {
  const slug = await uniqueSlug(db, "notebooks", title);
  const position = await nextPosition(db, "notebooks");
  const nb = await db
    .prepare("INSERT INTO notebooks (slug, title, subject, position) VALUES (?, ?, ?, ?) RETURNING *")
    .bind(slug, title, subject, position)
    .first<Notebook>();
  // Every notebook starts with one section so there's somewhere to put pages.
  await createSection(db, nb!.id, "Notes");
  return nb!;
}

export async function updateNotebook(
  db: D1Database,
  id: number,
  patch: Partial<Pick<Notebook, "title" | "subject" | "description" | "color" | "status" | "slug">>,
) {
  if (patch.slug !== undefined) patch.slug = await uniqueSlug(db, "notebooks", patch.slug, undefined, id);
  return updateRow(db, "notebooks", id, patch, true);
}

// ───────────────────────── Sections ─────────────────────────

export async function createSection(db: D1Database, notebookId: number, title: string): Promise<Section> {
  const slug = await uniqueSlug(db, "sections", title, { column: "notebook_id", value: notebookId });
  const position = await nextPosition(db, "sections", "notebook_id", notebookId);
  const row = await db
    .prepare("INSERT INTO sections (notebook_id, slug, title, position) VALUES (?, ?, ?, ?) RETURNING *")
    .bind(notebookId, slug, title, position)
    .first<Section>();
  return row!;
}

export async function updateSection(db: D1Database, id: number, patch: Partial<Pick<Section, "title" | "status">>) {
  const row = await db.prepare("SELECT notebook_id FROM sections WHERE id = ?").bind(id).first<{ notebook_id: number }>();
  if (!row) return null;
  const full: Record<string, unknown> = { ...patch };
  if (patch.title) full.slug = await uniqueSlug(db, "sections", patch.title, { column: "notebook_id", value: row.notebook_id }, id);
  return updateRow(db, "sections", id, full, false);
}

// ───────────────────────── Pages ─────────────────────────

export async function getPageById(db: D1Database, id: number) {
  return db.prepare("SELECT * FROM pages WHERE id = ?").bind(id).first<Page>();
}

/** A page is public only when it, its section and its notebook are all published. */
export async function getPageByPath(db: D1Database, notebookSlug: string, sectionSlug: string, pageSlug: string, drafts: boolean) {
  return db
    .prepare(
      `SELECT p.* FROM pages p
       JOIN sections s ON s.id = p.section_id
       JOIN notebooks n ON n.id = s.notebook_id
       WHERE n.slug = ? AND s.slug = ? AND p.slug = ?${pub("p", drafts)}${pub("s", drafts)}${pub("n", drafts)}`,
    )
    .bind(notebookSlug, sectionSlug, pageSlug)
    .first<Page>();
}

export interface RecentPage extends PageMeta {
  notebook_slug: string;
  notebook_title: string;
  section_slug: string;
  section_title: string;
}

export async function recentPages(db: D1Database, limit: number, drafts: boolean): Promise<RecentPage[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.section_id, p.slug, p.title, p.position, p.status, p.updated_at,
              n.slug AS notebook_slug, n.title AS notebook_title, s.slug AS section_slug, s.title AS section_title
       FROM pages p JOIN sections s ON s.id = p.section_id JOIN notebooks n ON n.id = s.notebook_id
       WHERE 1=1${pub("p", drafts)}${pub("s", drafts)}${pub("n", drafts)}
       ORDER BY p.updated_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<RecentPage>();
  return results;
}

/** Pages matching a title search, for the "link to another page" picker. */
export async function searchPages(db: D1Database, q: string, limit = 12): Promise<RecentPage[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.section_id, p.slug, p.title, p.position, p.status, p.updated_at,
              n.slug AS notebook_slug, n.title AS notebook_title, s.slug AS section_slug, s.title AS section_title
       FROM pages p JOIN sections s ON s.id = p.section_id JOIN notebooks n ON n.id = s.notebook_id
       WHERE p.title LIKE ? OR n.title LIKE ? ORDER BY p.updated_at DESC LIMIT ?`,
    )
    .bind(`%${q}%`, `%${q}%`, limit)
    .all<RecentPage>();
  return results;
}

export async function createPage(db: D1Database, sectionId: number, title: string): Promise<Page> {
  const slug = await uniqueSlug(db, "pages", title, { column: "section_id", value: sectionId });
  const position = await nextPosition(db, "pages", "section_id", sectionId);
  const page = await db
    .prepare("INSERT INTO pages (section_id, slug, title, position) VALUES (?, ?, ?, ?) RETURNING *")
    .bind(sectionId, slug, title, position)
    .first<Page>();
  await touchNotebookOfSection(db, sectionId);
  return page!;
}

export async function updatePage(
  db: D1Database,
  id: number,
  patch: Partial<Pick<Page, "title" | "content_json" | "status">>,
): Promise<Page | null> {
  const page = await getPageById(db, id);
  if (!page) return null;
  const full: Record<string, unknown> = { ...patch };
  if (patch.title && patch.title !== page.title) {
    full.slug = await uniqueSlug(db, "pages", patch.title, { column: "section_id", value: page.section_id }, id);
  }
  const row = await updateRow<Page>(db, "pages", id, full, true);
  await touchNotebookOfSection(db, page.section_id);
  return row;
}

/** Moves a page to a section (same or another notebook) at a position, renumbering both sections. */
export async function movePage(db: D1Database, id: number, sectionId: number, position: number): Promise<boolean> {
  const page = await getPageById(db, id);
  const target = await db.prepare("SELECT id FROM sections WHERE id = ?").bind(sectionId).first();
  if (!page || !target) return false;
  const slug =
    page.section_id === sectionId ? page.slug : await uniqueSlug(db, "pages", page.slug, { column: "section_id", value: sectionId });
  const { results } = await db
    .prepare("SELECT id FROM pages WHERE section_id = ? AND id != ? ORDER BY position, id")
    .bind(sectionId, id)
    .all<{ id: number }>();
  const ids = results.map((r) => r.id);
  ids.splice(Math.max(0, Math.min(position, ids.length)), 0, id);
  await db.batch([
    db.prepare("UPDATE pages SET section_id = ?, slug = ? WHERE id = ?").bind(sectionId, slug, id),
    ...ids.map((pid, i) => db.prepare("UPDATE pages SET position = ? WHERE id = ?").bind(i, pid)),
  ]);
  if (page.section_id !== sectionId) await renumber(db, "pages", "section_id", page.section_id);
  return true;
}

/** Moves a section to a position within its notebook. */
export async function moveSection(db: D1Database, id: number, position: number): Promise<boolean> {
  const section = await db.prepare("SELECT notebook_id FROM sections WHERE id = ?").bind(id).first<{ notebook_id: number }>();
  if (!section) return false;
  const { results } = await db
    .prepare("SELECT id FROM sections WHERE notebook_id = ? AND id != ? ORDER BY position, id")
    .bind(section.notebook_id, id)
    .all<{ id: number }>();
  const ids = results.map((r) => r.id);
  ids.splice(Math.max(0, Math.min(position, ids.length)), 0, id);
  await db.batch(ids.map((sid, i) => db.prepare("UPDATE sections SET position = ? WHERE id = ?").bind(i, sid)));
  return true;
}

export async function reorderNotebooks(db: D1Database, ids: number[]): Promise<void> {
  await db.batch(ids.map((id, i) => db.prepare("UPDATE notebooks SET position = ? WHERE id = ?").bind(i, id)));
}

async function renumber(db: D1Database, table: string, column: string, value: number) {
  const { results } = await db.prepare(`SELECT id FROM ${table} WHERE ${column} = ? ORDER BY position, id`).bind(value).all<{ id: number }>();
  if (results.length) await db.batch(results.map((r, i) => db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).bind(i, r.id)));
}

async function touchNotebookOfSection(db: D1Database, sectionId: number) {
  await db
    .prepare("UPDATE notebooks SET updated_at = datetime('now') WHERE id = (SELECT notebook_id FROM sections WHERE id = ?)")
    .bind(sectionId)
    .run();
}

// ───────────────────────── Posts ─────────────────────────

export async function listPosts(db: D1Database, kind: Post["kind"], drafts: boolean, limit = 200): Promise<Post[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM posts p WHERE p.kind = ?${pub("p", drafts)}
       ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT ?`,
    )
    .bind(kind, limit)
    .all<Post>();
  return results;
}

export async function getPost(db: D1Database, by: { id?: number; kind?: Post["kind"]; slug?: string }, drafts: boolean) {
  if (by.id !== undefined) return db.prepare(`SELECT * FROM posts p WHERE p.id = ?${pub("p", drafts)}`).bind(by.id).first<Post>();
  return db.prepare(`SELECT * FROM posts p WHERE p.kind = ? AND p.slug = ?${pub("p", drafts)}`).bind(by.kind, by.slug).first<Post>();
}

export async function createPost(db: D1Database, kind: Post["kind"], title: string): Promise<Post> {
  const slug = await uniqueSlug(db, "posts", title, { column: "kind", value: kind });
  const row = await db.prepare("INSERT INTO posts (kind, slug, title) VALUES (?, ?, ?) RETURNING *").bind(kind, slug, title).first<Post>();
  return row!;
}

export async function updatePost(
  db: D1Database,
  id: number,
  patch: Partial<Pick<Post, "title" | "summary" | "content_json" | "cover_key" | "links_json" | "tags" | "status" | "slug">>,
) {
  const post = await getPost(db, { id }, true);
  if (!post) return null;
  const full: Record<string, unknown> = { ...patch };
  if (patch.slug !== undefined) full.slug = await uniqueSlug(db, "posts", patch.slug, { column: "kind", value: post.kind }, id);
  if (patch.status === "published" && !post.published_at) full.published_at = new Date().toISOString().slice(0, 10);
  return updateRow<Post>(db, "posts", id, full, true);
}

// ───────────────────────── Certificates & roadmap ─────────────────────────

export async function listCertificates(db: D1Database, drafts: boolean): Promise<Certificate[]> {
  const { results } = await db
    .prepare(`SELECT * FROM certificates c WHERE 1=1${pub("c", drafts)} ORDER BY c.issued_on DESC, c.id DESC`)
    .all<Certificate>();
  return results;
}

export async function listRoadmap(db: D1Database, drafts: boolean): Promise<RoadmapItem[]> {
  const { results } = await db
    .prepare(`SELECT * FROM roadmap_items r WHERE 1=1${pub("r", drafts)} ORDER BY r.position, r.id`)
    .all<RoadmapItem>();
  return results;
}

// ───────────────────────── Generic helpers ─────────────────────────

const EDITABLE: Record<string, string[]> = {
  notebooks: ["title", "subject", "description", "color", "status", "slug"],
  sections: ["title", "status", "slug"],
  pages: ["title", "content_json", "status", "slug"],
  posts: ["title", "summary", "content_json", "cover_key", "links_json", "tags", "status", "slug", "published_at"],
  certificates: ["title", "issuer", "issued_on", "url", "file_key", "notebook_id", "status"],
  roadmap_items: ["kind", "title", "progress", "started_on", "finished_on", "notes", "url", "notebook_id", "status", "position"],
};

/** Updates whitelisted columns only. */
export async function updateRow<T = Record<string, unknown>>(
  db: D1Database,
  table: keyof typeof EDITABLE,
  id: number,
  patch: Record<string, unknown>,
  touch: boolean,
): Promise<T | null> {
  const cols = Object.keys(patch).filter((k) => EDITABLE[table].includes(k) && patch[k] !== undefined);
  if (!cols.length && !touch) return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<T>();
  const sets = cols.map((c) => `${c} = ?`);
  if (touch) sets.push("updated_at = datetime('now')");
  return db
    .prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
    .bind(...cols.map((c) => patch[c] as string | number | null), id)
    .first<T>();
}

export async function insertRow(db: D1Database, table: "certificates" | "roadmap_items", values: Record<string, unknown>) {
  const cols = Object.keys(values).filter((k) => EDITABLE[table].includes(k));
  return db
    .prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING *`)
    .bind(...cols.map((c) => values[c] as string | number | null))
    .first();
}

export async function deleteRow(
  db: D1Database,
  table: "notebooks" | "sections" | "pages" | "posts" | "certificates" | "roadmap_items",
  id: number,
): Promise<void> {
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
}
