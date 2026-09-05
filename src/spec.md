# WFD — Workflow Diagram DSL v1

**WFD** is a JSON document format describing one or more related workflows.
A deterministic renderer (`src/render.mjs`) turns a WFD document into a single
self-contained HTML page containing DRAKON-derived diagrams.

Determinism guarantee: **the same WFD document always produces byte-identical HTML.**
No layout heuristics, no randomness, no measurement of the DOM. All geometry is
computed from the document alone.

---

## 0. The visual contract

Everything in this spec exists to make these five promises true:

1. **The happy path is a straight vertical line down the left edge.** Read it top to
   bottom and you have read the workflow.
2. **Every deviation fans out to the right.** The further right a box sits, the more
   exceptional the situation that put you there.
3. **Lines never travel upward and never travel left except to merge.** There are no
   loops drawn on the canvas.
4. **A path that returns to an earlier step terminates in a `Go back to N` chip.**
   A path that leaves for another diagram terminates in a `Go to diagram M` chip.
   Both are dead ends *on the canvas*; the reader's eye never has to backtrack.
5. **There are no arrowheads.** Direction is implied by rules 1–3, as in DRAKON.
6. **Everything that ends the sheet ends on the same line.** DRAKON's common-fate
   rule: things that play the same role sit at the same height.

