// Assembles the complete, self-contained HTML page.
//
// Every page this produces carries four payloads: the rendered diagrams, the
// source document that produced them, the renderer itself, and the prompt that
// writes the source. That is what lets one file make the next one.

import { md, mdInline, esc, attr, plain } from "./md.mjs";
import { renderDiagram } from "./svg.mjs";
import { renderDetail } from "./detail.mjs";
import { densityCss, DENSITY, TONE_GLYPH, reviewCounts } from "./layout.mjs";
import { staticLine, parseDay, parseReviewEvery, formatDay } from "./fresh.mjs";

const LENS_LABEL = {
  ai: "AI agent", ui: "Interface", ops: "Operations", data: "Data", generic: "Process",
};

const ICON = {
  full: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"/></svg>',
  link: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-.7.7M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 1 0 4.24 4.24l.7-.7"/></svg>',
  copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>',
  spark: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 1.5l1.6 4.3 4.4 1.7-4.4 1.7L8 13.5l-1.6-4.3L2 7.5l4.4-1.7z"/></svg>',
  sun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.9 3.1l-1 1M4.1 11.9l-1 1M12.9 12.9l-1-1M4.1 4.1l-1-1"/></svg>',
  build: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.97"/><path d="M13.7 2.2v2.9h-2.9"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 3.2 12.6 8l-7.1 4.8z"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8m0 0 3-3m-3 3L5 7M2.5 13h11"/></svg>',
};

function countVariations(wfv) {
  let branches = 0, gobacks = 0, gotos = 0, ends = 0, forwards = 0;
  for (const n of wfv.nodes) {
    if (n.kind === "goback") gobacks++;
    else if (n.kind === "goto") gotos++;
    else if (n.kind === "goforward") forwards++;
    else if (n.kind === "end") ends++;
  }
  for (const e of wfv.edges) if (e.kind === "fan" || e.kind === "bypass") branches++;
  const steps = wfv.nodes.filter((n) => n.kind === "step").length;
  return { branches, gobacks, gotos, ends, forwards, steps };
}

/** Truncate at a word boundary so a card never ends mid-word. */
function clip(str, max) {
  const t = plain(str || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, "") + "…";
}

function tocSection(built) {
  if (built.length < 2) return "";   // a contents list of one is furniture
  return `<nav class="toc" aria-label="Contents">
  <h2>Diagrams</h2>
  <ol class="toc-list">
  ${built.map((wfv) => {
    const c = countVariations(wfv);
    const bits = [`${c.steps} steps`, `${c.branches} variation${c.branches === 1 ? "" : "s"}`];
    if (c.gobacks) bits.push(`${c.gobacks} loop${c.gobacks === 1 ? "" : "s"}`);
    return `<li><a class="toc-item" href="#wf-${attr(wfv.id)}">
      <span class="toc-n">${wfv.number}</span>
      <span><span class="toc-t">${esc(plain(wfv.title))}</span>
      <span class="toc-d">${esc(clip(wfv.description, 150))}</span></span>
      <span class="toc-c">${bits.join(" · ")}</span></a></li>`;
  }).join("\n")}
  </ol>
</nav>`;
}

function factStrip(wfv) {
  const s = wfv.summary;
  if (!s) return "";
  const rows = [
    ["Trigger", s.trigger], ["Outcome", s.outcome],
    ["Owner", s.owner], ["Typical duration", s.duration], ["Frequency", s.frequency],
  ].filter(([, v]) => v);
  if (!rows.length) return "";
  return `<div class="wf-facts">${rows.map(([k, v]) =>
    // mdInline, not esc. These fields are authored in the same markdown as
    // everything else, so `**Checkout**` was printing its own asterisks in the
    // TRIGGER row while the identical text rendered bold three lines below.
    `<div class="wf-fact"><span>${esc(k)}</span><b>${mdInline(v)}</b></div>`).join("")}</div>`;
}

// Best to worst, left to right — the same direction the canvas orders variations
// in. `neutral` is absent by design: it draws no glyph, so it has nothing to
// explain. See D1.
const TONE_LEGEND = [
  ["success", "went well"],
  ["info", "worth knowing"],
  ["warn", "needs attention"],
  ["error", "something failed"],
];

/** Which severity glyphs this sheet actually draws. Nothing else is listed. */
function tonesDrawn(wfv) {
  const seen = new Set();
  for (const e of wfv.edges) {
    if (!e.labelAt || !e.label) continue;
    if (e.tone && e.tone !== "neutral") seen.add(e.tone);
  }
  return seen;
}

/**
 * Which actors this sheet actually draws a chip for — in registry order, so the
 * legend reads the same way on every sheet of a document, and never listing an
 * actor whose boxes are all on some other sheet. Same rule as the severity
 * glyphs: a legend entry a reader cannot find on the page is worse than none.
 */
function actorsDrawn(wfv) {
  const seen = new Map();
  for (const n of wfv.nodes) {
    if (n.kind !== "step" || !n.actor) continue;
    if (!seen.has(n.actor.id)) seen.set(n.actor.id, n.actor);
  }
  return [...seen.values()];
}

