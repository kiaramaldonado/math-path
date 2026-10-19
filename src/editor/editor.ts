// The block editor used for notebook pages and posts.
import { Editor, Extension, type JSONContent, type Range } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Suggestion from "@tiptap/suggestion";
import { CALLOUT_KINDS, toEmbedUrl } from "../lib/render";
import { newDrawing } from "./drawing-modal";
import { BlockMath, Callout, Drawing, Embed, Figure, InlineMath, promptMath } from "./extensions";
import { api, h, menu, popover, toast, uploadFile } from "./ui";

export const TEXT_COLORS = ["#161616", "#5c5a56", "#1e3a5f", "#2563eb", "#0e7490", "#2f6b45", "#ca8a04", "#ea580c", "#b91c1c", "#be185d", "#7c3aed"];
export const HIGHLIGHTS = ["#fff1a8", "#d9f2d0", "#d4e8fb", "#fbdcdc", "#eadcf8", "#fde2c8", "#e4e2de"];

// ───────────────────────── Insert actions (slash menu + toolbar) ─────────────────────────

interface Action {
  title: string;
  hint: string;
  icon: string;
  keywords?: string;
  run: (editor: Editor) => void;
}

function pickImage(editor: Editor) {
  const input = h("input", { type: "file", accept: "image/*", multiple: true }) as HTMLInputElement;
  input.onchange = () => insertImages(editor, Array.from(input.files ?? []));
  input.click();
}

async function insertImages(editor: Editor, files: File[], pos?: number) {
  for (const file of files.filter((f) => f.type.startsWith("image/"))) {
    toast(`Uploading ${file.name || "image"}…`);
    try {
      const { url } = await uploadFile(file);
      const content = { type: "image", attrs: { src: url, alt: "", width: 100, caption: "" } };
      if (pos !== undefined) editor.chain().focus().insertContentAt(pos, content).run();
      else editor.chain().focus().insertContent(content).run();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
}

async function insertDrawing(editor: Editor) {
  const at = editor.state.selection.to; // after a selected block, not before it
  const attrs = await newDrawing();
  if (attrs) editor.chain().focus().insertContentAt(Math.min(at, editor.state.doc.content.size), { type: "drawing", attrs: { ...attrs, width: 100 } }).run();
}

function promptEmbed(editor: Editor) {
  const input = h("input", { type: "url", placeholder: "Paste a YouTube, Desmos or GeoGebra link" }) as HTMLInputElement;
  const error = h("p", { class: "error small", hidden: true }, "That link can't be embedded. Try YouTube, Desmos or GeoGebra.");
  const at = editor.view.coordsAtPos(editor.state.selection.from);
  const submit = () => {
    const src = toEmbedUrl(input.value);
    if (!src) return (error.hidden = false);
    close();
    editor.chain().focus().insertContent({ type: "embed", attrs: { src } }).run();
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), submit()));
  const close = popover(
    new DOMRect(at.left, at.top, 1, at.bottom - at.top),
    h("div", { class: "link-editor" }, h("div", { class: "pop-title" }, "Embed"), input, error, h("div", { class: "pop-actions" }, h("span", { style: "flex:1" }), h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: submit }, "Embed"))),
  );
  requestAnimationFrame(() => input.focus());
}

