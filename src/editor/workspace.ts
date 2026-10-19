// Notebook workspace: section/page tree on the left, editor on the right.
import type { Editor, JSONContent } from "@tiptap/core";
import type { Notebook, Page, SectionWithPages } from "../lib/types";
import { mountEditor } from "./editor";
import { api, h, menu, popover, toast } from "./ui";

interface State {
  notebook: Notebook;
  sections: SectionWithPages[];
  pageId: number | null;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const backupKey = (id: number) => `mp-unsaved-page-${id}`;

export function initWorkspace(root: HTMLElement, initial: State) {
  const state = initial;
  const tree = root.querySelector<HTMLElement>(".ws-tree-body")!;
  const titleInput = root.querySelector<HTMLInputElement>(".ws-title")!;
  const statusBtn = root.querySelector<HTMLButtonElement>(".ws-status")!;
  const saveLabel = root.querySelector<HTMLElement>(".ws-save")!;
  const viewLink = root.querySelector<HTMLAnchorElement>(".ws-view")!;
  const toolbar = root.querySelector<HTMLElement>(".ws-toolbar")!;
  const editorHost = root.querySelector<HTMLElement>(".ws-editor")!;
  const empty = root.querySelector<HTMLElement>(".ws-empty")!;
  const pageArea = root.querySelector<HTMLElement>(".ws-page")!;

  let editor: Editor | null = null;
  let page: Page | null = null;
  let saveState: SaveState = "idle";
  let saveTimer: number | undefined;
  let pending: JSONContent | null = null;

  // ───────── Saving ─────────

  const setSave = (s: SaveState, msg?: string) => {
    saveState = s;
    saveLabel.dataset.state = s;
    saveLabel.textContent = msg ?? { idle: "", dirty: "Unsaved", saving: "Saving…", saved: "Saved", error: "Not saved — retrying" }[s];
  };

  const flush = async () => {
    clearTimeout(saveTimer);
    if (!page || !pending) return;
    const id = page.id;
    const content = pending;
    pending = null;
    setSave("saving");
    try {
      const res = await api<{ updated_at: string }>(`/api/pages/${id}`, "PATCH", { content });
      if (page?.id === id) page.updated_at = res.updated_at;
      if (!pending) {
        localStorage.removeItem(backupKey(id));
        setSave("saved");
      }
    } catch {
      pending ??= content;
      setSave("error");
      saveTimer = window.setTimeout(flush, 5000);
    }
  };

  const onChange = (doc: JSONContent) => {
    if (!page) return;
    pending = doc;
    setSave("dirty");
    try {
      localStorage.setItem(backupKey(page.id), JSON.stringify({ doc, at: Date.now() }));
    } catch {
      /* storage full or blocked: the server save still runs */
    }
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 1200);
  };