function legend(wfv) {
  const c = countVariations(wfv);
  const parts = [
    `<span><b>Down</b> the happy path</span>`,
    `<span><b>Right</b> for variations, worst furthest right</span>`,
  ];
  // Every glyph drawn on a sheet is explained by that sheet's own legend, and
  // nothing that is not drawn is listed. A legend that lists a mark the reader
  // cannot find is worse than no legend.
  const drawn = tonesDrawn(wfv);
  for (const [tone, gloss] of TONE_LEGEND) {
    if (!drawn.has(tone)) continue;
    parts.push(`<span class="lg-tone tone-${tone}"><b>${esc(TONE_GLYPH[tone])}</b> ${esc(gloss)}</span>`);
  }
  // Actors (D5). Each is its own entry so the legend's own rhythm shows the
  // reader how many identities they are being asked to hold — which is the
  // thing the >6 warning is about, made visible rather than merely reported.
  const actors = actorsDrawn(wfv);
  for (const a of actors) {
    parts.push(
      `<button class="lg-actor" type="button" data-actor="${attr(a.id)}"` +
      ` data-wf="${attr(wfv.id)}" aria-pressed="false"` +
      ` title="Show only ${attr(a.name)}">` +
      `<b>${esc(a.short)}</b> ${esc(a.name)}</button>`
    );
  }
  // The handoff mark is a glyph like any other and gets explained on the sheets
  // that draw it, and only on those.
  if (wfv.edges.some((e) => e.handoff)) {
    parts.push(`<span class="lg-handoff">${HANDOFF_SWATCH} hands over to another actor</span>`);
  }
  if (c.gobacks) parts.push(`<span><b>&#8617;</b> returns to an earlier step</span>`);
  if (c.forwards) parts.push(`<span><b>&#8594;</b> rejoins further down</span>`);
  if (c.gotos) parts.push(`<span><b>&#8599;</b> continues in another diagram</span>`);
  // Only the weights this sheet actually draws are explained, the same rule the
  // severity glyphs follow. On an untouched document that means one entry, and
  // it is the honest one.
  //
  // Both are RENDERED and the ones the sheet does not draw are hidden, rather
  // than only the drawn ones being emitted. Marking a step changes what the
  // sheet draws, and a legend built once at build time then explained a weight
  // that was no longer there — or, worse, stopped explaining one that had just
  // appeared. app.js toggles these by their data hooks as marks change; the
  // rule that a legend explains only what is drawn is now enforced at read
  // time, which is the only time it can be true.
  const rc = reviewCounts(wfv);
  parts.push(`<span class="lg-conf" data-conf-thin${rc.unverified || rc.disputed ? "" : " hidden"}>` +
    `${CONF_SWATCH("is-thin")} not verified by a human</span>`);
  parts.push(`<span class="lg-conf" data-conf-solid${rc.verified ? "" : " hidden"}>` +
    `${CONF_SWATCH("is-solid")} checked by a reviewer</span>`);
  parts.push(`<span>Click any box for the detail</span>`);
  return `<div class="legend">${parts.join('<span class="sep">/</span>')}` +
    `${reviewLine(wfv)}</div>`;
}

/** The handoff mark, drawn rather than described — a tick across a line. */
const HANDOFF_SWATCH =
  `<svg class="lg-handoff-sw" viewBox="0 0 16 14" aria-hidden="true" focusable="false">` +
  `<line class="lg-handoff-line" x1="8" y1="0" x2="8" y2="14"/>` +
  `<line class="lg-handoff-tick" x1="1.5" y1="7" x2="14.5" y2="7"/></svg>`;

/* -------------------------------------------------------- review (D3) */

/** The two weights, drawn rather than described. */
const CONF_SWATCH = (cls) =>
  `<svg class="lg-conf-sw" viewBox="0 0 26 14" aria-hidden="true" focusable="false">` +
  `<rect class="lg-conf-box ${cls}" x="1.6" y="1.6" width="22.8" height="10.8" rx="2.5"/></svg>`;

/**
 * The sheet-level progress signal. Page chrome, never the canvas: it is a fact
 * about the document, not a part of the drawing, and the channel budget has
 * nothing left on the canvas to spend on it anyway.
 *
 * Written at build time from the document's own field, so it is honest on paper
 * and with scripting off. Review mode rewrites it in place.
 */
function reviewLine(wfv) {
  const c = reviewCounts(wfv);
  if (!c.total) return "";
  return `<span class="lg-review" data-review-wf="${attr(wfv.id)}"` +
    ` data-total="${c.total}"><b>${c.verified}</b> of <b>${c.total}</b> checked` +
    (c.disputed ? ` &middot; <b class="lg-disputed">${c.disputed}</b> disputed` : "") +
    `</span>`;
}

/**
 * Everything a reader needs to know about the document's review state, in the
 * document header beside the caveat and the freshness line — the three of them
 * are one family of "how much of this can you trust" notes.
 *
 * It is rendered whether or not anyone has reviewed anything, because "0 of 60"
 * is the fact D3 exists to stop a document hiding. The buttons are inert
 * without scripting and are marked so.
 */
function reviewPanel(workflows, meta) {
  const c = reviewCounts(workflows);
  if (!c.total) return "";

  // The provenance block, when this file was produced by "Publish review".
  // A reviewed copy has to say WHO checked it and WHEN on the document itself,
  // because that is the whole reason it was published as a separate file: the
  // run found a completed review left no attributable record anywhere, so every
  // recipient of a reviewed document saw "no step has been checked by a human".
  const r = meta && meta.review;
  const published = r && typeof r === "object" ? `<div class="dr-prov">
    <span class="dr-prov-badge">Reviewed</span>
    <span class="dr-prov-txt">Checked by <b>${esc(String(r.by || ""))}</b>` +
    `${r.on ? ` on ${esc(formatDay(parseDay(r.on)) || String(r.on))}` : ""} &middot; ` +
    `${Number(r.verified) || 0} of ${Number(r.total) || 0} steps verified` +
    `${Number(r.disputed) ? ` &middot; ${Number(r.disputed)} marked as needing work` : ""}</span>
  </div>` : "";
  const done = c.verified + c.disputed;
  const pct = Math.round((c.verified / c.total) * 1000) / 10;
  const gloss = c.verified === c.total
    ? "Every step in this document has been checked by a human."
    : done === 0
      ? "No step in this document has been checked by a human. Every box is drawn in a lighter outline until one is."
      : `${c.total - done} step${c.total - done === 1 ? "" : "s"} still to check.` +
        (c.disputed ? ` ${c.disputed} marked as needing work.` : "");

  return `<div class="doc-review" data-review-root>
  ${published}
  <div class="dr-head">
    <span class="dr-count"><b data-review-verified>${c.verified}</b> of <b>${c.total}</b> steps verified` +
    (c.disputed ? ` &middot; <b class="dr-disputed" data-review-disputed>${c.disputed}</b> disputed` : "") + `</span>
    <span class="dr-gloss" data-review-gloss>${esc(gloss)}</span>
  </div>
  <div class="dr-bar" role="img" aria-label="${attr(c.verified + " of " + c.total + " steps verified")}" data-review-bar>
    <span class="dr-fill" data-review-fill style="width:${pct}%"></span>
  </div>
  <div class="dr-act">
    <button class="btn btn-sm" type="button" id="review-toggle" aria-pressed="false">Review this document</button>
    <span class="dr-forwho">for whoever is checking it &#8212; reading needs nothing here</span>
    <button class="btn btn-sm btn-primary" type="button" id="review-publish" hidden>Publish review &#8594;</button>
    <button class="btn btn-sm" type="button" id="review-export" hidden>Export marks as JSON</button>
    <button class="btn btn-sm" type="button" id="review-clear" hidden>Discard my marks</button>
    <span class="dr-warn" id="review-dirty" hidden></span>
    <span class="dr-where">Anything you mark is held in this browser only until you publish it.</span>
  </div>
  <div class="dr-publish" id="review-publish-row" hidden>
    <label for="review-by">Publishing puts your name on this document. Who checked it?</label>
    <div class="dr-publish-in">
      <input type="text" id="review-by" autocomplete="name" spellcheck="false"
             placeholder="Your name" maxlength="80">
      <button class="btn btn-sm btn-primary" type="button" id="review-publish-go">Publish &#8594;</button>
      <button class="btn btn-sm" type="button" id="review-publish-cancel">Cancel</button>
    </div>
    <p class="dr-publish-note">This writes a new HTML file with your marks drawn in and your name on
      the header. Your working marks stay a draft in this browser until you do.</p>
  </div>
</div>`;
}