const ACTIONS: Action[] = [
  { title: "Text", hint: "Plain paragraph", icon: "¶", run: (e) => e.chain().focus().setParagraph().run() },
  { title: "Heading 1", hint: "Big section heading", icon: "H1", keywords: "title", run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { title: "Heading 2", hint: "Medium heading", icon: "H2", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { title: "Heading 3", hint: "Small heading", icon: "H3", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { title: "Inline formula", hint: "$x^2$ inside text", icon: "x²", keywords: "math latex equation", run: (e) => promptMath(e, false) },
  { title: "Block formula", hint: "Centered equation", icon: "∑", keywords: "math latex equation display", run: (e) => promptMath(e, true) },
  { title: "Drawing", hint: "Sketch with pen or mouse", icon: "✎", keywords: "draw sketch handwriting canvas pencil", run: insertDrawing },
  { title: "Image", hint: "Upload or take a photo", icon: "🖼", keywords: "photo picture upload camera", run: pickImage },
  ...CALLOUT_KINDS.map<Action>((kind) => ({
    title: kind[0].toUpperCase() + kind.slice(1),
    hint: "Callout box",
    icon: { definition: "D", theorem: "T", lemma: "L", proof: "∎", example: "E", note: "i", warning: "!" }[kind],
    keywords: "callout box",
    run: (e) => e.chain().focus().setCallout(kind).run(),
  })),
  { title: "Bullet list", hint: "• item", icon: "•", run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: "Numbered list", hint: "1. item", icon: "1.", run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: "Checklist", hint: "☐ to-do", icon: "☑", keywords: "todo task", run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: "Table", hint: "3 × 3 grid", icon: "▦", run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Quote", hint: "Quoted text", icon: "❝", run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: "Code", hint: "Code block", icon: "{}", keywords: "python program", run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: "Embed", hint: "YouTube, Desmos, GeoGebra", icon: "▶", keywords: "video graph youtube desmos geogebra", run: promptEmbed },
  { title: "Divider", hint: "Horizontal line", icon: "—", keywords: "hr rule line", run: (e) => e.chain().focus().setHorizontalRule().run() },
];

// ───────────────────────── Slash menu ─────────────────────────

const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<Action>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        pluginKey: new PluginKey("slash"),
        items: ({ query }) => {
          const q = query.toLowerCase();
          return ACTIONS.filter((a) => `${a.title} ${a.keywords ?? ""}`.toLowerCase().includes(q)).slice(0, 12);
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range as Range).run();
          props.run(editor);
        },
        render: () => {
          let el: HTMLElement;
          let items: Action[] = [];
          let index = 0;
          let pick: (a: Action) => void = () => {};
          const paint = () => {
            el.replaceChildren(
              ...(items.length
                ? items.map((a, i) =>
                    h("button", { type: "button", class: i === index ? "active" : "", onmousedown: (e: Event) => (e.preventDefault(), pick(a)) }, h("span", { class: "icon" }, a.icon), h("span", {}, a.title, h("small", {}, a.hint))),
                  )
                : [h("div", { class: "empty-row" }, "No matches")]),
            );
            el.querySelector(".active")?.scrollIntoView({ block: "nearest" });
          };
          const place = (rect: DOMRect | null) => {
            if (!rect) return;
            const top = rect.bottom + 6 + 320 > window.innerHeight ? Math.max(8, rect.top - 326) : rect.bottom + 6;
            el.style.left = `${Math.min(rect.left, window.innerWidth - 290)}px`;
            el.style.top = `${top}px`;
          };
          return {
            onStart: (props) => {
              el = h("div", { class: "mp-slash" });
              document.body.append(el);
              items = props.items;
              index = 0;
              pick = (a) => props.command(a);
              paint();
              place(props.clientRect?.() ?? null);
            },
            onUpdate: (props) => {
              items = props.items;
              index = 0;
              pick = (a) => props.command(a);
              paint();
              place(props.clientRect?.() ?? null);
            },
            onKeyDown: ({ event }) => {
              if (event.key === "ArrowDown") return ((index = (index + 1) % Math.max(1, items.length)), paint(), true);
              if (event.key === "ArrowUp") return ((index = (index - 1 + items.length) % Math.max(1, items.length)), paint(), true);
              if (event.key === "Enter" && items[index]) return (pick(items[index]), true);
              if (event.key === "Escape") return (el.remove(), true);
              return false;
            },
            onExit: () => el?.remove(),
          };
        },
      }),
    ];
  },
});

// ───────────────────────── Block handle (drag / move / delete blocks) ─────────────────────────

