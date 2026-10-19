import katex from "katex";
import { h, popover } from "./ui";

// Snippets: "{}" marks where the cursor lands.
const GROUPS: [string, [string, string][]][] = [
  ["Structure", [
    ["a/b", "\\frac{}{}"], ["√", "\\sqrt{}"], ["ⁿ√", "\\sqrt[]{}"], ["xⁿ", "^{}"], ["xᵢ", "_{}"],
    ["( )", "\\left( {} \\right)"], ["|x|", "\\left| {} \\right|"], ["vec", "\\vec{}"], ["x̂", "\\hat{}"], ["x̄", "\\overline{}"],
  ]],
  // LaTeX ignores spaces and treats { } as invisible grouping, so offer the explicit forms.
  ["Spacing & text", [
    ["space", "\\ "], ["wide", "\\quad "], ["wider", "\\qquad "], ["thin", "\\, "],
    ["text", "\\text{}"], ["{ }", "\\{ {} \\}"], ["⟨ ⟩", "\\langle {} \\rangle"], ["new line", " \\\\ "],
  ]],
  ["Calculus", [
    ["∑", "\\sum_{i=1}^{n} "], ["∏", "\\prod_{i=1}^{n} "], ["∫", "\\int_{a}^{b} {} \\, dx"], ["∮", "\\oint "], ["lim", "\\lim_{x \\to {}} "],
    ["d/dx", "\\frac{d}{dx} "], ["∂", "\\partial "], ["∇", "\\nabla "], ["∞", "\\infty "], ["→", "\\to "],
  ]],
  ["Matrices", [
    ["(2×2)", "\\begin{pmatrix} {} & b \\\\ c & d \\end{pmatrix}"],
    ["[3×3]", "\\begin{bmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{bmatrix}"],
    ["|det|", "\\begin{vmatrix} {} & b \\\\ c & d \\end{vmatrix}"],
    ["cases", "\\begin{cases} {} & \\text{if } x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}"],
    ["align", "\\begin{aligned} {} &= b \\\\ &= c \\end{aligned}"],
  ]],
  ["Greek", "α:alpha β:beta γ:gamma δ:delta ε:varepsilon θ:theta λ:lambda μ:mu π:pi ρ:rho σ:sigma τ:tau φ:varphi ω:omega Γ:Gamma Δ:Delta Θ:Theta Λ:Lambda Σ:Sigma Φ:Phi Ω:Omega"
    .split(" ").map((p) => { const [g, n] = p.split(":"); return [g, `\\${n} `] as [string, string]; })],
  ["Sets & logic", [
    ["∈", "\\in "], ["∉", "\\notin "], ["⊂", "\\subset "], ["⊆", "\\subseteq "], ["∪", "\\cup "], ["∩", "\\cap "], ["∅", "\\emptyset "],
    ["ℝ", "\\mathbb{R} "], ["ℕ", "\\mathbb{N} "], ["ℤ", "\\mathbb{Z} "], ["ℚ", "\\mathbb{Q} "], ["ℂ", "\\mathbb{C} "],
    ["∀", "\\forall "], ["∃", "\\exists "], ["⇒", "\\implies "], ["⇔", "\\iff "], ["¬", "\\neg "], ["∧", "\\land "], ["∨", "\\lor "],
  ]],
  ["Relations", [
    ["≤", "\\leq "], ["≥", "\\geq "], ["≠", "\\neq "], ["≈", "\\approx "], ["≡", "\\equiv "], ["∼", "\\sim "], ["∝", "\\propto "],
    ["·", "\\cdot "], ["×", "\\times "], ["÷", "\\div "], ["±", "\\pm "], ["∘", "\\circ "], ["…", "\\dots "],
  ]],
];

/**
 * Formula editor: LaTeX textarea, live preview and a symbol palette.
 * `done(null)` means "delete", `done("")` with no previous value means "cancelled".
 */
export function editMath(anchor: HTMLElement | DOMRect, latex: string, display: boolean, done: (latex: string | null) => void) {
  const input = h("textarea", { class: "math-input", spellcheck: "false", autocapitalize: "off", rows: display ? 4 : 2, placeholder: "e.g. \\frac{a}{b} + x^2" }) as HTMLTextAreaElement;
  input.value = latex;
  const preview = h("div", { class: "math-preview" });
  const hint = h(
    "p",
    { class: "math-hint" },
    "Spaces and { } don't show in formulas. Use ",
    h("code", {}, "\\ "),
    " or ",
    h("code", {}, "\\quad"),
    " for space, ",
    h("code", {}, "\\text{…}"),
    " for words and ",
    h("code", {}, "\\{ \\}"),
    " for braces — or the Spacing & text tab.",
  );
  const paint = () => {
    try {
      katex.render(input.value || "\\square", preview, { displayMode: true, throwOnError: true, strict: "ignore" });
      preview.classList.remove("invalid");
    } catch (e) {
      preview.textContent = (e as Error).message.replace("KaTeX parse error: ", "");
      preview.classList.add("invalid");
    }
  };
  input.addEventListener("input", paint);

  const insert = (snippet: string) => {
    const { selectionStart: s, selectionEnd: e, value } = input;
    const selected = value.slice(s, e);
    const marker = snippet.indexOf("{}");
    const text = marker >= 0 ? snippet.replace("{}", `{${selected}}`) : snippet;
    input.setRangeText(text, s, e, "end");
    if (marker >= 0) {
      const caret = s + marker + 1 + selected.length;
      input.setSelectionRange(caret, caret);
    }
    input.focus();
    paint();
  };

  let tab = 0;
  const palette = h("div", { class: "math-palette" });
  const tabs = h("div", { class: "math-tabs" });
  const renderPalette = () => {
    tabs.replaceChildren(...GROUPS.map(([name], i) => h("button", { type: "button", class: i === tab ? "active" : "", onmousedown: (e: Event) => e.preventDefault(), onclick: () => ((tab = i), renderPalette(), input.focus()) }, name)));
    palette.replaceChildren(...GROUPS[tab][1].map(([label, snip]) => h("button", { type: "button", title: snip.trim(), onclick: () => insert(snip) }, label)));
  };
  renderPalette();

  let result: string | null | undefined;
  const finish = (value: string | null) => {
    result = value;
    close();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (!display && !e.shiftKey))) {
      e.preventDefault();
      finish(input.value.trim());
    }
  });

  const box = h(
    "div",
    { class: "math-editor" },
    h("div", { class: "pop-title" }, display ? "Block formula" : "Inline formula", h("span", { class: "hint" }, display ? "⌘/Ctrl + Enter to finish" : "Enter to finish")),
    input,
    preview,
    hint,
    tabs,
    palette,
    h(
      "div",
      { class: "pop-actions" },
      latex ? h("button", { type: "button", class: "btn btn-sm btn-danger", onclick: () => finish(null) }, "Delete") : null,
      h("span", { style: "flex:1" }),
      h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => finish(input.value.trim()) }, "Done"),
    ),
  );
  const close = popover(anchor, box, () => {
    if (result === undefined) result = input.value.trim(); // clicking away keeps edits
    if (result === null) done(null);
    else if (result !== latex) done(result || (latex ? null : ""));
    else if (!latex) done("");
  });
  paint();
  requestAnimationFrame(() => input.focus());
}
