// SVG emission for WFD. Consumes the geometry produced by layout.mjs and does
// no computation of its own beyond path string assembly.

import { esc, attr, plain } from "./md.mjs";
import { normVerification } from "./layout.mjs";
import { measure } from "./text.mjs";

const R = (n) => Math.round(n * 100) / 100;

/* ---------------------------------------------------------------- shapes */

function shapePath(n, D) {
  const { x, y, w, h } = n;
  const r = D.CORNER;
  const x2 = x + w, y2 = y + h;

  switch (n.type) {
    case "start": case "end": {
      const rr = Math.min(h / 2, 22);
      return `M${R(x + rr)},${R(y)} H${R(x2 - rr)} A${R(rr)},${R(rr)} 0 0 1 ${R(x2 - rr)},${R(y2)}` +
             ` H${R(x + rr)} A${R(rr)},${R(rr)} 0 0 1 ${R(x + rr)},${R(y)} Z`;
    }
    case "question": case "choice": {
      const s = D.SLANT, m = y + h / 2;
      return `M${R(x + s)},${R(y)} H${R(x2 - s)} L${R(x2)},${R(m)} L${R(x2 - s)},${R(y2)}` +
             ` H${R(x + s)} L${R(x)},${R(m)} Z`;
    }
    case "input": {
      const s = D.PARA_SLANT;
      return `M${R(x + s)},${R(y)} H${R(x2)} L${R(x2 - s)},${R(y2)} H${R(x)} Z`;
    }
    case "output": {
      const s = D.PARA_SLANT;
      return `M${R(x)},${R(y)} H${R(x2 - s)} L${R(x2)},${R(y2)} H${R(x + s)} Z`;
    }
    case "wait": {
      const c = 11;
      return `M${R(x + c)},${R(y)} H${R(x2 - c)} L${R(x2)},${R(y + c)} V${R(y2 - c)}` +
             ` L${R(x2 - c)},${R(y2)} H${R(x + c)} L${R(x)},${R(y2 - c)} V${R(y + c)} Z`;
    }
    case "goback": case "goto": case "goforward": {
      const rr = Math.min(h / 2, 14);
      return `M${R(x + rr)},${R(y)} H${R(x2 - rr)} A${R(rr)},${R(rr)} 0 0 1 ${R(x2 - rr)},${R(y2)}` +
             ` H${R(x + rr)} A${R(rr)},${R(rr)} 0 0 1 ${R(x + rr)},${R(y)} Z`;
    }
    default: {
      return `M${R(x + r)},${R(y)} H${R(x2 - r)} Q${R(x2)},${R(y)} ${R(x2)},${R(y + r)}` +
             ` V${R(y2 - r)} Q${R(x2)},${R(y2)} ${R(x2 - r)},${R(y2)}` +
             ` H${R(x + r)} Q${R(x)},${R(y2)} ${R(x)},${R(y2 - r)}` +
             ` V${R(y + r)} Q${R(x)},${R(y)} ${R(x + r)},${R(y)} Z`;
    }
  }
}

/** Top edge of a node's text block. Ornaments and text must agree on this. */
function blockTop(n) { return n.y + (n.h - n.blockH) / 2; }

/** Decorations drawn on top of the base shape (bars, dividers, glyphs). */
function ornaments(n, D) {
  const { x, y, w, h } = n;
  const x2 = x + w, y2 = y + h;
  const out = [];

  if (n.type === "insert") {
    out.push(`<line class="wf-orn" x1="${R(x + 9)}" y1="${R(y)}" x2="${R(x + 9)}" y2="${R(y2)}"/>`);
    out.push(`<line class="wf-orn" x1="${R(x2 - 9)}" y1="${R(y)}" x2="${R(x2 - 9)}" y2="${R(y2)}"/>`);
  }
  if (n.type === "parallel") {
    out.push(`<line class="wf-orn" x1="${R(x)}" y1="${R(y + 5)}" x2="${R(x2)}" y2="${R(y + 5)}"/>`);
    out.push(`<line class="wf-orn" x1="${R(x)}" y1="${R(y2 - 5)}" x2="${R(x2)}" y2="${R(y2 - 5)}"/>`);
  }
  if (n.type === "shelf" && n.detailLines.length) {
    const divY = blockTop(n) + n.titleH + 2;
    out.push(`<line class="wf-orn" x1="${R(x)}" y1="${R(divY)}" x2="${R(x2)}" y2="${R(divY)}"/>`);
  }
  if (n.type === "choice") {
    const s = D.SLANT, m = y + h / 2;
    out.push(`<path class="wf-orn" d="M${R(x + s)},${R(y + 4)} L${R(x + 5)},${R(m)} L${R(x + s)},${R(y2 - 4)}" fill="none"/>`);
    out.push(`<path class="wf-orn" d="M${R(x2 - s)},${R(y + 4)} L${R(x2 - 5)},${R(m)} L${R(x2 - s)},${R(y2 - 4)}" fill="none"/>`);
  }
  return out.join("");
}

