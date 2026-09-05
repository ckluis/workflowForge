// workflowForge test suite.
//
// Two halves:
//   1. module tests — text metrics, markdown, validator error paths
//   2. geometric assertions — the "the diagram is correct iff…" checklist from
//      src/notes/drakon-rules.md, run against every example document.
//
//   node test/units.mjs

import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrap, wrapClamp, measure, measureMono, charEm } from "./text.mjs";
import { md, plain, esc } from "./md.mjs";
import {
  buildDocument, TONE_GLYPH, TONE_SPOKEN, labelWithTone, reviewCounts,
  buildActors, deriveShort, ACTOR_SHORT_MAX, ACTOR_LEGEND_MAX,
} from "./layout.mjs";
import { renderDiagram } from "./svg.mjs";
import { renderDocBody, renderPage, renderLibraryPage } from "./page.mjs";
import { renderDetail } from "./detail.mjs";
import {
  freshness, checkMeta, parseReviewEvery, parseDay, addInterval, describeSpan, staticLine,
} from "./fresh.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let passed = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push({ name, message: e.message });
  }
}
function eq(a, b, what) {
  if (a !== b) throw new Error(`${what || "value"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

/* ================================================================ text */

t("wrap is deterministic", () => {
  const s = "Validate the cart and reserve inventory for ninety seconds";
  eq(JSON.stringify(wrap(s, 208, 14, true)), JSON.stringify(wrap(s, 208, 14, true)), "repeat wrap");
});

t("wrap never exceeds the given width", () => {
  const samples = [
    "Short", "A somewhat longer sentence that must be broken across several lines",
    "supercalifragilisticexpialidocious-and-then-some-more-characters",
    "MMMMM WWWWW @@@@@", "iiiii lllll .....", "",
  ];
  for (const s of samples) {
    for (const w of [90, 140, 208, 300]) {
      for (const line of wrap(s, w, 14, true)) {
        ok(measure(line, 14, true) <= w + 0.01, `"${line}" overflows ${w}px`);
      }
    }
  }
});

t("wrapClamp respects the line budget and ellipsises", () => {
  const lines = wrapClamp("a ".repeat(200), 120, 11.5, 2);
  eq(lines.length, 2, "line count");
  ok(lines[1].endsWith("…"), "last line should be ellipsised");
  ok(measure(lines[1], 11.5, false) <= 120.01, "ellipsised line must still fit");
});

t("wrap handles a token longer than the whole line", () => {
  const lines = wrap("x".repeat(400), 100, 14, false);
  ok(lines.length > 1, "should hard-break");
  for (const l of lines) ok(measure(l, 14, false) <= 100.01, "hard-broken line fits");
});

/* ============================================================ markdown */

t("markdown renders the blocks we rely on", () => {
  const out = md("# H\n\n- a\n- b\n\n```js\nx<1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> q");
  for (const frag of ["<h3>", "<ul>", "<pre class=\"md-code\"", "<table", "<blockquote>"]) {
    ok(out.includes(frag), `missing ${frag}`);
  }
});

t("markdown escapes html", () => {
  ok(md("<script>alert(1)</script>").includes("&lt;script&gt;"), "must escape tags");
  ok(!md("<img onerror=x>").includes("<img"), "must not emit raw tags");
});

t("inline code survives the placeholder pass next to digits", () => {
  const out = md("call `f(1)` with 3 and 42 args");
  ok(out.includes("<code>f(1)</code>"), "code span lost");
  ok(out.includes("3 and 42"), "digits mangled");
});

t("plain strips markup", () => {
  eq(plain("**bold** `code` [x](y)"), "bold code x", "plain text");
});

/* =========================================================== validator */

function build(doc) { return buildDocument(doc); }

const MINIMAL = () => ({
  wfd: 1, title: "T", description: "d",
  workflows: [{
    id: "w", title: "W", description: "d", lens: "generic",
    start: { label: "s" },
    steps: [{ id: "a", type: "action", title: "A" }],
    end: { label: "e", tone: "success" },
  }],
});

t("a minimal document builds clean", () => {
  const b = build(MINIMAL());
  eq(b.errors.length, 0, "errors: " + JSON.stringify(b.errors));
});

t("a question with no branches is an error", () => {
  const d = MINIMAL();
  d.workflows[0].steps = [{ id: "q", type: "question", title: "Q?", branches: [] }];
  ok(build(d).errors.some((e) => /no branches/.test(e.message)), "should reject");
});

t("a branch with no exit is an error", () => {
  const d = MINIMAL();
  d.workflows[0].steps = [{ id: "q", type: "question", title: "Q?", branches: [{ label: "No", steps: [] }] }];
  ok(build(d).errors.some((e) => /no exit/.test(e.message)), "should reject");
});

t("an unresolvable join target is an error", () => {
  const d = MINIMAL();
  d.workflows[0].steps = [
    { id: "q", type: "question", title: "Q?", branches: [{ label: "No", steps: [], exit: { type: "join", to: "nope" } }] },
    { id: "z", type: "action", title: "Z" },
  ];
  ok(build(d).errors.some((e) => /not found/.test(e.message)), "should reject");
});

t("a backward join is rejected and suggests goback", () => {
  const d = MINIMAL();
  d.workflows[0].steps = [
    { id: "a", type: "action", title: "A" },
    { id: "q", type: "question", title: "Q?", branches: [{ label: "No", steps: [], exit: { type: "join", to: "a" } }] },
  ];
  const b = build(d);
  ok(b.errors.length > 0, "should reject a backward join");
  ok(b.errors.some((e) => /goback/.test(e.hint || "")), "hint should name goback");
});

t("a forward goback is rejected and suggests join", () => {
  const d = MINIMAL();
  d.workflows[0].steps = [
    { id: "q", type: "question", title: "Q?", branches: [{ label: "No", steps: [], exit: { type: "goback", to: "z" } }] },
    { id: "z", type: "action", title: "Z" },
  ];
  const b = build(d);
  ok(b.errors.some((e) => /below it/.test(e.message)), "should reject");
  ok(b.errors.some((e) => /join/.test(e.hint || "")), "hint should name join");
});

t("duplicate step ids are caught", () => {
  const d = MINIMAL();
  d.workflows[0].steps = [
    { id: "a", type: "action", title: "A" },
    { id: "a", type: "action", title: "A again" },
  ];
  ok(build(d).errors.some((e) => /duplicate step id/.test(e.message)), "should reject");
});

t("an unknown goto workflow is caught", () => {
  const d = MINIMAL();
  d.workflows[0].steps = [
    { id: "q", type: "question", title: "Q?", branches: [{ label: "No", steps: [], exit: { type: "goto", workflow: "ghost" } }] },
  ];
  ok(build(d).errors.some((e) => /goto workflow/.test(e.message)), "should reject");
});

t("tone aliases from the spec are accepted", () => {
  const d = MINIMAL();
  d.workflows[0].end = { label: "e", tone: "failure" };
  const b = build(d);
  eq(b.errors.length, 0, "failure tone should be accepted");
  const end = b.workflows[0].nodes.find((n) => n.kind === "end");
  eq(end.tone, "error", "failure maps to error");
});

t("numbering follows the spec", () => {
  const d = MINIMAL();
  d.workflows[0].steps = [
    { id: "s1", type: "action", title: "One" },
    {
      id: "s2", type: "question", title: "Two?", branches: [
        { label: "No", steps: [{ id: "b1", type: "action", title: "Detour" }], exit: { type: "continue" } },
        { label: "Never", steps: [{ id: "c1", type: "action", title: "Other" }], exit: { type: "continue" } },
      ],
    },
    { id: "s3", type: "action", title: "Three" },
  ];
  const b = build(d);
  const num = (id) => b.workflows[0].byStepId.get(id).num;
  eq(num("s1"), "1"); eq(num("s2"), "2"); eq(num("s3"), "3");
  eq(num("b1"), "2a"); eq(num("c1"), "2b");
});

/* ========================================================== freshness */
//
// Every one of these hands the code an explicit "today". None of them reads the
// real clock: a test that does would pass today and fail in March.

const DATED = (extra) => {
  const d = MINIMAL();
  d.meta = Object.assign({ date: "2026-03-04" }, extra || {});
  return d;
};

t("reviewEvery accepts the forms the spec documents", () => {
  eq(JSON.stringify(parseReviewEvery("6 months")), JSON.stringify({ n: 6, unit: "month", label: "6 months" }), "6 months");
  eq(parseReviewEvery("1 year").unit, "year", "1 year");
  eq(parseReviewEvery("90 days").n, 90, "90 days");
  eq(parseReviewEvery("2 weeks").unit, "week", "2 weeks");
  eq(parseReviewEvery("1 month").label, "1 month", "singular keeps its singular");
});

