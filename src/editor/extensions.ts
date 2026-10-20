// Custom Tiptap nodes. Their names and attributes must match what src/lib/render.ts understands.
import { type Editor, InputRule, mergeAttributes, Node, PasteRule } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import katex from "katex";
import { visibleSpaces } from "../lib/latex";
import { CALLOUT_KINDS } from "../lib/render";
import { editMath } from "./math-popover";
import { editDrawing } from "./drawing-modal";
import { editFigure } from "./figure-popover";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      insertMath: (opts: { latex: string; display: boolean }) => ReturnType;
    };
    callout: {
      setCallout: (kind: string) => ReturnType;
    };
  }
}

function renderKatex(el: HTMLElement, latex: string, display: boolean) {
  try {
    katex.render(visibleSpaces(latex) || "\\square", el, { displayMode: display, throwOnError: false, strict: "ignore" });
  } catch {
    el.textContent = latex;
  }
}

function mathNode(name: "inlineMath" | "blockMath", display: boolean) {
  return Node.create({
    name,
    group: display ? "block" : "inline",
    inline: !display,
    atom: true,
    selectable: true,
    draggable: display,
    addAttributes() {
      return { latex: { default: "" } };
    },
    parseHTML() {
      return [{ tag: `${display ? "div" : "span"}[data-type="${name}"]`, getAttrs: (el) => ({ latex: (el as HTMLElement).dataset.latex ?? "" }) }];
    },
    renderHTML({ node }) {
      return [display ? "div" : "span", { "data-type": name, "data-latex": node.attrs.latex }];
    },
    renderText({ node }) {
      return display ? `$$${node.attrs.latex}$$` : `$${node.attrs.latex}$`;
    },
    addNodeView() {
      return ({ node, editor, getPos }) => {
        const dom = document.createElement(display ? "div" : "span");
        dom.className = display ? "math-block math-node" : "math-inline math-node";
        dom.contentEditable = "false";
        let current = node;
        renderKatex(dom, node.attrs.latex, display);
        const open = () => {
          if (!editor.isEditable) return;
          editMath(dom, current.attrs.latex, display, (latex) => {
            const pos = typeof getPos === "function" ? getPos() : undefined;
            if (pos === undefined) return;
            if (latex === null) editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
            else editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { latex }), true)).run();
          });
        };
        dom.addEventListener("click", open);
        return {
          dom,
          update(updated) {
            if (updated.type.name !== name) return false;
            current = updated;
            renderKatex(dom, updated.attrs.latex, display);
            return true;
          },
          ignoreMutation: () => true,
          stopEvent: () => false,
        };
      };
    },
    addInputRules() {
      if (display) {
        // "$$ " at the start of an empty line → block formula, editor opens.
        return [
          new InputRule({
            find: /^\$\$\s$/,
            handler: ({ range, chain }) => {
              chain().deleteRange(range).run();
              requestAnimationFrame(() => promptMath(this.editor, true));
            },
          }),
        ];
      }
      // $x^2$ → inline formula (needs a non-space right after the first $ and before the last).
      return [
        new InputRule({
          find: /(?:^|[^$\\])\$([^\s$](?:[^$]*[^\s$])?)\$$/,
          handler: ({ state, range, match }) => {
            const start = range.from + (match[0].startsWith("$") ? 0 : 1);
            state.tr.replaceWith(start, range.to, this.type.create({ latex: match[1] }));
          },
        }),
      ];
    },
    addPasteRules() {
      // Pasting notes written elsewhere: "$x^2$" becomes a formula, "$$…$$" too (inline-sized).
      if (display) return [];
      return [
        new PasteRule({
          find: /\$\$?([^\s$](?:[^$]*?[^\s$])?)\$\$?/g,
          handler: ({ state, range, match }) => {
            state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1] }));
          },
        }),
      ];
    },
  });
}

export const InlineMath = mathNode("inlineMath", false).extend({
  addCommands() {
    return {
      insertMath:
        ({ latex, display }) =>
        ({ commands }) =>
          commands.insertContent({ type: display ? "blockMath" : "inlineMath", attrs: { latex } }),
    };
  },
});

/** Opens the formula editor at the caret and inserts the result. */
export function promptMath(editor: Editor, display: boolean, initial = "") {
  const at = editor.view.coordsAtPos(editor.state.selection.from);
  const rect = new DOMRect(at.left, at.top, 1, at.bottom - at.top);
  editMath(rect, initial, display, (latex) => {
    if (latex) editor.chain().focus().insertMath({ latex, display }).run();
    else editor.commands.focus();
  });
}