/* ----------------------------------------------------------------- edges */

function orthoPath(pts, radius, hops) {
  if (!pts || pts.length < 2) return "";
  const hopFor = (i) => (hops || []).find((h) => h.seg === i);
  let d = `M${R(pts[0].x)},${R(pts[0].y)}`;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const horizontal = prev.y === cur.y;
    const hop = horizontal ? hopFor(i - 1) : null;

    // travel along this segment, inserting hops on horizontals
    if (hop && hop.xs.length) {
      const right = cur.x > prev.x;
      const xs = right ? [...hop.xs].sort((a, b) => a - b) : [...hop.xs].sort((a, b) => b - a);
      const rr = 5;
      for (const hx of xs) {
        const a = right ? hx - rr : hx + rr;
        const b = right ? hx + rr : hx - rr;
        d += ` L${R(a)},${R(cur.y)} A${rr},${rr} 0 0 ${right ? 1 : 0} ${R(b)},${R(cur.y)}`;
      }
    }

    if (next) {
      // round the corner at `cur`
      const inDx = Math.sign(cur.x - prev.x), inDy = Math.sign(cur.y - prev.y);
      const outDx = Math.sign(next.x - cur.x), outDy = Math.sign(next.y - cur.y);
      const rIn = Math.min(radius, Math.abs(cur.x - prev.x) / 2 || Infinity, Math.abs(cur.y - prev.y) / 2 || Infinity);
      const rOut = Math.min(radius, Math.abs(next.x - cur.x) / 2 || Infinity, Math.abs(next.y - cur.y) / 2 || Infinity);
      const rad = Math.max(0, Math.min(rIn, rOut, radius));
      const ax = cur.x - inDx * rad, ay = cur.y - inDy * rad;
      const bx = cur.x + outDx * rad, by = cur.y + outDy * rad;
      d += ` L${R(ax)},${R(ay)} Q${R(cur.x)},${R(cur.y)} ${R(bx)},${R(by)}`;
    } else {
      d += ` L${R(cur.x)},${R(cur.y)}`;
    }
  }
  return d;
}

/* ------------------------------------------------------------------ text */

function textBlock(n, D) {
  const out = [];
  // D5 — each paragraph is centred in the room its own rows have. The chip sits
  // in a gutter on the right of the first title line, so the title block gives
  // up that gutter and centres in what is left; the note block is on rows the
  // chip cannot reach, so it keeps the box's own centre and its full width.
  // Both are exactly the widths layout wrapped them to. A node with no actor has
  // a zero gutter and both centres collapse onto the same axis, as before.
  const cx = n.x + n.w / 2;
  const titleCx = cx - (n.actorGutter || 0) / 2;
  let y = blockTop(n);

  const titleCls = CHIP.has(n.kind) ? "wf-chip-text" : "wf-title";
  for (const line of n.titleLines) {
    out.push(`<text class="${titleCls}" x="${R(titleCx)}" y="${R(y + D.TITLE_LH * 0.74)}">${esc(line)}</text>`);
    y += D.TITLE_LH;
  }
  if (n.detailLines.length) {
    y += 4;
    for (const d of n.detailLines) {
      out.push(`<text class="${d.cls}" x="${R(cx)}" y="${R(y + D.NOTE_LH * 0.74)}">${esc(d.t)}</text>`);
      y += D.NOTE_LH;
    }
  }
  return out.join("");
}

/**
 * The actor chip — D5.
 *
 * **Where.** Right-aligned in the gutter layout reserved, on the first title
 * line's baseline. Not the margin: the margin above the box is fully spent, with
 * the step number at top-left and the author tag at top-right, and the channel
 * budget assigns actor to the in-box chip. Not the vertical middle of the box
 * either — a `shelf` draws its divider across the box at a height that depends on
 * how many title lines it has, and at one common combination that divider lands
 * exactly on a vertically-centred chip. The first title line is the one row that
 * is above every type ornament (`shelf`'s divider, `parallel`'s lower bar) and
 * inside every slanted shape with room to spare, at every title height the box
 * can hold. Checked against all nine step types.
 *
 * **Monospace, so greyscale is not a special case.** Two or three uppercase
 * letters in the same face the step numbers use: no hue, no weight, no texture,
 * nothing that a photocopy or a colour-blind reader loses. It is the only
 * self-describing mark on the sheet — the legend says what SH means, but SH
 * already looks like an abbreviation of something, which no glyph does.
 */
