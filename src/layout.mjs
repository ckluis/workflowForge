// Deterministic layout engine for WFD v1. See spec/DSL.md §5.
//
// Pure function of the document: flatten -> layer -> size -> position -> route.
// No randomness, no measurement, no iteration to a fixed point.

import { wrap, wrapClamp, measure, measureMono } from "./text.mjs";
import { plain } from "./md.mjs";
import { checkMeta, checkReview } from "./fresh.mjs";

export const DENSITY = {
  comfortable: {
    NODE_W: 272, LANE_GAP: 52, EMPTY_LANE_W: 62, ROW_GAP: 46, BAND_GAP: 15,
    PAD: 34, PHASE_RAIL: 46, CORNER: 3, SLANT: 16, PARA_SLANT: 17, STUB: 26,
    TITLE_SIZE: 15, TITLE_LH: 20, NOTE_SIZE: 12, NOTE_LH: 16,
    CHIP_SIZE: 13.5, MONO_SIZE: 11.5, LABEL_NOTE_SIZE: 10.5,
    STEP_TEXT_H: 80, TERM_TEXT_H: 40, MAX_DETAIL_LINES: 2,
    NODE_PAD_X: 15, NODE_PAD_Y: 14, MIN_NODE_H: 58, BADGE_H: 17,
    LABEL_SIZE: 12, ACTOR_GAP: 8,
  },
  compact: {
    NODE_W: 236, LANE_GAP: 38, EMPTY_LANE_W: 50, ROW_GAP: 34, BAND_GAP: 12,
    PAD: 26, PHASE_RAIL: 38, CORNER: 3, SLANT: 14, PARA_SLANT: 15, STUB: 22,
    TITLE_SIZE: 13.5, TITLE_LH: 18, NOTE_SIZE: 11, NOTE_LH: 14.5,
    CHIP_SIZE: 12.5, MONO_SIZE: 10.5, LABEL_NOTE_SIZE: 10,
    STEP_TEXT_H: 80, TERM_TEXT_H: 40, MAX_DETAIL_LINES: 2,
    NODE_PAD_X: 13, NODE_PAD_Y: 11, MIN_NODE_H: 50, BADGE_H: 16,
    LABEL_SIZE: 11.5, ACTOR_GAP: 7,
  },
};

const STEP_TYPES = new Set([
  "action", "question", "choice", "input", "output",
  "shelf", "insert", "wait", "parallel",
]);
const TONES = new Set(["neutral", "info", "warn", "error", "success"]);
const TONE_ALIAS = { failure: "error", fail: "error", ok: "success", good: "success", bad: "error" };
const normTone = (t, fallback = "neutral") => {
  if (!t) return fallback;
  const v = TONE_ALIAS[t] || t;
  return TONES.has(v) ? v : fallback;
};

// D1 — severity must survive greyscale. Hue alone loses the whole axis to a
// photocopy or a colour-blind reader, so the branch label carries a mark as
// well: "Declined" is drawn as "▲ Declined". Branch labels only; a mark in
// every toned box was rejected as clutter.
//
// Every glyph here is outside the Unicode emoji set, so no platform can route
// it to a colour-emoji font and paint it a colour the tone did not choose.
// That disqualifies ⚠ (U+26A0) and ❗ (U+2757) on its own, before legibility.
// Chosen at the size they actually render — 11.5-12px on the canvas, 13px in
// the legend — and checked again through a 1-bit threshold, which is what a
// photocopy does. See the note under D1 in src/notes/decisions.md.
export const TONE_GLYPH = {
  neutral: "",
  info: "\u24D8",      // ⓘ  circled i — a ring is unique on the sheet
  warn: "\u25B2",      // ▲  solid triangle — caution, and all mass
  error: "\u2717",     // ✗  ballot X — heavy enough to match 600 weight
  success: "\u2713",   // ✓  check — the one mark nobody has to be told
};

// What a screen reader says instead of the glyph's Unicode name. "Variation,
// warning: Declined" is the announcement; "Variation, warning sign: Declined"
// is not.
export const TONE_SPOKEN = {
  neutral: "", info: "note", warn: "warning", error: "error", success: "success",
};

/** The drawn form of a branch label: glyph, a space, then the answer. */
export const labelWithTone = (label, tone) => {
  const g = TONE_GLYPH[normTone(tone)];
  return g ? `${g} ${label}` : String(label);
};
/* ------------------------------------------------------------------ */
/* Verification — D3                                                    */
/* ------------------------------------------------------------------ */
//
// A model removes the writing bottleneck and enlarges the verification one. A
// sixty-step document is ~22,000 words of asserted fact, and without this field
// it renders with exactly the same authority whether or not a human has checked
// a word of it. `verification` is how a step says which of those it is.
//
// **Absent means `unverified`, and that is the whole point.** Authority is
// earned by a human act, never granted by omission — so a document that says
// nothing about review is a document nobody has reviewed, and it draws that way.
// The five shipped examples carry no field and are therefore all unverified,
// which is the truth about them.
//
// Three states, not two, because a binary forces a reviewer who finds something
// wrong to either leave it looking untouched — losing the finding, and lying
// about how far the review got — or mark it verified, which is worse. "Nobody
// has looked" and "somebody looked and it does not hold up" are different facts
// and the sheet must be able to tell them apart. Nothing beyond those three is
// admitted; see the `partial`/`n-a` note in spec.md §3.2a.
export const VERIFICATIONS = ["unverified", "verified", "disputed"];
const VERIFICATION_SET = new Set(VERIFICATIONS);
export const DEFAULT_VERIFICATION = "unverified";

/** The state a step is in, with the honest default for anything unstated. */
export const normVerification = (v) =>
  VERIFICATION_SET.has(v) ? v : DEFAULT_VERIFICATION;

/* ------------------------------------------------------------------ */
/* Actors — D5                                                          */
/* ------------------------------------------------------------------ */
//
// Swimlanes answer "who owns which parts" by spending a spatial axis. Both axes
// are already spent — y is sequence, x is severity — and a second one destroys
// the no-crossing guarantee everything else rests on. So the answer is bought
// without the axis: a chip on every box, an entry in the legend, and a mark on
// the line wherever the work changes hands.
//
// **None of that is possible on free text.** `detail.actor` has always been
// prose, and prose cannot be grouped on: measured across the shipped examples it
// yields 39 "actors" from a document with five, 33 from one with four, 27 from
// one with three. "Shopper, with a pre-filled suggestion from the system" and
// "Shopper, prompted by the system" are the same person doing the same job,
// described twice. So identity moves to a document-level registry and the step
// carries a reference to it.
//
// **`step.actorId`, not `step.actor`.** Every other reference in this format is
// named for its target — `exit.to`, `goto.workflow`, `insert.workflow` — and by
// that convention this field would be `actor`. It is not, for one reason: the
// name `actor` is already taken, 165 times across the shipped examples, by the
// prose field inside `detail`. A step carrying `"actor": "shopper"` six lines
// above `"actor": "Shopper, with a pre-filled suggestion"` is a trap for anyone
// hand-editing the JSON and, worse, an invitation for a model to write the
// sentence where the identity belongs — which is precisely the failure this
// registry exists to end. The `Id` suffix says "this is a reference" in the one
// place a reader is looking.
//
// **`detail.actor` stays, unchanged and undeprecated.** It is not a worse
// version of the same field; it is a different field. `actorId` answers *which
// of the five*, which is the only question that can be grouped, filtered and
// counted. `detail.actor` answers *how this particular step is performed and by
// whom exactly*, which is the only thing the modal wanted. Migrating one into
// the other would delete 165 authored sentences to gain nothing, and would break
// every document already in the wild — which is the other reason: a shipped
// document must keep building.
//
// **Steps only.** Terminals and navigation chips take no reference, for the same
// reason they take no `verification`: they assert nothing and perform nothing, so
// an owner on them would be a claim nobody made.

/** Longest a `short` may be. Three characters of monospace, and no more. */
export const ACTOR_SHORT_MAX = 3;
const SHORT_OK = /^[A-Za-z0-9]{1,3}$/;

/**
 * `short` is the whole visual half of D5: it is what the in-box chip draws, what
 * the handoff marker draws, and what the legend entry is keyed by. It is capped
 * at three characters because every character it takes is taken from the title —
 * the box does not grow, so the chip's gutter comes out of the text's width, and
 * three characters of monospace cost about three characters of title. Three is
 * also enough for every real case: SH, SYS, PAY, INV, REC, APP, USC, TRI, OPS.
 *
 * Derived from `name` when absent, so the common case needs no thought: the
 * initials of the first three words, or the first three letters of a single word.
 */
export function deriveShort(name) {
  const words = String(name || "").trim().split(/[\s\-_/]+/).filter(Boolean);
  if (!words.length) return "?";
  const letters = words.map((w) => (w.match(/[A-Za-z0-9]/) || [""])[0]).filter(Boolean);
  if (letters.length >= 2) return letters.slice(0, ACTOR_SHORT_MAX).join("").toUpperCase();
  const only = words[0].replace(/[^A-Za-z0-9]/g, "");
  return (only.slice(0, ACTOR_SHORT_MAX) || "?").toUpperCase();
}

/**
 * A legend stops being scannable somewhere around six entries, and the actor
 * entries are only part of what a legend already carries — two directions, up to
 * four severity glyphs, three navigation glyphs, two confidence weights and a
 * review count. Past six actors it wraps to a third line and stops being read.
 *
 * So: warn, never error. A process really can have nine owners and it must still
 * build. But a registry with fourteen entries is overwhelmingly more likely to be
 * the failure this registry exists to catch, recurring one level up — prose
 * mistaken for identity — than a genuinely fourteen-actor process, and the
 * warning says exactly that so it is actionable rather than a scold.
 */
export const ACTOR_LEGEND_MAX = 6;

/**
 * Read the document-level registry. Returns a Map from id to
 * `{ id, name, short }`, and pushes an error for anything a chip could not be
 * drawn from.
 */
