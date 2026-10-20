// LaTeX ignores spaces in maths, so "x y" would show as "xy". Here a plain space between two
// words/numbers is made visible ("\ "). The stored LaTeX is never changed — this only runs
// before KaTeX draws it. Spaces that LaTeX needs stay untouched: after a command (\alpha b),
// next to operators (a + b) and inside \begin{…}{…} arguments (\begin{array}{c c}).
const WORD = /[A-Za-z0-9)\]]/;
const NEXT = /[A-Za-z0-9(]/;

export function visibleSpaces(latex: string): string {
  let out = "";
  let i = 0;
  // After a control word (\alpha) the next space is a separator, not a visible space.
  let afterCommand = false;
  while (i < latex.length) {
    const c = latex[i];
    if (c === "\\") {
      const m = /^\\(?:[A-Za-z]+|.)?/s.exec(latex.slice(i))![0];
      out += m;
      i += m.length;
      afterCommand = /^\\[A-Za-z]/.test(m);
      if (/^\\(?:text[a-z]*|mbox)$/.test(m) && latex[i] === "{") {
        // Text mode already shows spaces: copy the whole {…} group as is.
        let depth = 0;
        let j = i;
        for (; j < latex.length; j++) {
          if (latex[j] === "\\") j++;
          else if (latex[j] === "{") depth++;
          else if (latex[j] === "}" && --depth === 0) break;
        }
        out += latex.slice(i, j + 1);
        i = j + 1;
        afterCommand = false;
      } else if (m === "\\begin" || m === "\\end") {
        // Copy the environment name and any argument groups right after it verbatim.
        while (latex[i] === "{" || (m === "\\begin" && latex[i] === "[")) {
          const close = latex[i] === "{" ? "}" : "]";
          const end = latex.indexOf(close, i);
          if (end < 0) break;
          out += latex.slice(i, end + 1);
          i = end + 1;
        }
      }
      continue;
    }
    if (c === " ") {
      let j = i;
      while (latex[j] === " ") j++;
      const run = latex.slice(i, j);
      const prev = latex[i - 1] ?? "";
      out += !afterCommand && WORD.test(prev) && NEXT.test(latex[j] ?? "") ? "\\ ".repeat(run.length) : run;
      i = j;
      afterCommand = false;
      continue;
    }
    out += c;
    i++;
    afterCommand = false;
  }
  return out;
}
