// Renders a step's `detail` object into modal HTML. Lens-aware.

import { md, mdInline, esc, attr, plain } from "./md.mjs";

const TYPE_LABEL = {
  action: "Action", question: "Question", choice: "Choice", input: "Input",
  output: "Output", shelf: "State", insert: "Insert", wait: "Wait",
  parallel: "Parallel", start: "Start", end: "End",
  goback: "Return", goto: "Jump", goforward: "Continue",
};

const ROLE_LABEL = { user: "User", assistant: "Assistant", tool: "Tool", system: "System" };

const list = (arr) => Array.isArray(arr) ? arr : [];

function section(title, body, cls = "") {
  if (!body) return "";
  return `<section class="md-sec ${cls}"><h4 class="md-sec-t">${esc(title)}</h4>${body}</section>`;
}

function bullets(arr) {
  const items = list(arr).filter(Boolean);
  if (!items.length) return "";
  return `<ul class="md-list">${items.map((s) => `<li>${mdInline(s)}</li>`).join("")}</ul>`;
}

function defs(arr) {
  const items = list(arr).filter((d) => d && (d.label || d.name || d.key));
  if (!items.length) return "";
  return `<dl class="md-defs">${items.map((d) =>
    `<dt>${esc(d.label || d.name || d.key)}</dt><dd>${mdInline(d.value != null ? d.value : (d.text || ""))}</dd>`
  ).join("")}</dl>`;
}

/* ------------------------------------------------------------- ai lens */

function transcript(turns) {
  const items = list(turns);
  if (!items.length) return "";
  return `<div class="tx">${items.map((t) => {
    if (t.role === "tool" || t.tool) {
      const name = t.name || (t.tool && t.tool.name) || "tool";
      const input = t.input != null ? t.input : (t.tool && t.tool.input);
      const output = t.output != null ? t.output : (t.tool && t.tool.output);
      const bad = t.status === "error";
      return `<div class="tx-turn tx-tool${bad ? " is-error" : ""}">` +
        `<div class="tx-head"><span class="tx-role">Tool</span><code class="tx-name">${esc(name)}</code>` +
        `<span class="tx-status">${bad ? "error" : "ok"}</span></div>` +
        (input != null ? `<pre class="tx-io"><span class="tx-io-k">in</span>${esc(input)}</pre>` : "") +
        (output != null ? `<pre class="tx-io"><span class="tx-io-k">out</span>${esc(output)}</pre>` : "") +
        `</div>`;
    }
    const role = ROLE_LABEL[t.role] || "Assistant";
    return `<div class="tx-turn tx-${esc(t.role || "assistant")}">` +
      `<div class="tx-head"><span class="tx-role">${esc(role)}</span></div>` +
      `<div class="tx-body">${md(t.text || "")}</div></div>`;
  }).join("")}</div>`;
}

function fileRail(files) {
  const items = list(files);
  if (!items.length) return "";
  return `<ul class="rail-files">${items.map((f) => {
    const a = (f.action || "read").toLowerCase();
    return `<li class="fa-${esc(a)}"><span class="fa-tag">${esc(a)}</span>` +
      `<code>${esc(f.path || "")}</code>` +
      (f.note ? `<span class="fa-note">${mdInline(f.note)}</span>` : "") + `</li>`;
  }).join("")}</ul>`;
}

/* ------------------------------------------------------------- ui lens */

const EL = {
  heading: (e) => `<div class="wf-el el-heading">${esc(e.label || "")}</div>`,
  text: (e) => `<div class="wf-el el-text">${esc(e.label || "")}</div>`,
  divider: () => `<div class="wf-el el-divider"></div>`,
  badge: (e) => `<div class="wf-el el-badge"><span>${esc(e.label || "")}</span></div>`,
  image: (e) => `<div class="wf-el el-image"><span>${esc(e.label || "image")}</span></div>`,
  input: (e) => `<div class="wf-el el-input"><span class="el-lab">${esc(e.label || "")}</span>` +
    `<span class="el-field">${esc(e.hint || "")}</span></div>`,
  button: (e) => `<div class="wf-el el-button"><span>${esc(e.label || "")}</span></div>`,
  list: (e) => `<div class="wf-el el-list"><span class="el-lab">${esc(e.label || "")}</span>` +
    (e.hint ? `<span class="el-field">${esc(e.hint)}</span>` : "") + `</div>`,
};