export function buildActors(doc, errors, warnings) {
  const byId = new Map();
  const list = Array.isArray(doc && doc.actors) ? doc.actors : null;
  if (!list) {
    if (doc && doc.actors != null) {
      errors.push({ path: "actors", message: "actors must be an array of { id, name, short }" });
    }
    return byId;
  }

  const shorts = new Map();
  list.forEach((a, i) => {
    const at = `actors[${i}]`;
    if (!a || typeof a !== "object") { errors.push({ path: at, message: "actor must be an object" }); return; }
    if (!a.id) { errors.push({ path: `${at}.id`, message: "actor has no id" }); return; }
    if (!a.name) errors.push({ path: `${at}.name`, message: `actor "${a.id}" has no name` });
    if (byId.has(a.id)) { errors.push({ path: `${at}.id`, message: `duplicate actor id "${a.id}"` }); return; }

    let short;
    if (a.short == null || a.short === "") {
      short = deriveShort(a.name || a.id);
    } else if (!SHORT_OK.test(String(a.short))) {
      errors.push({
        path: `${at}.short`,
        message: `short ${JSON.stringify(a.short)} is not usable as a chip`,
        hint: `1 to ${ACTOR_SHORT_MAX} letters or digits. The chip is drawn inside the box and ` +
              `every character it takes is taken from the title. Leave it out to have it ` +
              `derived from the name.`,
      });
      short = deriveShort(a.name || a.id);
    } else {
      short = String(a.short);
    }

    // Two actors that draw the same chip are two actors the reader cannot tell
    // apart, which is the one thing the chip exists to do.
    const key = short.toUpperCase();
    if (shorts.has(key)) {
      errors.push({
        path: `${at}.short`,
        message: `short "${short}" is already used by actor "${shorts.get(key)}"`,
        hint: a.short == null
          ? `it was derived from the name "${a.name || a.id}" — set "short" explicitly on one of them`
          : `two actors drawing the same chip cannot be told apart on the sheet`,
      });
    } else {
      shorts.set(key, a.id);
    }

    byId.set(a.id, { id: a.id, name: String(a.name || a.id), short });
  });

  if (byId.size > ACTOR_LEGEND_MAX && warnings) {
    warnings.push({
      path: "actors",
      message: `${byId.size} actors — a legend stops being scannable past ${ACTOR_LEGEND_MAX}, and ` +
               `the reader has to hold ${byId.size} chips in their head while reading a sheet. ` +
               `Check whether some of these are one identity described more than once, or ` +
               `whether this is really two documents.`,
    });
  }

  return byId;
}

const EXIT_TYPES = new Set(["continue", "join", "end", "goback", "goto"]);
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

class Fail extends Error {}

/* ------------------------------------------------------------------ */
/* 1. Flatten                                                          */
/* ------------------------------------------------------------------ */

