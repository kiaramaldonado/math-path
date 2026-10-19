import { describe, expect, it } from "vitest";
import {
  createNotebook,
  createPage,
  createSection,
  getNotebookTree,
  getPageByPath,
  listNotebooks,
  movePage,
  recentPages,
  updateNotebook,
  updatePage,
  updateSection,
} from "../src/lib/db";
import { testDb } from "./d1";

async function setup() {
  const db = testDb();
  const nb = await createNotebook(db, "Linear Algebra");
  const [notes] = await getNotebookTree(db, nb.id, true);
  const page = await createPage(db, notes.id, "Vectors");
  return { db, nb, notes, page };
}

describe("drafts are private", () => {
  it("new notebooks and pages start as drafts and are hidden from the public", async () => {
    const { db, nb } = await setup();
    expect(await listNotebooks(db, false)).toHaveLength(0);
    expect(await listNotebooks(db, true)).toHaveLength(1);
    expect(await getPageByPath(db, nb.slug, "notes", "vectors", false)).toBeNull();
    expect(await getPageByPath(db, nb.slug, "notes", "vectors", true)).not.toBeNull();
  });

  it("a page is public only when it, its section and its notebook are published", async () => {
    const { db, nb, notes, page } = await setup();
    await updatePage(db, page.id, { status: "published" });
    expect(await getPageByPath(db, nb.slug, "notes", "vectors", false)).toBeNull(); // notebook still draft
    await updateNotebook(db, nb.id, { status: "published" });
    expect(await getPageByPath(db, nb.slug, "notes", "vectors", false)).not.toBeNull();
    await updateSection(db, notes.id, { status: "draft" });
    expect(await getPageByPath(db, nb.slug, "notes", "vectors", false)).toBeNull();
    expect(await recentPages(db, 10, false)).toHaveLength(0);
  });

  it("public page counts ignore drafts", async () => {
    const { db, nb, notes, page } = await setup();
    await createPage(db, notes.id, "Draft");
    await updatePage(db, page.id, { status: "published" });
    await updateNotebook(db, nb.id, { status: "published" });
    const [publicNb] = await listNotebooks(db, false);
    expect(publicNb.page_count).toBe(1);
  });
});

describe("organising notebooks", () => {
  it("gives unique slugs within a section", async () => {
    const { db, notes } = await setup();
    const again = await createPage(db, notes.id, "Vectors");
    expect(again.slug).toBe("vectors-2");
  });

  it("renaming a page updates its slug", async () => {
    const { db, page } = await setup();
    const renamed = await updatePage(db, page.id, { title: "Dot product & angles" });
    expect(renamed?.slug).toBe("dot-product-angles");
  });

  it("moves pages between sections and keeps order", async () => {
    const { db, nb, notes, page } = await setup();
    const second = await createPage(db, notes.id, "Matrices");
    const proofs = await createSection(db, nb.id, "Proofs");
    await movePage(db, page.id, proofs.id, 0);
    let tree = await getNotebookTree(db, nb.id, true);
    expect(tree.map((s) => s.pages.map((p) => p.title))).toEqual([["Matrices"], ["Vectors"]]);
    await movePage(db, second.id, proofs.id, 0);
    tree = await getNotebookTree(db, nb.id, true);
    expect(tree.map((s) => s.pages.map((p) => p.title))).toEqual([[], ["Matrices", "Vectors"]]);
  });

  it("moving a page into a section with the same slug renames it", async () => {
    const { db, nb, page } = await setup();
    const other = await createSection(db, nb.id, "Other");
    await createPage(db, other.id, "Vectors");
    await movePage(db, page.id, other.id, 9);
    const tree = await getNotebookTree(db, nb.id, true);
    expect(tree[1].pages.map((p) => p.slug)).toEqual(["vectors", "vectors-2"]);
  });
});