function workflowSection(wfv, doc) {
  const { svg, width, height } = renderDiagram(wfv);
  const details = wfv.nodes
    // chips navigate rather than open, so their templates were dead weight
    .filter((n) => n.kind === "step" || ((n.kind === "start" || n.kind === "end") && n.detail))
    .map((n) => `<template id="d-${attr(n.uid)}">${renderDetail(n, wfv, doc)}</template>`)
    .join("\n");

  return `<section class="wf" id="wf-${attr(wfv.id)}" aria-labelledby="h-${attr(wfv.id)}">
  <header class="wf-head">
    <div class="wf-head-l">
      <div class="wf-num">Diagram ${wfv.number}</div>
      <h2 class="wf-h" id="h-${attr(wfv.id)}">${esc(plain(wfv.title))}<span class="wf-lens">${esc(LENS_LABEL[wfv.lens] || wfv.lens)}</span></h2>
      <div class="wf-desc">${md(wfv.description || "")}</div>
    </div>
    <div class="wf-tools">
      <a class="btn" href="#wf-${attr(wfv.id)}" aria-label="Link to this diagram">${ICON.link}</a>
    </div>
  </header>
  ${factStrip(wfv)}
  ${legend(wfv)}
  <div class="canvas" data-wf="${attr(wfv.id)}">
    <div class="canvas-bar">
      <button class="btn btn-sm btn-walk" type="button" data-wf="${attr(wfv.id)}" aria-pressed="false">Walk this sheet</button>
      <span class="walk-steps" data-wf="${attr(wfv.id)}" hidden>
        <button class="zbtn" type="button" data-walk="prev" data-wf="${attr(wfv.id)}" aria-label="Previous step">&#8592;</button>
        <button class="zbtn" type="button" data-walk="next" data-wf="${attr(wfv.id)}" aria-label="Next step">&#8594;</button>
      </span>
      <label class="chk"><input type="checkbox" data-dim="${attr(wfv.id)}"> Dim secondary branches</label>
      <span class="walk-caption" data-wf="${attr(wfv.id)}"></span>
      <span class="spacer"></span>
      <span class="zoom-pair">
        <button class="zbtn" type="button" data-zoom="out" data-wf="${attr(wfv.id)}" aria-label="Zoom out">&#8722;</button>
        <span class="zlevel" data-wf="${attr(wfv.id)}">100%</span>
        <button class="zbtn" type="button" data-zoom="in" data-wf="${attr(wfv.id)}" aria-label="Zoom in">+</button>
      </span>
      <button class="zbtn zbtn-wide" type="button" data-zoom="fit" data-wf="${attr(wfv.id)}" aria-label="Fit to width">Fit</button>
      <button class="zbtn zbtn-wide btn-full" type="button" data-wf="${attr(wfv.id)}"
              aria-pressed="false" aria-label="Full screen"><span class="btn-full-label">Full screen</span></button>
    </div>
    <div class="canvas-inner">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"
           data-w="${width}" data-h="${height}" role="img"
           aria-label="${attr(plain(wfv.title))} — DRAKON-style workflow diagram">
        ${svg}
      </svg>
    </div>
  </div>
  ${details}
</section>`;
}

function glossarySection(doc) {
  const g = Array.isArray(doc.glossary) ? doc.glossary : [];
  if (!g.length) return "";
  return `<section class="glossary"><h2>Glossary</h2><dl>${g.map((t) =>
    `<dt>${esc(t.term)}</dt><dd>${mdInline(t.definition)}</dd>`).join("")}</dl></section>`;
}

function introSection(doc) {
  if (!doc.intro) return "";
  return `<section class="intro"><div class="intro-body">${md(doc.intro)}</div></section>`;
}

/* ------------------------------------------------------------------ */
/* The builder: what makes a page able to produce the next page.       */
/* ------------------------------------------------------------------ */