function actorChip(n, D) {
  if (!n.actor) return "";
  const x = n.x + n.w - n.inset;
  const y = blockTop(n) + D.TITLE_LH * 0.74;
  return `<text class="wf-actor" x="${R(x)}" y="${R(y)}">${esc(n.actor.short)}</text>`;
}

/**
 * The dispute flag.
 *
 * A step marked "Needs work" used to draw exactly like a step nobody had looked
 * at: both take the lighter outline, and the panel counter was the only thing
 * that knew. The one judgement that should stop a colleague was invisible on the
 * sheet.
 *
 * It could not be fixed in any existing channel — hue is severity, dashes are
 * reference chips, opacity is interaction state, the in-box chip is actors, and
 * border weight is confidence itself. So this opens the one piece of unspent
 * space on a node: OUTSIDE the box, top-right, mirroring the step number that
 * already sits outside top-left. It is a shape, not just a colour, so it
 * survives greyscale and printing.
 *
 * Deliberately NOT drawn for verified or unverified: a flag that appears on
 * every step is decoration. Only a positive human judgement earns a mark.
 */
function disputeFlag(n) {
  if (n.kind !== "step" || normVerification(n.verification) !== "disputed") return "";
  const x = n.left + n.w, y = n.top - 7;
  return `<g class="wf-flag" aria-hidden="true">` +
    `<path class="wf-flag-mast" d="M${R(x)},${R(y - 2)} L${R(x)},${R(y + 9)}"/>` +
    `<path class="wf-flag-cloth" d="M${R(x)},${R(y - 2)} L${R(x + 9)},${R(y + 1)} L${R(x)},${R(y + 4)} Z"/>` +
    `</g>`;
}

function badge(n, D) {
  if (!n.num) return "";
  return `<text class="wf-num" x="${R(n.left)}" y="${R(n.top - 7)}">${esc(n.num)}</text>`;
}

function tagChip(n, D) {
  if (!n.tag) return "";
  return `<text class="wf-tag" x="${R(n.right)}" y="${R(n.top - 7)}">${esc(String(n.tag))}</text>`;
}

const CHIP = new Set(["goback", "goto", "goforward"]);

// Border weight is invisible to a screen reader, so the state is spoken. Said
// for every state including the default: silence would be indistinguishable
// from "this reader's software dropped it", and the default is the one a reader
// most needs to hear.
const VERIFICATION_SPOKEN = {
  unverified: ", not verified",
  verified: ", verified by a reviewer",
  disputed: ", disputed by a reviewer",
};

function chipGlyph(n) {
  const gx = n.x + 15, gy = n.y + n.h / 2;
  // Three behaviours, three glyphs. A cross-sheet jump takes you off the page
  // and a forward rejoin does not, so they must not share a symbol (see D2).
  const g = n.kind === "goback" ? "&#8617;" : n.kind === "goto" ? "&#8599;" : "&#8594;";
  return `<text class="wf-glyph" x="${R(gx)}" y="${R(gy + 5)}">${g}</text>`;
}

/* --------------------------------------------------------------- diagram */

