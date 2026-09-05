// Bundles the ESM renderer modules into one browser-ready IIFE.
//
// There is no build tool here on purpose: the modules are plain ESM with
// single-line relative imports, so stripping the import/export keywords and
// concatenating in dependency order is a complete and honest bundle.
//
// The result is embedded in every page the renderer produces, which is what
// makes a generated page able to render the next one.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

// Dependency order matters; each module may only use the ones above it.
const MODULES = ["text.mjs", "md.mjs", "fresh.mjs", "layout.mjs", "svg.mjs", "detail.mjs", "page.mjs"];

const EXPORTS = [
  "buildDocument", "renderPage", "renderDocBody", "renderLibraryPage",
  "renderDiagram", "renderPreview", "renderDetail",
  "md", "mdInline", "plain", "esc", "attr", "wrap", "measure", "DENSITY",
  "freshness", "staticLine", "parseReviewEvery", "parseDay",
  "reviewCounts", "normVerification", "VERIFICATIONS", "DEFAULT_VERIFICATION",
];

function strip(source, name) {
  const out = [];
  for (const line of source.split("\n")) {
    // drop relative imports; they become lexical scope after concatenation
    if (/^\s*import\s+.*from\s+["']\.\/[^"']+["'];?\s*$/.test(line)) continue;
    if (/^\s*import\s+["']\.\/[^"']+["'];?\s*$/.test(line)) continue;
    out.push(line.replace(/^(\s*)export\s+(const|function|class|let)\s/, "$1$2 "));
  }
  return `/* ---- ${name} ---- */\n${out.join("\n")}`;
}

/** Escape any literal closing script tag so the bundle survives inlining. */
export function scriptSafe(js) {
  return js.replace(/<\/script>/gi, "<\\/script>");
}

export function makeBundle() {
  const parts = MODULES.map((m) => strip(readFileSync(resolve(SRC, m), "utf8"), m));
  const body = parts.join("\n\n");
  const api = EXPORTS.map((n) => `    ${n}: typeof ${n} === "function" || typeof ${n} === "object" ? ${n} : undefined,`).join("\n");

  return scriptSafe(`/* workflowForge runtime — WFD v1. Deterministic renderer, no dependencies. */
(function (root) {
  "use strict";

${body}

  root.WFD = {
${api}
    VERSION: 1
  };
})(typeof window !== "undefined" ? window : globalThis);
`);
}

export function readAsset(name) {
  return readFileSync(resolve(SRC, "assets", name), "utf8");
}