function flatten(wf, wfIndex, doc, errors, warnings, forced, actors) {
  const nodes = [];
  const edges = [];
  const lanes = [];
  const byStepId = new Map();
  const pending = [];              // deferred exit resolution
  let laneCounter = 0;

  const at = (p) => `workflows[${wfIndex}]${p}`;
  const err = (path, msg, hint) => errors.push({ path: at(path), message: msg, hint });
  const warnAt = (path, msg, hint) => warnings.push({ path: at(path), message: msg, hint });

  const addNode = (n) => {
    n.index = nodes.length;
    n.uid = `${wf.id}-n${n.index}`;
    nodes.push(n);
    return n;
  };

  const newLane = (parent, laneId, ownerNodeIndex, branch, ownerStep, branchOrder) => {
    const lane = {
      index: laneCounter++, laneId, parent, ownerNodeIndex,
      branch: branch || null, nodes: [], outlet: null, outletKind: null,
      depth: parent ? parent.depth + 1 : 0,
      tone: branch ? (branch.tone || "neutral") : "neutral",
      branchUid: branch ? `${wf.id}-b${laneCounter}` : null,
      // Placement metadata. `ownerStep` is the index, within the parent lane, of
      // the question this branch hangs off. `closeStep` is the index in the
      // parent lane at which this lane stops occupying vertical space. Together
      // they form an interval, and intervals are what decide column order.
      ownerStep: ownerStep == null ? -1 : ownerStep,
      branchOrder: branchOrder == null ? 0 : branchOrder,
      closeStep: null, children: [], ordered: [], col: 0, width: 1,
    };
    if (parent) parent.children.push(lane);
    lanes.push(lane);
    return lane;
  };

  /* --- the start terminal --- */
  const start = addNode({
    kind: "start", type: "start", laneIndex: 0, num: null,
    title: (wf.start && wf.start.label) || "Start",
    note: wf.start && wf.start.note, tone: "neutral", detail: wf.start && wf.start.detail,
  });

  const lane0 = newLane(null, "0", null, null, -1, 0);
  start.laneIndex = lane0.index;

  /* --- recursive lane emission --- */
  function emitLane(steps, lane, numPrefix, path) {
    steps.forEach((step, k) => {
      if (!step || typeof step !== "object") { err(`${path}[${k}]`, "step must be an object"); return; }
      if (!step.id) err(`${path}[${k}].id`, "missing id");
      if (!step.title) err(`${path}[${k}].title`, "missing title");
      if (!STEP_TYPES.has(step.type)) {
        err(`${path}[${k}].type`, `unknown step type ${JSON.stringify(step.type)}`,
          `expected one of ${[...STEP_TYPES].join(", ")}`);
      }
      if (step.tone && !TONES.has(TONE_ALIAS[step.tone] || step.tone)) err(`${path}[${k}].tone`, `unknown tone ${JSON.stringify(step.tone)}`);
      // Rejected loudly, the way meta.reviewEvery is: a step that asks for a
      // review state the renderer cannot draw would otherwise fall back to
      // "unverified" and leave its author believing the sheet says something it
      // does not. Absent is fine and means unverified; wrong is an error.
      if (step.verification != null && !VERIFICATION_SET.has(step.verification)) {
        err(`${path}[${k}].verification`,
          `unknown verification ${JSON.stringify(step.verification)}`,
          `expected one of ${VERIFICATIONS.join(", ")} — or leave it out, which means ` +
          `${DEFAULT_VERIFICATION}. Only a human may write "verified".`);
      }
      // The reason a reviewer disputed a step. Prose, and only meaningful on a
      // disputed step — a note attached to something nobody disputed is a claim
      // about a review that did not happen.
      if (step.verificationNote != null) {
        if (typeof step.verificationNote !== "string") {
          err(`${path}[${k}].verificationNote`,
            `verificationNote must be a string, got ${typeof step.verificationNote}`,
            "one line saying what is wrong with the step");
        } else if (normVerification(step.verification) !== "disputed") {
          warnAt(`${path}[${k}].verificationNote`,
            "verificationNote is set on a step that is not disputed, so nothing will show it",
            'a note explains a "disputed" mark; set verification to "disputed" or drop the note');
        }
      }

      // The detail panel's own shapes. `detail.mjs` reads every list field
      // through `Array.isArray(x) ? x : []`, so a field written as a bare
      // string — "procedure": "do the thing" rather than ["do the thing"] — is
      // silently dropped and the build still reports zero problems. An author
      // then ships a page whose panels are missing the material they wrote,
      // with a clean green build telling them everything is fine.
      //
      // Warnings rather than errors: the document is still renderable and the
      // rest of the panel is intact, so refusing to build would be out of
      // proportion. But the build must stop claiming nothing is wrong.
      checkDetailShape(step.detail, `${path}[${k}].detail`, warnAt);

      // D5 — the actor reference. Rejected loudly for the same reason: an
      // unresolvable id would otherwise draw no chip and leave its author
      // believing the sheet says who owns the step when it says nothing.
      let actor = null;
      if (step.actorId != null && step.actorId !== "") {
        actor = actors && actors.get(step.actorId);
        if (!actor) {
          const known = actors && actors.size ? [...actors.keys()].join(", ") : null;
          err(`${path}[${k}].actorId`,
            `unknown actor ${JSON.stringify(step.actorId)}`,
            known
              ? `expected one of ${known} — the ids come from the document-level "actors" registry`
              : `this document has no "actors" registry. Add one: ` +
                `"actors": [{ "id": ${JSON.stringify(step.actorId)}, "name": "…", "short": "…" }]`);
        }
      }

      // Branch steps read "3a", then "3a.2", "3a.3" — the common one-step branch
      // gets the short form the eye expects.
      const num = numPrefix
        ? (k === 0 ? numPrefix : `${numPrefix}.${k + 1}`)
        : String(k + 1);
      const node = addNode({
        kind: "step", type: step.type, laneIndex: lane.index, num,
        id: step.id, title: step.title, note: step.note, tag: step.tag,
        tone: normTone(step.tone, lane.tone || "neutral"), detail: step.detail, step,
        verificationNote: typeof step.verificationNote === "string" ? step.verificationNote : null,
        verification: normVerification(step.verification),
        actor: actor || null,
        source: step, path: at(`${path}[${k}]`),
      });
      if (step.id) {
        if (byStepId.has(step.id)) err(`${path}[${k}].id`, `duplicate step id "${step.id}"`);
        else byStepId.set(step.id, node);
      }
      lane.nodes.push(node.index);
      if (!step.detail) warnings.push({ path: at(`${path}[${k}]`), message: `step "${step.title}" has no detail — the modal will be empty` });

      // sequential edge inside the lane
      const prev = lane.nodes.length > 1 ? lane.nodes[lane.nodes.length - 2]
        : (lane.index === lane0.index ? start.index : null);
      if (prev != null) edges.push({ kind: "seq", from: prev, to: node.index, lane: lane.index });
      if (lane.index !== lane0.index && lane.nodes.length === 1) {
        // first node of a branch lane: the fan edge is created by the owner below
      }

      if (step.type === "question" || step.type === "choice") {
        // `branches` belongs to the step, beside `detail`. Models routinely bury
        // it inside `detail` instead, because `detail` is long enough to lose
        // your place in. The intent is unambiguous, so honour it and say so
        // rather than rejecting ten steps over a nesting level.
        let branches = Array.isArray(step.branches) ? step.branches : [];
        if (!branches.length && step.detail && Array.isArray(step.detail.branches)
            && step.detail.branches.length) {
          branches = step.detail.branches;
          warnings.push({
            path: at(`${path}[${k}]`),
            message: `"${step.title}" had its branches nested inside "detail". They belong ` +
                     `beside it, as a key of the step. Rendered as intended; fix the source.`,
          });
        }
        if (!branches.length) err(`${path}[${k}].branches`, `${step.type} "${step.title}" has no branches`,
          "every question must have at least one non-primary answer");
        node.primaryLabel = step.primaryLabel || (step.type === "choice" ? "Default" : "Yes");
        node.branchUids = [];

        branches.forEach((br, bi) => {
          const bpath = `${path}[${k}].branches[${bi}]`;
          if (!br || typeof br !== "object") { err(bpath, "branch must be an object"); return; }
          if (!br.label) err(`${bpath}.label`, "branch has no label");
          if (!br.exit || typeof br.exit !== "object") {
            err(`${bpath}.exit`, `branch "${br.label || bi}" has no exit`,
              "every branch must terminate: continue | join | end | goback | goto");
            return;
          }
          if (!EXIT_TYPES.has(br.exit.type)) {
            err(`${bpath}.exit.type`, `unknown exit type ${JSON.stringify(br.exit.type)}`,
              `expected one of ${[...EXIT_TYPES].join(", ")}`);
            return;
          }
          const letter = LETTERS[bi] || `z${bi}`;
          // attach the letter directly to a digit, but separate it from a letter
          const laneNum = /[0-9]$/.test(num) ? `${num}${letter}` : `${num}.${letter}`;
          const childLane = newLane(lane, laneNum, node.index, br, k, bi);
          node.branchUids.push(childLane.branchUid);
          childLane.label = br.label;
          childLane.note = br.note;

          const brSteps = Array.isArray(br.steps) ? br.steps : [];
          if (brSteps.length) {
            emitLane(brSteps, childLane, childLane.laneId, `${bpath}.steps`);
            edges.push({
              kind: "fan", from: node.index, to: childLane.nodes[0],
              lane: childLane.index, label: br.label, note: br.note,
              tone: normTone(br.tone), branchUid: childLane.branchUid,
            });
          }
          pending.push({
            exit: br.exit, lane: childLane, ownerLane: lane, ownerIndex: k,
            ownerNode: node.index, path: `${bpath}.exit`, branch: br,
            empty: brSteps.length === 0,
          });
          if (brSteps.length > 5 && !br.note) {
            warnings.push({ path: at(bpath), message: `branch "${br.label}" has ${brSteps.length} steps — consider splitting it into its own diagram` });
          }
        });
      }
    });
  }

  emitLane(Array.isArray(wf.steps) ? wf.steps : [], lane0, "", ".steps");
  if (!lane0.nodes.length) err(".steps", "workflow has no steps");

  /* --- the end terminal --- */
  const endSpec = wf.end || { label: "End", tone: "neutral" };
  const end = addNode({
    kind: "end", type: "end", laneIndex: lane0.index, num: null,
    title: endSpec.label || "End", note: endSpec.note,
    tone: normTone(endSpec.tone), detail: endSpec.detail,
  });
  if (lane0.nodes.length) edges.push({ kind: "seq", from: lane0.nodes[lane0.nodes.length - 1], to: end.index, lane: lane0.index });
  else edges.push({ kind: "seq", from: start.index, to: end.index, lane: lane0.index });
  lane0.outlet = end.index;
  lane0.outletKind = "node";

  /* --- resolve branch exits (two-pass: nodes exist, now wire them) --- */
  // Pass A: exits that create a node.
  for (const p of pending) {
    const { exit, lane } = p;
    if (exit.type === "end") {
      const n = addNode({
        kind: "end", type: "end", laneIndex: lane.index, num: null,
        title: exit.label || "End", note: exit.note,
        tone: normTone(exit.tone, lane.tone),
        detail: exit.detail,
      });
      lane.outlet = n.index; lane.outletKind = "node"; p.node = n;
    } else if (exit.type === "goback") {
      const n = addNode({
        kind: "goback", type: "goback", laneIndex: lane.index, num: null,
        title: exit.label || "", ref: { to: exit.to }, tone: lane.tone, note: exit.note,
        detail: exit.detail,
      });
      lane.outlet = n.index; lane.outletKind = "node"; p.node = n;
    } else if (exit.type === "goto") {
      const n = addNode({
        kind: "goto", type: "goto", laneIndex: lane.index, num: null,
        title: exit.label || "", ref: { workflow: exit.workflow, step: exit.step },
        tone: lane.tone, note: exit.note, detail: exit.detail,
      });
      lane.outlet = n.index; lane.outletKind = "node"; p.node = n;
    }
  }

  // Pass B: outlets for merge exits, resolved lazily (no cycles by construction).
  const outletAfter = (lane, idx, seen = new Set()) => {
    if (idx + 1 < lane.nodes.length) return lane.nodes[idx + 1];
    return laneOutlet(lane, seen);
  };
  const laneOutlet = (lane, seen = new Set()) => {
    if (lane.outlet != null) return lane.outlet;
    if (seen.has(lane.index)) return null;
    seen.add(lane.index);
    const p = pending.find((q) => q.lane === lane);
    if (!p) return null;
    if (p.exit.type === "join") {
      const t = byStepId.get(p.exit.to);
      lane.outlet = t ? t.index : null;
    } else if (p.exit.type === "continue") {
      lane.outlet = outletAfter(p.ownerLane, p.ownerIndex, seen);
    }
    lane.outletKind = "merge";
    return lane.outlet;
  };

  for (const p of pending) {
    const { exit, lane } = p;
    const tailIndex = lane.nodes.length ? lane.nodes[lane.nodes.length - 1] : null;

    if (exit.type === "join" || exit.type === "continue") {
      let target = null;
      if (exit.type === "join") {
        if (!exit.to) { err(p.path + ".to", "join exit has no target"); continue; }
        const t = byStepId.get(exit.to);
        if (!t) { err(p.path + ".to", `join target "${exit.to}" not found in this workflow`); continue; }
        target = t.index;
      } else {
        target = outletAfter(p.ownerLane, p.ownerIndex);
        if (target == null) { err(p.path, "continue exit could not resolve a rejoin point"); continue; }
      }
      // A merge that the layout cannot draw without crossing another line is
      // turned into a reference chip instead — the same move we already make for
      // backward edges. The reader loses nothing: the chip names its destination
      // and clicking it jumps there.
      if (forced && forced.has(lane.laneId)) {
        const t = nodes[target];
        const chip = addNode({
          kind: "goforward", type: "goforward", laneIndex: lane.index, num: null,
          title: exit.label || "", ref: { node: target, to: t ? t.id : null },
          tone: lane.tone, note: exit.note, detail: exit.detail,
        });
        lane.outlet = chip.index;
        lane.outletKind = "node";
        if (p.empty) {
          edges.push({
            kind: "fan", from: p.ownerNode, to: chip.index, lane: lane.index,
            label: p.branch.label, note: p.branch.note,
            tone: normTone(p.branch.tone), branchUid: lane.branchUid,
          });
        } else {
          edges.push({ kind: "seq", from: tailIndex, to: chip.index, lane: lane.index });
        }
        continue;
      }

      lane.outlet = target;
      lane.outletKind = "merge";

      if (p.empty) {
        edges.push({
          kind: "bypass", from: p.ownerNode, to: target, lane: lane.index,
          label: p.branch.label, note: p.branch.note,
          tone: normTone(p.branch.tone), branchUid: lane.branchUid,
        });
      } else {
        edges.push({ kind: "merge", from: tailIndex, to: target, lane: lane.index, branchUid: lane.branchUid });
      }
    } else {
      // node-producing exit
      const n = p.node;
      if (!n) continue;
      if (p.empty) {
        edges.push({
          kind: "fan", from: p.ownerNode, to: n.index, lane: lane.index,
          label: p.branch.label, note: p.branch.note,
          tone: normTone(p.branch.tone), branchUid: lane.branchUid,
        });
      } else {
        edges.push({ kind: "seq", from: tailIndex, to: n.index, lane: lane.index });
      }
    }
  }

  /* --- how far down the parent lane does each branch stay open? --- */
  //
  // A block's interval is not just its own: if anything nested inside it merges
  // out to a step further down the parent lane, the whole block stays open until
  // then. Computing this bottom-up is what keeps a deep branch that rejoins the
  // main skewer from being cut by a later decision's fan line.

  const isAncestorLane = (maybe, lane) => {
    for (let l = lane; l; l = l.parent) if (l === maybe) return true;
    return false;
  };
  const subtreeLanes = (lane) => {
    const out = [];
    const walk = (l) => { out.push(l); for (const c of l.children) walk(c); };
    walk(lane);
    return out;
  };

  for (const lane of lanes) {
    if (!lane.parent) { lane.closeStep = -1; continue; }
    const P = lane.parent;
    let close = lane.ownerStep;                       // self-closing by default
    for (const X of subtreeLanes(lane)) {
      // A block containing an exit runs all the way down to the shared terminal
      // row, so as far as the parent lane is concerned it never closes.
      // A block that ends in any terminal — a stadium or any of the reference
      // chips — runs down to the shared terminal row, so as far as the parent
      // lane is concerned it never closes.
      if (X.outletKind === "node" && X.outlet != null) { close = Infinity; continue; }
      if (X.outletKind !== "merge" || X.outlet == null) continue;
      const target = nodes[X.outlet];
      if (!target) continue;
      const TL = lanes[target.laneIndex];
      if (TL === P) {
        const pos = P.nodes.indexOf(target.index);
        close = Math.max(close, pos >= 0 ? pos : lane.ownerStep + 1);
      } else if (isAncestorLane(TL, P)) {
        close = Infinity;                             // escapes past this lane entirely
      } else {
        close = Math.max(close, lane.ownerStep + 1);  // merges inside the block
      }
    }
    lane.closeStep = close;
  }

  /* --- validate cross references --- */
  const wfIds = new Set((doc.workflows || []).map((w) => w.id));
  for (const n of nodes) {
    if (n.kind === "goback") {
      const t = byStepId.get(n.ref.to);
      if (!t) errors.push({ path: at(` goback -> ${n.ref.to}`), message: `goback target "${n.ref.to}" not found in this workflow` });
      else n.ref.node = t.index;
    } else if (n.kind === "goto") {
      if (!wfIds.has(n.ref.workflow)) {
        errors.push({ path: at(` goto -> ${n.ref.workflow}`), message: `goto workflow "${n.ref.workflow}" not found in this document` });
      }
    }
    if (n.type === "insert") {
      const target = n.source && n.source.workflow;
      if (!target) errors.push({ path: at(` insert "${n.title}"`), message: "insert step has no workflow reference" });
      else if (!wfIds.has(target)) errors.push({ path: at(` insert "${n.title}"`), message: `insert workflow "${target}" not found` });
    }
  }

  return { nodes, edges, lanes, lane0, byStepId, start: start.index, end: end.index, pending };
}

