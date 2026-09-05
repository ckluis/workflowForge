#!/usr/bin/env node
// Build a prompt that carries the renderer, so a model can emit the finished
// page with no builder file involved.
//
//   node src/build/self-contained.mjs -o out/workflow-prompt-standalone.md
//
// This exists because it is the obvious thing to want. Read the size it prints
// before deciding to use it: everything below PART 2 is boilerplate the model
// must transcribe byte-perfect, and one dropped character is a blank page.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeBundle, scriptSafe } from "./bundle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SRC = resolve(HERE, "..");

/** Drop whole-line comments and indentation. Never touches string interiors. */
function strip(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (inBlock) { if (t.endsWith("*/")) inBlock = false; continue; }
    if (t.startsWith("/*")) { if (!t.endsWith("*/")) inBlock = true; continue; }
    if (t.startsWith("//")) continue;
    if (!t) continue;
    out.push(t);
  }
  return out.join("\n");
}

function stripCss(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

function promptBody() {
  const raw = readFileSync(resolve(SRC, "prompt.md"), "utf8");
  const b = /^═══ BEGIN PROMPT ═══[ \t]*$/m.exec(raw);
  const e = /^═══ END PROMPT ═══[ \t]*$/m.exec(raw);
  return (b && e && e.index > b.index) ? raw.slice(b.index + b[0].length, e.index).trim() : raw;
}

/**
 * The page the model emits renders itself on load: the layout runs in the
 * browser from the embedded document, which is what keeps the model out of
 * geometry entirely. It is the same renderer, so the same document still
 * produces the same pixels.
 */
function template() {
  const css = stripCss(readFileSync(resolve(SRC, "assets/theme.css"), "utf8"));
  const app = scriptSafe(strip(readFileSync(resolve(SRC, "assets/app.js"), "utf8")));
  const runtime = strip(makeBundle());

  // Must run after the parser is done: document.write during parsing splices
  // into the stream instead of replacing the document.
  const boot = strip(`
function wfdBoot() {
  var el = document.getElementById("wfd-source");
  var out = document.getElementById("wfd-boot");
  var doc;
  try { doc = JSON.parse(el.textContent); }
  catch (e) { out.textContent = "The document is not valid JSON: " + e.message; return; }
  var build = window.WFD.buildDocument(doc);
  if (build.errors.length) {
    out.innerHTML = "<h2>This document did not validate</h2><ul>" +
      build.errors.map(function (x) {
        return "<li><code>" + x.path + "</code> — " + x.message + "</li>";
      }).join("") + "</ul>";
    return;
  }
  var html = window.WFD.renderPage(build, {
    css: document.getElementById("wfd-css").textContent,
    js: document.getElementById("wfd-app").textContent,
    runtime: document.getElementById("wfd-runtime").textContent,
    prompt: "",
    source: JSON.stringify(doc, null, 2)
  });
  document.open(); document.write(html); document.close();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wfdBoot);
} else { wfdBoot(); }
`);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workflow</title><meta name="color-scheme" content="light dark">
<style id="wfd-css">${css}</style></head>
<body><div id="wfd-boot" class="wrap" style="padding:40px">Rendering…</div>

<script type="application/json" id="wfd-source">
<<<REPLACE THIS LINE WITH YOUR WFD JSON DOCUMENT>>>
</script>

<script id="wfd-runtime">${runtime}</script>
<script id="wfd-app">${app}</script>
<script>${boot}</script>
</body></html>`;
}

function main() {
  const argv = process.argv.slice(2);
  let out = resolve(ROOT, "out", "workflow-prompt-standalone.md");
  for (let i = 0; i < argv.length; i++) if (argv[i] === "-o") out = argv[++i];

  const tpl = template();
  const md = `# Workflow diagram prompt — self-contained

Paste this whole file into Claude (or any comparable model), then describe your
process at the bottom. It returns one complete HTML file. Save it as \`.html\`
and open it. Nothing else to install, nothing else to run.

**Before you use this**, know what you are asking for. PART 2 below is about
${Math.round(tpl.length / 1000)} KB of code the model has to copy out character
for character. That is most of its answer, it takes a while, and if it drops a
single character you get a blank page with no way to tell why. The builder page
does the same job by pasting a much smaller document into a file that already
has the renderer in it. Use this one only when you truly cannot pass a file
around.

---

# PART 1 — HOW TO WRITE THE DOCUMENT

${promptBody()}

---

# PART 2 — HOW TO EMIT THE PAGE

You have written a WFD document. Now emit a complete HTML file.

Reproduce the template below **exactly**, character for character, with one
single change: replace the line

    <<<REPLACE THIS LINE WITH YOUR WFD JSON DOCUMENT>>>

with the JSON document you wrote.

Hard rules for the template:

1. Copy every other character verbatim. Do not reformat, reindent, or tidy it.
2. Never abbreviate. Do not write \`// ... unchanged\`, \`/* rest of file */\`,
   or any other placeholder. There is no part of it you may skip.
3. Do not "fix" anything in it, however wrong it looks.
4. Emit it inside a single fenced \`\`\`html block and write nothing after the
   closing fence.

If you cannot emit the whole template in one answer, say so up front and stop —
a truncated file is worse than none, because it fails silently.

\`\`\`html
${tpl}
\`\`\`

---

# YOUR INPUT

Describe your process below, or attach a flowchart, and I will return the file.
`;

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md, "utf8");

  const tok = (n) => Math.round(n / 3.6 / 1000);
  console.log(`✓ ${out}`);
  console.log(`  whole file      ${(md.length / 1024).toFixed(0)} KB   (~${tok(md.length)}K tokens to read)`);
  console.log(`  part 1, prompt  ${(promptBody().length / 1024).toFixed(0)} KB`);
  console.log(`  part 2, template ${(tpl.length / 1024).toFixed(0)} KB   (~${tok(tpl.length)}K tokens the model must WRITE OUT)`);
}

main();
