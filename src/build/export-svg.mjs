#!/usr/bin/env node
// Export each workflow as a standalone .svg — no page, no stylesheet, no script.
//
//   node src/build/export-svg.mjs src/examples/agent-pipeline.wfd.json -o out/svg
//
// The diagram rules and the theme variables are lifted straight out of
// src/assets/theme.css so an exported file cannot drift from the rendered page.
// Both light and dark palettes are embedded, so the file follows the viewer.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocument, densityCss } from "../layout.mjs";
import { renderDiagram } from "../svg.mjs";
import { plain, esc } from "../md.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SRC = resolve(HERE, "..");

/** Contents of the first `{ … }` that follows `from`, brace-matched. */
function blockAfter(css, from) {
  const open = css.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

function extractStyles() {
  const css = readFileSync(resolve(SRC, "assets/theme.css"), "utf8");

  const light = blockAfter(css, css.indexOf(":root {")).trim();

  const darkAt = css.indexOf('@media (prefers-color-scheme: dark) {');
  const darkOuter = blockAfter(css, darkAt);
  const dark = blockAfter(darkOuter, darkOuter.indexOf(":root")).trim();

  const begin = css.indexOf("/* ----------------------------------------------------- diagram styles */");
  const end = css.indexOf("/* --------------------------------------------------------------- legend */");
  if (begin < 0 || end < 0) throw new Error("could not find the diagram style block in theme.css");
  const rules = css.slice(begin, end).trim();

  // The page scopes these to `svg`; standalone they are the root element.
  const scoped = rules.replace(/\bsvg\.is-lit\b/g, "svg.is-lit")
                      .replace(/\bsvg\.dim-secondary\b/g, "svg.dim-secondary")
                      .replace(/\bsvg\.is-walking\b/g, "svg.is-walking");

  return { light, dark, rules: scoped };
}

export function exportSvg(wfv, styles) {
  const { svg, width, height } = renderDiagram(wfv);
  const title = plain(wfv.title);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"
     width="${width}" height="${height}" role="img" aria-labelledby="t">
<title id="t">${esc(title)} — DRAKON-style workflow diagram</title>
<style>
svg { ${styles.light} }
@media (prefers-color-scheme: dark) { svg { ${styles.dark} } }
${styles.rules}
${densityCss(wfv.D)}
</style>
<rect class="sheet" x="0" y="0" width="${width}" height="${height}" fill="var(--paper-2)"/>
${svg}
</svg>
`;
}

function main() {
  const argv = process.argv.slice(2);
  const inputs = [];
  let out = resolve(ROOT, "out", "svg");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-o" || argv[i] === "--out") out = argv[++i];
    else inputs.push(argv[i]);
  }
  if (!inputs.length) {
    console.log("node src/export-svg.mjs <doc.wfd.json> [more.json ...] [-o dir]");
    process.exit(1);
  }

  const styles = extractStyles();
  mkdirSync(resolve(out), { recursive: true });

  for (const file of inputs) {
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const build = buildDocument(doc);
    if (build.errors.length) {
      for (const e of build.errors) console.error(`error ${e.path}: ${e.message}`);
      process.exit(1);
    }
    const stem = basename(file).replace(/\.wfd\.json$|\.json$/, "");
    for (const wfv of build.workflows) {
      const name = `${stem}-${wfv.number}-${wfv.id}.svg`;
      const path = join(resolve(out), name);
      writeFileSync(path, exportSvg(wfv, styles), "utf8");
      const kb = (Buffer.byteLength(readFileSync(path)) / 1024).toFixed(0);
      console.log(`  ${name}  ${wfv.width}×${wfv.height}  ${kb} KB`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