export const BlockMath = mathNode("blockMath", true);

const calloutLabel = (kind: string, title: string) => kind[0].toUpperCase() + kind.slice(1) + (title ? ` (${title})` : "");

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { kind: { default: "note" }, title: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "aside[data-callout]", getAttrs: (el) => ({ kind: (el as HTMLElement).dataset.callout, title: (el as HTMLElement).dataset.title ?? "" }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const kind = CALLOUT_KINDS.includes(node.attrs.kind) ? node.attrs.kind : "note";
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-callout": kind,
        "data-title": node.attrs.title,
        "data-label": calloutLabel(kind, node.attrs.title),
        class: `callout callout-${kind}`,
      }),
      0,
    ];
  },
  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ editor, commands }) => {
          if (editor.isActive("callout")) return commands.updateAttributes("callout", { kind });
          return commands.wrapIn(this.name, { kind });
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      // Backspace at the very start of an empty callout removes the box.
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        const depth = $from.depth - 1;
        if (depth < 1 || $from.node(depth).type.name !== "callout" || $from.index(depth) !== 0) return false;
        return editor.commands.lift("callout");
      },
    };
  },
});

/** Images with a display width (%) and caption, uploaded to R2. */
export const Figure = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: 100 },
      caption: { default: "" },
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("figure");
      dom.className = "figure";
      dom.contentEditable = "false";
      const img = document.createElement("img");
      const cap = document.createElement("figcaption");
      dom.append(img, cap);
      let current = node;
      const paint = () => {
        img.src = current.attrs.src;
        img.alt = current.attrs.alt ?? "";
        dom.style.maxWidth = `${current.attrs.width || 100}%`;
        cap.textContent = current.attrs.caption ?? "";
        cap.hidden = !current.attrs.caption;
      };
      paint();
      dom.addEventListener("click", () => {
        if (!editor.isEditable) return;
        editFigure(dom, current.attrs, (attrs) => {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos === undefined) return;
          if (attrs === null) editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
          else editor.chain().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }), true)).run();
        });
      });
      return {
        dom,
        update(updated) {
          if (updated.type.name !== "image") return false;
          current = updated;
          paint();
          return true;
        },
      };
    };
  },
}).configure({ inline: false, allowBase64: false });

/** Drawings: the canvas strokes live in R2; the node only stores id + version. */
export const Drawing = Node.create({
  name: "drawing",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null }, v: { default: 0 }, width: { default: 100 }, caption: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-drawing]", getAttrs: (el) => ({ id: (el as HTMLElement).dataset.drawing }) }];
  },
  renderHTML({ node }) {
    return ["figure", { "data-drawing": node.attrs.id }];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("figure");
      dom.className = "figure drawing";
      dom.contentEditable = "false";
      const img = document.createElement("img");
      img.alt = "Drawing";
      const cap = document.createElement("figcaption");
      const hint = document.createElement("div");
      hint.className = "node-hint";
      hint.textContent = "Click to edit drawing";
      dom.append(img, cap, hint);
      let current = node;
      const paint = () => {
        img.src = `/files/drawings/${current.attrs.id}.svg?v=${current.attrs.v}`;
        dom.style.maxWidth = `${current.attrs.width || 100}%`;
        cap.textContent = current.attrs.caption ?? "";
        cap.hidden = !current.attrs.caption;
      };
      paint();
      dom.addEventListener("click", () => {
        if (!editor.isEditable) return;
        editDrawing(dom, current.attrs as { id: string; width?: number; caption?: string }, (attrs) => {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos === undefined) return;
          if (attrs === null) editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
          else editor.chain().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }), true)).run();
        });
      });
      return {
        dom,
        update(updated) {
          if (updated.type.name !== "drawing") return false;
          current = updated;
          paint();
          return true;
        },
      };
    };
  },
});

/** YouTube / Desmos / GeoGebra iframes. `src` is already the embeddable URL. */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: "" }, caption: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-embed]", getAttrs: (el) => ({ src: (el as HTMLElement).dataset.embed }) }];
  },
  renderHTML({ node }) {
    return ["figure", { "data-embed": node.attrs.src, class: "embed" }, ["iframe", { src: node.attrs.src, loading: "lazy" }]];
  },
});
