# Writing guide

How to use the admin area day to day, on a laptop, iPad or phone.

## Signing in

Go to your bookmarked secret URL, enter your password and the 6-digit code from your
authenticator app. You stay signed in on that device for 30 days after you last used it.

## Notebooks, sections and pages

```
Notebook   e.g. "Linear Algebra — Strang"
└─ Section   e.g. "Vectors", "Matrices", "Proofs"
   └─ Page     e.g. "Dot product"
```

- **Admin → Notebooks** to create a notebook. It starts with one section called "Notes".
- In the notebook, use **+** next to a section to add a page and **⋯** for section options
  (rename, publish/hide, move up/down, delete).
- Page **⋯** menu: move up/down, move to another section or notebook, delete.
  On a computer you can also drag pages in the sidebar.
- The **⚙** button next to the notebook name: title, subject, description, colour, URL and
  whether the notebook is published.
- On a phone, the **☰** button opens the page list.

## Draft or published

Everything starts as a **draft**: only you can see it. A notebook page appears on the public
site only when the **page, its section and its notebook** are all published. Use the
Draft / Published button above the editor. While signed in, the public site shows your drafts
with a yellow "Draft" badge and an "Edit" link.

## The editor

Pages and posts save automatically 5 seconds after you stop typing ("Saved" appears at the top), and
immediately when you open another page, switch tabs or apps, or close the browser.
If the connection drops, your changes are kept on the device and you're offered to restore them.

### Inserting things

Type **/** anywhere to open the block menu, then type to filter. Or use the toolbar.

| You want | Do this |
| --- | --- |
| Heading | `# ` / `## ` / `### ` at the start of a line, or **Text ▾** |
| Bold, italic, underline | `⌘B`, `⌘I`, `⌘U` (Ctrl on Windows) |
| Text colour / highlight | **A** and **▮** buttons: palette or any custom colour |
| Bullet / numbered / checklist | `- `, `1. `, `[ ] ` or the toolbar |
| Link | `⌘K`, or paste a URL over selected text. Type in the link box to **search your own pages** |
| Inline formula | type `$x^2$` (it converts when you type the closing `$`), or `⌘M` |
| Block formula | `$$` then space on an empty line, or `⌘⇧M`, or **∑** |
| Drawing | **✎** or `/drawing` |
| Image | **🖼**, paste, or drag & drop. On a phone it can open the camera |
| Definition / Theorem / Proof / Example / Note box | `/definition` etc., or **▤ ▾** |
| Table | `/table` or **▦ ▾** (the same menu adds/removes rows and columns) |
| YouTube / Desmos / GeoGebra | paste the link on an empty line, or `/embed` |
| Code | `/code` or three backticks |

Pasting text that contains `$…$` turns those parts into formulas.

### Formulas

Click any formula to edit it. The editor shows a live preview and a palette of symbols
(fractions, integrals, matrices, Greek letters, sets and logic). Formulas use
[KaTeX](https://katex.org/docs/supported.html), which supports almost all common LaTeX.

### Drawings

The drawing canvas is full screen:

- Tools: pen **P**, highlighter **H**, line **L**, arrow **A**, rectangle **R**, ellipse **O**, eraser **E**.
- 12 colours plus a custom colour picker, 4 thicknesses.
- Background: blank, grid, graph paper or dots. **+ Space** makes the page taller.
- Undo/redo with `⌘Z` / `⇧⌘Z`.
- **iPad / stylus**: pen pressure changes the line width. Once you've drawn with the pencil,
  your finger scrolls instead of drawing (palm rejection).

Click a drawing in a page to change its width or caption, or to edit it again.

### Moving blocks

Hover a block to see the **⋮⋮** handle on its left: drag it to move the block, or click it for
Move up / Move down / Duplicate / Delete. On touch screens the handle follows the cursor.

## Blog, projects, certificates and roadmap

- **Blog** and **Projects** use the same editor. Fill in the summary and tags, choose a cover
  image, add links (projects), tick **Published** and press **Save details**.
- **Certificates**: title, issuer, date, verification link and the PDF or image of the certificate.
- **Roadmap**: courses, books, topics and milestones with a status (planned / in progress / done).
  Items "in progress" appear on the home page under "Currently studying".