function wireframe(screen, resolve) {
  if (!screen || !list(screen.elements).length) return "";
  const els = list(screen.elements).map((e) => {
    const fn = EL[e.type] || EL.text;
    const cls = ["wf-el-wrap", e.state && e.state !== "default" ? `st-${esc(e.state)}` : "",
      e.target && resolve(e.target) ? "has-target" : ""].filter(Boolean).join(" ");
    const uid = e.target ? resolve(e.target) : null;
    return `<div class="${cls}"${uid ? ` data-jump="${attr(uid)}" tabindex="0" role="button"` : ""}>` +
      fn(e) + (uid ? `<span class="el-arrow">&#8594;</span>` : "") + `</div>`;
  }).join("");
  return `<div class="wire"><div class="wire-chrome"><span></span><span></span><span></span>` +
    `<b>${esc(screen.title || "Screen")}</b></div><div class="wire-body">${els}</div></div>`;
}

function options(opts, resolve) {
  const items = list(opts);
  if (!items.length) return "";
  return `<ul class="opt-list">${items.map((o) => {
    const uid = o.leadsTo ? resolve(o.leadsTo) : null;
    return `<li${uid ? ` data-jump="${attr(uid)}" tabindex="0" role="button" class="is-jump"` : ""}>` +
      `<div class="opt-h"><span class="opt-l">${esc(o.label || "")}</span>` +
      (uid ? `<span class="opt-go">leads to &#8594;</span>` : "") + `</div>` +
      (o.why ? `<div class="opt-w">${mdInline(o.why)}</div>` : "") + `</li>`;
  }).join("")}</ul>`;
}

/* -------------------------------------------------------- data/ops lens */

function schemaTable(rows) {
  const items = list(rows);
  if (!items.length) return "";
  return `<table class="md-table"><thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead><tbody>` +
    items.map((r) => `<tr><td><code>${esc(r.field || "")}</code></td><td>${esc(r.type || "")}</td>` +
      `<td>${mdInline(r.note || "")}</td></tr>`).join("") + `</tbody></table>`;
}

function commands(cmds) {
  const items = list(cmds);
  if (!items.length) return "";
  return `<div class="cmds">${items.map((c) =>
    `<div class="cmd"><pre class="md-code"><code>${esc(c.cmd || c.code || "")}</code></pre>` +
    (c.note ? `<div class="cmd-note">${mdInline(c.note)}</div>` : "") + `</div>`
  ).join("")}</div>`;
}

function alerts(rows) {
  const items = list(rows);
  if (!items.length) return "";
  return `<ul class="alert-list">${items.map((a) =>
    `<li class="sev-${esc(a.severity || "info")}"><span class="sev">${esc(a.severity || "info")}</span>` +
    `<b>${esc(a.name || "")}</b>${a.condition ? `<span class="cond">${mdInline(a.condition)}</span>` : ""}</li>`
  ).join("")}</ul>`;
}

/* ------------------------------------------------------------ assembly */

export function renderDetail(node, wfv, doc) {
  const d = node.detail || {};
  const lens = wfv.lens || "generic";
  const resolve = (id) => {
    const t = wfv.byStepId.get(id);
    return t ? t.uid : null;
  };
  const left = [];
  const rail = [];

  // ---------- header meta strip
  const facts = [];
  if (d.actor) facts.push(["Actor", d.actor]);
  if (d.duration) facts.push(["Duration", d.duration]);
  if (node.durationText) facts.push(["Waits", node.durationText]);
  if (d.model) facts.push(["Model", d.model]);
  if (node.source && node.source.source) facts.push(["Source", node.source.source]);
  if (node.source && node.source.destination) facts.push(["Destination", node.source.destination]);
  if (list(d.systems).length) facts.push(["Systems", list(d.systems).join(" · ")]);
  const factStrip = facts.length
    ? `<div class="mo-facts">${facts.map(([k, v]) =>
        `<div class="mo-fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>`
    : "";

  // ---------- left column
  // A dispute with a reason attached. First in the panel, above the author's own
  // material: a reviewer stopped this step, and the person who opened it needs to
  // know that before they read anything else. A bare flag told them nothing.
  if (node.verificationNote) {
    left.push(section("Marked as needing work", md(node.verificationNote), "sec-dispute"));
  }
  if (d.purpose) left.push(section("Purpose", md(d.purpose)));

  if (node.type === "shelf" && list(node.source && node.source.assign).length) {
    left.push(section("State set here",
      `<dl class="md-defs">${list(node.source.assign).map((a) =>
        `<dt><code>${esc(a.name)}</code></dt><dd><code>${esc(a.value)}</code></dd>`).join("")}</dl>`));
  }
  if (node.type === "parallel" && list(node.source && node.source.tracks).length) {
    left.push(section("Concurrent tracks", bullets(node.source.tracks)));
  }

  if (lens === "ui") {
    const w = wireframe(d.screen, resolve);
    if (w) left.push(section(d.screen && d.screen.title ? "Screen" : "Wireframe", w, "sec-wire"));
  }

  if (d.procedure) left.push(section("How it works", bullets(d.procedure)));
  if (d.prompt) left.push(section("Prompt", md(d.prompt)));

  if (lens === "ai" && list(d.transcript).length) {
    left.push(section("What the run looks like", transcript(d.transcript), "sec-tx"));
  }
  if (lens === "data") {
    if (list(d.schema).length) left.push(section("Schema", schemaTable(d.schema)));
    if (d.sample) left.push(section("Sample", md(d.sample)));
    if (list(d.queries).length) left.push(section("Queries", commands(list(d.queries).map((q) => ({ cmd: q.code, note: q.label })))));
  }
  if (lens === "ops" || list(d.runbook).length) {
    if (list(d.runbook).length) left.push(section("Runbook", bullets(d.runbook)));
    if (list(d.commands).length) left.push(section("Commands", commands(d.commands)));
  }
  if (list(d.rules).length) left.push(section("Rules and constraints", bullets(d.rules)));
  if (list(d.guardrails).length) left.push(section("Guardrails", bullets(d.guardrails), "sec-guard"));

  if (list(d.failureModes).length) {
    left.push(section("When it goes wrong",
      `<ul class="fail-list">${list(d.failureModes).map((f) => {
        const target = f.step && wfv.byStepId.get(f.step);
        return `<li${target ? ` data-jump="${attr(target.uid)}" tabindex="0" role="button" class="is-jump"` : ""}>` +
          `<span class="fail-when">${mdInline(f.when || "")}</span>` +
          `<span class="fail-then">${mdInline(f.then || "")}</span>` +
          (target ? `<span class="fail-go">${esc(target.num)} &#8594;</span>` : "") + `</li>`;
      }).join("")}</ul>`));
  }
  if (d.body) left.push(section("Notes", md(d.body)));

  // ---------- rail
  if ((node.kind === "goback" || node.kind === "goforward") && node.ref && node.ref.uid) {
    const t = wfv.nodes.find((x) => x.uid === node.ref.uid);
    rail.push(section(node.kind === "goforward" ? "Continues at" : "Returns to",
      `<div class="rail-jump" data-jump="${attr(node.ref.uid)}" tabindex="0" role="button">` +
      `<span class="rj-num">${esc(t ? t.num : "")}</span><span>${esc(plain(t ? t.title : ""))}</span></div>`));
  }
  if (node.kind === "goto" && node.ref) {
    rail.push(section("Continues in",
      `<div class="rail-jump" data-jump-wf="${attr(node.ref.workflow)}"${node.ref.uid ? ` data-jump="${attr(node.ref.uid)}"` : ""} tabindex="0" role="button">` +
      `<span class="rj-num">${esc(String(node.ref.wfNumber || ""))}</span><span>${esc(plain(node.ref.wfTitle || node.ref.workflow))}</span></div>`));
  }
  if (node.insertRef) {
    rail.push(section("Calls diagram",
      `<div class="rail-jump" data-jump-wf="${attr(node.insertRef.id)}" tabindex="0" role="button">` +
      `<span class="rj-num">${esc(String(node.insertRef.number))}</span><span>${esc(plain(node.insertRef.title))}</span></div>`));
  }

  if (list(d.inputs).length) rail.push(section("Inputs", defs(d.inputs)));
  if (list(d.outputs).length) rail.push(section("Outputs", defs(d.outputs)));
  if (lens === "ui") {
    if (list(d.options).length) rail.push(section("Where it leads", options(d.options, resolve)));
    if (list(d.states).length) rail.push(section("States", defs(list(d.states).map((s) => ({ label: s.name, value: s.description })))));
    if (list(d.copy).length) rail.push(section("Microcopy",
      `<ul class="copy-list">${list(d.copy).map((c) =>
        `<li><code>${esc(c.key)}</code><span>${esc(c.text)}</span></li>`).join("")}</ul>`));
  }
  if (list(d.tools).length) {
    rail.push(section("Tools", `<ul class="rail-tags">${list(d.tools).map((t) =>
      `<li><code>${esc(t.name || t)}</code>${t.purpose ? `<span>${mdInline(t.purpose)}</span>` : ""}</li>`).join("")}</ul>`));
  }
  if (list(d.skills).length) {
    rail.push(section("Skills", `<div class="chips">${list(d.skills).map((s) =>
      `<span class="chip">${esc(s)}</span>`).join("")}</div>`));
  }
  if (list(d.files).length) rail.push(section("Files touched", fileRail(d.files)));
  if (list(d.alerts).length) rail.push(section("Alerts", alerts(d.alerts)));
  if (list(d.metrics).length) {
    rail.push(section("Metrics", `<div class="metrics">${list(d.metrics).map((m) =>
      `<div class="metric"><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join("")}</div>`));
  }
  // What backs the claim, kept apart from what to read next (D3). A citation is
  // very often not a URL — "8 CFR 316.2(a)", "Fee schedule effective 2026-01-01",
  // "SOP v7 §4" — so it must be able to exist without an href, which `links`
  // cannot do. Placed above Links because a reviewer checking this step needs it
  // first, and because "further reading" is a different question.
  if (list(d.sources).length) {
    rail.push(section("Sources", `<ul class="rail-src">${list(d.sources).map((c) => {
      const label = esc(c.label || c.href || "");
      const head = c.href
        ? `<a href="${attr(c.href)}" target="_blank" rel="noopener">${label}</a>`
        : `<span>${label}</span>`;
      return `<li>${head}${c.note ? `<em>${mdInline(c.note)}</em>` : ""}</li>`;
    }).join("")}</ul>`, "sec-src"));
  }
  if (list(d.links).length) {
    rail.push(section("Links", `<ul class="rail-links">${list(d.links).map((l) =>
      `<li><a href="${attr(l.href)}" target="_blank" rel="noopener">${esc(l.label || l.href)}</a></li>`).join("")}</ul>`));
  }

  const empty = !left.length && !rail.length && !factStrip;
  const bodyHtml = empty
    ? `<div class="mo-empty"><p>This step has no <code>detail</code> block yet.</p>` +
      `<p>Add one in the source document to fill this panel — purpose, procedure, inputs and outputs, ` +
      `failure modes, and whatever the lens calls for.</p></div>`
    : `<div class="mo-grid${rail.length ? "" : " no-rail"}">` +
      `<div class="mo-main">${left.join("")}</div>` +
      (rail.length ? `<aside class="mo-rail">${rail.join("")}</aside>` : "") +
      `</div>`;

  const typeLabel = TYPE_LABEL[node.type] || node.type;
  const heading = node.kind === "step"
    ? `<span class="mo-num">${esc(node.num)}</span><h3>${esc(plain(node.title))}</h3>`
    : `<h3>${esc(plain(node.chipText || node.title))}</h3>`;

  return `<header class="mo-head"><div class="mo-kicker">` +
    `<span class="mo-type t-${esc(node.type)}">${esc(typeLabel)}</span>` +
    `<span class="mo-wf">${esc(String(wfv.number))} · ${esc(plain(wfv.title))}</span></div>` +
    `<div class="mo-title">${heading}</div>` +
    (node.note ? `<p class="mo-note">${mdInline(node.note)}</p>` : "") +
    factStrip + `</header>` + bodyHtml;
}