export function renderDiagram(wfv) {
  const D = wfv.D;
  const out = [];
  const pad = D.PAD;

  // ---- phase bands
  if (wfv.hasPhases) {
    wfv.phases.forEach((ph, i) => {
      const top = wfv.rowTop[ph.fromRow] - 13;
      const bottom = wfv.rowTop[ph.toRow] + wfv.rowH[ph.toRow] + 13;
      const railX = pad * 0.42;
      out.push(
        `<g class="wf-phase ${i % 2 ? "alt" : ""}">` +
        `<rect class="wf-phase-band" x="${R(railX)}" y="${R(top)}" width="${R(wfv.width - pad)}" height="${R(bottom - top)}" rx="10"/>` +
        `<rect class="wf-phase-spine" x="${R(railX)}" y="${R(top)}" width="4" height="${R(bottom - top)}" rx="2"/>` +
        `<text class="wf-phase-label" transform="translate(${R(railX + 19)},${R((top + bottom) / 2)}) rotate(-90)">${esc(ph.label)}</text>` +
        `</g>`
      );
    });
  }

  // ---- edges (painted first, but each terminates exactly on a node border)
  out.push(`<g class="wf-edges">`);
  for (const e of wfv.edges) {
    if (!e.pts) continue;
    const d = orthoPath(e.pts, 8, e.hops);
    const from = wfv.nodes[e.from], to = wfv.nodes[e.to];
    const primary = from && to && from.col === 0 && to.col === 0 && e.kind === "seq";
    const cls = ["wf-edge", `k-${e.kind}`, primary ? "is-primary" : "",
      e.tone && e.tone !== "neutral" ? `tone-${e.tone}` : ""].filter(Boolean).join(" ");
    out.push(
      `<path class="${cls}" d="${d}" data-from="${attr(from ? from.uid : "")}" data-to="${attr(to ? to.uid : "")}"` +
      (e.branchUid ? ` data-branch="${attr(e.branchUid)}"` : "") + `/>`
    );
  }
  out.push(`</g>`);

  // ---- handoff markers (D5): the line is ticked where work changes hands
  //
  // Painted after the edges so the tick sits on top of the line it marks, and
  // before the labels so a branch label always wins a contest neither should
  // ever have — layout drops a marker rather than let one happen.
  //
  // `aria-hidden`, deliberately. Both boxes either side already announce their
  // actor by name, so a reader using the announcement has the handoff twice
  // over; a third reading of "PAY" between them would be noise. The marker
  // buys the *visual* reader what the announcement already gives everyone else.
  const handoffs = wfv.edges.filter((e) => e.handoff);
  if (handoffs.length) {
    out.push(`<g class="wf-handoffs" aria-hidden="true">`);
    for (const e of handoffs) {
      const h = e.handoff;
      out.push(
        `<g class="wf-handoff" data-actor="${attr(h.to)}" data-actor-from="${attr(h.from)}">` +
        `<line class="wf-handoff-tick" x1="${R(h.x - h.tick)}" y1="${R(h.y)}"` +
        ` x2="${R(h.x + h.tick)}" y2="${R(h.y)}"/>` +
        `<text class="wf-handoff-t" x="${R(h.textX)}" y="${R(h.y + 4)}">${esc(h.short)}</text>` +
        `</g>`
      );
    }
    out.push(`</g>`);
  }

  // ---- branch labels sit above the fan line, at the drop point
  out.push(`<g class="wf-labels">`);
  for (const e of wfv.edges) {
    if (!e.labelAt || !e.label) continue;
    // The drawn string carries the severity glyph and was measured with it in
    // layout; the spoken string never does — a reader hearing "ballot X" learns
    // nothing, and "Variation, error: Declined" is the same fact in words.
    const text = e.labelText != null ? String(e.labelText) : String(e.label);
    const spoken = e.labelSpoken
      ? `Variation, ${e.labelSpoken}: ${e.label}`
      : `Variation: ${e.label}`;
    const lx = e.labelX != null ? e.labelX : e.labelAt.x + 8;
    const ly = e.labelAt.y - 8;
    const cls = ["wf-label", e.tone && e.tone !== "neutral" ? `tone-${e.tone}` : ""].filter(Boolean).join(" ");
    // The note lives inside the label's group so the two light and dim together.
    // Split apart they read as unrelated, which is what made highlighting look
    // half-applied.
    out.push(
      `<g class="${cls}" data-branch="${attr(e.branchUid || "")}" tabindex="0" role="button"` +
      ` aria-label="${attr(spoken)}">` +
      `<rect class="wf-label-hit" x="${R(lx - 4)}" y="${R(ly - 13)}" width="${R((e.labelW || 40))}" height="18"/>` +
      `<text class="wf-label-main" x="${R(lx)}" y="${R(ly)}">${esc(text)}</text>` +
      (e.noteText ? `<text class="wf-label-note" x="${R(e.noteX)}" y="${R(ly)}">${esc(e.noteText)}</text>` : "") +
      `</g>`
    );
  }
  for (const n of wfv.nodes) {
    if (!n.primaryLabel) continue;
    out.push(`<text class="wf-primary-label" data-node="${attr(n.uid)}" ` +
      `x="${R(n.cx + 8)}" y="${R(n.bottom + 15)}">${esc(n.primaryLabel)}</text>`);
  }
  out.push(`</g>`);

  // ---- nodes
  out.push(`<g class="wf-nodes">`);
  for (const n of wfv.nodes) {
    const clickable = n.kind === "step" || n.detail;
    // D3 — confidence rides on border weight, and only on steps. Terminals and
    // navigation chips assert nothing, so marking them would be noise claiming
    // to be information. The class only sets a custom property; every
    // interaction rule keeps its literal stroke-width and still wins.
    const verification = n.kind === "step" ? normVerification(n.verification) : null;
    const classes = [
      "wf-node", `n-${n.type}`, `k-${n.kind}`,
      n.tone && n.tone !== "neutral" ? `tone-${n.tone}` : "",
      verification ? `v-${verification}` : "",
      n.col === 0 ? "is-primary" : "",
      clickable ? "is-clickable" : "",
      n.ref && n.ref.uid ? "is-link" : "",
      n.insertRef ? "is-link" : "",
    ].filter(Boolean).join(" ");

    // The chip is two letters and the legend is somewhere else on the page, so
    // a screen reader gets the actor's whole name instead. Said before the
    // verification state, because who owns a step is read before how much of it
    // has been checked.
    const aria = n.kind === "step"
      ? `Step ${n.num}: ${plain(n.title)}` +
        (n.actor ? `, ${n.actor.name}` : "") +
        `${VERIFICATION_SPOKEN[verification] || ""}`
      : `${n.kind}: ${plain(n.chipText || n.title)}`;

    out.push(
      `<g class="${classes}" id="${attr(n.uid)}" data-uid="${attr(n.uid)}"` +
      ` data-up="${n.up.map((i) => wfv.nodes[i].uid).join(" ")}"` +
      ` data-down="${n.down.map((i) => wfv.nodes[i].uid).join(" ")}"` +
      (n.ref && n.ref.uid ? ` data-jump="${attr(n.ref.uid)}"` : "") +
      (n.ref && n.ref.workflow ? ` data-jump-wf="${attr(n.ref.workflow)}"` : "") +
      (n.insertRef ? ` data-jump-wf="${attr(n.insertRef.id)}"` : "") +
      (verification ? ` data-step="${attr(n.id || "")}" data-v="${attr(verification)}"` : "") +
      (n.actor ? ` data-actor="${attr(n.actor.id)}"` : "") +
      ` tabindex="0" role="button" aria-label="${attr(aria)}">` +
      `<title>${esc(plain(n.chipText || n.title))}</title>` +
      `<path class="wf-shape" d="${shapePath(n, D)}"/>` +
      ornaments(n, D) +
      (CHIP.has(n.kind) ? chipGlyph(n) : "") +
      textBlock(n, D) + badge(n, D) + tagChip(n, D) + actorChip(n, D) + disputeFlag(n) +
      `</g>`
    );
  }
  out.push(`</g>`);

  const w = Math.ceil(wfv.width), h = Math.ceil(wfv.height);
  return { svg: out.join("\n"), width: w, height: h };
}