/* ------------------------------------------------------------------ */
/* 1b. Columns                                                         */
/* ------------------------------------------------------------------ */
//
// Lanes are nested blocks, not a flat list. A branch occupies the interval of
// parent-lane steps between the question it hangs off and the step it rejoins.
// If block A is still open when block B's question fans right, A's line would
// be cut by B's fan — so A must be placed further right than all of B.
//
// In practice only a long `join` produces such an interval; `continue` and the
// terminating exits close immediately and keep their natural left-to-right
// severity order. The sort below is stable, so the common case comes out in
// exactly the order the author wrote.

function orderChildren(lane) {
  const kids = lane.children;
  const n = kids.length;
  if (n < 2) return kids.slice();

  const mustFollow = kids.map(() => new Set());
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const A = kids[i], B = kids[j];
      // The branches of one question keep the order the author wrote them in.
      // That order is the severity order, and it is the one promise the format
      // makes about horizontal position.
      if (A.ownerStep === B.ownerStep) {
        if (A.branchOrder > B.branchOrder) mustFollow[i].add(j);
        continue;
      }
      if (A.ownerStep < B.ownerStep && A.closeStep > B.ownerStep) mustFollow[i].add(j);
    }
  }

  const placed = new Set();
  const out = [];
  while (out.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (placed.has(i)) continue;
      let ready = true;
      for (const j of mustFollow[i]) if (!placed.has(j)) { ready = false; break; }
      if (ready) { pick = i; break; }
    }
    if (pick === -1) {
      for (let i = 0; i < n; i++) if (!placed.has(i)) { pick = i; break; }
    }
    placed.add(pick);
    out.push(kids[pick]);
  }
  return out;
}

function recomputeFanSpans(g) {
  for (const n of g.nodes) {
    if (!Array.isArray(n.branchUids) || !n.branchUids.length) continue;
    let max = n.col;
    for (const lane of g.lanes) {
      if (lane.ownerNodeIndex !== n.index) continue;
      const walk = (l) => { max = Math.max(max, l.col); for (const c of l.children) walk(c); };
      walk(lane);
    }
    n.fanMaxCol = max;
  }
}

function assignColumns(g) {
  const measureLane = (lane) => {
    lane.ordered = orderChildren(lane);
    let w = 1;
    for (const c of lane.ordered) w += measureLane(c);
    lane.width = w;
    return w;
  };
  measureLane(g.lane0);

  const place = (lane, col) => {
    lane.col = col;
    let next = col + 1;
    for (const c of lane.ordered) { place(c, next); next += c.width; }
  };
  place(g.lane0, 0);

  for (const n of g.nodes) n.col = g.lanes[n.laneIndex].col;
  g.colCount = g.lane0.width;
  recomputeFanSpans(g);
}

/* ------------------------------------------------------------------ */
/* 1c. Column packing                                                  */
/* ------------------------------------------------------------------ */
//
// The nested assignment above gives every branch a column of its own and never
// reuses one, which makes wide diagrams out of narrow ones. Because CLOSURE
// guarantees that blocks hanging off different steps of the same lane never
// overlap vertically, such blocks can share a column — and sharing costs the
// reader nothing, since only one of them is ever drawn at a given height.
//
// Runs after rows are known. If the packed result crosses a line, the caller
// throws it away and keeps the unpacked columns.

function packColumns(g) {
  const { nodes, lanes } = g;

  const blockExtent = (lane) => {
    let lo = Infinity, hi = -Infinity;
    const walk = (l) => {
      const owner = l.ownerNodeIndex != null ? nodes[l.ownerNodeIndex] : null;
      if (owner) { lo = Math.min(lo, owner.row); hi = Math.max(hi, owner.row); }
      for (const i of l.nodes) { lo = Math.min(lo, nodes[i].row); hi = Math.max(hi, nodes[i].row); }
      if (l.outlet != null && nodes[l.outlet]) hi = Math.max(hi, nodes[l.outlet].row);
      for (const c of l.children) walk(c);
    };
    walk(lane);
    if (lo === Infinity) { lo = 0; hi = 0; }
    return [lo, hi];
  };

  const mustFollowSet = (lane) => {
    const map = new Map();
    for (const A of lane.ordered) {
      const set = new Set();
      for (const B of lane.ordered) {
        if (A === B) continue;
        if (A.ownerStep < B.ownerStep && A.closeStep > B.ownerStep) set.add(B);
      }
      map.set(A, set);
    }
    return map;
  };

  const pack = (lane) => {
    const occupied = new Map();
    const follows = mustFollowSet(lane);
    const placed = [];
    let maxRel = 0;

    for (const L of lane.ordered) {
      const w = pack(L);
      const [lo, hi] = blockExtent(L);

      let floor = 1;
      for (const M of placed) {
        const sameQuestion = M.ownerNodeIndex === L.ownerNodeIndex;
        const ordered = follows.get(L) && follows.get(L).has(M);
        if (sameQuestion || ordered) floor = Math.max(floor, M.relCol + M.relWidth);
      }

      let s = floor;
      for (;;) {
        let free = true;
        for (let k = 0; k < w && free; k++) {
          for (const span of occupied.get(s + k) || []) {
            if (span[0] <= hi && lo <= span[1]) { free = false; break; }
          }
        }
        if (free) break;
        s++;
      }

      L.relCol = s;
      for (let k = 0; k < w; k++) {
        if (!occupied.has(s + k)) occupied.set(s + k, []);
        occupied.get(s + k).push([lo, hi]);
      }
      placed.push(L);
      maxRel = Math.max(maxRel, s + w - 1);
    }

    lane.relWidth = maxRel + 1;
    return lane.relWidth;
  };

  pack(g.lane0);

  const place = (lane, col) => {
    lane.col = col;
    for (const c of lane.ordered) place(c, col + c.relCol);
  };
  place(g.lane0, 0);

  for (const n of nodes) n.col = lanes[n.laneIndex].col;
  g.colCount = Math.max(...lanes.map((l) => l.col)) + 1;
  recomputeFanSpans(g);
}

function snapshotRows(g) { return g.nodes.map((n) => n.row); }
function restoreRows(g, snap) { g.nodes.forEach((n, i) => { n.row = snap[i]; }); }

function snapshotColumns(g) {
  return { lanes: g.lanes.map((l) => l.col), nodes: g.nodes.map((n) => n.col), count: g.colCount };
}
function restoreColumns(g, snap) {
  g.lanes.forEach((l, i) => { l.col = snap.lanes[i]; });
  g.nodes.forEach((n, i) => { n.col = snap.nodes[i]; });
  g.colCount = snap.count;
  recomputeFanSpans(g);
}

/* ------------------------------------------------------------------ */
/* 2. Layering (longest path)                                          */
/* ------------------------------------------------------------------ */

function assignRows(g, wfIndex, errors) {
  const { nodes, edges } = g;
  const preds = nodes.map(() => []);
  const succs = nodes.map(() => []);
  for (const e of edges) {
    if (e.from == null || e.to == null) continue;
    preds[e.to].push(e.from);
    succs[e.from].push(e.to);
  }

  const row = new Array(nodes.length).fill(-1);
  const state = new Array(nodes.length).fill(0);
  let cyclic = false;

  const visit = (i) => {
    if (state[i] === 2) return row[i];
    if (state[i] === 1) { cyclic = true; return 0; }
    state[i] = 1;
    let r = 0;
    for (const p of preds[i]) r = Math.max(r, visit(p) + 1);
    row[i] = r; state[i] = 2;
    return r;
  };
  for (let i = 0; i < nodes.length; i++) visit(i);

  if (cyclic) {
    // Name the merge that closed the loop. "The flow graph contains a cycle" is
    // true and useless; the author needs to know which exit to change.
    const suspects = edges.filter((e) => e.kind === "merge" || e.kind === "bypass")
      .map((e) => nodes[e.to])
      .filter(Boolean)
      .map((n) => n.id)
      .filter(Boolean);
    errors.push({
      path: `workflows[${wfIndex}]`,
      message: "a join or continue exit points back at a step that leads to it, which closes a loop" +
        (suspects.length ? ` — check the exits joining to: ${[...new Set(suspects)].join(", ")}` : ""),
      hint: 'change the offending exit to { "type": "goback", "to": "<that step id>" }',
    });
  }

  nodes.forEach((n, i) => { n.row = row[i]; });
  g.preds = preds;
  g.succs = succs;
  return g;
}

/* ------------------------------------------------------------------ */
/* 2b. Vertical reservation                                            */
/* ------------------------------------------------------------------ */
//
//   CLOSURE  An exception block finishes before the parent lane moves on. Every
//            branch that closes on itself (end / goback / goto) or rejoins the
//            very next step must have its whole subtree above that next step.
//            Without this, a later merge line would have to cross the block's
//            still-running verticals on its way back to the skewer.
//
//   FAN ROW  A question's branch line leaves its right vertex and travels right
//            at that exact height, so no box may share the question's row inside
//            the span the line covers.
//
// Rows only ever increase, so the loop terminates.

/** Reserve space, align terminals, repeat until neither moves anything. */
function settleRows(g) {
  for (let i = 0; i < 12; i++) {
    reserveVerticals(g);
    if (!alignTerminals(g)) return;
  }
  reserveVerticals(g);
}