Silhouette (DRAKON's multi-branch column layout) is **not used**. Vertical scrolling
is free; we spend it.

---

## 1. Document

```jsonc
{
  "wfd": 1,                          // required, format version, must be 1
  "title": "string",                 // required, page title
  "subtitle": "string",              // optional, one line under the title
  "description": "markdown",         // required, page-level intro
  "meta": {                          // optional
    "disclaimer": "markdown",        // rendered as a banner under the description;
                                     // for consequence-of-error subjects only:
                                     // legal, medical, financial, safety, regulated
    "author": "string",
    "date": "YYYY-MM-DD",            // the day the material was last checked
    "reviewEvery": "6 months",       // optional; how long that check stays good.
                                     // "<n> days|weeks|months|years". Needs `date`.
    "source": "string",              // where this workflow came from
    "version": "string",
    "tags": ["string"]
  },
  "theme": {                         // optional
    "accent": "#hex",                // default #2f6f4e
    "density": "comfortable"|"compact",   // default comfortable
    "directionMarks": false          // default false; true adds chevrons on long lines
  },
  "actors": [                        // optional; see §1.2
    { "id": "kebab-slug", "name": "Shopper", "short": "SH" }
  ],
  "glossary": [ { "term": "...", "definition": "markdown" } ],   // optional
  "workflows": [ Workflow, ... ]     // required, 1..20
}
```

### 1.1 Freshness — `meta.date` and `meta.reviewEvery`

A WFD document is a file. It gets sent, saved and forwarded, and it keeps
rendering with exactly the same authority a year after the thing it describes
changed. These two fields are how a document says so itself.

`meta.date` is the day the material was **last checked**, not the day the file
was generated. It renders as an eyebrow, as a fact chip, and as the freshness
line under the description.

`meta.reviewEvery` is how long that check stays good: a whole number and a unit,
`"90 days"`, `"6 months"`, `"1 year"`. It is an **interval, not an expiry date**,
because that is how the knowledge actually works — an author knows that fees are
reset annually or that an org chart survives about two quarters; they do not know
the date on which this particular file stops being true. An interval also stays
correct when `date` is updated after a real review, where an absolute date would
have to be edited twice.

Validation: the string must match `<n> day|week|month|year` (plural accepted,
`n >= 1`); anything else is an error naming `meta.reviewEvery`. `reviewEvery`
without a readable `meta.date` is an error too — an interval measured from
nothing says nothing. A malformed `meta.date` is a warning, not an error: it is
prose elsewhere on the page, and it costs only the freshness signal.

**The age is computed when the page is read, never when it is built.** The build
is byte-identical across runs and may not ask what day it is; the reader's
browser does that, from `meta.date`, with no network involved. So:

- **No `meta.date`** — no freshness element is rendered at all. Most documents
  have nothing to say here and are not nagged about it.
- **Inside the interval, or no interval set** — a quiet line under the
  description: `Dated 4 March 2026 · 3 months old · review due 4 September 2026`.
- **Past the interval** — the same line is raised into a banner in the style of
  `meta.disclaimer`, led by **Overdue for review**.

Without scripting the line still renders what the document itself asserts —
`Dated 4 March 2026 · reviewed every 6 months` — since that much needs no clock.

Nothing anywhere updates `meta.date` on its own. Rebuilding a page from its own
embedded document is not a review, and a date that moved by itself would assert
a freshness nobody verified.

### 1.2 Actors — the registry, and `step.actorId`

Swimlanes answer three questions — who owns which parts, where work changes
hands, how much sits with each actor — by spending a spatial axis. Both of this
format's axes are already spent (y is sequence, x is severity) and a second one
would destroy the no-crossing guarantee everything else rests on. So the answers
are bought without the axis: **a chip on every box, an entry in the legend, and a
mark on the line wherever the work changes hands** (§5.10).

None of that is possible on free text. `detail.actor` has always been prose, and
prose cannot be grouped on. Measured across the five shipped examples before this
existed:

| document | distinct `detail.actor` strings | real actors |
|---|---|---|
| `checkout-ux` | 39 | 5 |
| `agent-pipeline` | 33 | 4 |
| `naturalization` | 27 | 3 |
| `workflow-builder` | 27 | 4 |

`"Shopper, with a pre-filled suggestion from the system"` and `"Shopper, prompted
by the system"` are the same person doing the same job, written twice. Grouping on
those strings yields forty actors from a document with five.

**The registry.** `actors` is a document-level array of `{ id, name, short }`.

| field | req | meaning |
|---|---|---|
| `id` | yes | kebab slug, unique in the document. What steps reference. |
| `name` | yes | what the legend and the screen reader say. |
| `short` | no | 1–3 letters or digits — what the chip draws. Derived from `name` when absent. |

**`short` is capped at three characters, and the cap is load-bearing.** The chip is
drawn inside the box, and the box never grows (§5.9), so the room the chip takes
comes out of the width the title is wrapped to. Three characters of monospace cost
about three characters of title, and three is enough for every real case: `SH`,
`SYS`, `PAY`, `INV`, `REC`, `APP`, `USC`, `TRI`, `OPS`. Anything longer, or
anything that is not a letter or a digit, is an error naming `actors[i].short`.
An absent or empty `short` is derived — the initials of the first three words, or
the first three letters of a single word — so the common case needs no thought.

**Two actors may not draw the same chip.** A duplicate `short`, compared
case-insensitively and whether written or derived, is an error: two actors the
reader cannot tell apart defeat the one thing the chip exists to do. When the
collision is between derived shorts the error says so and asks for an explicit one.

**More than six actors is a warning, never an error.** A legend stops being
scannable somewhere around six entries, and the actor entries are only part of what
a legend already carries — two directions, up to four severity glyphs, three
navigation glyphs, two confidence weights and a review count. Past six it wraps to
a third line and stops being read, and the reader is being asked to hold more chips
in their head than they can. But a real process can have nine owners and must still
build, so this is a warning that names `actors` and says what to check: whether
some of these are one identity written more than once, or whether this is two
documents. A registry with fourteen entries is far more likely to be this section's
own failure recurring than a genuinely fourteen-actor process.

**How a step references it: `actorId`.** Every other reference in this format is
named for its target — `exit.to`, `goto.workflow`, `insert.workflow` — and by that
convention this field would be `actor`. It is not, for one reason: `actor` is
already taken, by the prose field inside `detail`. A step carrying
`"actor": "shopper"` six lines above `"actor": "Shopper, with a pre-filled
suggestion"` is a trap for anyone hand-editing the JSON, and an invitation for a
model to write the sentence where the identity belongs — which is exactly the
failure the registry exists to end. The `Id` suffix says *this is a reference* in
the one place a reader is looking.

An `actorId` that resolves to nothing is an error naming
`workflows[i].steps[k].actorId`, listing the ids that do exist — the same
treatment `meta.reviewEvery` and `step.verification` get, and for the same reason:
an unresolvable reference would otherwise draw no chip and leave its author
believing the sheet says who owns the step when it says nothing.

**Steps only.** Terminals and navigation chips take no `actorId`, for the same
reason they take no `verification`: they assert nothing and perform nothing.

**`detail.actor` stays, unchanged and undeprecated.** It is not a worse version of
the same field, it is a different field. `actorId` answers *which of the five*,
which is the only question that can be grouped, filtered and counted.
`detail.actor` answers *how this particular step is performed, and by whom
exactly*, which is what the modal wanted. Write both: the id on the step, the
sentence in the detail. A document written before this section existed keeps
building and keeps rendering its prose, which is the other reason nothing was
migrated away.

## 2. Workflow

```jsonc
{
  "id": "kebab-slug",                // required, unique in document
  "title": "string",                 // required
  "description": "markdown",         // required, 1-3 sentences
  "lens": "ai"|"ui"|"ops"|"data"|"generic",   // required; selects modal layout
  "summary": {                       // optional, rendered as a fact strip
    "trigger": "string",             // what starts this workflow
    "outcome": "string",             // what "done" looks like
    "owner": "string",
    "duration": "string",
    "frequency": "string"
  },
  "phases": [                        // optional row bands, left margin labels
    { "label": "Intake", "from": "stepId", "to": "stepId" }
  ],
  "start": { "label": "string", "note": "string?" },      // required
  "steps": [ Step, ... ],            // required, >=1 — THE HAPPY PATH, in order
  "end":   { "label": "string", "tone": "success"|"failure"|"neutral", "note": "string?" }
}
```

`steps` is lane 0: the royal road. It is rendered as one unbroken vertical line
from `start` to `end`. Nothing else is ever placed in lane 0.

## 3. Step

Common fields on every step:

| field | req | meaning |
|---|---|---|
| `id` | yes | slug, unique within the workflow |
| `type` | yes | see §3.1 |
| `title` | yes | imperative, **<= 45 chars**, no trailing period (see §5.9) |
| `note` | no | a gloss rendered under the title, **<= 50 chars** (see §5.9) |
| `tag` | no | short chip on the box, e.g. `AI`, `Manual`, `2 min` |
| `tone` | no | `neutral` (default) \| `info` \| `warn` \| `error` \| `success`. Sets the colour of the box; on a **branch** it also prefixes the label with a glyph — see §3.2 |
| `verification` | no | `unverified` (default) \| `verified` \| `disputed`. Who has checked this step, and what they concluded — see §3.0a |
| `actorId` | no | an `id` from the document-level `actors` registry — who performs this step. Draws the in-box chip and the handoff marks. See §1.2 |
| `detail` | no | rich modal payload, see §6. **Strongly recommended on every step.** |

### 3.0a `verification` — who has checked this step

A sixty-step document is around 22,000 words of asserted fact. Without this field
it renders with exactly the same authority whether or not a human has read a word
of it, and the format's own polish is what makes that dangerous: a diagram makes a
wrong number look official.

**The name.** `verification`, not `confidence`. It records *who has checked this*,
which is a fact about the review, not the author's belief about the material —
those are different claims and only the first one is checkable by a reader.

**The shape.** A bare string from a closed set of three. Not an object: the field
is read far more often than it is parsed, one line changes per step keeps an
export diffable, and a reviewer's free-text note on a disputed step is a separate
question this version deliberately leaves open rather than half-answers.

| value | means |
|---|---|
| `unverified` | nobody has checked this step. **The default, and what an absent field means.** |
| `verified` | a human has checked this step against the source and it holds. |
| `disputed` | a human has checked this step and it does not hold — it is wrong, out of date, or needs work. |

**The default is `unverified`, and it is not a placeholder.** Authority is earned
by a human act and never granted by omission, so a document that says nothing
about review is a document nobody has reviewed, and it draws that way. The five
shipped examples carry no `verification` anywhere and are therefore drawn entirely
unverified, which is the truth about them.

**Why three states and not two.** A binary forces a reviewer who finds something
wrong to choose between leaving the step looking untouched — which loses the
finding, and lies about how far the review got — and marking it verified, which is
worse. "Nobody has looked" and "somebody looked and it does not hold up" are
different facts. They are also the difference between *58 of 60 checked, review
incomplete* and *60 of 60 checked, 2 problems found*, which is the only number
anyone actually wants. No fourth state is admitted: `partial` and `n/a` were both
considered and neither answers a question a reader has.

**How it is drawn.** Border weight, and nothing else. Hue is severity, dashes mean
reference chip, opacity is interaction state, and the in-box chip belongs to actor
initials — weight is the only channel left, and it is the right one, because it
survives greyscale and print. `unverified` and `disputed` are drawn at the same
lighter weight; `verified` is drawn solid. The canvas answers one question — *can I
trust this box?* — and both unmarked and disputed answer no. Which of the two it is
is in the modal, the progress counter and the exported document. On a completed
review the disputed steps are the only light boxes left on the sheet, which is
exactly where you want the eye to go.

**Nothing but a human may write `verified`.** No rebuild, no import, no timer and
no default sets it — the same rule that stops a rebuild moving `meta.date` (§1.1).
A generated document should not contain `"verification": "verified"` unless a
person put it there.

### 3.1 Step types

| `type` | shape | extra fields | notes |
|---|---|---|---|
| `action` | rectangle | — | the default doing-step |
| `question` | hexagon | `primaryLabel` (default `"Yes"`), `branches` (>=1) | primary answer continues straight down |
| `choice` | trapezoid | `primaryLabel`, `branches` (>=1) | n-way selection; same layout as `question` |
| `input` | parallelogram, right-slant | `source` | data or a decision arrives from outside |
| `output` | parallelogram, left-slant | `destination` | something is emitted or shown |
| `shelf` | split rectangle | `assign`: `[{ "name": "...", "value": "..." }]` | state is set |
| `insert` | rectangle w/ double side bars | `workflow` (id ref), `step` (id ref, optional) | calls another diagram; box is a link |
| `wait` | clipped-corner rectangle | `duration` | time passes / waiting on an external event |
| `parallel` | rectangle w/ double top+bottom bars | `tracks`: `["...", "..."]` | concurrent work that reconverges here |

There is no `comment` icon. Use `note` (in-box) and `detail` (modal).

### 3.2 Branch

Only `question` and `choice` carry branches. The **primary** answer is not a branch —
it continues down the current lane. Every other answer is a branch object:

```jsonc
{
  "label": "No",                 // required — the answer text, <= 24 chars
  "tone": "warn",                // optional: neutral|info|warn|error|success
                                 // colours the lane AND prefixes the label with a glyph
  "note": "string",              // optional, rendered under the label on the canvas
  "steps": [ Step, ... ],        // required, may be [] (a pure bypass)
  "exit": Exit                   // required — see §3.3
}
```

Branch order is significant: branches are laid out left to right in array order,
so **order them from least to most severe**.

**`tone` on a branch is visible, not decorative.** The renderer prefixes the
drawn label with a severity glyph, so a branch labelled `Declined` with
`"tone": "error"` is drawn as `✗ Declined`:

| `tone` | drawn as | spoken as |
|---|---|---|
| `neutral` (default) | `Declined` | "Variation: Declined" |
| `info` | `ⓘ Declined` | "Variation, note: Declined" |
| `warn` | `▲ Declined` | "Variation, warning: Declined" |
| `error` | `✗ Declined` | "Variation, error: Declined" |
| `success` | `✓ Declined` | "Variation, success: Declined" |

Hue alone loses the severity axis to a greyscale print, a photocopy or a
colour-blind reader; the glyph does not. Leaving `tone` off is a choice for
"unremarkable", not an absence of one — the glyph is what a reader scans, so set
it on every branch that is not genuinely neutral. The 24-character limit applies
to `label` as authored; the glyph and its space are added by the renderer and are
accounted for in the layout.

Each sheet's legend lists exactly the severity glyphs that sheet draws, and
nothing else.

### 3.3 Exit

Every branch must terminate. It cannot dangle.

```jsonc
{ "type": "continue" }
```
Rejoin the owning lane at the step immediately after the owning question. If the
question is the last step in its lane, rejoin that lane's exit/end. Sugar for the
common case; produces a merge line, no extra box.

```jsonc
{ "type": "join", "to": "stepId" }
```
Merge into a named step. The target must live in an **ancestor lane** (the owning
lane or one of its ancestors, up to lane 0) and must be laid out strictly below the
branch's last node. Produces a merge line, no extra box.

```jsonc
{ "type": "end", "label": "Refund issued", "tone": "success"|"failure"|"neutral", "note": "..." }
```
A terminal stadium. Use for outcomes that genuinely finish the workflow.

```jsonc
{ "type": "goback", "to": "stepId", "label": "..." }
```
A **`↩ Go back to N`** chip. The target must be laid out at or above the branch's
last node (i.e. it would have been an upward line). This is how loops and retries
are drawn. `label` overrides the auto-generated text.

```jsonc
{ "type": "goto", "workflow": "wfId", "step": "stepId?", "label": "..." }
```
A **`↗ Go to diagram M`** chip, linking to another workflow in this document. Use
when a variation is genuinely a different process, not a detour.

### 3.4 Terminal chips are dead ends

`end`, `goback`, `goto` and `Continue at` chips have no outgoing edges on the
canvas. All but `end` are clickable: they scroll to and flash their target.

### 3.4a `Continue at N` — the renderer's own chip

Authors never write this one. When a `join` or `continue` cannot reach its target
without crossing another line — which happens when a nested branch rejoins the
parent *above* the point where its own parent branch rejoins — the renderer draws
a **`→ Continue at 6 · Choose a delivery option`** chip instead of the merge line.

Nothing is lost: the chip names its destination and clicking it jumps there. The
build reports how many merges were redrawn this way. More than one or two in a
diagram means the process is genuinely tangled and is worth restructuring.

---

## 4. Numbering

The renderer assigns display numbers; **authors never write them**.

- Lane 0 steps: `1`, `2`, `3`, …
- Branches of step `X` are lettered `a`, `b`, `c`, … in array order.
- The first step inside branch `a` of step `4` is just `4a`; later steps in that
  branch are `4a.2`, `4a.3`, … The one-step branch — by far the most common —
  therefore reads as the short `4a` the eye expects.
- A branch of step `4a` is `4a.b`; a branch of step `4a.2` is `4a.2b`. A letter
  attaches straight onto a digit and is separated by a dot from another letter.
- `start`, `end` and the reference chips are unnumbered.

Chips render on two lines: a bold reference and a muted destination.

    ↩ Go back to 3          ↗ Go to sheet 2         → Continue at 6
      Validate cart           Refund flow             Choose a delivery option

---

## 5. Layout algorithm (normative)

The renderer must implement exactly this. Any conforming implementation produces
identical geometry.

**5.1 Flatten.** Depth-first walk the nested document into a node list. Lane 0 is
the workflow's own step array. Each branch creates a new lane, which records the
index of the question it hangs off (`ownerStep`) and the index in the parent lane
at which it stops occupying vertical space (`closeStep`):

- `continue` → `ownerStep + 1`
- `join` to a step of the parent lane → that step's index
- `join` to a step of an ancestor lane → unbounded
- `end` / `goback` / `goto` → `ownerStep`, it finishes on its own

`closeStep` is computed bottom-up: if anything nested inside a block merges out to
a later step of the parent lane, the whole block stays open until then.

**5.2 Column order.** A lane's children are ordered left to right in the order the
author wrote them, then topologically corrected: if block A is still open when
block B's question fans right, A's line would be cut by B's fan, so A is moved
right of all of B. In practice only a long `join` triggers this, so the common case
comes out in exactly the authored severity order.

**5.3 Edges.** Emit an edge for each: `start`→first step; consecutive steps in a
lane; last step in a lane→that lane's exit node; `question`→branch's first node
(a *fan* edge, leaving the question's right vertex); branch exit `continue`/`join`→
target (a *merge* edge). An empty branch produces a single *bypass* edge.

**5.4 Rows (longest-path layering).** `row(start) = 0`. For every other node,
`row(n) = 1 + max(row(p))` over all predecessors `p`. `goback`, `goto` and
`Continue at` chips are leaves and contribute nothing. The graph is a DAG by
construction, so this terminates.

**5.5 Vertical reservation.** Two rules, applied together until rows stop moving.
Rows only ever increase, so it terminates.

- **CLOSURE** — an exception block finishes before the parent lane moves on. Every
  branch that closes on itself or rejoins the very next step must have its entire
  subtree above the parent's next node. This is what stops a later merge line from
  having to cross a block that is still running.
- **FAN ROW** — no box may share a question's row inside the span its branch line
  covers, because that line travels right at exactly that height.

**5.5a Common fate.** Icons that play the same role sit at the same height, so
the eye reads them as one set rather than as a staircase of unrelated boxes.

- **Exits** — every way the sheet can finish, meaning every `end` stadium and
  every `goto` chip including the workflow's own end, lands on one row. That row
  is the answer to "how does this end?", readable in a glance.
- **Returns** — `goback` and `Continue at` chips align with their siblings, so the
  outcomes of a single decision line up beneath it.
- Branches of one question already share a row by construction, since each has
  only that question as a predecessor.

A block containing an exit therefore stays open all the way down, which gives it
`closeStep = ∞` in §5.1 and pushes it right of everything it runs past. Terminals
are leaves, so moving them down disturbs nothing downstream; §5.5 and this rule
are iterated together until neither moves anything.

**5.5b Sibling order is a promise.** Whatever else moves, the branches of one
question appear left to right in the order the author wrote them. That order is
the severity order, and it is the only guarantee the format makes about
horizontal position.

**5.6 Column packing.** Because CLOSURE guarantees that blocks hanging off
different steps of the same lane never overlap vertically, such blocks can share a
column. Pack greedily, smallest free column first, preserving the order from §5.2
and keeping the branches of a single question in their authored order. If packing
turns out to cross a line, it is discarded and the unpacked columns are kept.

**5.7 Fan and merge geometry.** All branches of one question share a single
horizontal segment at the question's vertical centre, running right from its right
vertex, with a drop into each branch column and the answer label above each drop.
The drawn label is the branch's severity glyph, a space, and the authored label
(§3.2); it is composed once, where its width is measured, so every consumer sees
the same string. The branch `note` follows the label on the same baseline, given
only the room that exists before the next branch drops, before any line running
down through it, and before any box on that row — whichever comes first. A note
that starts inside a box is dropped rather than drawn over it.
All merges into the same node share one horizontal band in the gutter directly
above it; within a gutter, bands are ordered by target column ascending, topmost
first.

**5.7a No crossings.** After routing, every horizontal is tested against every
vertical. Touching at an endpoint is a junction and is allowed — that is how
branches share a fan line and merges share a band. An intersection interior to
both segments is a crossing and is not allowed. If one is found, the merge
responsible is redrawn as a `→ Continue at N` chip (§3.4a) and the workflow is
laid out again. Each pass removes one long vertical, so this converges.

**5.9 Fixed boxes, flexible lines.** A sheet has exactly two box sizes: one for
steps and one for terminals. Neither grows to fit its text, because a reader
relies on every box being the same box.

Inside that fixed box the lines flex. The title takes as many lines as it needs,
up to the whole box; whatever is left over goes to the detail lines — first the
`shelf` assignment or `parallel` track summary, then the `note`. A title long
enough to need a third line takes that line from the note rather than being cut
short, since the title is the box's job and the note is a gloss.

Text that still does not fit is truncated with an ellipsis and reported as a
build warning naming the field. Nothing is lost: the modal carries the full text.

Budgets at the default density: **titles fit in about 45 characters** and **notes
in about 50** across every shape. Hexagons and parallelograms are the tightest,
since their slanted ends narrow the usable width.

**5.8 Text metrics.** Deterministic character-advance table, in em units at the box
font size, applied to the font stack `ui-sans-serif, -apple-system, "Segoe UI", Inter,
Helvetica, Arial, sans-serif`:

```
' '                       0.278
'ijlt.,:;|!\'`'           0.300
'fIr()[]{}/\\-'           0.340
'0123456789'              0.556
'mw'                      0.850
'MW@'                     0.940
A-Z (other)               0.680
'ⓘ' 0.983   '▲' 0.775   '✗' 0.825   '✓' 0.896
default                   0.556
```
The four severity glyphs (§3.2) are measured, not defaulted: each is wider than
the 0.556 fallback, and marginal text has none of the padding that absorbs a bad
estimate inside a box. Any glyph added to the drawn output must be added here too.
Multiply by 1.06 safety margin, wrap greedily at word boundaries, hard-break tokens
longer than the line. Lines are emitted as explicit `<tspan>`s, so no browser reflow
can change the layout.

**5.9 Geometry constants** (comfortable density):
`NODE_W 236 · LANE_GAP 44 · ROW_GAP 34 · BAND_GAP 14 · PAD 28 · CORNER 7 ·
TITLE_SIZE 14 · NOTE_SIZE 11.5 · NODE_PAD_X 14 · NODE_PAD_Y 12 · MIN_NODE_H 46`
(compact density multiplies gaps by 0.72).

**5.10 Actor chip and handoff marks** (§1.2). A step with an `actorId` draws its
actor's `short` in monospace, right-aligned at the text inset, on the **first
title line's baseline**.

The chip takes a gutter of `ACTOR_GAP + measureMono(short)` and **layout must
charge for it where the wrap is derived, not where the mark is drawn.** Decorating
in the renderer alone draws text wider than the width layout reserved, and the
geometric checklist does not catch it — the same failure the severity glyph (§3.2)
was written to avoid, and a test asserts this width.

The gutter is charged **to the title rows only**, because those are the only rows
the chip is on: it is about ten pixels tall on the first title baseline and the
note block starts at least twenty-four below it. The rule is one line long —
**each paragraph is centred in the room its own rows have.** The title block
shares one width and one centre, set by its first line, which carries the chip;
the note block keeps the box's own centre and its full width. Two alternatives
were measured against the shipped examples and are worse: charging the note rows
too took note truncations from 26 to 51, and narrowing the title symmetrically
took them to 75, because a narrower title wraps onto another line and every line
a title takes is a line the note does not get.

The first title line is also the only row that clears every type ornament at every
title height: `shelf` draws its divider below the title block, `parallel` its
lower bar near the box's foot, `choice` its chevrons at mid-height, and a
vertically-centred chip collides with the `shelf` divider at one common
combination of title and note lines.

**Handoff marks.** Where a `seq` edge runs between two steps whose `actorId`s
differ, the line is ticked and labelled with the *receiving* actor's `short`.
`seq` edges only, and only between two steps: a `fan` already carries a branch
label and its note in exactly that space, a `merge` or `bypass` rejoins a numbered
step the reader has already met, and a terminal has no actor to hand to.

The mark is placed with the same discipline as a branch note (§5.7): given only
the room that exists — below the box, below its primary label if it has one, above
the next box, and clear of any line crossing the gap — and **dropped rather than
drawn over something** if that room is not there. It is `aria-hidden`: both boxes
either side already announce their actor by name.

---

## 6. `detail` — the modal payload

The modal is the point of the format. A node without `detail` is a wasted node.
Aim for 150–400 words of real substance per step.

### 6.1 Shared fields (any lens)

```jsonc
"detail": {
  "purpose": "markdown — why this step exists, 1-2 sentences",
  "actor": "who/what performs it, in prose — see the note below",
  "duration": "typical elapsed time",
  "systems": ["system or service names"],
  "inputs":  [ { "label": "...", "value": "..." } ],
  "outputs": [ { "label": "...", "value": "..." } ],
  "procedure": [ "markdown bullet", "..." ],     // the actual how-to
  "rules": [ "markdown bullet" ],                // constraints, policy, gotchas
  "failureModes": [ { "when": "...", "then": "...", "step": "stepId?" } ],
  "metrics": [ { "label": "...", "value": "..." } ],
  "sources": [ { "label": "...", "href": "...?", "note": "...?" } ],  // what backs the claims
  "links": [ { "label": "...", "href": "..." } ],                     // where to read more
  "body": "markdown — free-form, rendered last"
}
```

**`detail.actor` and `step.actorId` are different fields on purpose.** `actorId`
is the identity — one id from the document's registry, which is what the chip, the
legend filter and the handoff marks are all built on (§1.2). `detail.actor` is the
sentence: *"Shopper, with a pre-filled suggestion from the system"*, *"Payment
service, on behalf of the shopper"*. Prose cannot be grouped on and an id cannot
say that, so write both. Neither is required, and a document that carries only the
prose — as every document written before §1.2 does — still builds.

**`sources` and `links` are different fields on purpose.** `sources` is what backs
the claims in this step; `links` is where to read more. A reviewer working through
the sheet needs the first and not the second, and mixing them means opening all of
them to find out which is which. `sources` also does not require an `href`, because
a great many citations are not URLs — `8 CFR 316.2(a)`, `Fee schedule effective
2026-01-01`, `SOP v7 §4`, `interview with the on-call lead, March 2026`. `label`
is the citation, `href` is optional, `note` is what it supports. Rendered above
`links` in the modal rail.

### 6.2 `lens: "ai"` extras — simulate the agent turn

```jsonc
  "model": "claude-opus-5",
  "prompt": "markdown — the actual prompt or instruction",
  "transcript": [
    { "role": "user",      "text": "markdown" },
    { "role": "assistant", "text": "markdown" },
    { "role": "tool",      "name": "Grep",
      "input": "pattern: 'checkout' path: src/",
      "output": "src/checkout/index.ts:42\n…",
      "status": "ok"|"error" }
  ],
  "tools":  [ { "name": "Read", "purpose": "..." } ],
  "skills": [ "skill-name" ],
  "files":  [ { "path": "src/x.ts", "action": "read"|"write"|"create"|"delete", "note": "..." } ],
  "guardrails": [ "markdown bullet" ]
}
```
Renders as a two-column modal: transcript on the left, a rail of tools / skills /
files touched on the right.

### 6.3 `lens: "ui"` extras — show the screen and the doors out of it

```jsonc
  "screen": {
    "title": "Checkout — payment",
    "elements": [
      { "type": "heading"|"text"|"input"|"button"|"list"|"image"|"badge"|"divider",
        "label": "Card number", "hint": "•••• 4242",
        "state": "default"|"focus"|"error"|"disabled"|"selected",
        "target": "stepId?" }          // if set, this control is highlighted and
    ]                                  // linked to the step it leads to
  },
  "options": [ { "label": "Tap Pay", "leadsTo": "stepId", "why": "markdown" } ],
  "states":  [ { "name": "Empty", "description": "markdown" } ],
  "copy":    [ { "key": "cta", "text": "Pay $42.00" } ]
}
```
Renders a wireframe of the screen on the left (drawn from `elements`, no images
required) and the option map on the right, each option linked to its destination step.

### 6.4 `lens: "data"` / `"ops"` extras

```jsonc
  "schema":   [ { "field": "...", "type": "...", "note": "..." } ],
  "sample":   "markdown code block",
  "queries":  [ { "label": "...", "code": "..." } ],
  "runbook":  [ "markdown bullet" ],
  "commands": [ { "cmd": "...", "note": "..." } ],
  "alerts":   [ { "name": "...", "condition": "...", "severity": "page"|"ticket"|"info" } ]
}
```

---

## 7. Validation rules

The renderer refuses to emit HTML unless all of these hold. Errors name the offending
path (e.g. `workflows[1].steps[3].branches[0].exit.to`).

1. `wfd === 1`.
2. Workflow ids unique; step ids unique within their workflow.
3. Every `question`/`choice` has >= 1 branch; every branch has an `exit`.
4. `join`/`goback` `to` resolves to a step in the same workflow.
5. `goto.workflow` resolves to a workflow in the document; `goto.step`, if present, resolves within it.
6. `insert.workflow` resolves.
7. `join` target is in an ancestor lane of the branch **and** below it after layering.
   If it is above, the error suggests converting to `goback`.
8. `goback` target is at or above the branch's last node. If it is below, the error
   suggests `join`.
9. No step is both the target of a `continue` and unreachable.
10. `title` non-empty on every step; `label` non-empty on every branch.
11. Lane depth <= 8; total nodes per workflow <= 200.
11a. After layout, no two lines cross (enforced by construction, see §5.7a).
11b. All exits share one row, and sibling branches appear in authored order (§5.5a, §5.5b).
12. `tone` and `type` values are from the enumerated sets.
13. Markdown fields are strings, never objects.
14. `meta.reviewEvery`, if present, is a string of the form `<n> day|week|month|year`
    (plural accepted, `n >= 1`), and `meta.date` is a readable `YYYY-MM-DD` date.
15. `step.verification`, if present, is exactly one of `unverified`, `verified`,
    `disputed`. Anything else is an error naming the field — a step that asks for a
    review state the renderer cannot draw would otherwise fall back to `unverified`
    and leave its author believing the sheet says something it does not. Absent is
    always legal and means `unverified`.
16. `actors`, if present, is an array of objects. Each has a non-empty `id`, unique
    in the document, and a non-empty `name`. `short`, if present, is 1–3 letters or
    digits; if absent it is derived from `name`. No two actors, written or derived,
    may share a `short` compared case-insensitively.
17. `step.actorId`, if present, resolves to an `actors[].id`. Anything else is an
    error naming `workflows[i].steps[k].actorId` and listing the ids that do exist —
    an unresolvable reference would otherwise draw no chip and leave its author
    believing the sheet says who owns the step. Absent is always legal and means
    the step names no owner.

Warnings (non-fatal): a `meta.date` that is not a `YYYY-MM-DD` calendar date —
the document renders, but nothing can be said about its age. More than six entries
in `actors` — the document renders, but the legend has stopped being scannable and
some of those entries are probably one identity written twice (§1.2).

Warnings (non-fatal, printed and rendered into a `?debug` panel):
steps with no `detail`; branches with >3 steps and no `note`; workflows with no
`summary`; a question whose primary label is not the successful outcome.

---

## 8. Authoring rules of thumb

- **The happy path must actually be happy.** If your lane 0 ends in failure, you have
  the polarity wrong — invert the question.
- **Severity increases to the right.** Order branches least → most severe.
- **Prefer `continue` to `join`.** Prefer `join` to `goback`. Prefer `goback` to a
  new diagram. Prefer a new diagram to a 12-step branch.
- **A branch longer than ~5 steps is a diagram.** Split it and use `goto`.
- **One question, one decision.** If the label needs "and"/"or", split it.
- **Name branches with the answer, not the consequence.** `"No"`, `"Declined"`,
  `"Timeout"` — not `"Go to error handling"`.
- **Write to the box.** 45 characters of title, 50 of note. Anything longer is
  truncated on the canvas with an ellipsis and reported as a warning — the words
  are not lost, but a box full of ellipses is a document that needs editing.
- **Every step earns its modal.** If you cannot write 150 words of `detail`, the step
  is probably two steps merged, or one step too small to draw.
- **Name a handful of actors, and give every step one.** Five is a good number and
  six is the most a legend carries. If your registry is heading for a dozen, two or
  three of them are the same person described differently — and the point of the
  registry is that the diagram can then show you where the work changes hands.
- **Cite the load-bearing facts, and never write `verification` yourself.** A number,
  a deadline, a fee, a threshold or a citation that a reader would act on belongs in
  `detail.sources` with whatever backs it. `verification` is the reviewer's field:
  a document arrives unverified and is marked by a person walking the sheet.