/* --------------------------------------------------------------- preview */

/**
 * A thumbnail of the sheet: real geometry, no words. At card size the text
 * would be illegible anyway, so drawing only the shapes says the honest thing —
 * here is how this flow is built, how far it fans, where it ends.
 */
export function renderPreview(wfv, boxW, boxH) {
  const out = [];
  const pad = 6;
  const w = wfv.width + pad * 2;
  const h = wfv.height + pad * 2;
  const scale = Math.min(boxW / w, boxH / h);

  out.push(`<g transform="translate(${pad},${pad})">`);

  for (const e of wfv.edges) {
    if (!e.pts || e.pts.length < 2) continue;
    const d = e.pts.map((p, i) => `${i ? "L" : "M"}${R(p.x)},${R(p.y)}`).join(" ");
    out.push(`<path class="pv-edge" d="${d}"/>`);
  }
  for (const n of wfv.nodes) {
    const cls = ["pv-node", `n-${n.type}`, `k-${n.kind}`,
      n.tone && n.tone !== "neutral" ? `tone-${n.tone}` : "",
      n.col === 0 ? "is-primary" : ""].filter(Boolean).join(" ");
    out.push(`<path class="${cls}" d="${shapePath(n, wfv.D)}"/>`);
  }
  out.push(`</g>`);

  return `<svg class="pv" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}"` +
    ` width="${Math.round(w * scale)}" height="${Math.round(h * scale)}"` +
    ` preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false">${out.join("")}</svg>`;
}