function topLevelBlockAt(view: EditorView, pos: number): { pos: number; dom: HTMLElement } | null {
  const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
  if ($pos.depth === 0) {
    const node = view.state.doc.nodeAt(pos);
    const dom = node && (view.nodeDOM(pos) as HTMLElement | null);
    return dom ? { pos, dom } : null;
  }
  const start = $pos.before(1);
  const dom = view.nodeDOM(start) as HTMLElement | null;
  return dom instanceof HTMLElement ? { pos: start, dom } : null;
}

function moveBlock(editor: Editor, pos: number, dir: -1 | 1) {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return;
  const $pos = state.doc.resolve(pos);
  const index = $pos.index(0);
  const sibling = dir < 0 ? state.doc.maybeChild(index - 1) : state.doc.maybeChild(index + 1);
  if (!sibling) return;
  const tr = state.tr.delete(pos, pos + node.nodeSize);
  const target = dir < 0 ? pos - sibling.nodeSize : pos + sibling.nodeSize;
  tr.insert(target, node);
  tr.setSelection(NodeSelection.create(tr.doc, target));
  view.dispatch(tr.scrollIntoView());
}

const BlockHandle = Extension.create({
  name: "blockHandle",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        view(view) {
          const wrap = view.dom.parentElement!;
          const handle = h("button", { type: "button", class: "block-handle", draggable: "true", title: "Drag to move · click for options", "aria-label": "Block options" }, "⋮⋮");
          wrap.append(handle);
          let current: { pos: number; dom: HTMLElement } | null = null;

          const show = (block: typeof current) => {
            current = block;
            if (!block) return (handle.style.display = "none");
            const wr = wrap.getBoundingClientRect();
            const br = block.dom.getBoundingClientRect();
            handle.style.display = "flex";
            handle.style.top = `${br.top - wr.top + Math.min(br.height / 2, 14) - 12}px`;
          };
          const onMove = (e: MouseEvent) => {
            const r = view.dom.getBoundingClientRect();
            const hit = view.posAtCoords({ left: r.left + 24, top: e.clientY });
            if (hit) show(topLevelBlockAt(view, hit.inside >= 0 ? hit.inside : hit.pos));
          };
          wrap.addEventListener("mousemove", onMove);

          handle.addEventListener("dragstart", (e) => {
            if (!current) return;
            const sel = NodeSelection.create(view.state.doc, current.pos);
            view.dispatch(view.state.tr.setSelection(sel));
            const slice = sel.content();
            view.dragging = { slice, move: true } as typeof view.dragging;
            e.dataTransfer?.setData("text/plain", "");
            e.dataTransfer?.setDragImage(current.dom, 0, 0);
          });
          handle.addEventListener("click", () => {
            if (!current) return;
            const pos = current.pos;
            menu(handle, [
              { label: "↑ Move up", run: () => moveBlock(editor, pos, -1) },
              { label: "↓ Move down", run: () => moveBlock(editor, pos, 1) },
              {
                label: "⧉ Duplicate",
                run: () => {
                  const node = editor.state.doc.nodeAt(pos);
                  if (node) editor.chain().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
                },
              },
              {
                label: "✕ Delete",
                run: () => {
                  const node = editor.state.doc.nodeAt(pos);
                  if (node) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
                },
              },
            ]);
          });

          return {
            // Follow the caret too, so the handle works on touch screens.
            update(v) {
              if (!v.hasFocus()) return;
              show(topLevelBlockAt(v, v.state.selection.from));
            },
            destroy() {
              wrap.removeEventListener("mousemove", onMove);
              handle.remove();
            },
          };
        },
      }),
    ];
  },
});

// ───────────────────────── Links ─────────────────────────