function builderPanel() {
  return `<div class="modal" id="build-modal" role="dialog" aria-modal="true" aria-labelledby="build-h">
  <div class="modal-scrim"></div>
  <div class="modal-panel is-wide">
    <div class="modal-bar">
      <strong id="build-h" style="font-size:14px">Make one for your own process</strong>
      <span class="spacer"></span>
      <button class="btn" type="button" id="build-theme" aria-label="Toggle colour theme">${ICON.sun}<span>Theme</span></button>
      <button class="btn" type="button" id="build-close" aria-label="Close">Close &#10005;</button>
    </div>
    <div class="modal-body build-body">

      <section class="bstep" id="bstep-prompt">
        <div class="bstep-h">
          <span class="bstep-n">1</span>
          <div>
            <h4>Take the prompt</h4>
            <p>It teaches a model the format and nothing else. Paste it into Claude, ChatGPT or
            anything comparable, then describe your process — or attach a flowchart you already have.</p>
          </div>
          <div class="bstep-act">
            <button class="btn btn-primary" type="button" data-copy="wfd-prompt">${ICON.copy}<span>Copy prompt</span></button>
            <button class="btn" type="button" id="prompt-download">${ICON.down}<span>Download .md</span></button>
          </div>
        </div>
        <details class="bpeek">
          <summary>Look inside it <span class="bpeek-note">— 120,000 characters, written for a
            model. You do not need to read it.</span></summary>
          <div class="prompt-box" id="prompt-view"></div>
        </details>
      </section>

      <section class="bstep">
        <div class="bstep-h">
          <span class="bstep-n">2</span>
          <div>
            <h4>Paste back what it gives you</h4>
            <p>A single JSON document — a <b>WFD</b> file, which is just this format&#8217;s name for
            it. Fenced code blocks are fine; the fence is stripped for you. Or load the document this
            page was built from and edit that — nothing here goes back to the model for a change you
            can make yourself.</p>
          </div>
          <div class="bstep-act">
            <button class="btn" type="button" id="build-source" hidden>Edit this page&#8217;s document</button>
            <button class="btn btn-primary" type="button" id="build-example">Try an example first</button>
          </div>
        </div>
        <textarea id="build-input" spellcheck="false"
          placeholder='{ "wfd": 1, "title": "…", "description": "…", "workflows": [ … ] }'></textarea>
      </section>

      <section class="bstep">
        <div class="bstep-h">
          <span class="bstep-n">3</span>
          <div>
            <h4>Get your file</h4>
            <p>One HTML page, no server, no build. It carries this builder and this prompt, so
            whoever you send it to can do the same. There is no send button anywhere here on
            purpose: the file lands in your downloads and you mail, commit or host it yourself.</p>
          </div>
          <div class="bstep-act">
            <button class="btn btn-primary btn-lg" type="button" id="build-render">${ICON.play}<span>Build my page</span></button>
          </div>
        </div>
        <div class="build-status" id="build-status"></div>
        <p class="build-note" id="build-note" hidden></p>
        <div class="build-handle" id="build-handle" hidden>
          <button class="btn btn-sm" type="button" id="build-again">Download again</button>
          <button class="btn btn-sm" type="button" id="build-open">Open in a new tab</button>
          <span class="build-where" id="build-where"></span>
        </div>
        <div id="build-report"></div>
        <iframe id="build-preview" title="Preview of your page" hidden></iframe>
      </section>

    </div>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ */

const HOME = { url: "https://ckluis.github.io/workflowforge", label: "ckluis.github.io/workflowforge" };

/** Shared bits of the document `<head>`. */
function headTag(title, description, css, accent, density) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(plain(title))}</title>
<meta name="description" content="${attr(plain(description || "").slice(0, 200))}">
<meta name="generator" content="workflowForge — WFD v1">
<meta name="color-scheme" content="light dark">
<style id="wfd-css">${css}</style>
<style id="wfd-accent">:root { --accent: ${accent}; }
${densityCss(DENSITY[density || "comfortable"] || DENSITY.comfortable)}</style>`;
}

/**
 * One document's page: its own masthead, its diagrams, its glossary. Rendered
 * at build time for a single-document file, and on demand by the router when a
 * library file navigates to an example.
 */
