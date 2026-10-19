import { h, popover } from "./ui";

interface FigureAttrs {
  width?: number;
  caption?: string;
  alt?: string;
}

/** Width / caption / alt settings for an image or drawing. `done(null)` deletes it. */
export function figureSettings(anchor: HTMLElement, attrs: FigureAttrs, opts: { alt: boolean; extra?: HTMLElement }, done: (a: FigureAttrs | null) => void) {
  const state: FigureAttrs = { width: attrs.width ?? 100, caption: attrs.caption ?? "", alt: attrs.alt ?? "" };
  const widths = h("div", { class: "toggle" });
  const paintWidths = () =>
    widths.replaceChildren(
      ...[25, 50, 75, 100].map((w) =>
        h("button", { type: "button", "aria-pressed": String(state.width === w), onclick: () => ((state.width = w), paintWidths(), done({ ...state })) }, `${w}%`),
      ),
    );
  paintWidths();
  const caption = h("input", { type: "text", value: state.caption, placeholder: "Caption (optional)" }) as HTMLInputElement;
  const alt = h("input", { type: "text", value: state.alt, placeholder: "Describe the image (for screen readers)" }) as HTMLInputElement;
  let deleted = false;
  const box = h(
    "div",
    { class: "figure-editor" },
    opts.extra ?? null,
    h("div", { class: "field" }, h("span", { class: "label" }, "Width"), widths),
    h("div", { class: "field" }, h("span", { class: "label" }, "Caption"), caption),
    opts.alt ? h("div", { class: "field" }, h("span", { class: "label" }, "Alt text"), alt) : null,
    h(
      "div",
      { class: "pop-actions" },
      h("button", { type: "button", class: "btn btn-sm btn-danger", onclick: () => ((deleted = true), close()) }, "Delete"),
      h("span", { style: "flex:1" }),
      h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => close() }, "Done"),
    ),
  );
  const close = popover(anchor, box, () => {
    if (deleted) return done(null);
    state.caption = caption.value.trim();
    state.alt = alt.value.trim();
    done({ ...state });
  });
}

export function editFigure(anchor: HTMLElement, attrs: FigureAttrs, done: (a: FigureAttrs | null) => void) {
  figureSettings(anchor, attrs, { alt: true }, done);
}