function editLink(editor: Editor, anchor: HTMLElement) {
  const existing = editor.getAttributes("link").href as string | undefined;
  const input = h("input", { type: "text", value: existing ?? "", placeholder: "https://…  or search your notes" }) as HTMLInputElement;
  const results = h("div", { class: "link-results" });
  const apply = (href: string, label?: string) => {
    close();
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !existing) {
      chain.insertContent({ type: "text", text: label ?? href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.extendMarkRange("link").setLink({ href }).run();
    }
  };
  let timer: number | undefined;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q || /^(https?:|mailto:|\/)/.test(q)) return results.replaceChildren();
    timer = window.setTimeout(async () => {
      const pages = await api<{ title: string; where: string; href: string }[]>(`/api/pages?q=${encodeURIComponent(q)}`).catch(() => []);
      results.replaceChildren(
        ...pages.map((p) => h("button", { type: "button", onclick: () => apply(p.href, p.title) }, p.title, h("small", {}, p.where))),
      );
    }, 200);
  });
  const submit = () => {
    let href = input.value.trim();
    if (!href) return;
    if (!/^(https?:|mailto:|\/|#)/.test(href)) href = `https://${href}`;
    apply(href);
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), submit()));
  const close = popover(
    anchor,
    h(
      "div",
      { class: "link-editor" },
      h("div", { class: "pop-title" }, "Link", h("span", { class: "hint" }, "Type to search your notes")),
      input,
      results,
      h(
        "div",
        { class: "pop-actions" },
        existing ? h("button", { type: "button", class: "btn btn-sm btn-danger", onclick: () => (close(), editor.chain().focus().extendMarkRange("link").unsetLink().run()) }, "Remove link") : null,
        h("span", { style: "flex:1" }),
        h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: submit }, "Apply"),
      ),
    ),
  );
  requestAnimationFrame(() => input.focus());
}

// ───────────────────────── Toolbar ─────────────────────────

function colorMenu(anchor: HTMLElement, colors: string[], current: string | undefined, set: (c: string) => void, reset: () => void, label: string) {
  const custom = h("input", { type: "color", value: current ?? colors[0], title: "Custom colour" }) as HTMLInputElement;
  let close = () => {};
  custom.addEventListener("change", () => (set(custom.value), close()));
  close = popover(
    anchor,
    h(
      "div",
      { class: "color-menu" },
      h("div", { class: "pop-title" }, label),
      h("div", { class: "swatches" }, ...colors.map((c) => h("button", { type: "button", class: c === current ? "active" : "", style: `--c:${c}`, title: c, onclick: () => (set(c), close()) }))),
      h("div", { class: "pop-actions" }, h("label", { class: "custom-color" }, custom, "Custom…"), h("span", { style: "flex:1" }), h("button", { type: "button", class: "btn btn-sm", onclick: () => (reset(), close()) }, "Default")),
    ),
  );
}

interface Tool {
  label: string;
  title: string;
  run: (e: Editor, btn: HTMLElement) => void;
  active?: (e: Editor) => boolean;
  class?: string;
}

const SEP = null;