  window.addEventListener("beforeunload", (e) => {
    if (pending || saveState === "saving") {
      flush();
      e.preventDefault();
    }
  });
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());

  // ───────── Pages ─────────

  const findPage = (id: number) => {
    for (const s of state.sections) {
      const p = s.pages.find((x) => x.id === id);
      if (p) return { section: s, page: p };
    }
    return null;
  };

  const publicHref = (pageId: number) => {
    const hit = findPage(pageId);
    return hit ? `/notebooks/${state.notebook.slug}/${hit.section.slug}/${hit.page.slug}` : "#";
  };

  const syncPageBar = () => {
    if (!page) return;
    statusBtn.textContent = page.status === "published" ? "Published" : "Draft";
    statusBtn.dataset.status = page.status;
    viewLink.href = publicHref(page.id);
  };

  async function openPage(id: number | null) {
    await flush();
    editor?.destroy();
    editor = null;
    page = null;
    state.pageId = id;
    const url = new URL(location.href);
    if (id) url.searchParams.set("page", String(id));
    else url.searchParams.delete("page");
    history.replaceState(null, "", url);
    renderTree();
    root.classList.remove("tree-open");

    if (!id) {
      pageArea.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    pageArea.hidden = false;
    editorHost.replaceChildren(h("p", { class: "muted" }, "Loading…"));
    try {
      page = await api<Page>(`/api/pages/${id}`);
    } catch {
      toast("Couldn't load that page", "error");
      return;
    }
    let content: JSONContent = JSON.parse(page.content_json);
    // Unsaved edits from a previous visit (e.g. connection dropped)?
    const backup = localStorage.getItem(backupKey(id));
    if (backup) {
      const { doc, at } = JSON.parse(backup) as { doc: JSONContent; at: number };
      if (at > Date.parse(page.updated_at.replace(" ", "T") + "Z") && confirm("This page has changes that weren't saved last time. Restore them?")) {
        content = doc;
        pending = doc;
      } else localStorage.removeItem(backupKey(id));
    }
    titleInput.value = page.title;
    syncPageBar();
    editorHost.replaceChildren();
    editor = mountEditor({ element: editorHost, toolbar, content, onChange });
    setSave(pending ? "dirty" : "idle");
    if (pending) saveTimer = window.setTimeout(flush, 500);
    if (page.title === "Untitled") {
      titleInput.focus();
      titleInput.select();
    }
  }

  let titleTimer: number | undefined;
  titleInput.addEventListener("input", () => {
    clearTimeout(titleTimer);
    titleTimer = window.setTimeout(saveTitle, 800);
  });
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      editor?.commands.focus("start");
    }
  });
  titleInput.addEventListener("blur", () => saveTitle());
  async function saveTitle() {
    clearTimeout(titleTimer);
    const title = titleInput.value.trim();
    if (!page || !title || title === page.title) return;
    const res = await api<{ title: string; slug: string }>(`/api/pages/${page.id}`, "PATCH", { title });
    page.title = res.title;
    const hit = findPage(page.id);
    if (hit) Object.assign(hit.page, { title: res.title, slug: res.slug });
    renderTree();
    syncPageBar();
  }

  statusBtn.addEventListener("click", async () => {
    if (!page) return;
    const status = page.status === "published" ? "draft" : "published";
    await api(`/api/pages/${page.id}`, "PATCH", { status });
    page.status = status;
    const hit = findPage(page.id);
    if (hit) hit.page.status = status;
    syncPageBar();
    renderTree();
    toast(status === "published" ? "Page is public (if its section and notebook are too)" : "Page is now a draft");
  });

  // ───────── Tree ─────────

  const reload = async () => {
    const data = await api<{ notebook: Notebook; sections: SectionWithPages[] }>(`/api/notebooks/${state.notebook.id}`);
    state.notebook = data.notebook;
    state.sections = data.sections;
    renderTree();
    syncPageBar();
  };

  async function addPage(sectionId: number) {
    const p = await api<Page>("/api/pages", "POST", { sectionId, title: "Untitled" });
    await reload();
    openPage(p.id);
  }

  async function addSection() {
    const title = prompt("Section name", "New section");
    if (!title?.trim()) return;
    await api("/api/sections", "POST", { notebookId: state.notebook.id, title: title.trim() });
    await reload();
  }

  function sectionMenu(btn: HTMLElement, s: SectionWithPages, index: number) {
    menu(btn, [
      { label: "+ New page", run: () => addPage(s.id) },
      {
        label: "Rename…",
        run: async () => {
          const title = prompt("Section name", s.title);
          if (title?.trim()) (await api(`/api/sections/${s.id}`, "PATCH", { title: title.trim() }), reload());
        },
      },
      {
        label: s.status === "published" ? "Hide section (draft)" : "Publish section",
        run: async () => (await api(`/api/sections/${s.id}`, "PATCH", { status: s.status === "published" ? "draft" : "published" }), reload()),
      },
      ...(index > 0 ? [{ label: "↑ Move up", run: async () => (await api(`/api/sections/${s.id}`, "PATCH", { position: index - 1 }), reload()) }] : []),
      ...(index < state.sections.length - 1 ? [{ label: "↓ Move down", run: async () => (await api(`/api/sections/${s.id}`, "PATCH", { position: index + 1 }), reload()) }] : []),
      {
        label: "Delete section…",
        run: async () => {
          if (!confirm(`Delete "${s.title}" and its ${s.pages.length} page(s)? This can't be undone.`)) return;
          await api(`/api/sections/${s.id}`, "DELETE");
          if (s.pages.some((p) => p.id === state.pageId)) await openPage(null);
          reload();
        },
      },
    ]);
  }

  function pageMenu(btn: HTMLElement, s: SectionWithPages, index: number) {
    const p = s.pages[index];
    const move = (sectionId: number, position: number) => api(`/api/pages/${p.id}`, "PATCH", { sectionId, position }).then(reload);
    menu(btn, [
      ...(index > 0 ? [{ label: "↑ Move up", run: () => move(s.id, index - 1) }] : []),
      ...(index < s.pages.length - 1 ? [{ label: "↓ Move down", run: () => move(s.id, index + 1) }] : []),
      ...state.sections.filter((o) => o.id !== s.id).map((o) => ({ label: `→ Move to “${o.title}”`, run: () => move(o.id, 1e6) })),
      { label: "→ Move to another notebook…", run: () => moveToNotebook(p.id) },
      {
        label: "Delete page…",
        run: async () => {
          if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
          await api(`/api/pages/${p.id}`, "DELETE");
          if (state.pageId === p.id) await openPage(null);
          reload();
        },
      },
    ]);
  }

  async function moveToNotebook(pageId: number) {
    const notebooks = await api<Notebook[]>("/api/notebooks");
    const others = notebooks.filter((n) => n.id !== state.notebook.id);
    if (!others.length) return toast("You only have one notebook");
    const anchor = tree;
    const list = h(
      "div",
      { class: "mp-menu" },
      h("div", { class: "pop-title" }, "Move to notebook"),
      ...others.map((n) =>
        h(
          "button",
          {
            type: "button",
            onclick: async () => {
              close();
              const data = await api<{ sections: SectionWithPages[] }>(`/api/notebooks/${n.id}`);
              const target = data.sections[0];
              if (!target) return toast("That notebook has no sections yet", "error");
              await api(`/api/pages/${pageId}`, "PATCH", { sectionId: target.id, position: 1e6 });
              if (state.pageId === pageId) await openPage(null);
              await reload();
              toast(`Moved to ${n.title} › ${target.title}`);
            },
          },
          n.title,
        ),
      ),
    );
    const close = popover(anchor, list);
  }

  // Drag & drop pages (desktop). Phones use the ⋯ menu.
  let dragged: number | null = null;
  function dropTarget(el: HTMLElement, sectionId: number, position: () => number) {
    el.addEventListener("dragover", (e) => {
      if (dragged === null) return;
      e.preventDefault();
      el.classList.add("drop");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("drop");
      if (dragged === null) return;
      const id = dragged;
      dragged = null;
      await api(`/api/pages/${id}`, "PATCH", { sectionId, position: position() });
      reload();
    });
  }

  function renderTree() {
    tree.replaceChildren(
      ...state.sections.map((s, si) => {
        const head = h(
          "div",
          { class: `ws-section-head${s.status === "draft" ? " is-draft" : ""}` },
          h("span", { class: "ws-section-title" }, s.title),
          s.status === "draft" ? h("span", { class: "badge badge-draft" }, "Hidden") : null,
          h("button", { type: "button", class: "ws-icon", title: "New page", "aria-label": `New page in ${s.title}`, onclick: () => addPage(s.id) }, "+"),
          h("button", { type: "button", class: "ws-icon", title: "Section options", "aria-label": `Options for ${s.title}`, onclick: (e: Event) => sectionMenu(e.currentTarget as HTMLElement, s, si) }, "⋯"),
        );
        dropTarget(head, s.id, () => 0);
        const items = s.pages.map((p, pi) => {
          const row = h(
            "div",
            { class: `ws-page-row${p.id === state.pageId ? " active" : ""}`, draggable: "true" },
            h("button", { type: "button", class: "ws-page-link", onclick: () => openPage(p.id) }, h("i", { class: `dot ${p.status}`, title: p.status === "draft" ? "Draft" : "Published" }), p.title),
            h("button", { type: "button", class: "ws-icon", title: "Page options", "aria-label": `Options for ${p.title}`, onclick: (e: Event) => pageMenu(e.currentTarget as HTMLElement, s, pi) }, "⋯"),
          );
          row.addEventListener("dragstart", (e) => {
            dragged = p.id;
            e.dataTransfer?.setData("text/plain", String(p.id));
          });
          row.addEventListener("dragend", () => (dragged = null));
          dropTarget(row, s.id, () => pi);
          return row;
        });
        const empty = s.pages.length ? null : h("button", { type: "button", class: "ws-add-page", onclick: () => addPage(s.id) }, "+ Add a page");
        return h("div", { class: "ws-section" }, head, ...items, empty);
      }),
      h("button", { type: "button", class: "btn btn-sm ws-add-section", onclick: addSection }, "+ New section"),
    );
  }

  // ───────── Notebook settings ─────────

  root.querySelector<HTMLElement>(".ws-settings")!.addEventListener("click", (e) => {
    const nb = state.notebook;
    const field = (label: string, input: HTMLElement) => h("div", { class: "field" }, h("label", {}, label), input);
    const title = h("input", { type: "text", value: nb.title }) as HTMLInputElement;
    const subject = h("input", { type: "text", value: nb.subject, placeholder: "e.g. Linear Algebra" }) as HTMLInputElement;
    const description = h("textarea", { rows: 3 }) as HTMLTextAreaElement;
    description.value = nb.description;
    const color = h("input", { type: "color", value: nb.color }) as HTMLInputElement;
    const slug = h("input", { type: "text", value: nb.slug }) as HTMLInputElement;
    const published = h("input", { type: "checkbox", checked: nb.status === "published" }) as HTMLInputElement;
    const save = async () => {
      await api(`/api/notebooks/${nb.id}`, "PATCH", {
        title: title.value,
        subject: subject.value,
        description: description.value,
        color: color.value,
        slug: slug.value,
        status: published.checked ? "published" : "draft",
      });
      close();
      await reload();
      root.querySelector(".ws-nb-title")!.textContent = state.notebook.title;
      toast("Notebook saved");
    };
    const remove = async () => {
      if (!confirm(`Delete the notebook "${nb.title}" with all its sections and pages? This can't be undone.`)) return;
      if (prompt(`Type the notebook name to confirm`) !== nb.title) return toast("Name didn't match — nothing deleted");
      await api(`/api/notebooks/${nb.id}`, "DELETE");
      location.href = `${document.body.dataset.adminBase}/notebooks`;
    };
    const close = popover(
      e.currentTarget as HTMLElement,
      h(
        "div",
        { class: "nb-settings" },
        h("div", { class: "pop-title" }, "Notebook settings"),
        field("Title", title),
        field("Subject", subject),
        field("Description", description),
        h("div", { class: "row" }, field("Colour", color), field("URL name", slug)),
        h("label", { class: "check" }, published, " Published (visible to everyone)"),
        h(
          "div",
          { class: "pop-actions" },
          h("button", { type: "button", class: "btn btn-sm btn-danger", onclick: remove }, "Delete notebook"),
          h("span", { style: "flex:1" }),
          h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: save }, "Save"),
        ),
      ),
    );
  });

  root.querySelector(".ws-tree-toggle")?.addEventListener("click", () => root.classList.toggle("tree-open"));

  renderTree();
  openPage(state.pageId && findPage(state.pageId) ? state.pageId : (state.sections.find((s) => s.pages.length)?.pages[0]?.id ?? null));
}
