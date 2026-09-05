#!/usr/bin/env node
// Build the one file: every example in it, an index of previews, and the
// builder that makes the next one.
//
//   node src/build/library.mjs -o index.html
//
// The index is rendered at build time so the first screen needs no script. The
// example pages are not — they render on demand from the documents carried in
// the file, which is the difference between one download and four.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocument } from "../layout.mjs";
import { renderLibraryPage, libraryStats } from "../page.mjs";
import { renderPreview } from "../svg.mjs";
import { makeBundle, scriptSafe } from "./bundle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SRC = resolve(HERE, "..");

// Order is the running order on the index.
const LIBRARY = [
  "workflow-builder",
  "naturalization",
  "agent-pipeline",
  "checkout-ux",
  "starter",
];

// The hero.
//
// D6 settled the positioning: this is a portfolio piece and a personal tool,
// not a product. So no puffery, no social proof, no product voice — and the
// harder rule that follows from D3: every claim here must be one the page can
// demonstrate on itself, within a click or two.
//
// REWRITTEN (2026-09-04). The old hero led with the confidence model — "Diagrams
// that say what nobody has checked" — and four paragraphs of prose before
// anything you could look at. A UX run across five personas found the cost:
// nothing on the landing page was a diagram (the first legible one was ~8
// interactions and five screens away), the CTA was cut through its own label by
// the fold at 1280x800, and — worst — the page described a model round-trip
// WITHOUT SAYING THE READER PERFORMS IT, so an evaluator who stopped at the
// landing left believing this page transmits their process to someone.
//
// The lead is now the mechanism, because the mechanism is the honest pitch:
// this is a rendering engine. You bring the workflow; the page draws it and
// never reads it. The confidence model has not been dropped — it moved to the
// feature cards, where it is a property of the format rather than the headline.
// Leading with a thesis asked the reader to care before they knew what it was.
const SITE = {
  eyebrow: "workflowForge",
  title: "Paste a workflow. Get a page you can send.",
  subtitle: "A rendering engine for workflow diagrams. You write the workflow with your own model — this page draws it, mechanically, without ever reading what is in it.",
};

// The three steps, rendered as a strip directly under the hero so the whole
// mechanism is visible above the fold. Step 2 is deliberately the one that
// names the model: the run found that leaving it implicit is what made a
// careful reader assume this page does the sending.
const STEPS = [
  {
    n: "1",
    title: "Copy the prompt",
    body: "It is inside this file, along with the renderer. Nothing is fetched to give it to you.",
  },
  {
    n: "2",
    title: "Paste it into your own model",
    body: "With a description of your process. Claude, ChatGPT, whichever you already use — you run this step, not this page. It hands back a workflow file.",
  },
  {
    n: "3",
    title: "Paste the result back here",
    body: "The renderer turns it into one self-contained HTML page you can send to anyone. Or download the renderer and run it yourself.",
  },
];

// The one disclosure the run says this page owes its reader, stated where the
// mechanism is explained rather than buried in a footer. Both halves are true
// and they point opposite ways, so they are said together: the PAGE sends
// nothing; the WORKFLOW you run in step 2 hands your process to a vendor.
const DISCLOSURE =
  "Step 2 happens in your model, not here — your process text goes to whichever provider you use, " +
  "on their terms. This page itself sends nothing: it is one file, it makes no network requests after " +
  "it loads, and there is no account, no server and nothing to install.";

function siteDescription(s) {
  return (
    `Five worked examples below, each a page of its own — ${s.steps} steps across ${s.sheets} ` +
    "sheets. The path that works runs straight down one column; everything that can go wrong hangs " +
    "off it to the right in a box of its own, so a failure mode nobody enumerated is a missing box " +
    `rather than a sentence nobody wrote — ${s.offSpine} of the ${s.steps} steps are things ` +
    "going wrong."
  );
}

function promptBody() {
  const raw = readFileSync(resolve(SRC, "prompt.md"), "utf8");
  const b = /^═══ BEGIN PROMPT ═══[ \t]*$/m.exec(raw);
  const e = /^═══ END PROMPT ═══[ \t]*$/m.exec(raw);
  return (b && e && e.index > b.index) ? raw.slice(b.index + b[0].length, e.index).trim() : raw;
}

function main() {
  const argv = process.argv.slice(2);
  let out = resolve(ROOT, "index.html");
  for (let i = 0; i < argv.length; i++) if (argv[i] === "-o") out = argv[++i];

  const entries = [];
  for (const id of LIBRARY) {
    const path = resolve(SRC, "examples", `${id}.wfd.json`);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    const build = buildDocument(doc);
    if (build.errors.length) {
      for (const e of build.errors) console.error(`error ${id}: ${e.path} — ${e.message}`);
      process.exit(1);
    }
    entries.push({ id, doc, build, preview: renderPreview(build.workflows[0], 460, 260) });
  }

  const css = readFileSync(resolve(SRC, "assets/theme.css"), "utf8");
  const js = scriptSafe(readFileSync(resolve(SRC, "assets/app.js"), "utf8"));
  const runtime = makeBundle();
  let starter = "{}";
  try { starter = readFileSync(resolve(SRC, "examples/starter.wfd.json"), "utf8").trim(); } catch {}

  const site = {
    ...SITE,
    description: siteDescription(libraryStats(entries)),
    steps: STEPS,
    disclosure: DISCLOSURE,
  };
  // The hero diagram is the page explaining ITSELF in its own notation, drawn by
  // the same renderer and from the same format as every other page in this file.
  // The run found nothing on the landing page was a diagram and the first legible
  // one was five screens and ~8 interactions away; a picture of the product would
  // have fixed that badly. This is the product running on its own instructions.
  //
  // It is a purpose-built six-step sheet rather than the rich builder example,
  // because the builder sheet's twelve spine steps render illegibly at hero size
  // — which is finding D1-F04 (auto-fit to a zoom at which the text does not
  // resolve) and would have reproduced the exact defect this rework is fixing.
  const howDoc = JSON.parse(readFileSync(resolve(SRC, "examples/how-it-works.wfd.json"), "utf8"));
  const howBuild = buildDocument(howDoc);
  if (howBuild.errors.length) {
    for (const e of howBuild.errors) console.error(`error how-it-works: ${e.path} — ${e.message}`);
    process.exit(1);
  }
  const heroBuild = howBuild.workflows[0];
  // The canonical home of the hosted copy. Only the library file gets this:
  // a generated page could be served from anywhere and must not claim it.
  const SOCIAL = {
    url: "https://ckluis.github.io/workflowForge/",
    image: "https://ckluis.github.io/workflowForge/social-card.png",
  };

  const html = renderLibraryPage(entries, {
    social: SOCIAL,
    site, css, js, runtime, starter, prompt: promptBody(),
    heroBuild, heroDoc: howDoc,
    heroCaption: "Drawn by the renderer it describes, from the same format as every page in this file",
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");

  const steps = entries.reduce((n, e) =>
    n + e.build.workflows.reduce((m, w) => m + w.nodes.filter((x) => x.kind === "step").length, 0), 0);
  console.log(`✓ ${out}`);
  console.log(`  ${entries.length} examples · ` +
    `${entries.reduce((n, e) => n + e.build.workflows.length, 0)} sheets · ${steps} steps · ` +
    `${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
}

main();
