import type { JSONContent } from "@tiptap/core";
import { mountEditor } from "./editor";
import { api, toast, uploadFile } from "./ui";

interface Data {
  id: number;
  content: JSONContent;
  cover: string | null;
}

/** Blog post / project editor: details form + the same block editor as notebooks. */
export function initPostEditor(root: HTMLElement, data: Data) {
  const form = root.querySelector<HTMLFormElement>("#post-meta")!;
  const saveLabel = root.querySelector<HTMLElement>(".ws-save")!;
  const url = `/api/posts/${data.id}`;
  let pending: JSONContent | null = null;
  let timer: number | undefined;

  const setSave = (text: string, error = false) => {
    saveLabel.textContent = text;
    saveLabel.dataset.state = error ? "error" : "";
  };

  const flush = async () => {
    clearTimeout(timer);
    if (!pending) return;
    const content = pending;
    pending = null;
    setSave("Saving…");
    try {
      await api(url, "PATCH", { content });
      if (!pending) setSave("Saved");
    } catch {
      pending ??= content;
      setSave("Not saved — retrying", true);
      timer = window.setTimeout(flush, 5000);
    }
  };

  mountEditor({
    element: root.querySelector(".ws-editor")!,
    toolbar: root.querySelector(".ws-toolbar")!,
    content: data.content,
    onChange: (doc) => {
      pending = doc;
      setSave("Unsaved");
      clearTimeout(timer);
      timer = window.setTimeout(flush, 1200);
    },
  });
  window.addEventListener("beforeunload", (e) => pending && (flush(), e.preventDefault()));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const labels = f.getAll("link_label").map(String);
    const urls = f.getAll("link_url").map(String);
    await flush(); // the page reloads after saving details
    try {
      await api(url, "PATCH", {
        title: f.get("title"),
        summary: f.get("summary"),
        tags: f.get("tags"),
        slug: f.get("slug"),
        status: f.get("published") ? "published" : "draft",
        ...(labels.length ? { links: labels.map((label, i) => ({ label, url: urls[i] })) } : {}),
      });
      toast("Saved");
      location.reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  });

  root.querySelector<HTMLInputElement>(".cover-input")?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await flush();
    try {
      const { key } = await uploadFile(file);
      await api(url, "PATCH", { cover_key: key });
      location.reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  });
  root.querySelector(".cover-remove")?.addEventListener("click", async () => {
    await flush();
    await api(url, "PATCH", { cover_key: null });
    location.reload();
  });
  root.querySelector(".post-delete")?.addEventListener("click", async () => {
    if (!confirm("Delete this permanently? This can't be undone.")) return;
    await api(url, "DELETE");
    history.back();
  });
}
