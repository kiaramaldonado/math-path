// Tiny DOM helpers for popovers and menus (no framework).

type Attrs = Record<string, string | boolean | number | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, "").toLowerCase(), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let openPopover: { el: HTMLElement; close: () => void } | null = null;

export function closePopover() {
  openPopover?.close();
}

/**
 * Shows `content` next to `anchor` (an element or a rect). On phones it becomes a bottom sheet.
 * Returns a close function. Clicking outside or pressing Escape closes it.
 */
export function popover(anchor: HTMLElement | DOMRect, content: HTMLElement, onClose?: () => void): () => void {
  closePopover();
  const el = h("div", { class: "mp-popover", role: "dialog" }, content);
  document.body.append(el);

  const place = () => {
    if (window.innerWidth < 600) {
      el.classList.add("sheet");
      return;
    }
    const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 8);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  place();

  const onDown = (e: Event) => {
    if (!el.contains(e.target as Node) && !(anchor instanceof HTMLElement && anchor.contains(e.target as Node))) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  const close = () => {
    if (!el.isConnected) return;
    el.remove();
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    if (openPopover?.el === el) openPopover = null;
    onClose?.();
  };
  setTimeout(() => document.addEventListener("pointerdown", onDown, true));
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  openPopover = { el, close };
  return close;
}

/** A dropdown of buttons under `anchor`. */
export function menu(anchor: HTMLElement, items: { label: string | Node; run: () => void; active?: boolean; hint?: string }[]) {
  let close = () => {};
  const list = h(
    "div",
    { class: "mp-menu" },
    ...items.map((it) =>
      h(
        "button",
        {
          type: "button",
          class: it.active ? "active" : "",
          onclick: () => {
            close();
            it.run();
          },
        },
        it.label,
        it.hint ? h("span", { class: "hint" }, it.hint) : null,
      ),
    ),
  );
  close = popover(anchor, list);
}

export function toast(message: string, kind: "info" | "error" = "info") {
  const el = h("div", { class: `mp-toast ${kind}`, role: "status" }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

export async function api<T = unknown>(path: string, method = "GET", data?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: data instanceof FormData || data === undefined ? {} : { "Content-Type": "application/json" },
    body: data instanceof FormData ? data : data === undefined ? undefined : JSON.stringify(data),
    credentials: "same-origin",
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out as { error?: string }).error ?? `Request failed (${res.status})`);
  return out as T;
}

export async function uploadFile(file: File): Promise<{ key: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  return api("/api/uploads", "POST", form);
}
