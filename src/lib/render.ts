// Turns the editor's Tiptap JSON into HTML on the server (no DOM needed).
// Every node/mark the editor can produce must be handled here, otherwise it
// silently disappears from the public site. Unknown nodes render their children.
import katex from "katex";
import { visibleSpaces } from "./latex";

export interface JMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface JNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JNode[];
  text?: string;
  marks?: JMark[];
}

export const CALLOUT_KINDS = ["definition", "theorem", "lemma", "proof", "example", "note", "warning"] as const;

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s), mailto and site-relative links survive. */
export function safeUrl(raw: unknown): string | null {
  const url = String(raw ?? "").trim();
  if (!url) return null;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (url.startsWith("#")) return url;
  return null;
}

export function safeColor(raw: unknown): string | null {
  const c = String(raw ?? "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(c)) return c;
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/i.test(c)) return c;
  return null;
}

const EMBED_HOSTS = [
  /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]+(\?[\w=&-]*)?$/,
  /^https:\/\/www\.desmos\.com\/calculator\/\w+\?embed$/,
  /^https:\/\/www\.geogebra\.org\/material\/iframe\/id\/\w+(\/[\w/]*)?$/,
];

/** Converts a pasted YouTube/Desmos/GeoGebra URL into its embeddable form, or null. */
export function toEmbedUrl(input: string): string | null {
  const url = input.trim();
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = url.match(/desmos\.com\/calculator\/(\w+)/);
  if (m) return `https://www.desmos.com/calculator/${m[1]}?embed`;
  m = url.match(/geogebra\.org\/(?:m|classic|calculator|graphing|geometry|3d|material\/iframe\/id)\/(\w+)/);
  if (m) return `https://www.geogebra.org/material/iframe/id/${m[1]}`;
  return null;
}

export function safeEmbed(raw: unknown): string | null {
  const url = String(raw ?? "");
  return EMBED_HOSTS.some((re) => re.test(url)) ? url : null;
}

export function renderMath(latex: string, displayMode: boolean): string {
  return katex.renderToString(visibleSpaces(latex) || "\\square", {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    output: "htmlAndMathml",
  });
}

function percent(raw: unknown, fallback = 100): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.round(n) : fallback;
}

function alignStyle(attrs: Record<string, unknown> | undefined): string {
  const a = attrs?.textAlign;
  return a === "center" || a === "right" || a === "justify" ? ` style="text-align:${a}"` : "";
}

