import { describe, expect, it } from "vitest";
import { cleanDrawing, toSvg } from "../src/lib/drawing";
import { docText, type JMark, type JNode, renderDoc, toEmbedUrl } from "../src/lib/render";

const doc = (...content: JNode[]): JNode => ({ type: "doc", content });
const p = (...content: JNode[]): JNode => ({ type: "paragraph", content });
const text = (t: string, marks?: JMark[]): JNode => ({ type: "text", text: t, marks });

describe("renderDoc", () => {
  it("renders text with marks, colours and safe links", () => {
    const html = renderDoc(
      doc(
        p(
          text("bold", [{ type: "bold" }]),
          text(" red", [{ type: "textStyle", attrs: { color: "#b91c1c" } }]),
          text(" link", [{ type: "link", attrs: { href: "https://example.com" } }]),
          text(" bad", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
        ),
      ),
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<span style="color:#b91c1c"> red</span>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer"> link</a>');
    expect(html).not.toContain("javascript:");
  });

  it("escapes text and drops unsafe colours", () => {
    const html = renderDoc(doc(p(text("<script>x</script>", [{ type: "textStyle", attrs: { color: "red;background:url(x)" } }]))));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("url(");
  });

  it("renders inline and block formulas with KaTeX", () => {
    const html = renderDoc(doc(p(text("area "), { type: "inlineMath", attrs: { latex: "\\pi r^2" } }), { type: "blockMath", attrs: { latex: "\\int_0^1 x\\,dx" } }));
    expect(html).toContain('class="math-inline"');
    expect(html).toContain('class="math-block"');
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
  });

  it("does not throw on broken LaTeX", () => {
    expect(() => renderDoc(doc({ type: "blockMath", attrs: { latex: "\\frac{1" } }))).not.toThrow();
  });

  it("renders drawings, images, callouts and embeds", () => {
    const html = renderDoc(
      doc(
        { type: "drawing", attrs: { id: "2cf44a2d-79e4-4640-887a-2ba28c5a380a", v: 5, width: 50, caption: "Unit circle" } },
        { type: "image", attrs: { src: "/files/u/x.png", alt: "photo", width: 75 } },
        { type: "image", attrs: { src: "javascript:alert(1)" } },
        { type: "callout", attrs: { kind: "theorem", title: "Pythagoras" }, content: [p(text("a² + b² = c²"))] },
        { type: "embed", attrs: { src: "https://www.youtube-nocookie.com/embed/abc123" } },
        { type: "embed", attrs: { src: "https://evil.example/embed" } },
      ),
    );
    expect(html).toContain('src="/files/drawings/2cf44a2d-79e4-4640-887a-2ba28c5a380a.svg?v=5"');
    expect(html).toContain("max-width:50%");
    expect(html).toContain("<figcaption>Unit circle</figcaption>");
    expect(html).toContain('src="/files/u/x.png"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain('class="callout callout-theorem"');
    expect(html).toContain("Theorem <span>(Pythagoras)</span>");
    expect(html).toContain("youtube-nocookie.com/embed/abc123");
    expect(html).not.toContain("evil.example");
  });

  it("shifts headings down one level (the page title is the h1)", () => {
    expect(renderDoc(doc({ type: "heading", attrs: { level: 1 }, content: [text("Intro")] }))).toBe("<h2>Intro</h2>");
  });

  it("survives invalid JSON", () => {
    expect(renderDoc("{not json")).toBe("");
  });
});

describe("helpers", () => {
  it("extracts plain text", () => {
    expect(docText(doc(p(text("Hello")), p(text("world"))))).toBe("Hello world");
  });
  it("turns links into embeddable URLs", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(toEmbedUrl("https://www.desmos.com/calculator/abcd1234")).toBe("https://www.desmos.com/calculator/abcd1234?embed");
    expect(toEmbedUrl("https://example.com")).toBeNull();
  });
});

describe("drawings", () => {
  it("cleans untrusted data and builds SVG on the server", () => {
    const data = cleanDrawing({
      width: 1000,
      height: 600,
      background: "grid",
      strokes: [
        { tool: "pen", color: "#ff0000", size: 4, points: [[10, 10, 0.5], [20, 30, 0.6], [40, 35, 0.7]] },
        { tool: "rect", color: "#000000", size: 2, points: [[100, 100], [200, 150]] },
        { tool: "pen", color: "red\"/><script>", size: 4, points: [[1, 1]] },
        { tool: "laser", color: "#000000", size: 2, points: [[1, 1]] },
      ],
    });
    expect(data?.strokes).toHaveLength(2);
    const svg = toSvg(data!);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain("<rect x=\"100\" y=\"100\" width=\"100\" height=\"50\"");
    expect(svg).not.toContain("<script");
  });
  it("rejects absurd sizes", () => {
    expect(cleanDrawing({ width: 10, height: 10, strokes: [] })).toBeNull();
  });
});