function reserveVerticals(g) {
  const { nodes, succs, lanes } = g;

  const pushDown = (i, target, depth) => {
    if (depth > nodes.length + 4) return false;
    const n = nodes[i];
    if (n.row >= target) return false;
    n.row = target;
    for (const s of succs[i]) pushDown(s, target + 1, depth + 1);
    return true;
  };

  const subtreeNodes = (lane) => {
    const out = [];
    const walk = (l) => { out.push(...l.nodes); for (const c of l.children) walk(c); };
    walk(lane);
    for (const n of nodes) {
      if (n.laneIndex === lane.index && out.indexOf(n.index) === -1) out.push(n.index);
    }
    return out;
  };

  const isFanning = (n) => (n.type === "question" || n.type === "choice") &&
    Array.isArray(n.branchUids) && n.branchUids.length > 0;

  const ordered = lanes.slice().sort((a, b) => b.depth - a.depth || a.index - b.index);

  let changed = true;
  let rounds = 0;
  const cap = Math.max(64, nodes.length * 4);

  while (changed && rounds++ < cap) {
    changed = false;

    for (const lane of ordered) {
      if (!lane.parent) continue;
      if (lane.closeStep > lane.ownerStep + 1) continue;

      const kids = subtreeNodes(lane);
      if (!kids.length) continue;
      const bottom = Math.max(...kids.map((i) => nodes[i].row));

      const parent = lane.parent;
      const nextIdx = lane.ownerStep + 1 < parent.nodes.length
        ? parent.nodes[lane.ownerStep + 1]
        : parent.outlet;
      if (nextIdx == null) continue;
      if (nodes[nextIdx].row <= bottom) {
        if (pushDown(nextIdx, bottom + 1, 0)) changed = true;
      }
    }

    for (const q of nodes) {
      if (!isFanning(q) || q.fanMaxCol == null) continue;
      for (const n of nodes) {
        if (n.row !== q.row || n === q) continue;
        if (n.col <= q.col || n.col > q.fanMaxCol) continue;
        if (pushDown(n.index, q.row + 1, 0)) changed = true;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2c. Common fate                                                     */
/* ------------------------------------------------------------------ */
//
// DRAKON's strongest legibility rule after the skewer: icons that play the same
// role sit at the same height, so the eye reads them as one set rather than as a
// staircase of unrelated boxes.
//
// Two groups earn it here.
//
// Every line on the sheet ends somewhere, and every one of those endings —
// `end` stadiums, `goto` chips, `goback` chips, `Continue at` chips — lands on
// one row. To a reader a chip is an ending like any other, so scattering them
// reads as sloppiness rather than as meaning. One row is the honest answer to
// "where can this finish?", readable in a glance.
//
// Terminals are leaves, so moving them down cannot disturb anything downstream.
// Rows only increase, so iterating this with the reservation pass converges.

const TERMINAL_KINDS = new Set(["end", "goto", "goback", "goforward"]);

function alignTerminals(g) {
  const { nodes } = g;
  const terminals = nodes.filter((n) => TERMINAL_KINDS.has(n.kind));
  if (terminals.length < 2) return false;

  const row = Math.max(...terminals.map((n) => n.row));
  let changed = false;
  for (const n of terminals) if (n.row !== row) { n.row = row; changed = true; }
  return changed;
}

/* ------------------------------------------------------------------ */
/* 3. Direction checks (join must go down, goback must go up)          */
/* ------------------------------------------------------------------ */

function checkDirections(g, wfIndex, errors) {
  const { nodes, edges } = g;
  for (const e of edges) {
    if (e.kind !== "merge" && e.kind !== "bypass") continue;
    const a = nodes[e.from], b = nodes[e.to];
    if (!a || !b) continue;
    if (b.row <= a.row) {
      errors.push({
        path: `workflows[${wfIndex}] merge ${a.num || a.title} -> ${b.num || b.title}`,
        message: "a join/continue exit points at a step that is not below it",
        hint: `change this exit to { "type": "goback", "to": "${b.id || ""}" }`,
      });
    }
    if (b.col > a.col) {
      errors.push({
        path: `workflows[${wfIndex}] merge ${a.num || a.title} -> ${b.num || b.title}`,
        message: "a join exit points to the right; merges may only travel left",
        hint: "the join target must be in an ancestor lane",
      });
    }
  }
  for (const n of nodes) {
    if (n.kind !== "goback" || n.ref.node == null) continue;
    const t = nodes[n.ref.node];
    // Compare against what flows INTO the chip — the branch's last step, or the
    // question that spawned an empty branch. The chip's own row is one lower and
    // would let a forward reference tie its way past this check.
    const feeders = (g.preds[n.index] || []).map((i) => nodes[i]);
    const anchorRow = feeders.length ? Math.min(...feeders.map((f) => f.row)) : n.row;
    if (t.row > anchorRow) {
      errors.push({
        path: `workflows[${wfIndex}] goback -> ${t.num}`,
        message: "a goback exit points at a step that is below it",
        hint: `this is a forward merge — use { "type": "join", "to": "${t.id}" }`,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* 4. Sizing                                                           */
/* ------------------------------------------------------------------ */

/** Hard-truncate a monospace line to a pixel width, with an ellipsis. */
function clampMono(str, width, size) {
  const max = Math.floor(width / (0.6 * size));
  const t = String(str == null ? "" : str);
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)) + "…";
}

function textInset(node, D) {
  switch (node.type) {
    case "question": case "choice": return D.SLANT + D.NODE_PAD_X;
    case "input": case "output": return D.PARA_SLANT + D.NODE_PAD_X;
    case "start": case "end": return 20 + D.NODE_PAD_X;
    case "insert": return 8 + D.NODE_PAD_X;
    case "goback": case "goto": case "goforward": return 22 + D.NODE_PAD_X;
    default: return D.NODE_PAD_X;
  }
}

const TERMINAL_SHAPES = new Set(["start", "end", "goback", "goto", "goforward"]);

/**
 * Wrap to a fixed number of lines, ellipsising the overflow, and say so.
 * The canvas carries the shape; the modal carries the words. A box that grew to
 * fit its text would break the one thing a reader relies on — that every box on
 * a sheet is the same box.
 */
function fit(text, width, size, maxLines, bold, report) {
  const full = wrap(text, width, size, bold);
  const lines = wrapClamp(text, width, size, maxLines, bold);
  if (full.length > maxLines && report) report(full.length, maxLines);
  return lines;
}

function sizeNodes(g, D, nodesByWf, warnings) {
  const warn = (n, field, got, max) => {
    if (!warnings) return;
    warnings.push({
      path: n.path || `workflow step "${n.title}"`,
      message: `${field} needs ${got} lines and the box holds ${max} — it is shown ` +
               `truncated with an ellipsis. Titles fit in about 45 characters and ` +
               `notes in about 50; the modal carries the full text either way.`,
    });
  };

  // Two sizes on a sheet, and only two: one for steps, one for terminals.
  //
  // The box is fixed; the lines inside it flex. A title long enough to need a
  // third line takes that line from the note rather than being cut short — the
  // title is the box's job, the note is a gloss, and the modal has both in full.
  const stepH = Math.round(D.NODE_PAD_Y * 2 + D.STEP_TEXT_H);
  const termH = Math.round(D.NODE_PAD_Y * 2 + D.TERM_TEXT_H);

  for (const n of g.nodes) {
    // D5 — the actor chip is drawn *inside* the box, and the box never grows.
    // So the room it takes has to come out of the text's width here, at the one
    // place the wrap is derived, or the title would be drawn wider than the
    // space reserved for it and run under the chip in silence. That is the
    // failure D1 hit when a glyph was added to a branch label in the renderer
    // alone; a test asserts this width, and mutating it fails that test.
    //
    // Charged only to nodes that actually carry an actor, so a document with no
    // registry wraps exactly as it did before this existed.
    //
    // **And charged only to the rows the chip is actually on.** The chip sits on
    // the first title line's baseline and is about ten pixels tall; the note
    // block starts at least twenty-four below that, so no note line can ever
    // reach it. Narrowing the notes as well would have cost real text — measured
    // across the five migrated examples, note truncations went from 26 to 51 —
    // and bought nothing. The rule is one line long: **each paragraph is
    // centred in the room its own rows have.** The title block shares one width
    // and one centre, set by its first line, which is the one carrying the chip;
    // the note block gets the box's own centre and its full width.
    //
    // Narrowing the *title* symmetrically and leaving its centre alone was
    // tried and is worse than either — a narrower title wraps onto another line,
    // and every line a title takes is a line the note does not get, so the
    // truncation count went to 75.
    n.actorGutter = n.actor ? D.ACTOR_GAP + measureMono(n.actor.short, D.MONO_SIZE) : 0;
    const inset = textInset(n, D);
    const tw = D.NODE_W - inset * 2;
    const titleW = tw - n.actorGutter;
    const terminal = TERMINAL_SHAPES.has(n.kind);
    const textH = terminal ? D.TERM_TEXT_H : D.STEP_TEXT_H;
    const maxTitle = Math.max(1, Math.floor(textH / D.TITLE_LH));

    if (n.kind === "goback") {
      const t = n.ref.node != null ? g.nodes[n.ref.node] : null;
      n.chipTitle = n.title || (t ? `Go back to ${t.num}` : "Go back");
      n.chipSub = n.title ? null : (t ? plain(t.title) : null);
    } else if (n.kind === "goforward") {
      const t = n.ref.node != null ? g.nodes[n.ref.node] : null;
      n.chipTitle = n.title || (t ? `Continue at ${t.num}` : "Continue");
      n.chipSub = n.title ? null : (t ? plain(t.title) : null);
    } else if (n.kind === "goto") {
      const target = nodesByWf.get(n.ref.workflow);
      n.chipTitle = n.title || (target ? `Go to sheet ${target.number}` : `Go to ${n.ref.workflow}`);
      n.chipSub = n.title ? null : (target ? plain(target.title) : null);
    }

    if (n.chipTitle) {
      n.chipText = n.chipSub ? `${n.chipTitle} · ${n.chipSub}` : n.chipTitle;
      n.titleSize = D.CHIP_SIZE;
      n.titleLines = fit(n.chipTitle, titleW, D.CHIP_SIZE, maxTitle, true,
        (got, max) => warn(n, "chip label", got, max));
    } else {
      n.titleSize = D.TITLE_SIZE;
      n.titleLines = fit(n.title, titleW, D.TITLE_SIZE, maxTitle, true,
        (got, max) => warn(n, `title "${plain(n.title).slice(0, 40)}"`, got, max));
    }

    // Whatever the title left behind, spent on state first and prose second.
    const spare = textH - n.titleLines.length * D.TITLE_LH - 4;
    const maxDetail = Math.min(D.MAX_DETAIL_LINES, Math.max(0, Math.floor(spare / D.NOTE_LH)));
    n.detailLines = [];
    const room = () => maxDetail - n.detailLines.length;

    if (maxDetail > 0 && n.type === "shelf" && Array.isArray(n.source && n.source.assign) && n.source.assign.length) {
      const a = n.source.assign;
      const first = `${a[0].name} ← ${a[0].value}`;
      const text = a.length > 1 ? `${first}  +${a.length - 1} more` : first;
      n.detailLines.push({ t: clampMono(text, tw, D.MONO_SIZE), cls: "wf-mono" });
    }
    if (room() > 0 && n.type === "parallel" && Array.isArray(n.source && n.source.tracks) && n.source.tracks.length) {
      const t = n.source.tracks;
      const text = t.length > 1 ? `${t[0]}  +${t.length - 1} more` : t[0];
      n.detailLines.push({ t: clampMono(text, tw, D.MONO_SIZE), cls: "wf-mono" });
    }
    if (n.chipSub && room() > 0) {
      const lines = fit(n.chipSub, tw, D.NOTE_SIZE, room(), false, null);
      for (const t of lines) n.detailLines.push({ t, cls: "wf-sub" });
    }
    if (n.note && room() > 0) {
      const lines = fit(n.note, tw, D.NOTE_SIZE, room(), false,
        (got, max) => warn(n, "note", got, max));
      for (const t of lines) n.detailLines.push({ t, cls: "wf-note" });
    }
    if (n.type === "wait" && n.source && n.source.duration) n.durationText = String(n.source.duration);

    n.titleH = n.titleLines.length * D.TITLE_LH;
    n.detailH = n.detailLines.length ? 4 + n.detailLines.length * D.NOTE_LH : 0;
    n.blockH = n.titleH + n.detailH;

    n.h = terminal ? termH : stepH;
    n.w = D.NODE_W;
    n.inset = inset;
  }
}

/* ------------------------------------------------------------------ */
/* 5. Positioning                                                      */
/* ------------------------------------------------------------------ */

function position(g, D, hasPhases) {
  const { nodes, edges, lanes } = g;

  // --- column x, narrowing columns that hold only a line ---
  const ncols = g.colCount || (Math.max(...lanes.map((l) => l.col)) + 1);
  const colUsed = new Array(ncols).fill(false);
  for (const n of nodes) colUsed[n.col] = true;

  const colX = new Array(ncols).fill(0);
  const colW = new Array(ncols).fill(0);
  let x = D.PAD + (hasPhases ? D.PHASE_RAIL : 0);
  for (let c = 0; c < ncols; c++) {
    colW[c] = colUsed[c] ? D.NODE_W : D.EMPTY_LANE_W;
    colX[c] = x;
    x += colW[c] + D.LANE_GAP;
  }
  const width = x - D.LANE_GAP + D.PAD;

  for (const lane of lanes) {
    lane.x = colX[lane.col];
    lane.w = colW[lane.col];
    lane.cx = lane.x + lane.w / 2;
  }
  for (const n of nodes) n.cx = lanes[n.laneIndex].cx;

  // --- rows ---
  const maxRow = nodes.reduce((m, n) => Math.max(m, n.row), 0);
  const rowH = new Array(maxRow + 1).fill(0);
  for (const n of nodes) rowH[n.row] = Math.max(rowH[n.row], n.h);

  // --- merge bands per gutter ---
  // A gutter g sits between row g and row g+1. Bands live in the gutter above
  // their target's row. Ordered by target lane ascending (leftmost is topmost).
  const gutterBands = new Map();   // gutterIndex -> [{ targetIndex, targetLane, sources:[] }]
  const bandFor = (targetIndex) => {
    const t = nodes[targetIndex];
    const gi = t.row - 1;
    if (!gutterBands.has(gi)) gutterBands.set(gi, []);
    const list = gutterBands.get(gi);
    let band = list.find((b) => b.targetIndex === targetIndex);
    if (!band) { band = { targetIndex, targetLane: t.col, sources: [], minX: t.cx, maxX: t.cx }; list.push(band); }
    return band;
  };
  for (const e of edges) {
    if (e.kind !== "merge" && e.kind !== "bypass") continue;
    if (e.from == null || e.to == null) continue;
    const band = bandFor(e.to);
    const sx = e.kind === "bypass" ? lanes[e.lane].cx : nodes[e.from].cx;
    band.sources.push({ edge: e, x: sx });
    band.minX = Math.min(band.minX, sx);
    band.maxX = Math.max(band.maxX, sx);
  }
  for (const list of gutterBands.values()) {
    list.sort((a, b) => a.targetLane - b.targetLane || a.targetIndex - b.targetIndex);
  }

  const gutterH = [];
  for (let r = 0; r < maxRow; r++) {
    const bands = gutterBands.get(r);
    const n = bands ? bands.length : 0;
    gutterH[r] = n <= 1 ? D.ROW_GAP
      : Math.max(D.ROW_GAP, D.STUB + (n - 1) * D.BAND_GAP + 16);
  }

  // --- y ---
  const rowTop = [];
  let y = D.PAD;
  for (let r = 0; r <= maxRow; r++) {
    rowTop[r] = y;
    y += rowH[r] + (r < maxRow ? gutterH[r] : 0);
  }
  const height = y + D.PAD;

  for (const n of nodes) {
    n.x = Math.round(n.cx - n.w / 2);
    n.y = Math.round(rowTop[n.row] + (rowH[n.row] - n.h) / 2);
    n.cy = n.y + n.h / 2;
    n.top = n.y;
    n.bottom = n.y + n.h;
    n.left = n.x;
    n.right = n.x + n.w;
  }

  // --- band y coordinates ---
  for (const [gi, list] of gutterBands) {
    const nextTop = rowTop[gi + 1];
    const count = list.length;
    list.forEach((band, i) => {
      band.y = Math.round(nextTop - D.STUB - (count - 1 - i) * D.BAND_GAP);
    });
  }

  return { width, height, rowTop, rowH, gutterBands, maxRow };
}

/* ------------------------------------------------------------------ */
/* 6. Routing                                                          */
/* ------------------------------------------------------------------ */

function route(g, geo, D) {
  const { nodes, edges, lanes } = g;
  const paths = [];

  const exitY = (n) => n.bottom;
  const entryY = (n) => n.top;

  for (const e of edges) {
    if (e.from == null || e.to == null) continue;
    const a = nodes[e.from];
    const b = nodes[e.to];
    let pts;

    if (e.kind === "seq") {
      pts = [{ x: a.cx, y: exitY(a) }, { x: b.cx, y: entryY(b) }];
    } else if (e.kind === "fan") {
      const bx = lanes[e.lane].cx;
      pts = [{ x: a.right, y: a.cy }, { x: bx, y: a.cy }, { x: bx, y: entryY(b) }];
      e.labelAt = { x: bx, y: a.cy };
      e.dropX = bx;
    } else if (e.kind === "merge") {
      const band = findBand(geo, e.to);
      const by = band ? band.y : a.bottom + D.ROW_GAP / 2;
      pts = [{ x: a.cx, y: exitY(a) }, { x: a.cx, y: by }, { x: b.cx, y: by }, { x: b.cx, y: entryY(b) }];
      if (a.cx === b.cx) pts = [{ x: a.cx, y: exitY(a) }, { x: b.cx, y: entryY(b) }];
    } else if (e.kind === "bypass") {
      const bx = lanes[e.lane].cx;
      const band = findBand(geo, e.to);
      const by = band ? band.y : a.bottom + D.ROW_GAP / 2;
      pts = [{ x: a.right, y: a.cy }, { x: bx, y: a.cy }, { x: bx, y: by }, { x: b.cx, y: by }, { x: b.cx, y: entryY(b) }];
      e.labelAt = { x: bx, y: a.cy };
      e.dropX = bx;
    }
    e.pts = pts;
    paths.push(e);
  }

  // --- every vertical run, used both for label placement and for hops ---
  const verticals = [];
  for (const e of paths) {
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const p = e.pts[i], q = e.pts[i + 1];
      if (p.x === q.x && p.y !== q.y) {
        verticals.push({ x: p.x, y0: Math.min(p.y, q.y), y1: Math.max(p.y, q.y), edge: e });
      }
    }
  }

  // --- branch label and note extents ---
  // The pill carries the answer; the note is an aside. Give the note only the
  // room that exists before the next branch drops or the next line runs down
  // through it, and never let either push past the canvas edge.
  // Box text sits inside padding that absorbs any error in the width table.
  // Marginal text has no such buffer: it is clamped to the exact gap before the
  // next label, so an underestimate collides. Measured against the real font,
  // the table runs up to ~13% light at this size, so give it room.
  const MARGIN_SAFETY = 1.18;
  const noteWidth = (t) => measure(t, D.LABEL_NOTE_SIZE, false) * MARGIN_SAFETY;

  const nextLineAfter = (x, y) => {
    let best = Infinity;
    for (const v of verticals) {
      if (v.x <= x + 2) continue;
      if (y <= v.y0 + 1 || y >= v.y1 - 1) continue;
      if (v.x < best) best = v.x;
    }
    return best;
  };

  // A note was clamped against the next branch drop and against any line
  // running down through it, but not against boxes — so a long note on a row
  // that happens to carry a box to its right ran straight into it. The glyph
  // (D1) pushes every note one glyph-width further right and made that visible,
  // but the overlap predates it. The note's row is one line of text around the
  // shared baseline.
  // `n.right`, not `n.left`: a box the note *starts inside* has to count too,
  // or the clamp silently stops applying at exactly the moment it is needed.
  // Such a box returns a limit to the left of the note's own origin, which
  // makes the room negative and drops the note — the right answer, because a
  // note printed over a box cannot be read anyway.
  const nextNodeAfter = (x, y) => {
    let best = Infinity;
    for (const n of nodes) {
      if (n.right <= x + 2) continue;
      if (y + 3 <= n.top || y - 9 >= n.bottom) continue;
      if (n.left < best) best = n.left;
    }
    return best;
  };

  const byQuestion = new Map();
  for (const e of paths) {
    if (!e.labelAt || !e.label) continue;
    if (!byQuestion.has(e.from)) byQuestion.set(e.from, []);
    byQuestion.get(e.from).push(e);
  }
  let rightMost = 0;
  for (const group of byQuestion.values()) {
    group.sort((a, b) => a.dropX - b.dropX);
    group.forEach((e, i) => {
      // Decorate once, here, where the width is derived. Adding the glyph in
      // the renderer instead would draw text wider than the space reserved for
      // it, and the overlap would be silent.
      e.labelText = labelWithTone(e.label, e.tone);
      e.labelSpoken = TONE_SPOKEN[normTone(e.tone)];
      e.labelW = measure(e.labelText, D.LABEL_SIZE, true) + 16;
      e.labelX = e.dropX + 8;
      const textY = e.labelAt.y - 8;
      const noteX = e.labelX + e.labelW + 8;
      const next = group[i + 1];
      const blocked = nextLineAfter(noteX, textY);
      const boxed = nextNodeAfter(noteX, textY);
      const limit = Math.min(next ? next.dropX - 34 : noteX + 300, blocked - 14, boxed - 10);
      const avail = limit - noteX;
      if (e.note && avail >= 80) {
        const room = Math.min(avail, 300) / MARGIN_SAFETY;
        e.noteText = wrapClamp(String(e.note), room, D.LABEL_NOTE_SIZE, 1)[0] || "";
        e.noteX = noteX;
        e.noteDropped = false;
        rightMost = Math.max(rightMost, noteX + noteWidth(e.noteText));
      } else {
        e.noteText = null;
        // A note with nowhere to go is omitted rather than printed over a box.
        // Flagged, not warned, because route() runs twice when the packed
        // columns had to be thrown away — the warning is emitted once, after
        // the final layout, by buildWorkflow.
        e.noteDropped = !!e.note;
      }
      rightMost = Math.max(rightMost, e.labelX + e.labelW * MARGIN_SAFETY);
    });
  }
  geo.width = Math.max(geo.width, Math.ceil(rightMost + D.PAD));

  // --- handoff markers (D5) ---
  //
  // Handoffs are where processes fail, and a reader should see them without
  // touching anything. Where two consecutive steps have different actors, the
  // line between them is ticked and labelled with the *receiving* actor's chip:
  // the tick says "it changes hands here", the chip says "to them".
  //
  // **`seq` edges only, and only between two steps.** A `fan` edge already
  // carries a branch label and its note in exactly the space a marker would
  // need, and the clamp that keeps those off the boxes is one item old — piling
  // a second decoration into that gap is how it gets regressed. A `merge` or
  // `bypass` rejoins a numbered step the reader has already met, chip and all,
  // so a marker there restates rather than reveals. And a terminal has no actor
  // to hand to.
  //
  // Placed with the same discipline as a branch note: given only the room that
  // actually exists — below the box, below its primary label if it has one,
  // above the next box, and clear of any line running across the gap — and
  // dropped rather than drawn over something if that room is not there.
  const horizontals = [];
  for (const e of paths) {
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const p = e.pts[i], q = e.pts[i + 1];
      if (p.y === q.y && p.x !== q.x) {
        horizontals.push({ y: p.y, x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x) });
      }
    }
  }

  const HANDOFF_TICK = 7;      // half-width of the tick across the line
  const HANDOFF_GAP = 4;       // tick to chip
  const HANDOFF_CLEAR = 8;     // vertical room the mark needs either side

  for (const e of paths) {
    e.handoff = null;
    if (e.kind !== "seq") continue;
    const a = nodes[e.from], b = nodes[e.to];
    if (!a || !b || a.kind !== "step" || b.kind !== "step") continue;
    if (!a.actor || !b.actor || a.actor.id === b.actor.id) continue;
    if (a.cx !== b.cx) continue;                 // only a straight vertical run

    const x = a.cx;
    const textX = x + HANDOFF_TICK + HANDOFF_GAP;
    const right = textX + measureMono(b.actor.short, D.MONO_SIZE);
    const left = x - HANDOFF_TICK;

    // The primary label ("Yes", "Default") already owns the top of the gap
    // under a question, so start below it.
    const top = a.bottom + (a.primaryLabel ? 26 : 11);
    const bot = b.top - 11;
    if (bot - top < -0.01) continue;

    const blocked = (y) => {
      for (const h of horizontals) {
        if (h.x1 < left - 1 || h.x0 > right + 1) continue;
        if (Math.abs(h.y - y) < HANDOFF_CLEAR) return true;
      }
      for (const n of nodes) {
        if (n.right <= left || n.left >= right) continue;
        if (y + HANDOFF_CLEAR <= n.top || y - HANDOFF_CLEAR >= n.bottom) continue;
        return true;
      }
      return false;
    };

    const mid = (top + bot) / 2;
    let y = null;
    for (const cand of [mid, (top + mid) / 2, (mid + bot) / 2, top, bot]) {
      if (cand < top - 0.01 || cand > bot + 0.01) continue;
      if (!blocked(cand)) { y = cand; break; }
    }
    if (y == null) continue;

    e.handoff = {
      x, y, textX, left, right,
      tick: HANDOFF_TICK,
      from: a.actor.id, to: b.actor.id,
      short: b.actor.short, name: b.actor.name,
    };
  }

  // --- line hops: horizontals jump over verticals they cross ---
  for (const e of paths) {
    e.hops = [];
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const p = e.pts[i], q = e.pts[i + 1];
      if (p.y !== q.y || p.x === q.x) continue;
      const lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
      const xs = [];
      for (const v of verticals) {
        if (v.edge === e) continue;
        if (v.x <= lo + 0.5 || v.x >= hi - 0.5) continue;
        if (v.y0 >= p.y - 0.5 || v.y1 <= p.y + 0.5) continue;
        xs.push(v.x);
      }
      if (xs.length) e.hops.push({ seg: i, y: p.y, xs: [...new Set(xs)].sort((m, n) => m - n) });
    }
  }

  return paths;
}

function findBand(geo, targetIndex) {
  for (const list of geo.gutterBands.values()) {
    const b = list.find((x) => x.targetIndex === targetIndex);
    if (b) return b;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 6b. Crossing detection                                              */
/* ------------------------------------------------------------------ */
//
// Touching at an endpoint is a junction: several branches leaving one question
// share a line, several merges into one node share a band. An intersection
// interior to both segments is a crossing, and there must not be any.

export function findCrossings(wfv) {
  const hor = [], ver = [];
  for (const e of wfv.edges) {
    if (!e.pts) continue;
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const p = e.pts[i], q = e.pts[i + 1];
      if (p.y === q.y && p.x !== q.x) {
        hor.push({ y: p.y, x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), e });
      } else if (p.x === q.x && p.y !== q.y) {
        ver.push({ x: p.x, y0: Math.min(p.y, q.y), y1: Math.max(p.y, q.y), e });
      }
    }
  }
  const out = [];
  for (const h of hor) {
    for (const v of ver) {
      if (v.x <= h.x0 + 0.01 || v.x >= h.x1 - 0.01) continue;
      if (h.y <= v.y0 + 0.01 || h.y >= v.y1 - 0.01) continue;
      out.push({ x: v.x, y: h.y, horizontal: h.e, vertical: v.e });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 7. Reachability, for hover highlighting                             */
/* ------------------------------------------------------------------ */

function reachability(g) {
  const { nodes, edges } = g;
  const n = nodes.length;
  const outAll = Array.from({ length: n }, () => []);
  const outSpine = Array.from({ length: n }, () => []);
  const inn = Array.from({ length: n }, () => []);

  for (const e of edges) {
    if (e.from == null || e.to == null) continue;
    outAll[e.from].push(e.to);
    // Taking an exception is a choice the reader has not made yet. Following
    // every branch off every later decision lights the whole sheet and says
    // nothing, so the forward cone runs down the spine and only opens out at
    // the node actually under the cursor.
    if (e.kind !== "fan" && e.kind !== "bypass") outSpine[e.from].push(e.to);
    inn[e.to].push(e.from);
  }

  const walk = (start, first, rest) => {
    const seen = new Set();
    const stack = [...first[start]];
    while (stack.length) {
      const k = stack.pop();
      if (seen.has(k)) continue;
      seen.add(k);
      for (const j of rest[k]) if (!seen.has(j)) stack.push(j);
    }
    return seen;
  };

  nodes.forEach((node, i) => {
    node.up = [...walk(i, inn, inn)].sort((a, b) => a - b);
    node.down = [...walk(i, outAll, outSpine)].sort((a, b) => a - b);
  });

  edges.forEach((e, ei) => { e.index = ei; });
}

/* ------------------------------------------------------------------ */
/* 8. Public entry                                                     */
/* ------------------------------------------------------------------ */

function buildWorkflow(wf, i, doc, errors, warnings, D, nodesByWf, forced, actors) {
  const g = flatten(wf, i, doc, errors, warnings, forced, actors);
  assignColumns(g);
  assignRows(g, i, errors);
  settleRows(g);
  checkDirections(g, i, errors);
  sizeNodes(g, D, nodesByWf, warnings);

  const phases = [];
  if (Array.isArray(wf.phases)) {
    for (const ph of wf.phases) {
      const a = g.byStepId.get(ph.from), b = g.byStepId.get(ph.to);
      if (!a || !b) {
        errors.push({ path: `workflows[${i}].phases`, message: `phase "${ph.label}" references an unknown step` });
        continue;
      }
      phases.push({ label: ph.label, fromRow: a.row, toRow: b.row });
    }
    phases.sort((p, q) => p.fromRow - q.fromRow);
  }

  const draw = () => {
    const geo = position(g, D, phases.length > 0);
    const paths = route(g, geo, D);
    return { geo, paths };
  };

  // Try the packed columns; keep them only if the drawing stays clean.
  const before = snapshotColumns(g);
  packColumns(g);
  settleRows(g);
  let { geo, paths } = draw();
  if (findCrossings({ edges: paths }).length) {
    restoreColumns(g, before);
    settleRows(g);
    ({ geo, paths } = draw());
  }

  reachability(g);

  // Authored text that never reaches the canvas must say so. Truncation already
  // warns; a dropped note is a larger loss and was silent until now.
  if (warnings) {
    for (const e of paths) {
      if (!e.noteDropped) continue;
      warnings.push({
        path: `workflows[${i}] branch "${e.label || ""}"`,
        message: `the note "${String(e.note)}" has no room beside its label and is ` +
                 `not drawn — a box or a line sits where it would go. Shorten it, ` +
                 `shorten the branch label, or move it into the step's detail.`,
      });
    }
  }

  return {
    id: wf.id, number: i + 1, title: wf.title || wf.id,
    description: wf.description, lens: wf.lens || "generic",
    summary: wf.summary, legend: wf.legend,
    nodes: g.nodes, edges: paths, lanes: g.lanes,
    byStepId: g.byStepId, phases,
    width: geo.width, height: geo.height,
    rowTop: geo.rowTop, rowH: geo.rowH, maxRow: geo.maxRow,
    hasPhases: phases.length > 0, D,
    raw: wf,
  };
}

/**
 * The stylesheet carries the look; the density table carries the sizes. Emitting
 * them from here is what keeps drawn text the same size as the text the layout
 * measured — the whole determinism argument rests on those agreeing.
 */
/**
 * How much of a sheet — or of a whole document — a human has actually checked.
 * Steps only: terminals and navigation chips assert nothing, so counting them
 * would inflate the denominator with boxes nobody can review.
 *
 * Rendered into page chrome at build time so the count is honest with scripting
 * off and on paper, then kept live by the review mode in app.js.
 */
export function reviewCounts(wfvs) {
  const list = Array.isArray(wfvs) ? wfvs : [wfvs];
  const out = { total: 0, verified: 0, disputed: 0, unverified: 0 };
  for (const wfv of list) {
    for (const n of wfv.nodes) {
      if (n.kind !== "step") continue;
      out.total++;
      out[normVerification(n.verification)]++;
    }
  }
  return out;
}

export function densityCss(D) {
  return [
    `.wf-title { font-size: ${D.TITLE_SIZE}px; }`,
    `.wf-chip-text { font-size: ${D.CHIP_SIZE}px; }`,
    `.wf-note, .wf-sub { font-size: ${D.NOTE_SIZE}px; }`,
    `.wf-mono { font-size: ${D.MONO_SIZE}px; }`,
    // D5 — the chip and the handoff mark are measured with measureMono() at
    // MONO_SIZE, so they must be drawn at MONO_SIZE. The gutter the title gave
    // up is exactly this wide and not a pixel wider.
    `.wf-actor, .wf-handoff-t { font-size: ${D.MONO_SIZE}px; }`,
    `.wf-label-main { font-size: ${D.LABEL_SIZE}px; }`,
    `.wf-label-note { font-size: ${D.LABEL_NOTE_SIZE}px; }`,
  ].join("\n");
}

/**
 * Fields `detail.mjs` reads as arrays, and the ones it reads as prose. A field
 * of the wrong shape is not rendered at all — see checkDetailShape's caller.
 */
const DETAIL_LISTS = [
  "procedure", "rules", "guardrails", "runbook", "commands", "failureModes",
  "transcript", "schema", "queries", "systems", "links", "metrics", "tracks",
  "stateSet", "inputs", "outputs",
];
const DETAIL_TEXTS = ["purpose", "prompt", "sample", "body", "actor"];

/**
 * Warn about `detail` sub-fields whose shape means they will be dropped.
 *
 * The failure this exists to stop: an author writes `"procedure": "do the
 * thing"`, the renderer's `Array.isArray(x) ? x : []` quietly discards it, and
 * the build reports zero problems — so a clean green result says nothing about
 * whether what they wrote actually survived into the page.
 */
export function checkDetailShape(detail, path, warn) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return;
  for (const f of DETAIL_LISTS) {
    const v = detail[f];
    if (v == null || Array.isArray(v)) continue;
    warn(`${path}.${f}`,
      `detail.${f} is ${Array.isArray(v) ? "an array" : `a ${typeof v}`}, and the panel reads it ` +
      "as a list — as written it will not be rendered at all",
      typeof v === "string"
        ? `wrap it in a list: ["${String(v).slice(0, 40)}${String(v).length > 40 ? "…" : ""}"]`
        : "write it as a list of items");
  }
  for (const f of DETAIL_TEXTS) {
    const v = detail[f];
    if (v == null || typeof v === "string") continue;
    warn(`${path}.${f}`,
      `detail.${f} is ${Array.isArray(v) ? "a list" : `a ${typeof v}`}, and the panel reads it ` +
      "as prose — as written it will not be rendered at all",
      Array.isArray(v) ? "join it into one string, or use a list field like procedure" : "write it as text");
  }
}

export function buildDocument(doc) {
  const errors = [];
  const warnings = [];

  if (!doc || typeof doc !== "object") throw new Fail("document is not an object");
  if (doc.wfd !== 1) errors.push({ path: "wfd", message: `unsupported format version ${JSON.stringify(doc.wfd)}`, hint: "expected 1" });
  if (!doc.title) errors.push({ path: "title", message: "document has no title" });

  // meta.date / meta.reviewEvery — the freshness pair (D4). Checked here so a
  // document that asks for a review interval it cannot compute is rejected at
  // build time rather than failing silently in the reader's browser.
  // A tag may not impersonate a verification state. `meta.tags: ["verified"]`
  // rendered as an ordinary chip that read exactly like the one a human review
  // earns, in a format whose central rule is that only a human may write
  // "verified". Reserved words are rejected rather than quietly renamed.
  {
    const reserved = new Set(VERIFICATIONS);
    const tags = (doc.meta && Array.isArray(doc.meta.tags)) ? doc.meta.tags : [];
    tags.forEach((t, i) => {
      if (typeof t === "string" && reserved.has(t.trim().toLowerCase())) {
        errors.push({
          path: `meta.tags[${i}]`,
          message: `"${t}" is a verification state and may not be used as a tag`,
          hint: "a tag sits beside the review chip and would be read as one. Only a human " +
            "marking a step may put that word on a document.",
        });
      }
    });
  }

  {
    const m = checkMeta(doc.meta);
    errors.push(...m.errors);
    warnings.push(...m.warnings);
    // meta.review — the provenance block "Publish review" writes. Same rule as
    // step.verification: only a human may write it, and a malformed record is
    // an error rather than a field quietly dropped.
    const rv = checkReview(doc.meta);
    errors.push(...rv.errors);
    warnings.push(...rv.warnings);
  }
  if (!Array.isArray(doc.workflows) || !doc.workflows.length) {
    errors.push({ path: "workflows", message: "document has no workflows" });
    return { doc, workflows: [], errors, warnings };
  }

  const D = DENSITY[(doc.theme && doc.theme.density) || "comfortable"] || DENSITY.comfortable;

  // D5 — the actor registry, read once for the whole document. Steps reference
  // it by id; an id that resolves to nothing is an error naming the step's own
  // `actorId`, the way `meta.reviewEvery` and `step.verification` are.
  const actors = buildActors(doc, errors, warnings);

  const seenWf = new Set();
  const nodesByWf = new Map();
  doc.workflows.forEach((wf, i) => {
    if (!wf.id) errors.push({ path: `workflows[${i}].id`, message: "workflow has no id" });
    else if (seenWf.has(wf.id)) errors.push({ path: `workflows[${i}].id`, message: `duplicate workflow id "${wf.id}"` });
    seenWf.add(wf.id);
    nodesByWf.set(wf.id, { number: i + 1, title: wf.title || wf.id, id: wf.id });
    if (!wf.summary) warnings.push({ path: `workflows[${i}]`, message: `workflow "${wf.title || wf.id}" has no summary block` });
  });

  // Build each workflow, then check the drawing. If any two lines cross, the
  // merge responsible is converted to a forward reference chip and the workflow
  // is laid out again. Each pass strictly removes one long vertical, so this
  // converges; the cap is a backstop, not an expectation.
  const built = doc.workflows.map((wf, i) => {
    const forced = new Set();
    let attempt = 0;
    let result = null;

    for (;;) {
      const wfErrors = [];
      const wfWarnings = [];
      result = buildWorkflow(wf, i, doc, wfErrors, wfWarnings, D, nodesByWf, forced, actors);
      result.errors = wfErrors;
      result.warnings = wfWarnings;

      if (wfErrors.length) break;                       // geometry is meaningless now

      const crossings = findCrossings(result);
      if (!crossings.length) break;

      // Prefer to redraw the merge, never the fan: a fan is how a branch begins.
      let progressed = false;
      for (const c of crossings) {
        const candidate =
          (c.horizontal.kind === "merge" || c.horizontal.kind === "bypass") ? c.horizontal :
          (c.vertical.kind === "merge" || c.vertical.kind === "bypass") ? c.vertical : null;
        if (!candidate) continue;
        const lane = result.lanes[candidate.lane];
        if (!lane || forced.has(lane.laneId)) continue;
        forced.add(lane.laneId);
        progressed = true;
        break;
      }

      if (!progressed || ++attempt > 24) {
        for (const c of crossings) {
          wfWarnings.push({
            path: `workflows[${i}]`,
            message: `two lines cross near (${Math.round(c.x)}, ${Math.round(c.y)}) and the layout could not separate them`,
          });
        }
        break;
      }
    }

    if (forced.size) {
      result.warnings.push({
        path: `workflows[${i}]`,
        message: `${forced.size} merge(s) were drawn as "Continue at" chips because the line ` +
                 `could not reach its target without crossing another`,
      });
    }
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    return result;
  });

  // resolve goto -> node uid for deep links
  for (const wfv of built) {
    for (const n of wfv.nodes) {
      if (n.kind !== "goto") continue;
      const target = built.find((w) => w.id === n.ref.workflow);
      if (!target) continue;
      n.ref.wfNumber = target.number;
      n.ref.wfTitle = target.title;
      if (n.ref.step) {
        const t = target.byStepId.get(n.ref.step);
        if (t) n.ref.uid = t.uid;
        else errors.push({ path: `workflows goto`, message: `goto step "${n.ref.step}" not found in workflow "${n.ref.workflow}"` });
      }
    }
    for (const n of wfv.nodes) {
      if ((n.kind === "goback" || n.kind === "goforward") && n.ref.node != null) {
        n.ref.uid = wfv.nodes[n.ref.node].uid;
      }
      if (n.type === "insert" && n.source && n.source.workflow) {
        const target = built.find((w) => w.id === n.source.workflow);
        if (target) { n.insertRef = { id: target.id, number: target.number, title: target.title }; }
      }
    }
  }

  return { doc, workflows: built, errors, warnings, D, actors };
}