export function renderDocBody(build, opts = {}) {
  const { doc, workflows } = build;
  const meta = doc.meta || {};

  // A generated document can be wrong, and this format renders wrong things
  // with the same authority as right ones. Where the author knows the material
  // needs checking, say so where the reader cannot miss it.
  const disclaimer = meta.disclaimer
    ? `<div class="doc-caveat" role="note">${md(meta.disclaimer)}</div>` : "";

  // A file outlives the truth in it. What is written here is only what the
  // document itself asserts — the day it was dated and the interval its author
  // asked to be reviewed on — because the age depends on when the page is read
  // and the build may not ask what day it is (see fresh.mjs). app.js rewrites
  // this line at read time with the age, and raises it to a banner once the
  // interval has run out. No date, no element, no nag.
  const freshText = staticLine(meta);
  const freshEvery = parseDay(meta.date) && parseReviewEvery(meta.reviewEvery);
  const freshLine = freshText
    ? `<p class="doc-fresh" data-date="${attr(meta.date)}"` +
      (freshEvery ? ` data-review-every="${attr(meta.reviewEvery)}"` : "") +
      `>${esc(freshText)}</p>`
    : "";
  const metaBits = [
    meta.author && `By ${meta.author}`,
    meta.date, meta.version && `v${meta.version}`, meta.source && clip(meta.source, 62),
    ...(Array.isArray(meta.tags) ? meta.tags : []),
  ].filter(Boolean);

  return `<header class="doc-head">
  <div class="wrap">
    ${opts.back === false ? "" : '<a class="doc-back" href="#/">&#8592; All examples</a>'}
    <p class="eyebrow">Workflow atlas${meta.date ? ` &middot; ${esc(meta.date)}` : ""}</p>
    <h1 class="site-title">${esc(plain(doc.title))}</h1>
    ${doc.subtitle ? `<p class="site-sub">${esc(plain(doc.subtitle))}</p>` : ""}
    <div class="site-desc">${md(doc.description || "")}</div>
    ${disclaimer}
    ${freshLine}
    ${reviewPanel(workflows, meta)}
    ${metaBits.length ? `<div class="site-meta">${metaBits.map((b) => `<span>${esc(b)}</span>`).join("")}</div>` : ""}
    ${tocSection(workflows)}
    ${workflows.length ? `<a class="jump-first" href="#wf-${attr(workflows[0].id)}">Skip to the first diagram &#8595;</a>` : ""}
  </div>
</header>
<main class="wrap">
${introSection(doc)}
${workflows.map((w) => workflowSection(w, doc)).join("\n\n")}
${glossarySection(doc)}
</main>`;
}

function footer(links, stats) {
  const l = { ...HOME, ...(links || {}) };
  return `<footer class="site-foot">
  <div class="wrap">
    <div class="cta">
      <h2>Make one for your own process</h2>
      <div class="cta-copy">${md(
        "These diagrams are generated, not drawn. You describe a process — or paste a flowchart " +
        "you already have — and a language model returns a structured document. The renderer inside " +
        "this very file turns that document into a page like this one. Same input, same output, every time.\n\n" +
        "This file is the whole tool. Nothing to install, nothing to fetch.")}</div>
      <div class="cta-row">
        <button class="btn btn-primary btn-lg" type="button" data-open-build>${ICON.spark}<span>Open the builder</span></button>
        <button class="btn" type="button" id="theme-toggle" aria-label="Toggle colour theme">${ICON.sun}<span>Theme</span></button>
      </div>
    </div>
    <div class="foot-meta">
      ${stats}
      <span class="foot-keys">Press <code>?</code> for shortcuts</span>
      <span class="foot-links">This workflow was generated by
        <a href="${attr(l.url)}" target="_blank" rel="noopener">${esc(l.label)}
          <span class="ext" aria-label="opens a website in a new tab">&#8599; website</span></a></span>
      <span class="foot-prov">This page is a single file with no server behind it. Questions about
        the process it describes go to whoever sent it to you \u2014 not to the renderer.</span>
    </div>
  </div>
</footer>`;
}

function chrome(prompt, source, runtime, js, starter, extra) {
  return `<div class="modal" id="modal" role="dialog" aria-modal="true" aria-label="Step detail">
  <div class="modal-scrim"></div>
  <div class="modal-panel">
    <div class="modal-bar">
      <button class="btn" type="button" id="modal-prev" aria-label="Previous step">&#8592;</button>
      <button class="btn" type="button" id="modal-next" aria-label="Next step">&#8594;</button>
      <span class="modal-nav" id="modal-nav"></span>
      <span class="spacer"></span>
      <button class="btn" type="button" id="modal-close" aria-label="Close">Close &#10005;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-review" id="modal-review" hidden>
      <div class="mor-row">
        <span class="mor-q">Checked this step against the source?</span>
        <span class="spacer"></span>
        <button class="btn btn-sm mor-btn" type="button" data-mark="verified">&#10003; Verified <kbd>V</kbd></button>
        <button class="btn btn-sm mor-btn" type="button" data-mark="disputed">&#10007; Needs work <kbd>X</kbd></button>
        <button class="btn btn-sm mor-btn" type="button" data-mark="unverified">Not checked <kbd>U</kbd></button>
      </div>
      <div class="mor-why" id="mor-why" hidden>
        <label for="mark-note">Why does this step need work?</label>
        <textarea id="mark-note" rows="2" spellcheck="true" maxlength="400"
          placeholder="What is wrong with it, in one line \u2014 the person who fixes it reads this."></textarea>
      </div>
      <div class="mor-said" id="mor-said" aria-live="polite"></div>
    </div>
  </div>
</div>

${builderPanel()}

<div id="toast" role="status" aria-live="polite"></div>

<div id="shortcuts" hidden>
  <strong>Shortcuts</strong>
  <div>? &mdash; show or hide this panel</div>
  <div>Tab &mdash; move into the sheet, then &uarr; &darr; between steps</div>
  <div>Enter &mdash; open the detail</div>
  <div>&larr; &rarr; &mdash; step through details</div>
  <div>Esc &mdash; close this panel, a detail, or full screen</div>
  <div>V / X / U &mdash; in review mode: verified, needs work, not checked</div>
</div>

<script type="application/json" id="wfd-source">${source.replace(/</g, "\\u003c")}</script>
<template id="wfd-prompt">${esc(prompt)}</template>
<script type="application/json" id="wfd-starter">${(starter || "{}").replace(/</g, "\\u003c")}</script>
${extra || ""}
<script id="wfd-runtime">${runtime}</script>
<script id="wfd-app">${js}</script>`;
}

/* ---------------------------------------------------- single-document file */

export function renderPage(build, opts = {}) {
  const { doc, workflows } = build;
  const accent = (doc.theme && doc.theme.accent) || "#2f6f4e";
  const source = opts.source || JSON.stringify(doc, null, 2);
  const stepCount = workflows.reduce((n, w) => n + w.nodes.filter((x) => x.kind === "step").length, 0);
  const stats = `<span>${workflows.length} diagram${workflows.length === 1 ? "" : "s"}</span>
      <span>${stepCount} steps</span>
      <span>Rendered by workflowForge &middot; WFD v1</span>`;

  return `<!doctype html>
<html lang="en">
<head>
${headTag(doc.title, doc.description, opts.css || "", accent, doc.theme && doc.theme.density)}
</head>
<body>
<div id="doc-view">
${renderDocBody(build, { back: false })}
</div>
${footer(opts.links, stats)}
${chrome(opts.prompt || "", source, opts.runtime || "", opts.js || "", opts.starter)}
</body>
</html>`;
}

/* ------------------------------------------------------------ library file */


/**
 * Facts about the library, counted from the documents themselves. The hero and
 * the feature cards both quote numbers, and a quoted number that is typed by
 * hand goes stale the first time an example changes without anyone noticing.
 * Pure: it reads the build, never the clock (see fresh.mjs).
 */
export function libraryStats(entries) {
  const s = {
    examples: entries.length, sheets: 0, steps: 0, offSpine: 0,
    failureModes: 0, agent: 0, agentGuard: 0, agentOff: 0,
  };
  for (const e of entries) {
    s.sheets += e.build.workflows.length;
    for (const w of e.build.workflows) {
      for (const n of w.nodes) {
        if (n.kind !== "step") continue;
        s.steps++;
        if ((n.col || 0) > 0) s.offSpine++;
        const d = n.detail || {};
        if (Array.isArray(d.failureModes) && d.failureModes.length) s.failureModes++;
        if (d.model && d.tools && d.transcript) {
          s.agent++;
          if (d.guardrails) s.agentGuard++;
          if ((n.col || 0) > 0) s.agentOff++;
        }
      }
    }
  }
  return s;
}

// Each card's art is geometry only — no text, so nothing to translate and
// nothing that changes size with a font. All of it is aria-hidden: the card
// says in words whatever the drawing says in shapes.
const FEATURE_ART = {
  weight: '<svg viewBox="0 0 132 92" fill="none" aria-hidden="true">' +
    '<rect class="fa-box fa-primary fa-w-thin" x="8" y="6" width="66" height="17" rx="2"/>' +
    '<rect class="fa-box fa-primary fa-w-thick" x="8" y="31" width="66" height="17" rx="2"/>' +
    '<path class="fa-tick" d="M82 39.5l4 4.5 8-10"/>' +
    '<rect class="fa-box fa-primary fa-w-thin" x="8" y="56" width="66" height="17" rx="2"/>' +
    '<rect class="fa-track" x="8" y="82" width="116" height="6" rx="3"/>' +
    '<rect class="fa-fill" x="8" y="82" width="38" height="6" rx="3"/></svg>',
  // A document stating its date and its interval, and elapsed time measured
  // against the review it is due. The bar stops short of the marker, because
  // nothing on this page is overdue today and the art may not claim otherwise.
  clock: '<svg viewBox="0 0 132 92" fill="none" aria-hidden="true">' +
    '<rect class="fa-panel" x="8" y="6" width="116" height="52" rx="4"/>' +
    '<rect class="fa-bar" x="19" y="16" width="30" height="5" rx="2.5"/>' +
    '<rect class="fa-bar fa-faint" x="19" y="29" width="64" height="4" rx="2"/>' +
    '<rect class="fa-bar fa-faint" x="19" y="39" width="46" height="4" rx="2"/>' +
    '<rect class="fa-track" x="8" y="74" width="116" height="7" rx="3.5"/>' +
    '<rect class="fa-fill" x="8" y="74" width="52" height="7" rx="3.5"/>' +
    '<path class="fa-due" d="M96 66v23"/></svg>',
  spec: '<svg viewBox="0 0 132 92" fill="none" aria-hidden="true">' +
    '<rect class="fa-box fa-primary" x="6" y="34" width="34" height="17" rx="2"/>' +
    '<path class="fa-line" d="M40 42.5h14"/>' +
    '<rect class="fa-panel" x="56" y="6" width="70" height="80" rx="4"/>' +
    '<path class="fa-chev" d="M64 18l6 5-6 5"/>' +
    '<rect class="fa-bar" x="77" y="20.5" width="26" height="5" rx="2.5"/>' +
    '<rect class="fa-tool" x="64" y="38" width="24" height="12" rx="3"/>' +
    '<rect class="fa-tool" x="92" y="38" width="26" height="12" rx="3"/>' +
    '<rect class="fa-tool" x="64" y="56" width="32" height="12" rx="3"/>' +
    '<rect class="fa-bar fa-faint" x="64" y="76" width="48" height="4" rx="2"/></svg>',
  actors: '<svg viewBox="0 0 132 92" fill="none" aria-hidden="true">' +
    '<rect class="fa-box fa-primary" x="10" y="6" width="80" height="22" rx="2"/>' +
    '<rect class="fa-chip" x="70" y="11" width="15" height="12" rx="2.5"/>' +
    '<path class="fa-ini" d="M73.5 17h2.5M78.5 17h3"/>' +
    '<path class="fa-line" d="M50 28v36"/>' +
    '<path class="fa-hand" d="M43 45h14"/>' +
    '<rect class="fa-chip fa-chip-next" x="62" y="39" width="15" height="12" rx="2.5"/>' +
    '<path class="fa-ini" d="M65.5 45h2.5M70.5 45h3"/>' +
    '<rect class="fa-box fa-primary" x="10" y="64" width="80" height="22" rx="2"/>' +
    '<rect class="fa-chip fa-chip-next" x="70" y="69" width="15" height="12" rx="2.5"/>' +
    '<path class="fa-ini" d="M73.5 75h2.5M78.5 75h3"/></svg>',
  glyph: '<svg viewBox="0 0 132 92" fill="none" aria-hidden="true">' +
    '<path class="fa-line" d="M14 6v78"/>' +
    '<path class="fa-line" d="M14 22h18M14 48h18M14 74h18"/>' +
    '<circle class="fa-g-info" cx="42" cy="22" r="6"/>' +
    '<rect class="fa-bar fa-faint" x="56" y="19.5" width="42" height="5" rx="2.5"/>' +
    '<path class="fa-g-warn" d="M42 42l7 12H35z"/>' +
    '<rect class="fa-bar fa-faint" x="56" y="45.5" width="54" height="5" rx="2.5"/>' +
    '<path class="fa-g-err" d="M37 69l10 10M47 69l-10 10"/>' +
    '<rect class="fa-bar fa-faint" x="56" y="71.5" width="34" height="5" rx="2.5"/></svg>',
  spine: '<svg viewBox="0 0 132 92" fill="none" aria-hidden="true">' +
    '<path class="fa-line" d="M22 12v68"/><path class="fa-line" d="M22 30h40v14M22 52h64v14"/>' +
    '<rect class="fa-box fa-primary" x="8" y="4" width="28" height="12" rx="2"/>' +
    '<rect class="fa-box fa-primary" x="8" y="24" width="28" height="12" rx="2"/>' +
    '<rect class="fa-box fa-primary" x="8" y="46" width="28" height="12" rx="2"/>' +
    '<rect class="fa-box fa-primary" x="8" y="74" width="28" height="12" rx="2"/>' +
    '<rect class="fa-box fa-warn" x="48" y="38" width="28" height="12" rx="2"/>' +
    '<rect class="fa-box fa-error" x="72" y="60" width="28" height="12" rx="2"/></svg>',
  cross: '<svg viewBox="0 0 132 92" fill="none" aria-hidden="true">' +
    '<g class="fa-bad"><path class="fa-line" d="M14 14h60v64"/><path class="fa-line" d="M46 8v70h56"/>' +
    '<circle class="fa-hit" cx="46" cy="14" r="5"/><circle class="fa-hit" cx="74" cy="78" r="5"/></g>' +
    '<g class="fa-good" transform="translate(0,0)"><path class="fa-line" d="M112 10v72"/></g></svg>',
  open: '<svg viewBox="0 0 132 92" fill="none" aria-hidden="true">' +
    '<rect class="fa-box fa-primary" x="8" y="14" width="34" height="14" rx="2"/>' +
    '<path class="fa-line" d="M25 28v40"/>' +
    '<rect class="fa-box fa-primary" x="8" y="66" width="34" height="14" rx="2"/>' +
    '<rect class="fa-panel" x="56" y="8" width="68" height="76" rx="4"/>' +
    '<rect class="fa-bar" x="64" y="18" width="34" height="5" rx="2.5"/>' +
    '<rect class="fa-bar fa-faint" x="64" y="30" width="52" height="4" rx="2"/>' +
    '<rect class="fa-bar fa-faint" x="64" y="39" width="46" height="4" rx="2"/>' +
    '<rect class="fa-bar fa-faint" x="64" y="48" width="52" height="4" rx="2"/>' +
    '<rect class="fa-bar fa-faint" x="64" y="57" width="30" height="4" rx="2"/></svg>',
};

/**
 * Eight cards, which is two full rows of four, four rows of two and eight rows
 * of one — no orphan cell at any of the three column counts the grid states.
 * Every number in them is counted from the documents on this page rather than
 * typed, and every sentence is something the page demonstrates within two
 * clicks. A card that could only be believed rather than checked was cut: the
 * one about the freshness banner turning amber says instead what the two
 * examples with a review interval actually show today.
 */
function features(s) {
  return [
    {
      art: "weight",
      kicker: "Confidence",
      title: "Nothing here has been checked by a human",
      body: "Every step carries a verification state, and an absent one means unverified — " +
            "authority is earned by a human act, never granted by omission. Unchecked boxes draw " +
            `a 1.04px border and checked ones 1.92px, so the answer is on the canvas rather than ` +
            `buried in a panel. All ${s.steps} steps below are light. Review mode walks a sheet, ` +
            "marks each step, and exports the marked copy.",
    },
    {
      art: "clock",
      kicker: "Freshness",
      title: "The document dates itself",
      body: "A document says when it was written and how often it wants revisiting — naturalization " +
            "asks for six months, checkout-ux for a year — and the line under each header does that " +
            "arithmetic against your clock, never the build's. Nothing moves the date on its own, " +
            "because a rebuild is not a review. Starter carries no date and so gets no line at all: " +
            "a document that makes no claim about its age is not nagged about one.",
    },
    {
      art: "open",
      kicker: "Depth",
      title: "Every box opens onto the real material",
      body: "A diagram that fits on a page can only ever be an index. Click any box and the panel " +
            "behind it holds the actual work — the runbook, the schema, the wireframe with every " +
            `control wired to where it leads. ${s.failureModes} of the ${s.steps} steps enumerate ` +
            `their own failure modes, and all ${s.steps} open. Left and right walk the panels ` +
            "without going back to the sheet, and nothing is fetched to fill them — the material " +
            "travels inside this file.",
    },
    {
      art: "spec",
      kicker: "Specification",
      title: "Precise enough to hand to an agent",
      body: "On an agent sheet a step is not a description of what should happen. " +
            `${s.agent} steps name their model, the tools that turn may call and a worked ` +
            `transcript of it going right; ${s.agentGuard} of those add the guardrails. The diagram ` +
            `is the control flow around them, exceptions included: ${s.agentOff} of the ${s.agent} ` +
            "sit off the happy path, so a guardrail that trips is a step with its own transcript " +
            "rather than a footnote.",
    },
    {
      art: "spine",
      kicker: "Exceptions",
      title: "One column works. The rest are exceptions.",
      // Corrected 2026-09-04. This used to say "exceptions get boxes rather than
      // clauses" without qualification, and a reader took it to mean a step's
      // `detail.failureModes` would be drawn hanging off it. They are not —
      // they are notes inside the panel. What gets a box is a BRANCH, a real
      // fork in the control flow. Both are useful, they are not the same thing,
      // and the page was promising the wrong one.
      body: "The successful path runs straight down the left edge, and every branch that can go " +
            "wrong hangs off it to the right — the further right a box sits, the worse the " +
            "situation that put you there. A branch is control flow and gets a box of its own; the " +
            "smaller ways a single step can fail are listed inside that step, under " +
            `"When it goes wrong". ${s.offSpine} of these ${s.steps} boxes are things going wrong, ` +
            `and ${s.failureModes} steps enumerate their own failure modes on top of that.`,
    },
    {
      art: "cross",
      kicker: "Legibility",
      title: "No two lines cross. Not once.",
      body: "The renderer tests every horizontal against every vertical, lays the sheet out again if " +
            "it finds an intersection, and refuses to build the file if it cannot separate them. A " +
            `guarantee rather than a habit, asserted by a test across all ${s.sheets} sheets — which ` +
            "is why these stay readable at two hundred steps where a hand-drawn chart stops at twenty.",
    },
    {
      art: "actors",
      kicker: "Ownership",
      title: "Who does what, without a second axis",
      body: "Swimlanes want an axis and both are spent: down is sequence, right is severity. So each " +
            "box carries a three-character chip of its owner's initials, the legend dims the sheet to " +
            "one actor while you hover it, and where the owner changes the connecting line is ticked " +
            "with the receiving initials. Handoffs are where processes fail.",
    },
    {
      art: "glyph",
      kicker: "Severity",
      title: "It survives a photocopy",
      body: "Tone was hue alone, which a colour-blind reader or a black-and-white print loses " +
            "entirely. Branch labels lead with a glyph — ▲ warning, ✗ error, ⓘ note, ✓ success — " +
            "picked by drawing twenty-four candidates at the size they actually render, then again " +
            "through a 1-bit threshold. None is in the emoji set: a colour-emoji font would repaint " +
            "it a colour the tone never chose.",
    },
  ];
}

/**
 * The mechanism, as three steps, directly under the hero.
 *
 * The UX run found the landing page described a model round-trip without ever
 * saying the READER performs it, and a low-trust evaluator who stopped here left
 * believing this page transmits their process. Step 2 therefore names the model
 * and says "you run this step" in the step itself, not in a footnote.
 */
function stepsSection(steps) {
  if (!steps || !steps.length) return "";
  return `<section class="how" aria-label="How it works">
  <ol class="how-steps">
${steps.map((st) => `    <li class="how-step">
      <span class="how-n" aria-hidden="true">${esc(st.n)}</span>
      <div class="how-txt"><h3>${esc(st.title)}</h3><p>${esc(st.body)}</p></div>
    </li>`).join("\n")}
  </ol>
</section>`;
}

/**
 * The hero diagram: this page, drawn by its own renderer, in its own notation.
 *
 * This is renderDiagram, not renderPreview. renderPreview makes the abstract
 * card thumbnails — shapes with no text — which would have put a picture of a
 * diagram on the landing page rather than a diagram, and left the run's finding
 * ("nothing on the landing page is a diagram") standing under a nicer layout.
 * Rendered at build time so the first screen still needs no script.
 */
function heroFigure(built, caption, doc) {
  if (!built) return "";
  const { svg, width, height } = renderDiagram(built);
  // The hero's boxes open like any other box on any other sheet. Without these
  // templates the diagram would be a picture of an interactive diagram — which
  // is the same mistake as using renderPreview, one layer further in. The
  // self-host step's panel is where the project and download links live.
  const details = built.nodes
    .filter((n) => n.kind === "step" || ((n.kind === "start" || n.kind === "end") && n.detail))
    .map((n) => `<template id="d-${attr(n.uid)}">${renderDetail(n, built, doc)}</template>`)
    .join("\n");
  return `${details}
<figure class="hero-fig">
  <div class="hero-fig-frame">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"
         width="${width}" height="${height}" class="wf-svg" role="img"
         aria-label="${attr(caption || "How this page works")}">
      ${svg}
    </svg>
  </div>
  ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
</figure>`;
}

function featureSection(stats) {
  return `<section class="features">
  <h2 class="section-label">What the format carries</h2>
  <div class="feature-grid">
${features(stats).map((f) => `    <article class="feature">
      <div class="feature-art">${FEATURE_ART[f.art]}</div>
      <p class="feature-kicker">${esc(f.kicker)}</p>
      <h3>${esc(f.title)}</h3>
      <p class="feature-body">${esc(f.body)}</p>
    </article>`).join("\n")}
  </div>
</section>`;
}

/** The first step with something worth reading, for the card's open panel. */
function cardSpotlight(build) {
  for (const wfv of build.workflows) {
    for (const n of wfv.nodes) {
      if (n.kind !== "step" || !n.detail || !n.detail.purpose) continue;
      return {
        num: n.num,
        title: plain(n.title),
        body: clip(n.detail.purpose, 150),
        lens: wfv.lens,
      };
    }
  }
  return null;
}

const LENS_CHIP = { ai: "Transcript", ui: "Wireframe", ops: "Runbook", data: "Schema", generic: "Detail" };

/**
 * The governance columns on each card: how old the document is, how often it
 * asks to be revisited, and how much of it a human has checked.
 *
 * Re-grounded from a finding that originally read "there is no roster anywhere".
 * That finding was raised against a directory listing produced by the test
 * server, not by this product — a fidelity audit caught the probe reaching a
 * URL no screen had shown it. The honest version of the complaint survives:
 * the index listed sheets and steps, which are size, and said nothing about
 * currency or review, which are the facts someone governing a set of documents
 * actually reads a list for.
 */
function govRow(entry) {
  const meta = entry.doc.meta || {};
  const c = reviewCounts(entry.build.workflows);
  const line = staticLine(meta);
  const bits = [];
  if (line) bits.push(`<span class="cg-date">${esc(line)}</span>`);
  else bits.push(`<span class="cg-none">undated</span>`);
  if (c.total) {
    bits.push(c.verified
      ? `<span class="cg-ok">${c.verified} of ${c.total} checked</span>`
      : `<span class="cg-none">none of ${c.total} checked</span>`);
  }
  return `<div class="card-gov">${bits.join("")}</div>`;
}

function libraryCard(entry) {
  const { id, build, preview } = entry;
  const doc = build.doc;
  const spot = cardSpotlight(build);
  const steps = build.workflows.reduce((n, w) => n + w.nodes.filter((x) => x.kind === "step").length, 0);
  const sheets = build.workflows.length;
  const panel = spot ? `<div class="card-panel">
      <div class="card-panel-top"><span class="cp-num">${esc(spot.num)}</span>
        <span class="cp-kind">${esc(LENS_CHIP[spot.lens] || "Detail")}</span></div>
      <h4>${esc(spot.title)}</h4>
      <p>${esc(spot.body)}</p>
    </div>` : "";

  // Deep-linked to the first diagram rather than the top of the document. The
  // card sells a picture; the click used to land on three screens of prose.
  const firstWf = build.workflows[0];
  return `<a class="card" href="#/${attr(id)}${firstWf ? "/" : ""}">
  <div class="card-pv"><div class="card-pv-shape">${preview}</div>${panel}</div>
  <div class="card-body">
    <h3>${esc(plain(doc.title))}</h3>
    ${doc.subtitle ? `<p class="card-sub">${esc(plain(doc.subtitle))}</p>` : ""}
    <p class="card-desc">${esc(clip(doc.description, 165))}</p>
    <div class="card-meta">
      <span>${sheets} sheet${sheets === 1 ? "" : "s"}</span>
      <span>${steps} steps</span>
      <span class="card-go">Open &#8594;</span>
    </div>
    ${govRow(entry)}
  </div>
</a>`;
}

/**
 * Every example in one file. The index is rendered at build time so the first
 * screen needs no script; the example pages render on demand from the documents
 * carried below, which is what keeps the file to one download instead of four.
 */
export function renderLibraryPage(entries, opts = {}) {
  const site = opts.site || {};
  const accent = site.accent || "#2f6f4e";
  // Counted from the documents this page carries, so the feature cards and the
  // footer cannot drift apart, and neither can drift from the examples.
  const counts = libraryStats(entries);
  const totalSteps = counts.steps;
  const totalSheets = counts.sheets;

  const docScripts = entries.map((e) =>
    `<script type="application/json" class="wfd-doc" data-doc="${attr(e.id)}">` +
    `${JSON.stringify(e.doc).replace(/</g, "\\u003c")}</script>`).join("\n");

  const stats = `<span>${entries.length} examples</span>
      <span>${totalSheets} sheets</span>
      <span>${totalSteps} steps</span>
      <span>Rendered by workflowForge &middot; WFD v1</span>`;

  return `<!doctype html>
<html lang="en">
<head>
${headTag(site.title || "Workflow atlas", site.description || "", opts.css || "", accent, "comfortable")}
</head>
<body>

<div id="index-view">
  <header class="site-head">
    <div class="wrap">
      <p class="eyebrow">${esc(site.eyebrow || "Workflow atlas")}</p>
      <h1 class="site-title">${esc(site.title || "")}</h1>
      ${site.subtitle ? `<p class="site-sub">${esc(site.subtitle)}</p>` : ""}
      <div class="head-cta">
        <button class="btn btn-primary btn-lg" type="button" data-open-build>${ICON.spark}<span>Make one for your process</span></button>
        <button class="btn btn-lg" type="button" data-open-prompt>${ICON.copy || ""}<span>Read the prompt</span></button>
      </div>
      ${site.disclosure ? `<p class="head-disclosure">${esc(site.disclosure)}</p>` : ""}
    </div>
  </header>
  <main class="wrap">
${stepsSection(site.steps)}
${heroFigure(opts.heroBuild, opts.heroCaption, opts.heroDoc)}
${featureSection(counts)}
    <h2 class="section-label">Examples</h2>
    <p class="section-note">${md(site.description || "").replace(/<\/?p>/g, "")}</p>
    <div class="cards">
${entries.map(libraryCard).join("\n")}
    </div>
  </main>
</div>

<div id="doc-view" hidden></div>

${footer(opts.links, stats)}
${chrome(opts.prompt || "", "{}", opts.runtime || "", opts.js || "", opts.starter, docScripts)}
</body>
</html>`;
}