function buildToolbar(editor: Editor, el: HTMLElement) {
  const tools: (Tool | null)[] = [
    {
      label: "Text ▾",
      title: "Block type",
      class: "wide",
      run: (e, b) =>
        menu(b, [
          { label: "Text", run: () => e.chain().focus().setParagraph().run(), active: e.isActive("paragraph") },
          { label: "Heading 1", run: () => e.chain().focus().setHeading({ level: 1 }).run(), active: e.isActive("heading", { level: 1 }) },
          { label: "Heading 2", run: () => e.chain().focus().setHeading({ level: 2 }).run(), active: e.isActive("heading", { level: 2 }) },
          { label: "Heading 3", run: () => e.chain().focus().setHeading({ level: 3 }).run(), active: e.isActive("heading", { level: 3 }) },
        ]),
    },
    SEP,
    { label: "B", title: "Bold (⌘B)", class: "b", run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
    { label: "I", title: "Italic (⌘I)", class: "i", run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
    { label: "U", title: "Underline (⌘U)", class: "u", run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive("underline") },
    { label: "S", title: "Strikethrough", class: "s", run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive("strike") },
    { label: "x₂", title: "Subscript", run: (e) => e.chain().focus().toggleSubscript().run(), active: (e) => e.isActive("subscript") },
    { label: "x²", title: "Superscript", run: (e) => e.chain().focus().toggleSuperscript().run(), active: (e) => e.isActive("superscript") },
    {
      label: "A",
      title: "Text colour",
      class: "color-a",
      run: (e, b) => colorMenu(b, TEXT_COLORS, e.getAttributes("textStyle").color, (c) => e.chain().focus().setColor(c).run(), () => e.chain().focus().unsetColor().run(), "Text colour"),
    },
    {
      label: "▮",
      title: "Highlight",
      class: "hl",
      run: (e, b) => colorMenu(b, HIGHLIGHTS, e.getAttributes("highlight").color, (c) => e.chain().focus().setHighlight({ color: c }).run(), () => e.chain().focus().unsetHighlight().run(), "Highlight"),
      active: (e) => e.isActive("highlight"),
    },
    { label: "🔗", title: "Link (⌘K)", run: (e, b) => editLink(e, b), active: (e) => e.isActive("link") },
    SEP,
    { label: "•", title: "Bullet list", run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
    { label: "1.", title: "Numbered list", run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
    { label: "☑", title: "Checklist", run: (e) => e.chain().focus().toggleTaskList().run(), active: (e) => e.isActive("taskList") },
    { label: "❝", title: "Quote", run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
    {
      label: "≡",
      title: "Alignment",
      run: (e, b) =>
        menu(
          b,
          (["left", "center", "right", "justify"] as const).map((a) => ({ label: a[0].toUpperCase() + a.slice(1), run: () => e.chain().focus().setTextAlign(a).run(), active: e.isActive({ textAlign: a }) })),
        ),
    },
    SEP,
    { label: "√x", title: "Inline formula ($…$)", class: "math", run: (e) => promptMath(e, false) },
    { label: "∑", title: "Block formula ($$ + space)", class: "math", run: (e) => promptMath(e, true) },
    { label: "✎", title: "Drawing", run: (e) => insertDrawing(e) },
    { label: "🖼", title: "Image", run: (e) => pickImage(e) },
    {
      label: "▤ ▾",
      title: "Callout box",
      class: "wide",
      run: (e, b) =>
        menu(b, [
          ...CALLOUT_KINDS.map((k) => ({ label: k[0].toUpperCase() + k.slice(1), run: () => e.chain().focus().setCallout(k).run(), active: e.isActive("callout", { kind: k }) })),
          ...(e.isActive("callout")
            ? [
                { label: "Set title…", run: () => calloutTitle(e, b) },
                { label: "Remove box", run: () => e.chain().focus().lift("callout").run() },
              ]
            : []),
        ]),
      active: (e) => e.isActive("callout"),
    },
    {
      label: "▦ ▾",
      title: "Table",
      class: "wide",
      run: (e, b) =>
        menu(
          b,
          e.isActive("table")
            ? [
                { label: "Add row below", run: () => e.chain().focus().addRowAfter().run() },
                { label: "Add column right", run: () => e.chain().focus().addColumnAfter().run() },
                { label: "Delete row", run: () => e.chain().focus().deleteRow().run() },
                { label: "Delete column", run: () => e.chain().focus().deleteColumn().run() },
                { label: "Toggle header row", run: () => e.chain().focus().toggleHeaderRow().run() },
                { label: "Merge / split cells", run: () => e.chain().focus().mergeOrSplit().run() },
                { label: "Delete table", run: () => e.chain().focus().deleteTable().run() },
              ]
            : [{ label: "Insert 3 × 3 table", run: () => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }],
        ),
      active: (e) => e.isActive("table"),
    },
    {
      label: "+ ▾",
      title: "More blocks",
      class: "wide",
      run: (e, b) =>
        menu(b, [
          { label: "Code block", run: () => e.chain().focus().toggleCodeBlock().run() },
          { label: "Embed (YouTube, Desmos, GeoGebra)", run: () => promptEmbed(e) },
          { label: "Divider", run: () => e.chain().focus().setHorizontalRule().run() },
          { label: "Clear formatting", run: () => e.chain().focus().unsetAllMarks().clearNodes().run() },
        ]),
    },
    SEP,
    { label: "↶", title: "Undo (⌘Z)", run: (e) => e.chain().focus().undo().run() },
    { label: "↷", title: "Redo (⇧⌘Z)", run: (e) => e.chain().focus().redo().run() },
  ];

  const buttons: [HTMLElement, Tool][] = [];
  el.replaceChildren(
    ...tools.map((t) => {
      if (!t) return h("span", { class: "tb-sep" });
      const b = h("button", { type: "button", class: `tb ${t.class ?? ""}`, title: t.title, "aria-label": t.title, onmousedown: (ev: Event) => ev.preventDefault() }, t.label);
      b.addEventListener("click", () => t.run(editor, b));
      buttons.push([b, t]);
      return b;
    }),
  );
  const sync = () => {
    for (const [b, t] of buttons) if (t.active) b.classList.toggle("active", t.active(editor));
    const colorBtn = el.querySelector<HTMLElement>(".color-a");
    colorBtn?.style.setProperty("--c", editor.getAttributes("textStyle").color ?? "currentColor");
  };
  editor.on("transaction", sync);
  sync();
}

function calloutTitle(editor: Editor, anchor: HTMLElement) {
  const input = h("input", { type: "text", value: editor.getAttributes("callout").title ?? "", placeholder: "e.g. Pythagoras" }) as HTMLInputElement;
  const save = () => (close(), editor.chain().focus().updateAttributes("callout", { title: input.value.trim() }).run());
  input.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), save()));
  const close = popover(anchor, h("div", { class: "link-editor" }, h("div", { class: "pop-title" }, "Box title"), input, h("div", { class: "pop-actions" }, h("span", { style: "flex:1" }), h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: save }, "Save"))));
  requestAnimationFrame(() => input.focus());
}

