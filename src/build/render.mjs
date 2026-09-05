#!/usr/bin/env node
// workflowForge — render a WFD document to a self-contained HTML page.
//
//   node src/build/render.mjs src/examples/agent-pipeline.wfd.json -o out/page.html
//   node src/build/render.mjs doc.json --check      # validate only
//   node src/build/render.mjs a.json b.json -o out.html

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocument } from "../layout.mjs";
import { renderPage } from "../page.mjs";
import { makeBundle, scriptSafe } from "./bundle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SRC = resolve(HERE, "..");

const C = process.stdout.isTTY
  ? { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" }
  : { r: "", y: "", g: "", d: "", b: "", x: "" };

function parseArgs(argv) {
  const inputs = [];
  const opts = { out: null, check: false, quiet: false, prompt: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") opts.out = argv[++i];
    else if (a === "--check") opts.check = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--prompt") opts.prompt = argv[++i];
    else if (a === "-h" || a === "--help") opts.help = true;
    else inputs.push(a);
  }
  return { inputs, opts };
}

function readJson(path) {
  let raw;
  try { raw = readFileSync(path, "utf8"); }
  catch (e) { throw new Error(`cannot read ${path}: ${e.message}`); }
  try { return JSON.parse(raw); }
  catch (e) {
    const m = /position (\d+)/.exec(e.message);
    let where = "";
    if (m) {
      const pos = +m[1];
      const line = raw.slice(0, pos).split("\n").length;
      where = ` (line ${line})`;
    }
    throw new Error(`${path} is not valid JSON${where}: ${e.message}`);
  }
}

function mergeDocs(docs, names) {
  if (docs.length === 1) return docs[0];
  const base = { ...docs[0], workflows: [] };
  for (const d of docs) base.workflows.push(...(d.workflows || []));
  base.title = docs[0].title || "Workflows";
  return base;
}

function main() {
  const { inputs, opts } = parseArgs(process.argv.slice(2));

  if (opts.help || !inputs.length) {
    console.log(`workflowForge — WFD v1 renderer

  node src/build/render.mjs <input.wfd.json> [more.json ...] [options]

  -o, --out <file>   write HTML here (default out/<input>.html)
      --check        validate only, emit no HTML
      --prompt <f>   embed this file as the footer's generator prompt
      --quiet        suppress warnings
`);
    process.exit(inputs.length ? 0 : 1);
  }

  const docs = inputs.map(readJson);
  const doc = mergeDocs(docs, inputs);

  const build = buildDocument(doc);

  if (build.warnings.length && !opts.quiet) {
    for (const w of build.warnings) {
      console.warn(`${C.y}warn${C.x} ${C.d}${w.path}${C.x}  ${w.message}`);
    }
    console.warn(`${C.d}${build.warnings.length} warning(s)${C.x}\n`);
  }

  if (build.errors.length) {
    for (const e of build.errors) {
      console.error(`${C.r}error${C.x} ${C.d}${e.path}${C.x}\n  ${e.message}` +
        (e.hint ? `\n  ${C.d}hint: ${e.hint}${C.x}` : ""));
    }
    console.error(`\n${C.r}${build.errors.length} error(s) — no output written${C.x}`);
    process.exit(1);
  }

  const nSteps = build.workflows.reduce((n, w) => n + w.nodes.filter((x) => x.kind === "step").length, 0);
  const noDetail = build.workflows.reduce(
    (n, w) => n + w.nodes.filter((x) => x.kind === "step" && !x.detail).length, 0);

  if (opts.check) {
    console.log(`${C.g}ok${C.x} ${build.workflows.length} workflow(s), ${nSteps} steps, ` +
      `${build.warnings.length} warning(s)`);
    process.exit(0);
  }

  // The prompt file wraps the prompt in instructions for a human reading the
  // repo. What the page hands over must be the prompt and nothing else — asking
  // someone to find two marker lines and copy between them is a chore, and a
  // chore is the thing this button exists to remove.
  let prompt = "";
  const promptPath = opts.prompt || resolve(SRC, "prompt.md");
  try {
    const raw = readFileSync(promptPath, "utf8");
    // Whole-line markers only: the same text appears inside the instructions
    // above them, quoted in backticks.
    const b = /^═══ BEGIN PROMPT ═══[ \t]*$/m.exec(raw);
    const e = /^═══ END PROMPT ═══[ \t]*$/m.exec(raw);
    prompt = (b && e && e.index > b.index)
      ? raw.slice(b.index + b[0].length, e.index).trim()
      : raw;
  } catch {
    prompt = "src/prompt.md was not found at render time.";
  }

  const css = readFileSync(resolve(SRC, "assets/theme.css"), "utf8");
  const js = scriptSafe(readFileSync(resolve(SRC, "assets/app.js"), "utf8"));
  const runtime = makeBundle();

  let starter = "{}";
  try { starter = readFileSync(resolve(SRC, "examples/starter.wfd.json"), "utf8").trim(); }
  catch { /* the page simply offers no example */ }

  const html = renderPage(build, {
    prompt, css, js, runtime, starter,
    source: JSON.stringify(doc, null, 2),
  });

  const out = opts.out || resolve(ROOT, "out", basename(inputs[0]).replace(/\.wfd\.json$|\.json$/, "") + ".html");
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), html, "utf8");

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`${C.g}✓${C.x} ${C.b}${out}${C.x} ${C.d}${kb} KB · ${build.workflows.length} diagram(s) · ${nSteps} steps` +
    (noDetail ? ` · ${noDetail} without detail` : "") + `${C.x}`);
}

try {
  main();
} catch (e) {
  console.error(`${C.r}error${C.x} ${e.message}`);
  process.exit(1);
}