function renderMarks(text: string, marks: JMark[] = []): string {
  let html = esc(text);
  for (const mark of marks) {
    const a = mark.attrs ?? {};
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "underline":
        html = `<u>${html}</u>`;
        break;
      case "strike":
        html = `<s>${html}</s>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "subscript":
        html = `<sub>${html}</sub>`;
        break;
      case "superscript":
        html = `<sup>${html}</sup>`;
        break;
      case "textStyle": {
        const color = safeColor(a.color);
        if (color) html = `<span style="color:${color}">${html}</span>`;
        break;
      }
      case "highlight": {
        const color = safeColor(a.color);
        html = color ? `<mark style="background-color:${color}">${html}</mark>` : `<mark>${html}</mark>`;
        break;
      }
      case "link": {
        const href = safeUrl(a.href);
        if (!href) break;
        const external = /^https?:/i.test(href);
        html = `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${html}</a>`;
        break;
      }
    }
  }
  return html;
}

function children(node: JNode): string {
  return (node.content ?? []).map(renderNode).join("");
}

function figcaption(caption: unknown): string {
  const c = String(caption ?? "").trim();
  return c ? `<figcaption>${esc(c)}</figcaption>` : "";
}

export function renderNode(node: JNode): string {
  const a = node.attrs ?? {};
  switch (node.type) {
    case "doc":
      return children(node);
    case "text":
      return renderMarks(node.text ?? "", node.marks);
    case "paragraph":
      return `<p${alignStyle(a)}>${children(node) || "<br>"}</p>`;
    case "heading": {
      // Page titles are the h1, so content headings start at h2.
      const level = Math.min(Math.max(Number(a.level) || 2, 1), 4) + 1;
      return `<h${level}${alignStyle(a)}>${children(node)}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote>${children(node)}</blockquote>`;
    case "bulletList":
      return `<ul>${children(node)}</ul>`;
    case "orderedList": {
      const start = Number(a.start) > 1 ? ` start="${Number(a.start)}"` : "";
      return `<ol${start}>${children(node)}</ol>`;
    }
    case "listItem":
      return `<li>${children(node)}</li>`;
    case "taskList":
      return `<ul class="task-list">${children(node)}</ul>`;
    case "taskItem":
      return `<li class="task-item${a.checked ? " done" : ""}"><input type="checkbox" disabled${a.checked ? " checked" : ""}><div>${children(node)}</div></li>`;
    case "codeBlock": {
      const lang = String(a.language ?? "").replace(/[^\w-]/g, "");
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${esc(text)}</code></pre>`;
    }
    case "horizontalRule":
      return "<hr>";
    case "hardBreak":
      return "<br>";
    case "table":
      return `<div class="table-wrap"><table><tbody>${children(node)}</tbody></table></div>`;
    case "tableRow":
      return `<tr>${children(node)}</tr>`;
    case "tableHeader":
    case "tableCell": {
      const tag = node.type === "tableHeader" ? "th" : "td";
      const span =
        (Number(a.colspan) > 1 ? ` colspan="${Number(a.colspan)}"` : "") +
        (Number(a.rowspan) > 1 ? ` rowspan="${Number(a.rowspan)}"` : "");
      return `<${tag}${span}>${children(node)}</${tag}>`;
    }
    case "inlineMath":
      return `<span class="math-inline">${renderMath(String(a.latex ?? ""), false)}</span>`;
    case "blockMath":
      return `<div class="math-block">${renderMath(String(a.latex ?? ""), true)}</div>`;
    case "callout": {
      const kind = CALLOUT_KINDS.includes(a.kind as never) ? String(a.kind) : "note";
      const title = String(a.title ?? "").trim();
      const label = kind[0].toUpperCase() + kind.slice(1);
      return `<aside class="callout callout-${kind}"><div class="callout-title">${esc(label)}${title ? ` <span>(${esc(title)})</span>` : ""}</div>${children(node)}</aside>`;
    }
    case "image": {
      const src = safeUrl(a.src);
      if (!src) return "";
      return `<figure class="figure" style="max-width:${percent(a.width)}%"><img src="${esc(src)}" alt="${esc(a.alt)}" loading="lazy">${figcaption(a.caption)}</figure>`;
    }
    case "drawing": {
      const id = String(a.id ?? "");
      if (!/^[a-z0-9-]{8,64}$/.test(id)) return "";
      return `<figure class="figure drawing" style="max-width:${percent(a.width)}%"><img src="/files/drawings/${id}.svg?v=${Number(a.v) || 0}" alt="${esc(a.caption || "Drawing")}" loading="lazy">${figcaption(a.caption)}</figure>`;
    }
    case "embed": {
      const src = safeEmbed(a.src);
      if (!src) return "";
      return `<figure class="embed"><iframe src="${esc(src)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="Embedded content"></iframe>${figcaption(a.caption)}</figure>`;
    }
    default:
      return children(node);
  }
}

export function parseDoc(json: string | JNode | null | undefined): JNode {
  if (!json) return { type: "doc", content: [] };
  if (typeof json !== "string") return json;
  try {
    const doc = JSON.parse(json);
    return doc && typeof doc === "object" && doc.type === "doc" ? doc : { type: "doc", content: [] };
  } catch {
    return { type: "doc", content: [] };
  }
}

export function renderDoc(json: string | JNode | null | undefined): string {
  return renderNode(parseDoc(json));
}

/** Plain text of a document (for excerpts, RSS, meta descriptions). */
export function docText(json: string | JNode | null | undefined, max = 240): string {
  const out: string[] = [];
  const walk = (n: JNode) => {
    if (n.type === "text") out.push(n.text ?? "");
    else if (n.type === "inlineMath" || n.type === "blockMath") out.push(String(n.attrs?.latex ?? ""));
    n.content?.forEach(walk);
    if (["paragraph", "heading", "listItem", "blockMath"].includes(n.type)) out.push(" ");
  };
  walk(parseDoc(json));
  const text = out.join("").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