t("reviewEvery rejects everything else", () => {
  for (const bad of ["", "biannual", "6", "6mo", "six months", "0 months", "-1 months",
                     "every 6 months", "2026-09-01", "1 fortnight", "6 monthsish", 6, null, {}]) {
    eq(parseReviewEvery(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
  eq(parseReviewEvery(" 6 months ").n, 6, "surrounding space is forgiven");
});

t("a bad reviewEvery is a build error that names the field", () => {
  const b = build(DATED({ reviewEvery: "biannual" }));
  const e = b.errors.find((x) => x.path === "meta.reviewEvery");
  ok(e, "should error: " + JSON.stringify(b.errors));
  ok(/not a review interval/.test(e.message), "message names the problem");
  ok(/6 months/.test(e.hint || ""), "hint shows the shape");
});

t("a non-string reviewEvery is a build error", () => {
  const b = build(DATED({ reviewEvery: 6 }));
  ok(b.errors.some((x) => x.path === "meta.reviewEvery" && /must be a string/.test(x.message)),
    "should reject a number: " + JSON.stringify(b.errors));
});

/* ------------------------------------------------------------ meta.review

   The provenance block "Publish review" writes. Same rule as step.verification:
   only a human may write it, and a malformed record is an ERROR rather than a
   field quietly dropped — a document that looks reviewed because a broken
   provenance block was ignored is precisely what this format exists to stop. */

function REVIEWED(review) {
  const d = MINIMAL();
  d.meta = { review };
  return d;
}

t("a well-formed meta.review builds clean", () => {
  const b = build(REVIEWED({ by: "Dana Kowalczyk", on: "2026-09-03", verified: 1, disputed: 0, total: 2 }));
  eq(b.errors.length, 0, "no errors: " + JSON.stringify(b.errors));
});

t("a review with nobody's name on it is a build error", () => {
  const b = build(REVIEWED({ by: "  ", on: "2026-09-03", verified: 1, disputed: 0, total: 2 }));
  const e = b.errors.find((x) => x.path === "meta.review.by");
  ok(e, "should error: " + JSON.stringify(b.errors));
  ok(/attributable/.test(e.hint || ""), "hint says why a name is the point");
});

t("a review dated with something that is not a date is a build error", () => {
  const b = build(REVIEWED({ by: "Dana", on: "last Tuesday", verified: 1, disputed: 0, total: 2 }));
  ok(b.errors.some((x) => x.path === "meta.review.on"), "should reject: " + JSON.stringify(b.errors));
});

t("review counts must be whole non-negative numbers of steps", () => {
  const b = build(REVIEWED({ by: "Dana", on: "2026-09-03", verified: "four", disputed: -1, total: 2 }));
  ok(b.errors.some((x) => x.path === "meta.review.verified"), "rejects a non-number");
  ok(b.errors.some((x) => x.path === "meta.review.disputed"), "rejects a negative");
});

t("a review may not claim more checked steps than the document has", () => {
  const b = build(REVIEWED({ by: "Dana", on: "2026-09-03", verified: 9, disputed: 3, total: 4 }));
  const e = b.errors.find((x) => x.path === "meta.review");
  ok(e, "should error: " + JSON.stringify(b.errors));
  ok(/overstate/.test(e.hint || ""), "hint names the risk: overstating the review");
});

t("meta.review that is not an object is a build error", () => {
  const b = build(REVIEWED("reviewed by Dana"));
  ok(b.errors.some((x) => x.path === "meta.review" && /must be an object/.test(x.message)),
    "a string is not a review record: " + JSON.stringify(b.errors));
});

t("a published review renders its provenance into the document header", () => {
  const d = MINIMAL();
  d.meta = { review: { by: "Dana Kowalczyk", on: "2026-09-03", verified: 1, disputed: 1, total: 2 } };
  const b = build(d);
  eq(b.errors.length, 0, "builds: " + JSON.stringify(b.errors));
  const html = renderDocBody(b, {});
  ok(/dr-prov/.test(html), "carries the provenance block");
  ok(/Dana Kowalczyk/.test(html), "names the reviewer");
  ok(/3 September 2026/.test(html), "states the day in words");
  ok(/1 marked as needing work/.test(html), "does not hide the disputed count");
});

t("a document with no review says nothing about one", () => {
  const html = renderDocBody(build(MINIMAL()), {});
  ok(!/dr-prov/.test(html), "no provenance block where nobody has reviewed anything");
});

t("reviewEvery without a date is a build error", () => {
  const d = MINIMAL();
  d.meta = { reviewEvery: "6 months" };
  const b = build(d);
  const e = b.errors.find((x) => x.path === "meta.reviewEvery");
  ok(e && /nothing to measure from/.test(e.message), "an interval alone measures nothing");
  ok(/meta\.date/.test(e.hint || ""), "hint names meta.date");
});

t("a valid date and interval build clean", () => {
  const b = build(DATED({ reviewEvery: "6 months" }));
  eq(b.errors.length, 0, "errors: " + JSON.stringify(b.errors));
  eq(b.warnings.filter((w) => w.path === "meta.date").length, 0, "no date warning");
});

t("a malformed date warns but does not fail the build", () => {
  const d = MINIMAL();
  d.meta = { date: "March 2026" };
  const b = build(d);
  eq(b.errors.filter((e) => /^meta\./.test(e.path)).length, 0, "no meta errors");
  ok(b.warnings.some((w) => w.path === "meta.date"), "should warn");
  eq(parseDay("2026-02-30"), null, "30 February is not a date");
  eq(parseDay("2026-2-4"), null, "unpadded is not the documented shape");
  eq(parseDay("2024-02-29").d, 29, "a real leap day is");
});

t("no date means no freshness signal at all", () => {
  eq(freshness({}, "2026-08-23"), null, "no meta.date");
  eq(freshness({ date: "soon" }, "2026-08-23"), null, "unreadable meta.date");
  eq(freshness(null, "2026-08-23"), null, "no meta");
  eq(staticLine({}), null, "nothing to render");
  const html = renderDocBody(build(MINIMAL()));
  ok(!/doc-fresh/.test(html), "a dateless document renders no freshness element");
});

t("age arithmetic is measured against the day it is read", () => {
  const meta = { date: "2026-03-04", reviewEvery: "6 months" };
  eq(freshness(meta, "2026-03-04").ageDays, 0, "same day");
  eq(freshness(meta, "2026-03-05").ageDays, 1, "next day");
  eq(freshness(meta, "2027-03-04").ageDays, 365, "a year of days");
  eq(freshness(meta, "2026-03-04").state, "fresh", "dated today is fresh");
  eq(freshness(meta, "2026-09-03").state, "fresh", "the day before it is due");
  eq(freshness(meta, "2026-09-04").state, "stale", "the day it falls due");
  eq(freshness(meta, "2027-01-01").state, "stale", "well past");
  eq(freshness(meta, "2026-09-04").dueDays, 0, "due today");
  eq(freshness(meta, "2026-09-05").dueDays, -1, "one day over");
  eq(freshness(meta, "2026-03-04").due, "2026-09-04", "the due date is calendar-added");
});

t("a date in the future is not staleness", () => {
  const f = freshness({ date: "2027-01-01", reviewEvery: "1 month" }, "2026-08-23");
  eq(f.state, "fresh", "state");
  ok(f.ageDays < 0, "negative age");
  eq(f.text, "Dated 1 January 2027", "says the date and stops");
});

t("intervals add by the calendar, not by 30-day months", () => {
  eq(JSON.stringify(addInterval({ y: 2026, m: 1, d: 31 }, 1, "month")),
    JSON.stringify({ y: 2026, m: 2, d: 28 }), "31 Jan + 1 month clamps to 28 Feb");
  eq(JSON.stringify(addInterval({ y: 2024, m: 1, d: 31 }, 1, "month")),
    JSON.stringify({ y: 2024, m: 2, d: 29 }), "and to 29 Feb in a leap year");
  eq(JSON.stringify(addInterval({ y: 2026, m: 11, d: 15 }, 3, "month")),
    JSON.stringify({ y: 2027, m: 2, d: 15 }), "months roll the year");
  eq(JSON.stringify(addInterval({ y: 2026, m: 3, d: 4 }, 2, "week")),
    JSON.stringify({ y: 2026, m: 3, d: 18 }), "weeks are seven days");
  eq(JSON.stringify(addInterval({ y: 2026, m: 12, d: 20 }, 30, "day")),
    JSON.stringify({ y: 2027, m: 1, d: 19 }), "days roll the year");
  eq(JSON.stringify(addInterval({ y: 2024, m: 2, d: 29 }, 1, "year")),
    JSON.stringify({ y: 2025, m: 2, d: 28 }), "a leap day plus a year clamps");
});

t("a span is described in units a reader can hold", () => {
  eq(describeSpan(0), "today", "0");
  eq(describeSpan(1), "1 day", "1");
  eq(describeSpan(30), "30 days", "30");
  eq(describeSpan(183), "6 months", "183");
  eq(describeSpan(365), "12 months", "365");
  eq(describeSpan(800), "2 years 2 months", "800");
});

t("the freshness line says which state it is in", () => {
  const meta = { date: "2026-03-04", reviewEvery: "6 months" };
  eq(freshness(meta, "2026-06-04").text,
    "Dated 4 March 2026 · 3 months old · reviewed every 6 months · next due 4 September 2026", "fresh");
  eq(freshness(meta, "2027-03-04").lead, "Overdue for review", "stale lead");
  ok(/a review was due 4 September 2026/.test(freshness(meta, "2027-03-04").body), "stale body");
  eq(freshness({ date: "2026-03-04" }, "2026-06-04").text,
    "Dated 4 March 2026 · 3 months old", "a date with no interval still shows its age");
});

t("the rendered page states the date, never a computed age", () => {
  const d = DATED({ reviewEvery: "6 months" });
  const html = renderDocBody(build(d));
  ok(html.includes('class="doc-fresh"'), "element present");
  ok(html.includes('data-date="2026-03-04"'), "carries the date for read-time arithmetic");
  ok(html.includes('data-review-every="6 months"'), "carries the interval");
  ok(html.includes("Dated 4 March 2026 · reviewed every 6 months"), "static line, readable without script");
  ok(!/months old|Overdue for review|review due/.test(html), "no age is baked into the build");
});

t("an interval the validator rejected never reaches the markup", () => {
  const html = renderDocBody(build(DATED({ reviewEvery: "biannual" })));
  ok(!/data-review-every/.test(html), "unparseable interval is not emitted");
  ok(html.includes("Dated 4 March 2026"), "the date still renders");
});

t("the freshness line is page chrome, not a canvas channel", () => {
  const b = build(DATED({ reviewEvery: "6 months" }));
  const html = renderDocBody(b);
  const head = html.slice(0, html.indexOf("<main"));
  ok(head.includes("doc-fresh"), "it lives in the document header, beside the caveat");
  ok(!renderDiagram(b.workflows[0]).svg.includes("doc-fresh"), "and nothing of it is drawn on the sheet");
});

/* ========================================================= round trip */

t("a generated page carries the document that made it", () => {
  const doc = DATED({ reviewEvery: "6 months" });
  const html = renderPage(build(doc), { css: "", js: "", runtime: "", prompt: "p", starter: "{}" });
  const m = /<script type="application\/json" id="wfd-source">([\s\S]*?)<\/script>/.exec(html);
  ok(m, "wfd-source payload present");
  const back = JSON.parse(m[1].replace(/\\u003c/g, "<"));
  eq(JSON.stringify(back), JSON.stringify(doc), "the source round-trips unchanged");
  eq(build(back).errors.length, 0, "and rebuilds clean");
});

t("a rebuild does not move meta.date", () => {
  const doc = DATED({ reviewEvery: "6 months" });
  const html = renderPage(build(doc), { css: "", js: "", runtime: "", prompt: "p", starter: "{}" });
  const m = /<script type="application\/json" id="wfd-source">([\s\S]*?)<\/script>/.exec(html);
  eq(JSON.parse(m[1].replace(/\\u003c/g, "<")).meta.date, "2026-03-04",
    "the date is the author's assertion, not the build's");
});

t("the library page carries each example separately, and no single source", () => {
  const doc = DATED();
  const entries = [{ id: "one", doc, build: build(doc), preview: "<svg></svg>" }];
  const html = renderLibraryPage(entries, { css: "", js: "", runtime: "", prompt: "p", starter: "{}" });
  ok(/<script type="application\/json" id="wfd-source">\{\}<\/script>/.test(html),
    "the index itself has no one document to be the source");
  const m = /<script type="application\/json" class="wfd-doc" data-doc="one">([\s\S]*?)<\/script>/.exec(html);
  ok(m, "the example is embedded under its own id");
  eq(JSON.stringify(JSON.parse(m[1].replace(/\\u003c/g, "<"))), JSON.stringify(doc), "and round-trips");
  ok(/id="build-source"/.test(html), "the builder offers the round-trip button");
  ok(/id="build-source" hidden/.test(html), "hidden until a document is open");
});

/* ================================================ verification state (D3) */
/* D3: a model-written document renders with the same authority whether or not
   anyone has checked it, so steps carry a review state and the canvas draws it.
   Four things can break independently — the default, the validator, the channel
   it is drawn in, and the promise that the drawing does not move. */

const VDOC = (v) => ({
  wfd: 1, title: "T", description: "d",
  workflows: [{
    id: "w", title: "W", description: "d", lens: "generic",
    start: { label: "s" },
    steps: [
      { id: "a", type: "action", title: "A", ...(v === undefined ? {} : { verification: v }) },
      { id: "b", type: "action", title: "B" },
    ],
    end: { label: "e" },
  }],
});

t("a step that says nothing about review is unverified", () => {
  const b = build(VDOC(undefined));
  eq(b.errors.length, 0, "errors: " + JSON.stringify(b.errors));
  const steps = b.workflows[0].nodes.filter((n) => n.kind === "step");
  for (const n of steps) eq(n.verification, "unverified", `step ${n.id}`);
});

t("the shipped examples assert no review state, so every step is unverified", () => {
  for (const f of readdirSync(join(ROOT, "src", "examples"))) {
    if (!f.endsWith(".wfd.json")) continue;
    const raw = readFileSync(join(ROOT, "src", "examples", f), "utf8");
    ok(!/"verification"\s*:/.test(raw), `${f} already carries a verification field`);
    const b = build(JSON.parse(raw));
    eq(b.errors.length, 0, `${f}: ` + JSON.stringify(b.errors));
    const c = reviewCounts(b.workflows);
    ok(c.total > 0, `${f} has no steps`);
    eq(c.verified, 0, `${f} verified`);
    eq(c.disputed, 0, `${f} disputed`);
    eq(c.unverified, c.total, `${f} unverified`);
  }
});

t("the three states are accepted and nothing else is", () => {
  for (const v of ["unverified", "verified", "disputed"]) {
    eq(build(VDOC(v)).errors.length, 0, `${v} should be legal`);
  }
});

t("an unknown verification is an error that names the field", () => {
  const errs = build(VDOC("checked")).errors;
  const e = errs.find((x) => /\.verification$/.test(x.path));
  ok(e, "should name workflows[0].steps[0].verification, got " + JSON.stringify(errs));
  ok(/unknown verification "checked"/.test(e.message), "says what was wrong: " + e.message);
  for (const v of ["unverified", "verified", "disputed"]) {
    ok(e.hint.includes(v), `the hint lists ${v}`);
  }
});

t("a truthy-looking non-string verification is still rejected", () => {
  const d = VDOC(undefined);
  d.workflows[0].steps[0].verification = true;
  ok(build(d).errors.some((x) => /\.verification$/.test(x.path)), "true is not a state");
});

t("the state is drawn as a class on the step, and only on steps", () => {
  const b = build(VDOC("verified"));
  const { svg } = renderDiagram(b.workflows[0]);
  ok(/class="[^"]*\bk-step\b[^"]*\bv-verified\b/.test(svg), "the marked step carries v-verified");
  ok(/\bv-unverified\b/.test(svg), "and its unmarked neighbour carries v-unverified");
  // terminals and navigation chips assert nothing; marking them would be noise
  for (const m of svg.match(/<g class="[^"]*"/g) || []) {
    if (/\bv-(un)?verified\b|\bv-disputed\b/.test(m)) ok(/\bk-step\b/.test(m), `non-step marked: ${m}`);
  }
});

t("the state is spoken, because border weight is not", () => {
  const b = build(VDOC("disputed"));
  const { svg } = renderDiagram(b.workflows[0]);
  ok(/aria-label="Step 1: A, disputed by a reviewer"/.test(svg), "disputed is announced");
  ok(/aria-label="Step 2: B, not verified"/.test(svg), "and so is the default");
});

t("confidence does not move a single box", () => {
  // The no-crossing guarantee and the whole geometric checklist rest on the box
  // positions. Border weight was chosen precisely because it cannot move them,
  // and this is the assertion that keeps it that way.
  const geom = (v) => build(VDOC(v)).workflows[0].nodes
    .map((n) => [n.uid, n.x, n.y, n.w, n.h].join(",")).join("|");
  const base = geom(undefined);
  for (const v of ["unverified", "verified", "disputed"]) {
    eq(geom(v), base, `${v} moved the geometry`);
  }
  const edges = (v) => JSON.stringify(build(VDOC(v)).workflows[0].edges.map((e) => e.pts));
  eq(edges("verified"), edges(undefined), "and no line moved either");
});

t("the progress signal is page chrome, never the canvas", () => {
  const b = build(VDOC("verified"));
  const html = renderDocBody(b);
  const head = html.slice(0, html.indexOf("<main"));
  ok(head.includes("doc-review"), "the document's review state sits with the caveat");
  ok(/<b data-review-verified>1<\/b> of <b>2<\/b> steps verified/.test(head), "and counts honestly");
  const drawn = renderDiagram(b.workflows[0]).svg;
  ok(!/doc-review|dr-bar|dr-count|lg-review|steps verified/.test(drawn),
    "nothing of it is drawn on the sheet — the canvas has no channel left to spend on it");
});

t("an untouched document says so in as many words", () => {
  const head = renderDocBody(build(VDOC(undefined)));
  ok(/No step in this document has been checked by a human/.test(head),
    "the default state is stated, not left to be inferred from the outlines");
});

t("the legend explains only the weights the sheet actually draws", () => {
  // The rule is unchanged; where it is enforced moved. Both swatches are now
  // emitted and the undrawn one is hidden, because marking a step changes what
  // the sheet draws and a legend decided at build time went stale the instant
  // anyone reviewed anything. So the assertion is about VISIBILITY, and it has
  // to be — a build-time-only check would pass on a legend that lies as soon as
  // it is used. app.js repaints these in paintProgress; the test below pins
  // that it still does.
  const shown = (html, hook) => {
    const re = new RegExp(`<span class="lg-conf" data-conf-${hook}((?: hidden)?)>`);
    const m = re.exec(html);
    ok(m, `the ${hook} swatch is rendered`);
    return m[1] !== " hidden";
  };
  const none = renderDocBody(build(VDOC(undefined)));
  ok(shown(none, "thin"), "an untouched sheet explains the light outline");
  ok(!shown(none, "solid"), "and does not explain a weight it never draws");
  const some = renderDocBody(build(VDOC("verified")));
  ok(shown(some, "solid"), "a partly-reviewed sheet explains both");
});

t("the legend's weight swatches are repainted as marks change", () => {
  // Without this the legend is correct exactly once, at build time — which is
  // the defect: three counters in one document disagreed and this was the one
  // that went stale.
  const app = readFileSync(join(ROOT, "src", "assets", "app.js"), "utf8");
  const at = app.indexOf("function paintProgress()");
  ok(at > -1, "paintProgress exists");
  const body = app.slice(at, app.indexOf("\n  function ", at + 10));
  ok(/data-conf-thin/.test(body) && /data-conf-solid/.test(body),
    "paintProgress repaints both weight swatches");
});

t("counts never include a diagram nobody is reviewing", () => {
  // The landing page's hero is a real rendered sheet outside any .canvas.
  // Counting its steps inflated every tally on that page.
  const app = readFileSync(join(ROOT, "src", "assets", "app.js"), "utf8");
  const m = /function steps\(root\) \{ return \$\$\("([^"]+)"/.exec(app);
  ok(m, "steps() selects the nodes it counts");
  ok(/^\.canvas /.test(m[1]), `steps() is scoped to a canvas, got "${m[1]}"`);
});

t("confidence spends no channel but border weight", () => {
  const css = readFileSync(join(ROOT, "src", "assets", "theme.css"), "utf8");
  const rules = (css.match(/^\.wf-node\.v-[a-z-]+(?:,\s*\.wf-node\.v-[a-z-]+)*\s*\{[^}]*\}/gm) || []);
  ok(rules.length >= 2, "the states are styled at all");
  for (const r of rules) {
    const body = r.slice(r.indexOf("{") + 1, -1);
    for (const decl of body.split(";")) {
      if (!decl.trim()) continue;
      ok(/^\s*--conf\s*:/.test(decl),
        `confidence must ride on border weight alone, found "${decl.trim()}" — ` +
        "hue is severity, dashes are reference chips, opacity is interaction state " +
        "and the in-box chip belongs to actors (see the channel budget)");
    }
  }
  ok(!/\.wf-node\.v-[a-z-]+[^{]*\{[^}]*stroke-dasharray/.test(css), "no dashes: they mean reference chip");
});

t("a disputed step is distinguishable on the sheet", () => {
  // The finding this fixes: "Needs work" and "nobody has looked at this" drew
  // identically, so the one judgement that should stop a colleague was invisible.
  const drawn = renderDiagram(build(VDOC("disputed")).workflows[0]).svg;
  ok(/wf-flag/.test(drawn), "a disputed step carries a flag");
  const clean = renderDiagram(build(VDOC("verified")).workflows[0]).svg;
  ok(!/wf-flag/.test(clean), "a verified step does not");
  const none = renderDiagram(build(VDOC(undefined)).workflows[0]).svg;
  ok(!/wf-flag/.test(none), "and neither does an unreviewed one — a mark on every step is decoration");
});

t("the dispute flag is a shape, not only a colour", () => {
  // It has to survive greyscale and print, where a hue-only cue says nothing.
  const drawn = renderDiagram(build(VDOC("disputed")).workflows[0]).svg;
  ok(/wf-flag-cloth/.test(drawn) && /wf-flag-mast/.test(drawn),
    "drawn from geometry, so it reads without colour");
});

t("the legend is printed before the sheet it decodes", () => {
  // A phone reader's whole journey survived on the legend line — and it used to
  // print BELOW the canvas, after the render that would make her bounce.
  const html = renderDocBody(build(MINIMAL()), {});
  const lg = html.indexOf('class="legend"');
  const cv = html.indexOf('class="canvas"');
  ok(lg > -1 && cv > -1, "both are rendered");
  ok(lg < cv, "the key comes before the thing it unlocks");
});

t("the legibility floor is derived from the title size the sheet actually draws", () => {
  // fit() stops at LEGIBLE_PX / TITLE_PX. If someone restyles .wf-title and
  // forgets the constant, the floor silently starts fitting to a smudge again —
  // the exact defect it was added to fix, reintroduced by a stylesheet edit.
  const app = readFileSync(join(ROOT, "src", "assets", "app.js"), "utf8");
  const css = readFileSync(join(ROOT, "src", "assets", "theme.css"), "utf8");
  const declared = /var TITLE_PX = (\d+(?:\.\d+)?);/.exec(app);
  ok(declared, "app.js declares the title size it reasons about");
  const block = /\.wf-title\s*\{[^}]*\}/.exec(css);
  ok(block, "theme.css styles .wf-title");
  const actual = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(block[0]);
  ok(actual, ".wf-title states a px font-size");
  eq(+declared[1], +actual[1],
    "app.js's TITLE_PX must match .wf-title's font-size, or the floor is wrong");
});

t("a detail field of the wrong shape is named, not silently dropped", () => {
  // The failure: "procedure": "do the thing" is discarded by the panel's
  // Array.isArray guard, and the build still says zero problems — so a green
  // build told the author their material was fine when it had vanished.
  const d = MINIMAL();
  d.workflows[0].steps[0].detail = { purpose: "why", procedure: "do the thing" };
  const b = build(d);
  eq(b.errors.length, 0, "still renderable, so not an error");
  const w = b.warnings.find((x) => /detail\.procedure/.test(x.path));
  ok(w, "the dropped field is named: " + JSON.stringify(b.warnings));
  ok(/will not be rendered/.test(w.message), "and says what happens to it");
  ok(/\["do the thing"\]/.test(w.hint || ""), "and shows the shape that works");
});

t("prose fields written as lists are named too", () => {
  const d = MINIMAL();
  d.workflows[0].steps[0].detail = { purpose: ["why", "because"] };
  const b = build(d);
  ok(b.warnings.some((x) => /detail\.purpose/.test(x.path)), "a list where prose is expected");
});

t("well-shaped detail produces no shape warnings", () => {
  const d = MINIMAL();
  d.workflows[0].steps[0].detail = { purpose: "why", procedure: ["a", "b"], rules: ["r"] };
  const b = build(d);
  ok(!b.warnings.some((x) => /detail\./.test(x.path)), "nothing to say about correct input");
});

t("the builder strips review claims from a pasted document", () => {
  // The forgery this closes: doctor a document, forge "verified" marks and a
  // reviewedBy, press Build, and get a page asserting a human checked it.
  // Enforced structurally the way the one-write rule is — the builder path must
  // call the stripper before it builds anything.
  const app = readFileSync(join(ROOT, "src", "assets", "app.js"), "utf8");
  const at = app.indexOf("function renderFromInput()");
  ok(at > -1, "the builder path exists");
  const body = app.slice(at, app.indexOf("\n  }", app.indexOf("buildDocument(doc)", at)));
  ok(/stripReviewClaims\(doc\)/.test(body),
    "renderFromInput strips review claims before it builds");
  const strip = app.indexOf("function stripReviewClaims(");
  ok(strip > -1, "the stripper exists");
  const sbody = app.slice(strip, app.indexOf("\n  }", strip));
  ok(/delete doc\.meta\.review/.test(sbody), "it drops the review record");
  ok(/delete st\.verification/.test(sbody), "and every per-step mark");
  ok(app.indexOf("stripReviewClaims") < app.indexOf("function publishReview"),
    "the stripper is defined before the publish path that must NOT use it");
  const pat = app.indexOf("function publishReview(");
  const pbody = app.slice(pat, app.indexOf("\n  }", app.indexOf("saveFile(html", pat)));
  ok(!/stripReviewClaims/.test(pbody),
    "publishing your OWN marks must not strip them — that is the sanctioned path");
});

t("the modal's scrolling pane can actually shrink", () => {
  // The highest-frequency finding in the run. .modal-panel is a flex column, so
  // .modal-body needs min-height:0 to scroll at all — with the default
  // min-height:auto it grows to content height, never scrolls, and every scroll
  // aimed at it falls through to the page behind.
  const css = readFileSync(join(ROOT, "src", "assets", "theme.css"), "utf8");
  const block = /\.modal-body\s*\{[^}]*\}/.exec(css);
  ok(block, ".modal-body is styled");
  ok(/min-height:\s*0/.test(block[0]), "it may shrink below its content, so it scrolls");
  ok(/overflow-y:\s*auto/.test(block[0]), "and it is the scroll container");
  ok(/overscroll-behavior:\s*contain/.test(block[0]),
    "and reaching its end does not hand the next scroll to the page behind");
});

t("a disputed step can carry the reason it was disputed", () => {
  const d = MINIMAL();
  d.workflows[0].steps[0].verification = "disputed";
  d.workflows[0].steps[0].verificationNote = "The command here is for the old cluster.";
  const b = build(d);
  eq(b.errors.length, 0, "builds: " + JSON.stringify(b.errors));
  const html = renderDocBody(b, {});
  ok(/Marked as needing work/.test(html), "the panel says a reviewer stopped this step");
  ok(/old cluster/.test(html), "and shows the reason they gave");
});

t("a reason on a step nobody disputed is a warning, not silence", () => {
  const d = MINIMAL();
  d.workflows[0].steps[0].verificationNote = "why";
  const b = build(d);
  ok(b.warnings.some((x) => /verificationNote/.test(x.path)),
    "a note nothing will show is called out: " + JSON.stringify(b.warnings));
});

t("a non-string dispute reason is a build error", () => {
  const d = MINIMAL();
  d.workflows[0].steps[0].verification = "disputed";
  d.workflows[0].steps[0].verificationNote = ["a", "b"];
  const b = build(d);
  ok(b.errors.some((x) => /verificationNote/.test(x.path)), "rejected");
});

t("review mode is visible on the sheet, not only in the panel", () => {
  const css = readFileSync(join(ROOT, "src", "assets", "theme.css"), "utf8");
  ok(/body\.is-reviewing\s+\.canvas\s*\{/.test(css),
    "entering review changes the sheet's own frame");
  // And it must not do that by spending a channel the drawing needs.
  const block = /body\.is-reviewing\s+\.canvas\s*\{[^}]*\}/.exec(css)[0];
  ok(!/stroke|dasharray|opacity/.test(block),
    "the cue dresses the frame, it does not repaint the diagram");
});

t("every shortcut the panel advertises is handled somewhere", () => {
  // It advertised Esc as "close" and then ignored it while the panel itself was
  // open — the one state a reader is guaranteed to press it in.
  const app = readFileSync(join(ROOT, "src", "assets", "app.js"), "utf8");
  const html = renderPage(build(MINIMAL()), { css: "", js: "", runtime: "", prompt: "", starter: "{}", source: "{}" });
  const panel = /<div id="shortcuts"[\s\S]*?<\/div>\s*<\/div>/.exec(html);
  ok(panel, "the panel is rendered");
  for (const k of ['"Escape"', '"Enter"', '"ArrowLeft"', '"ArrowRight"', '"ArrowUp"', '"ArrowDown"', '"Tab"', '"?"']) {
    ok(app.includes("e.key === " + k), `the page handles ${k}, which the panel promises`);
  }
  // and Escape must reach the panel itself, not only modals and full screen
  ok(/#shortcuts[\s\S]{0,220}setAttribute\("hidden"/.test(app),
    "Escape closes the shortcuts panel");
});

t("the index states currency and review, not only size", () => {
  // Re-grounded finding: the list said sheets and steps — size — and nothing
  // about how old a document is or how much of it anyone has checked, which is
  // what a list of documents is actually read for.
  const docs = ["starter", "workflow-builder"].map((id) => {
    const doc = JSON.parse(readFileSync(join(ROOT, "src", "examples", id + ".wfd.json"), "utf8"));
    const b = build(doc);
    return { id, doc, build: b, preview: "" };
  });
  const html = renderLibraryPage(docs, { site: { title: "t" }, css: "", js: "", runtime: "", starter: "{}", prompt: "" });
  ok(/card-gov/.test(html), "every card carries a governance row");
  ok(/checked</.test(html), "including how much of it a human has checked");
});

t("a tag cannot impersonate a verification state", () => {
  const d = MINIMAL();
  d.meta = { tags: ["runbook", "verified"] };
  const b = build(d);
  const e = b.errors.find((x) => /meta\.tags/.test(x.path));
  ok(e, "rejected: " + JSON.stringify(b.errors));
  ok(/may not be used as a tag/.test(e.message), "and says why");
  ok(b.errors.length === 1, "the innocent tag beside it is untouched");
});

t("ordinary tags still build", () => {
  const d = MINIMAL();
  d.meta = { tags: ["runbook", "ops"] };
  eq(build(d).errors.length, 0, "nothing reserved about these");
});

t("the hosted library page carries a social card", () => {
  const docs = [{ id: "starter", doc: JSON.parse(readFileSync(join(ROOT, "src", "examples", "starter.wfd.json"), "utf8")), build: null, preview: "" }];
  docs[0].build = build(docs[0].doc);
  const html = renderLibraryPage(docs, {
    site: { title: "T", subtitle: "S" }, css: "", js: "", runtime: "", starter: "{}", prompt: "",
    social: { url: "https://example.test/", image: "https://example.test/social-card.png" },
  });
  const head = html.slice(0, html.indexOf("</head>"));
  ok(/og:image"\s+content="https:\/\/example\.test\/social-card\.png"/.test(head), "names the image");
  ok(/og:image:width"\s+content="1200"/.test(head), "and its size, which several scrapers require");
  ok(/twitter:card"\s+content="summary_large_image"/.test(head), "asks for the large card");
  ok(/og:url"\s+content="https:\/\/example\.test\/"/.test(head), "and states the canonical url");
});

t("a generated page never claims someone else's social card", () => {
  // A generated file gets mailed around and hosted anywhere. Stamping it with an
  // absolute og:image would put this project's card on another person's document
  // at a URL their copy has nothing to do with.
  const html = renderPage(build(MINIMAL()), { css: "", js: "", runtime: "", prompt: "", starter: "{}", source: "{}" });
  const head = html.slice(0, html.indexOf("</head>"));
  ok(!/og:image/.test(head), "no image");
  ok(!/og:url/.test(head), "no canonical url");
  ok(/og:title/.test(head), "but it still says what it is");
  ok(/twitter:card"\s+content="summary"/.test(head), "as a small card, which needs no host");
});

t("nothing automatic can mark a step verified", () => {
  // The human-act rule from D3, and D4's refusal to move meta.date on a rebuild,
  // are the same rule. Enforced structurally: there is exactly one write to the
  // mark table in the whole interaction layer, and it lives in `mark()`.
  const app = readFileSync(join(ROOT, "src", "assets", "app.js"), "utf8");
  const writes = app.match(/\bmarks\s*\[[^\]]*\]\s*=[^=]/g) || [];
  eq(writes.length, 1, "exactly one place may write a verification state, found " + writes.length);
  const at = app.indexOf("function mark(node, state)");
  ok(at > -1, "mark() is the one that does it");
  const body = app.slice(at, app.indexOf("\n  }", at));
  ok(/\bmarks\[key\] = state;/.test(body), "and the write is inside it");
  // and it is only ever reached from something a human pressed
  const callers = app.match(/[\w$]*\bmark\(/g) || [];
  for (const c of callers) {
    ok(/^(function |markCurrent\(node, state\)|!mark\(|mark\()/.test(c) || /mark\($/.test(c),
      "unexpected caller shape: " + c);
  }
  ok(!/setInterval[\s\S]{0,200}mark\(/.test(app), "no timer marks anything");
});

t("hiding a button by attribute actually hides it", () => {
  // `.btn { display: inline-flex }` outranks the user-agent sheet's `[hidden]`,
  // so every button hidden by attribute was still drawn — D4's round-trip
  // button on the index page, and all three review controls. Found while
  // screenshotting D3; the fix is one rule, and this keeps it.
  const css = readFileSync(join(ROOT, "src", "assets", "theme.css"), "utf8");
  ok(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css),
    "a global [hidden] rule must outrank the display a class sets");
});

t("the marking controls are in the modal, so the chip stays free for D5", () => {
  const html = renderPage(build(VDOC(undefined)), { css: "", js: "", runtime: "", prompt: "p", starter: "{}" });
  ok(/id="modal-review"/.test(html), "the footer exists");
  ok(/data-mark="verified"/.test(html) && /data-mark="disputed"/.test(html) &&
     /data-mark="unverified"/.test(html), "all three states are offered");
  ok(/id="modal-review" hidden/.test(html), "and it is out of the way until review mode is on");
  const app = readFileSync(join(ROOT, "src", "assets", "app.js"), "utf8");
  for (const id of ["modal-review", "review-toggle", "review-export", "review-clear", "review-dirty"]) {
    ok(app.includes(id), `nothing listens to #${id}`);
  }
});

t("marks fold into the page's own document, rather than a second export path", () => {
  const app = readFileSync(join(ROOT, "src", "assets", "app.js"), "utf8");
  ok(/function currentSource\(\)\s*\{\s*return applyMarks\(baseSource\(\)\);/.test(app),
    "D4's round trip and D3's export hand out the same document");
  ok(/saveFile\(JSON\.stringify\(doc, null, 2\)/.test(app), "the export reuses D4's saver");
  ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(app), "and nothing leaves the machine");
});

t("a citation may exist without a link, which is why it is not a link", () => {
  const d = VDOC(undefined);
  d.workflows[0].steps[0].detail = {
    purpose: "p",
    sources: [{ label: "8 CFR 316.2(a)", note: "residence requirement" },
              { label: "Fee schedule", href: "https://example.test/fees" }],
    links: [{ label: "Further reading", href: "https://example.test/more" }],
  };
  const b = build(d);
  const html = renderDetail(b.workflows[0].nodes.find((n) => n.id === "a"), b.workflows[0], d);
  ok(/rail-src/.test(html), "sources render");
  ok(/8 CFR 316\.2\(a\)/.test(html), "including the one with no href");
  ok(html.indexOf("Sources") < html.indexOf("Links"), "and they come before further reading");
  ok(/<a href="https:\/\/example\.test\/fees"/.test(html), "an href is used when there is one");
});

/* ================================================== no clock at build time */

t("no build-time module asks what day it is", () => {
  const files = [
    "fresh.mjs", "layout.mjs", "page.mjs", "svg.mjs", "detail.mjs", "text.mjs", "md.mjs",
    ...readdirSync(join(ROOT, "src", "build")).filter((f) => f.endsWith(".mjs")).map((f) => join("build", f)),
  ];
  for (const f of files) {
    const src = readFileSync(join(ROOT, "src", f), "utf8");
    const hit = /new Date\b|Date\.now\b|Date\.UTC\b|toISOString\b|performance\.now\b/.exec(src);
    ok(!hit, `${f} reads a clock (${hit && hit[0]}) — the build would stop being byte-identical`);
  }
});

/* ==================================================== severity glyphs */
/* D1: severity must survive greyscale, so the branch label carries a mark as
   well as a hue. Three things can break independently — the mapping, the width
   table that reserves room for the mark, and the legend that explains it. */

const GLYPH_DOC = () => ({
  wfd: 1, title: "T", description: "d",
  workflows: [{
    id: "w", title: "W", description: "d", lens: "generic",
    start: { label: "s" },
    steps: [{
      id: "q", type: "question", title: "Ok?", branches: [
        { label: "Plain", tone: "neutral", steps: [{ id: "n1", type: "action", title: "N" }], exit: { type: "continue" } },
        { label: "Noted", tone: "info", steps: [{ id: "i1", type: "action", title: "I" }], exit: { type: "continue" } },
        { label: "Careful", tone: "warn", steps: [{ id: "w1", type: "action", title: "W" }], exit: { type: "continue" } },
        { label: "Broke", tone: "error", steps: [{ id: "e1", type: "action", title: "E" }], exit: { type: "continue" } },
        { label: "Fine", tone: "success", steps: [{ id: "g1", type: "action", title: "G" }], exit: { type: "continue" } },
      ],
    }],
    end: { label: "e", tone: "success" },
  }],
});

t("every tone but neutral prefixes its label with a glyph", () => {
  eq(labelWithTone("Declined", "neutral"), "Declined", "neutral");
  eq(labelWithTone("Declined", "info"), "\u24D8 Declined", "info");
  eq(labelWithTone("Declined", "warn"), "\u25B2 Declined", "warn");
  eq(labelWithTone("Declined", "error"), "\u2717 Declined", "error");
  eq(labelWithTone("Declined", "success"), "\u2713 Declined", "success");
  eq(TONE_GLYPH.neutral, "", "neutral draws nothing");
  eq(labelWithTone("Declined", undefined), "Declined", "no tone is neutral");
  // an alias must not lose its glyph on the way through
  eq(labelWithTone("Declined", "failure"), "\u2717 Declined", "failure aliases to error");
});

t("no two tones share a glyph, and none collides with a chip arrow", () => {
  const marks = Object.entries(TONE_GLYPH).filter(([, g]) => g).map(([, g]) => g);
  eq(new Set(marks).size, marks.length, "duplicate severity glyph");
  // D2 spent these three on destinations; severity may not spend them again.
  for (const arrow of ["\u21A9", "\u2192", "\u2197"]) {
    ok(!marks.includes(arrow), `severity reuses the chip arrow ${escape(arrow)}`);
  }
});

t("every severity glyph has a real advance, not the fallback", () => {
  // The fallback is 0.556em. Every one of these is wider than that, so a glyph
  // that falls through the table reserves too little room and collides with
  // whatever sits to its right. A wrong advance is a geometry bug.
  for (const [tone, g] of Object.entries(TONE_GLYPH)) {
    if (!g) continue;
    eq([...g].length, 1, `${tone} glyph must be a single code point`);
    ok(charEm(g) !== 0.556, `${tone} glyph ${escape(g)} has no advance of its own`);
    ok(charEm(g) > 0.6 && charEm(g) < 1.05, `${tone} glyph advance out of range`);
  }
});

t("the glyph is spoken as a word and never announced raw", () => {
  const b = build(GLYPH_DOC());
  eq(b.errors.length, 0, "errors: " + JSON.stringify(b.errors));
  const svg = renderDiagram(b.workflows[0]).svg;
  for (const [tone, word] of Object.entries(TONE_SPOKEN)) {
    if (!word) continue;
    ok(svg.includes(`aria-label="Variation, ${word}: `), `no spoken "${word}" label`);
  }
  ok(svg.includes(`aria-label="Variation: Plain"`), "neutral keeps the plain announcement");
  for (const [, g] of Object.entries(TONE_GLYPH)) {
    if (!g) continue;
    ok(!new RegExp(`aria-label="[^"]*${g}`).test(svg), `glyph ${escape(g)} leaked into an announcement`);
  }
});

t("the width reserved for a label is the width of the label as drawn", () => {
  // The failure this guards: decorating in the renderer only. The drawn string
  // would then be wider than the space layout reserved, and the overlap would
  // be silent.
  const b = build(GLYPH_DOC());
  const wfv = b.workflows[0];
  let seen = 0;
  for (const e of wfv.edges) {
    if (!e.labelAt || !e.label) continue;
    seen++;
    eq(e.labelText, labelWithTone(e.label, e.tone), `labelText for "${e.label}"`);
    eq(Math.round(e.labelW * 1000),
      Math.round((measure(e.labelText, wfv.D.LABEL_SIZE, true) + 16) * 1000),
      `labelW for "${e.label}" was not measured from the drawn string`);
  }
  eq(seen, 5, "expected five labelled branches");
});

/* ========================================================= actors ==== */
/*
 * D5. The registry is most of the work: `detail.actor` is prose and prose
 * cannot be grouped on, so identity moved to a document-level `actors` list and
 * steps reference it by `actorId`.
 */

const ACTOR_DOC = (over) => ({
  wfd: 1, title: "T", description: "d",
  actors: [
    { id: "shopper", name: "Shopper", short: "SH" },
    { id: "payments", name: "Payment service", short: "PAY" },
  ],
  workflows: [{
    id: "w", title: "W", description: "d", lens: "generic",
    start: { label: "s" },
    steps: [
      { id: "a", type: "action", title: "Enter the card", actorId: "shopper" },
      { id: "b", type: "action", title: "Authorise the card", actorId: "payments" },
      { id: "c", type: "action", title: "Show the receipt", actorId: "shopper" },
    ],
    end: { label: "e" },
  }],
  ...over,
});

t("a step references an actor by id and gets the whole record", () => {
  const b = build(ACTOR_DOC());
  eq(b.errors.length, 0, "errors: " + JSON.stringify(b.errors));
  const steps = b.workflows[0].nodes.filter((n) => n.kind === "step");
  eq(steps[0].actor.id, "shopper", "first step's actor");
  eq(steps[0].actor.short, "SH", "first step's chip");
  eq(steps[0].actor.name, "Shopper", "first step's name");
  eq(steps[1].actor.id, "payments", "second step's actor");
});

t("an unknown actor reference is an error naming the field", () => {
  const doc = ACTOR_DOC();
  doc.workflows[0].steps[1].actorId = "nobody";
  const b = build(doc);
  const e = b.errors.find((x) => /actorId/.test(x.path));
  ok(e, "no error naming actorId: " + JSON.stringify(b.errors));
  eq(e.path, "workflows[0].steps[1].actorId", "the path names the step and the field");
  ok(/unknown actor "nobody"/.test(e.message), "the message names the id");
  ok(/shopper, payments/.test(e.hint || ""), "the hint lists the ids that do exist");
});

t("an actorId with no registry at all says how to make one", () => {
  const doc = ACTOR_DOC();
  delete doc.actors;
  const b = build(doc);
  const e = b.errors.find((x) => /actorId/.test(x.path));
  ok(e, "no error");
  ok(/"actors": \[/.test(e.hint || ""), "the hint shows the registry to add");
});

t("free-text detail.actor is untouched and never grouped on", () => {
  // Backward compatibility is the whole reason the reference is a new field.
  // A document written before D5 keeps building, and its prose keeps rendering.
  const doc = ACTOR_DOC();
  doc.workflows[0].steps[0].detail = { actor: "Shopper, with a pre-filled suggestion" };
  delete doc.workflows[0].steps[0].actorId;
  const b = build(doc);
  eq(b.errors.length, 0, "prose alone must not be an error: " + JSON.stringify(b.errors));
  const n = b.workflows[0].nodes.filter((x) => x.kind === "step")[0];
  eq(n.actor, null, "prose must never be promoted to an identity");
  ok(renderDetail(n, b.workflows[0], doc).includes("Shopper, with a pre-filled suggestion"),
    "the modal still carries the prose");
});

t("short is validated, capped and derived", () => {
  eq(deriveShort("Payment service"), "PS", "initials of two words");
  eq(deriveShort("On-call engineer"), "OCE", "a hyphen breaks a word like a space does");
  eq(deriveShort("Shopper"), "SHO", "one word takes its first letters");
  eq(deriveShort("USCIS immigration services officer"), "UIS", "capped at three");
  for (const bad of ["TOOLONG", "S H", "*", "SH!", "четыре"]) {
    const errors = [];
    buildActors({ actors: [{ id: "x", name: "X", short: bad }] }, errors, []);
    ok(errors.some((e) => e.path === "actors[0].short"),
      `short ${JSON.stringify(bad)} should have been rejected`);
  }
  const errors = [];
  const reg = buildActors({ actors: [
    { id: "x", name: "Payment service" },
    { id: "y", name: "Shopper", short: "" },
  ] }, errors, []);
  eq(errors.length, 0, "a missing or empty short is derived, not rejected");
  eq(reg.get("y").short, "SHO", "an empty short derives like an absent one");
  eq(reg.get("x").short, "PS", "derived short");
  eq(ACTOR_SHORT_MAX, 3, "the cap the spec states");
});

t("two actors may not draw the same chip", () => {
  const errors = [];
  buildActors({ actors: [
    { id: "a", name: "Shopper", short: "SH" },
    { id: "b", name: "Shipping", short: "sh" },
  ] }, errors, []);
  const e = errors.find((x) => x.path === "actors[1].short");
  ok(e, "a duplicate chip must be an error");
  ok(/already used by actor "a"/.test(e.message), "it names the other actor");
});

t("more than six actors is a warning, never an error", () => {
  const mk = (n) => ({ actors: Array.from({ length: n }, (_, i) =>
    ({ id: "a" + i, name: "Actor " + i, short: "A" + i })) });
  for (const n of [1, ACTOR_LEGEND_MAX]) {
    const errors = [], warnings = [];
    buildActors(mk(n), errors, warnings);
    eq(warnings.length, 0, `${n} actors must be quiet`);
  }
  const errors = [], warnings = [];
  buildActors(mk(ACTOR_LEGEND_MAX + 1), errors, warnings);
  eq(errors.length, 0, "a real process may have many owners and must still build");
  eq(warnings.length, 1, "one warning");
  eq(warnings[0].path, "actors", "the warning names the registry");
  ok(/legend/.test(warnings[0].message), "and says why the number matters");
});

t("the chip is drawn only on steps, and only where an actor is named", () => {
  const b = build(ACTOR_DOC());
  const wfv = b.workflows[0];
  const svg = renderDiagram(wfv).svg;
  eq((svg.match(/class="wf-actor"/g) || []).length, 3, "one chip per step, none on terminals");
  ok(svg.includes(">SH<") && svg.includes(">PAY<"), "the chips carry the shorts");
  ok(/aria-label="Step 1: Enter the card, Shopper, not verified"/.test(svg),
    "the announcement carries the actor's whole name, not the chip");
});

t("the gutter the chip takes is the gutter layout charged for", () => {
  // The D1 failure, repeated for D5: decorate in the renderer only and the
  // drawn mark is wider than the space reserved for it, silently.
  const b = build(ACTOR_DOC());
  const wfv = b.workflows[0], D = wfv.D;
  for (const n of wfv.nodes) {
    if (n.kind !== "step") { eq(n.actorGutter, 0, "a terminal charges nothing"); continue; }
    eq(Math.round(n.actorGutter * 1000),
      Math.round((D.ACTOR_GAP + measureMono(n.actor.short, D.MONO_SIZE)) * 1000),
      `gutter for "${n.title}"`);
    const inner = n.w - n.inset * 2;
    for (const line of n.titleLines) {
      ok(measure(line, n.titleSize, true) <= inner - n.actorGutter + 0.01,
        `title "${line}" was not wrapped to the width the chip left it`);
    }
  }
});

t("a document with no actors wraps exactly as it did before D5 existed", () => {
  const doc = ACTOR_DOC();
  const withIds = build(doc);
  const plain = ACTOR_DOC();
  delete plain.actors;
  for (const s of plain.workflows[0].steps) delete s.actorId;
  const bare = build(plain);
  eq(bare.errors.length, 0, "errors");
  const geo = (x) => JSON.stringify(x.workflows[0].nodes.map((n) =>
    [n.uid, n.x, n.y, n.w, n.h, n.row, n.col]));
  eq(geo(bare), geo(withIds), "boxes moved or resized because of an actor");
  eq(bare.workflows[0].nodes.every((n) => !n.actorGutter), true, "a bare document charges no gutter");
});

t("a handoff is marked where two consecutive steps change hands", () => {
  const b = build(ACTOR_DOC());
  const wfv = b.workflows[0];
  const marks = wfv.edges.filter((e) => e.handoff);
  eq(marks.length, 2, "two changes of hand in shopper -> payments -> shopper");
  eq(marks[0].handoff.to, "payments", "the mark names the receiving actor");
  eq(marks[0].handoff.short, "PAY", "and draws its chip");
  eq(marks[1].handoff.to, "shopper", "back again");
  const svg = renderDiagram(wfv).svg;
  eq((svg.match(/class="wf-handoff"/g) || []).length, 2, "two marks drawn");
  ok(svg.includes('class="wf-handoffs" aria-hidden="true"'),
    "the marks are hidden from a reader who already hears both actors by name");
});

t("no handoff is marked where nothing changes hands", () => {
  const doc = ACTOR_DOC();
  for (const s of doc.workflows[0].steps) s.actorId = "shopper";
  const b = build(doc);
  eq(b.workflows[0].edges.filter((e) => e.handoff).length, 0, "no marks");
  ok(!renderDiagram(b.workflows[0]).svg.includes("wf-handoff"), "and none drawn");
});

t("a handoff needs two named actors, not one", () => {
  const doc = ACTOR_DOC();
  delete doc.workflows[0].steps[1].actorId;
  const b = build(doc);
  eq(b.workflows[0].edges.filter((e) => e.handoff).length, 0,
    "an unstated actor is not a handoff — it is an unstated actor");
});

/* ======================================================== geometry ==== */

const TERMINAL = new Set(["end", "goback", "goto", "goforward"]);

// Same allowance the layout uses: the width table runs light at marginal-text size.
const MARGIN_SAFETY = 1.18;

function segments(edge) {
  const out = [];
  for (let i = 0; i + 1 < edge.pts.length; i++) {
    out.push([edge.pts[i], edge.pts[i + 1]]);
  }
  return out;
}

function rectsOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Does a horizontal or vertical segment pass through the interior of a box? */
function segHitsNode(p, q, n, tol = 1.5) {
  const L = n.left + tol, R = n.right - tol, T = n.top + tol, B = n.bottom - tol;
  if (R <= L || B <= T) return false;
  if (p.y === q.y) {
    const y = p.y;
    if (y <= T || y >= B) return false;
    const lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
    return lo < R && hi > L;
  }
  if (p.x === q.x) {
    const x = p.x;
    if (x <= L || x >= R) return false;
    const lo = Math.min(p.y, q.y), hi = Math.max(p.y, q.y);
    return lo < B && hi > T;
  }
  return false;
}

function checkWorkflow(wfv, label) {
  const nodes = wfv.nodes;

  // 18. no two icons overlap in screen space
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      ok(!rectsOverlap(nodes[i], nodes[j]),
        `${label}: "${nodes[i].title}" overlaps "${nodes[j].title}"`);
    }
  }

  // 8/9. every edge travels downward; only merges travel left
  for (const e of wfv.edges) {
    const a = nodes[e.from], b = nodes[e.to];
    if (!a || !b) continue;
    ok(b.row > a.row, `${label}: edge ${a.title} -> ${b.title} does not travel downward`);
    if (e.kind === "seq" || e.kind === "fan") {
      ok(b.laneIndex >= a.laneIndex,
        `${label}: ${e.kind} edge ${a.title} -> ${b.title} travels left`);
    }
    if (e.kind === "merge" || e.kind === "bypass") {
      ok(b.laneIndex <= a.laneIndex,
        `${label}: merge ${a.title} -> ${b.title} travels right`);
    }
  }

  // 10 (the part that matters). no segment cuts through a box it does not touch
  for (const e of wfv.edges) {
    const endpoints = new Set([e.from, e.to]);
    for (const [p, q] of segments(e)) {
      for (const n of nodes) {
        if (endpoints.has(n.index)) continue;
        ok(!segHitsNode(p, q, n),
          `${label}: an edge segment cuts through "${n.title}" ` +
          `(${p.x},${p.y})-(${q.x},${q.y}) vs box ${n.left},${n.top},${n.right},${n.bottom}`);
      }
    }
  }

  // 10. NO TWO LINES CROSS. Touching at an endpoint is a junction and is fine;
  //     an intersection interior to both segments is a crossing and is not.
  const hor = [], ver = [];
  for (const e of wfv.edges) {
    for (const [p, q] of segments(e)) {
      if (p.y === q.y && p.x !== q.x) hor.push({ y: p.y, x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), e });
      else if (p.x === q.x && p.y !== q.y) ver.push({ x: p.x, y0: Math.min(p.y, q.y), y1: Math.max(p.y, q.y), e });
    }
  }
  for (const h of hor) {
    for (const v of ver) {
      const crosses = v.x > h.x0 + 0.01 && v.x < h.x1 - 0.01 &&
                      h.y > v.y0 + 0.01 && h.y < v.y1 - 0.01;
      ok(!crosses,
        `${label}: lines cross at (${Math.round(v.x)}, ${Math.round(h.y)}) — ` +
        `horizontal ${Math.round(h.x0)}..${Math.round(h.x1)} of a ${h.e.kind} edge ` +
        `over vertical ${Math.round(v.y0)}..${Math.round(v.y1)} of a ${v.e.kind} edge`);
    }
  }

  // COMMON FATE. Every way the sheet can finish sits on one row, and the
  // branches of a single decision keep the order they were written in.
  const termRows = new Set(nodes.filter((n) => TERMINAL.has(n.kind)).map((n) => n.row));
  ok(termRows.size <= 1,
    `${label}: terminals are scattered across rows [${[...termRows].sort((a, b) => a - b).join(", ")}] — they must share one`);

  const byOwner = new Map();
  for (const lane of wfv.lanes) {
    if (lane.ownerNodeIndex == null) continue;
    if (!byOwner.has(lane.ownerNodeIndex)) byOwner.set(lane.ownerNodeIndex, []);
    byOwner.get(lane.ownerNodeIndex).push(lane);
  }
  for (const sibs of byOwner.values()) {
    const ordered = sibs.slice().sort((a, b) => a.branchOrder - b.branchOrder);
    for (let i = 1; i < ordered.length; i++) {
      ok(ordered[i].col > ordered[i - 1].col,
        `${label}: branch "${ordered[i].label}" is left of "${ordered[i - 1].label}" — ` +
        `sibling order must follow the authored array`);
    }
  }

  // No text may leave its box, whatever the flexing did.
  for (const n of nodes) {
    ok(n.blockH <= n.h - 2, `${label}: text block is taller than the box in "${n.title}"`);
  }

  // TIGHT SIZING. Two box heights on a sheet and only two.
  const TERM_SHAPE = new Set(["start", "end", "goback", "goto", "goforward"]);
  const stepHs = new Set(nodes.filter((n) => !TERM_SHAPE.has(n.kind)).map((n) => n.h));
  const termHs = new Set(nodes.filter((n) => TERM_SHAPE.has(n.kind)).map((n) => n.h));
  ok(stepHs.size <= 1, `${label}: step boxes have ${stepHs.size} different heights [${[...stepHs].join(", ")}]`);
  ok(termHs.size <= 1, `${label}: terminal boxes have ${termHs.size} different heights [${[...termHs].join(", ")}]`);

  // 2/3. the start has no incoming, ends have no outgoing
  const start = nodes.find((n) => n.kind === "start");
  ok(start, `${label}: no start icon`);
  ok(!wfv.edges.some((e) => e.to === start.index), `${label}: start has an incoming line`);
  for (const n of nodes) {
    if (!TERMINAL.has(n.kind)) continue;
    ok(!wfv.edges.some((e) => e.from === n.index),
      `${label}: terminal "${n.title}" has an outgoing line`);
  }

  // 15. every non-terminal node leads somewhere
  for (const n of nodes) {
    if (TERMINAL.has(n.kind)) continue;
    ok(wfv.edges.some((e) => e.from === n.index),
      `${label}: "${n.title}" dead-ends without terminating`);
  }

  // 14. the happy path is one unbroken vertical in lane 0
  const lane0 = nodes.filter((n) => n.laneIndex === 0);
  const xs = new Set(lane0.map((n) => n.cx));
  eq(xs.size, 1, `${label}: lane 0 is not a single skewer (${xs.size} x-positions)`);

  // 16. goback names an earlier icon
  for (const n of nodes) {
    if (n.kind !== "goback" || n.ref.node == null) continue;
    ok(nodes[n.ref.node].row <= n.row, `${label}: goback points forward`);
  }

  // text fits inside its box
  for (const n of nodes) {
    const inner = n.w - n.inset * 2;
    // The title gives up the actor chip's gutter (D5); the note does not,
    // because the chip is not on its rows. Asserting the tighter bound here is
    // the mutation guard: draw the chip without charging layout for it and this
    // is the test that fails.
    const titleInner = inner - (n.actorGutter || 0);
    for (const line of n.titleLines) {
      ok(measure(line, n.titleSize, true) <= titleInner + 0.01,
        `${label}: title line overflows in "${n.title}"`);
    }
    for (const d of n.detailLines) {
      const size = d.cls === "wf-mono" ? wfv.D.MONO_SIZE : wfv.D.NOTE_SIZE;
      const w = d.cls === "wf-mono" ? measureMono(d.t, size) : measure(d.t, size, false);
      ok(w <= inner + 0.01, `${label}: detail line overflows in "${n.title}"`);
    }
  }

  // a note must not run into the next branch label on the same fan line
  const byQ = new Map();
  for (const e of wfv.edges) {
    if (!e.labelAt || !e.label) continue;
    if (!byQ.has(e.from)) byQ.set(e.from, []);
    byQ.get(e.from).push(e);
  }
  for (const group of byQ.values()) {
    const sorted = group.slice().sort((a, b) => a.dropX - b.dropX);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const e = sorted[i], nx = sorted[i + 1];
      if (!e.noteText) continue;
      const end = e.noteX + measure(e.noteText, wfv.D.LABEL_NOTE_SIZE, false) * MARGIN_SAFETY;
      ok(end <= nx.labelX + 0.01,
        `${label}: note for "${e.label}" runs into the next label "${nx.label}"`);
    }
  }

  // marginal text must not run into a box either. The note is clamped to the
  // gap before the next branch drop, before any line running down through it,
  // and before any box on its row — the last of those was missing, and the
  // severity glyph (D1) shifting every note right is what made it visible.
  for (const e of wfv.edges) {
    if (!e.labelAt || !e.label) continue;
    const y = e.labelAt.y - 8;
    // the drawn width, not labelW — the extra 16px in labelW is hit-target
    // padding around the text, not ink
    const spans = [[e.labelX, e.labelX + measure(e.labelText, wfv.D.LABEL_SIZE, true), "label"]];
    if (e.noteText) {
      spans.push([e.noteX, e.noteX + measure(e.noteText, wfv.D.LABEL_NOTE_SIZE, false) * MARGIN_SAFETY, "note"]);
    }
    for (const [x0, x1, what] of spans) {
      for (const n of nodes) {
        if (y + 3 <= n.top || y - 9 >= n.bottom) continue;
        ok(x1 <= n.left + 0.01 || x0 >= n.right - 0.01,
          `${label}: branch ${what} for "${e.label}" runs into the box "${n.title}"`);
      }
    }
  }

  // The actor chip lives inside its own box, clear of that box's own text.
  // Branch labels and their notes are marginal ink; this one is not, and the
  // failure mode is different: it runs into the title it was charged for.
  for (const n of nodes) {
    if (!n.actor) { ok(!n.actorGutter, `${label}: "${n.title}" charges a gutter with no actor`); continue; }
    const D = wfv.D;
    const blockTop = n.y + (n.h - n.blockH) / 2;
    const cw = measureMono(n.actor.short, D.MONO_SIZE);
    const cr = n.x + n.w - n.inset, cl = cr - cw;
    ok(cl > n.left && cr < n.right, `${label}: actor chip escapes the box "${n.title}"`);
    if (n.titleLines.length) {
      const tcx = n.x + n.w / 2 - n.actorGutter / 2;
      const tw = measure(n.titleLines[0], n.titleSize, true);
      ok(tcx + tw / 2 <= cl + 0.01, `${label}: actor chip runs into the title "${n.title}"`);
      ok(tcx - tw / 2 >= n.left + n.inset - 0.01, `${label}: title escapes its box in "${n.title}"`);
    }
    // the chip's row and the note's rows must not be the same rows
    const chipBottom = blockTop + D.TITLE_LH * 0.74 + 2;
    ok(!n.detailLines.length || chipBottom <= blockTop + n.titleH + 4 + 0.01,
      `${label}: actor chip reaches the note rows in "${n.title}"`);
  }

  // Handoff marks (D5) sit in the gap between two boxes, which is where the
  // branch notes go and where the merge bands run. The clamp that keeps notes
  // off boxes is one item old and this must not regress it: a mark that cannot
  // find clear room is dropped, never drawn over something.
  for (const e of wfv.edges) {
    if (!e.handoff) continue;
    const h = e.handoff;
    // Only a straight run between two steps. A fan already carries a branch
    // label and its note in exactly this space; a merge rejoins a step the
    // reader has already met.
    eq(e.kind, "seq", `${label}: a ${e.kind} edge carries a handoff mark`);
    eq(nodes[e.from].kind, "step", `${label}: a handoff leaves a ${nodes[e.from].kind}`);
    eq(nodes[e.to].kind, "step", `${label}: a handoff arrives at a ${nodes[e.to].kind}`);
    eq(h.to, nodes[e.to].actor.id, `${label}: the mark names the wrong actor`);
    ok(h.from !== h.to, `${label}: a mark where nothing changed hands`);
    const box = { left: h.left, right: h.right, top: h.y - 6, bottom: h.y + 6 };
    for (const n of nodes) {
      ok(!rectsOverlap(box, n), `${label}: handoff mark "${h.short}" overlaps the box "${n.title}"`);
    }
    for (const other of wfv.edges) {
      if (other === e) continue;
      if (other.handoff) {
        const o = other.handoff;
        ok(!rectsOverlap(box, { left: o.left, right: o.right, top: o.y - 6, bottom: o.y + 6 }),
          `${label}: two handoff marks overlap near (${Math.round(h.x)}, ${Math.round(h.y)})`);
      }
      for (const [p, q] of segments(other)) {
        ok(!rectsOverlap(box, {
          left: Math.min(p.x, q.x) - 1, right: Math.max(p.x, q.x) + 1,
          top: Math.min(p.y, q.y) - 1, bottom: Math.max(p.y, q.y) + 1,
        }), `${label}: handoff mark "${h.short}" sits on a ${other.kind} line`);
      }
      if (!other.labelAt || !other.label) continue;
      const ly = other.labelAt.y - 8;
      const spans = [[other.labelX, other.labelX + measure(other.labelText, wfv.D.LABEL_SIZE, true)]];
      if (other.noteText) spans.push([other.noteX, other.noteX + measure(other.noteText, wfv.D.LABEL_NOTE_SIZE, false) * MARGIN_SAFETY]);
      for (const [x0, x1] of spans) {
        ok(!rectsOverlap(box, { left: x0, right: x1, top: ly - 10, bottom: ly + 3 }),
          `${label}: handoff mark "${h.short}" overlaps the branch label "${other.label}"`);
      }
    }
    for (const n of nodes) {
      if (!n.primaryLabel) continue;
      const w = measure(n.primaryLabel, 11, true);
      ok(!rectsOverlap(box, { left: n.cx + 8, right: n.cx + 8 + w, top: n.bottom + 7, bottom: n.bottom + 18 }),
        `${label}: handoff mark "${h.short}" overlaps the primary label "${n.primaryLabel}"`);
    }
    ok(box.left >= 0 && box.right <= wfv.width && box.top >= 0 && box.bottom <= wfv.height,
      `${label}: handoff mark "${h.short}" falls outside the canvas`);
  }

  // branch labels and their notes stay inside the canvas too
  for (const e of wfv.edges) {
    if (e.labelX == null) continue;
    ok(e.labelX + e.labelW <= wfv.width + 0.01, `${label}: branch label "${e.label}" overflows the canvas`);
    if (e.noteText) {
      ok(e.noteX + measure(e.noteText, wfv.D.LABEL_NOTE_SIZE, false) * MARGIN_SAFETY <= wfv.width + 0.01,
        `${label}: branch note for "${e.label}" overflows the canvas`);
    }
  }

  // the canvas actually contains everything drawn on it
  for (const n of nodes) {
    ok(n.left >= 0 && n.top >= 0, `${label}: "${n.title}" sits outside the canvas`);
    ok(n.right <= wfv.width && n.bottom <= wfv.height,
      `${label}: "${n.title}" overflows the canvas`);
  }
}

/* -------- run the geometry checks over every example we ship ---------- */

const exDir = join(HERE, "examples");
let examples = [];
try {
  examples = readdirSync(exDir).filter((f) => f.endsWith(".wfd.json"));
} catch { /* no examples yet */ }

for (const file of examples) {
  let doc = null;
  let parseError = null;
  try { doc = JSON.parse(readFileSync(join(exDir, file), "utf8")); }
  catch (e) { parseError = e.message; }

  if (parseError) {
    t(`${file}: parses as JSON`, () => { throw new Error(parseError); });
    continue;
  }

  const b = buildDocument(doc);

  t(`${file}: validates`, () => {
    eq(b.errors.length, 0, "errors:\n  " + b.errors.map((e) => `${e.path} — ${e.message}`).join("\n  "));
  });

  if (b.errors.length) continue;

  // The legend under each sheet is per-sheet and adaptive. The invariant: every
  // glyph drawn on a sheet is explained by that sheet's own legend, and nothing
  // the sheet does not draw is listed. Scope matters — the legend lives inside
  // .wf, so reading the whole document would scoop every sheet at once.
  const body = renderDocBody(b);
  const sheets = body.split('<section class="wf" id="wf-').slice(1);

  t(`${file}: one legend per sheet`, () => {
    eq(sheets.length, b.workflows.length, "sheet count");
    for (const chunk of sheets) {
      eq((chunk.match(/<div class="legend">/g) || []).length, 1, "legends in this sheet");
    }
  });

  b.workflows.forEach((wfv, si) => {
    const chunk = sheets[si] || "";
    const legend = (chunk.match(/<div class="legend">[\s\S]*?<\/div>/) || [""])[0];

    t(`${file}: ${wfv.id} legend explains every glyph it draws`, () => {
      const drawn = new Set();
      for (const e of wfv.edges) {
        if (!e.labelAt || !e.label) continue;
        if (e.tone && e.tone !== "neutral") drawn.add(e.tone);
      }
      for (const [tone, glyph] of Object.entries(TONE_GLYPH)) {
        if (!glyph) continue;
        const listed = (legend.match(new RegExp(glyph, "g")) || []).length;
        if (drawn.has(tone)) {
          eq(listed, 1, `${wfv.id}: legend entries for ${tone}`);
        } else {
          eq(listed, 0, `${wfv.id}: legend lists ${tone}, which this sheet never draws`);
        }
      }
      // and the sheet's own arrows, the other adaptive half, still hold
      for (const [kind, entity] of [["goback", "&#8617;"], ["goforward", "&#8594;"], ["goto", "&#8599;"]]) {
        const has = wfv.nodes.some((n) => n.kind === kind);
        eq(legend.includes(entity), has, `${wfv.id}: legend entry for ${kind}`);
      }
    });

    t(`${file}: ${wfv.id} legend explains every actor it draws, once`, () => {
      // The adaptive rule, extended to D5: this sheet's legend names exactly the
      // actors this sheet draws a chip for, each of them once, and no others —
      // including actors that exist in the registry but only appear on some
      // other sheet.
      const drawn = new Set();
      for (const n of wfv.nodes) if (n.kind === "step" && n.actor) drawn.add(n.actor.id);
      const listed = [...legend.matchAll(/class="lg-actor"[^>]*?data-actor="([^"]+)"/g)].map((m) => m[1]);
      eq(listed.length, new Set(listed).size, `${wfv.id}: an actor is listed twice`);
      eq(listed.slice().sort().join(","), [...drawn].sort().join(","),
        `${wfv.id}: the legend's actors are not the sheet's actors`);
      for (const id of listed) {
        const a = b.actors.get(id);
        ok(legend.includes(`<b>${esc(a.short)}</b>`), `${wfv.id}: no chip beside "${a.name}"`);
      }
      // the handoff swatch, same rule
      eq(legend.includes("lg-handoff-sw"), wfv.edges.some((e) => e.handoff),
        `${wfv.id}: handoff legend entry`);
    });

    t(`${file}: ${wfv.id} draws the glyph its tone calls for`, () => {
      const svg = renderDiagram(wfv).svg;
      for (const e of wfv.edges) {
        if (!e.labelAt || !e.label) continue;
        const glyph = TONE_GLYPH[e.tone] || "";
        eq(e.labelText.startsWith(glyph ? glyph + " " : ""), true,
          `${wfv.id}: "${e.label}" (${e.tone}) is missing its glyph`);
        if (!glyph) {
          ok(!/^[\u24D8\u25B2\u2717\u2713]/.test(e.labelText),
            `${wfv.id}: neutral label "${e.label}" carries a glyph`);
        }
        ok(svg.includes(`class="wf-label-main"`), "labels rendered");
      }
    });
  });

  for (const wfv of b.workflows) {
    t(`${file}: ${wfv.id} geometry`, () => checkWorkflow(wfv, `${file}#${wfv.id}`));
    t(`${file}: ${wfv.id} emits svg`, () => {
      const { svg, width, height } = renderDiagram(wfv);
      ok(svg.length > 0, "empty svg");
      ok(width > 0 && height > 0, "zero-size canvas");
      ok(!/undefined|NaN/.test(svg), "svg contains NaN or undefined");
    });
  }

  t(`${file}: builds identically twice`, () => {
    const geo = (x) => JSON.stringify(x.workflows.map((w) =>
      w.nodes.map((n) => [n.uid, n.x, n.y, n.w, n.h, n.row, n.laneIndex, n.num])));
    eq(geo(buildDocument(JSON.parse(readFileSync(join(exDir, file), "utf8")))), geo(b), "geometry drift");
  });
}

/* =================================================================== */

if (failures.length) {
  console.error(`\n\x1b[31m${failures.length} test(s) failed\x1b[0m  (${passed} passed)\n`);
  for (const f of failures) {
    console.error(`  \x1b[31m✗\x1b[0m ${f.name}\n    ${f.message.split("\n").join("\n    ")}`);
  }
  process.exit(1);
}
console.log(`\x1b[32m${passed} test(s) passed\x1b[0m` +
  (examples.length ? ` \x1b[2m(${examples.length} example document(s) checked)\x1b[0m` : ""));
