// Minimal deterministic Markdown -> HTML. Server-side only; output is static.
// Supports: fenced code, ATX headings, hr, blockquote, ul/ol, tables, paragraphs,
// and inline code / strong / em / links / hard breaks.

const SENTINEL = ""; // private-use area, never appears in real content

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function attr(s) { return esc(s); }

function inline(src) {
  let s = esc(src);
  const code = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => SENTINEL + (code.push(`<code>${c}</code>`) - 1) + SENTINEL);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, t, h) => `<a href="${h}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  s = s.replace(/ {2}\n/g, "<br>");
  s = s.replace(new RegExp(SENTINEL + "(\\d+)" + SENTINEL, "g"), (_, i) => code[+i]);
  return s;
}

export function md(src) {
  if (src == null || src === "") return "";
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const isRule = (l) => /^(\s{0,3})([-*_])(\s*\2){2,}\s*$/.test(l);
  const isFence = (l) => /^\s*```/.test(l);
  const isHeading = (l) => /^#{1,6}\s/.test(l);
  const isQuote = (l) => /^\s*>/.test(l);
  const isItem = (l) => /^(\s*)([-*+]|\d+[.)])\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (isFence(line)) {
      const lang = line.replace(/^\s*```/, "").trim();
      const buf = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="md-code"${lang ? ` data-lang="${attr(lang)}"` : ""}><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if (isRule(line)) { out.push("<hr>"); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const n = Math.min(6, h[1].length + 2);
      out.push(`<h${n}>${inline(h[2])}</h${n}>`);
      i++;
      continue;
    }

    if (isQuote(line)) {
      const buf = [];
      while (i < lines.length && isQuote(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${md(buf.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      out.push(
        `<table class="md-table"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
        `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      );
      continue;
    }

    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const tag = ordered ? "ol" : "ul";
      const baseIndent = li[1].length;
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m || m[1].length > baseIndent + 1) break;
        const buf = [m[3]];
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !isItem(lines[i])) buf.push(lines[i++].trim());
        const nested = [];
        while (i < lines.length) {
          const n = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (n && n[1].length > baseIndent + 1) nested.push(lines[i++].trim());
          else break;
        }
        items.push(inline(buf.join(" ")) + (nested.length ? md(nested.join("\n")) : ""));
      }
      out.push(`<${tag}>${items.map((t) => `<li>${t}</li>`).join("")}</${tag}>`);
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() && !isRule(lines[i]) && !isFence(lines[i]) &&
           !isHeading(lines[i]) && !isQuote(lines[i]) && !isItem(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join("\n"))}</p>`);
  }
  return out.join("\n");
}

/** Inline-only render, for short strings that must not become block elements. */
export function mdInline(src) { return src == null ? "" : inline(String(src)); }

/** Strip markdown to plain text (for titles, tooltips, meta tags). */
export function plain(src) {
  return String(src == null ? "" : src)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