// ───────────────────────── Editor ─────────────────────────

export interface MountOptions {
  element: HTMLElement;
  toolbar: HTMLElement;
  content: JSONContent;
  placeholder?: string;
  onChange: (doc: JSONContent) => void;
}

export function mountEditor({ element, toolbar, content, placeholder, onChange }: MountOptions): Editor {
  let editor: Editor;
  editor = new Editor({
    element,
    content,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer", target: null } },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? "Start writing… type / for formulas, drawings, images and more" }),
      InlineMath,
      BlockMath,
      Callout,
      Figure,
      Drawing,
      Embed,
      SlashCommand,
      BlockHandle,
      Extension.create({
        name: "shortcuts",
        addKeyboardShortcuts: () => ({
          "Mod-k": () => (editLink(editor, toolbar), true),
          "Mod-Shift-m": () => (promptMath(editor, true), true),
          "Mod-m": () => (promptMath(editor, false), true),
        }),
      }),
    ],
    editorProps: {
      attributes: { class: "prose mp-prose", spellcheck: "true" },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length) {
          insertImages(editor, files);
          return true;
        }
        // A lone YouTube/Desmos/GeoGebra link pasted on an empty line becomes an embed.
        const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
        const src = /^https?:\/\/\S+$/.test(text) ? toEmbedUrl(text) : null;
        if (src && view.state.selection.$from.parent.content.size === 0) {
          editor.chain().focus().insertContent({ type: "embed", attrs: { src } }).run();
          return true;
        }
        return false;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertImages(editor, files, pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  buildToolbar(editor, toolbar);
  return editor;
}
