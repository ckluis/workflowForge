# Decisions

Each entry: the problem, the options considered, the call, and why. Recorded so a
later session does not relitigate settled ground or quietly contradict it.

---

## D1 — Severity is carried by colour alone

**Problem.** Tone (warn / error / info) is expressed only as hue, so a colour-blind
reader, a greyscale print or a photocopy loses the severity axis entirely.

**Call: glyph + text on the branch label.** The renderer prefixes the branch label
with a severity glyph, so `Declined` reads as `▲ Declined`. Position already carries
severity (further right = worse), so this is reinforcement rather than sole signal,
but it costs nothing and makes the greyscale case honest.

**Rejected.** A glyph in every toned box (clutters the exception boxes). Stroke
weight or dashes (dashes already mean "reference chip"). Doing nothing (position
alone is real but leaves print unreadable).

**Implemented.** The mapping, and what it was chosen against:

| tone | glyph | codepoint | why this one |
|---|---|---|---|
| `neutral` | *(none)* | — | nothing to say, so nothing is drawn |
| `info` | `ⓘ` | U+24D8 | circled i; a ring is the only ring on the sheet |
| `warn` | `▲` | U+25B2 | solid triangle; caution, and all mass |
| `error` | `✗` | U+2717 | ballot X; heavy enough to sit next to 600-weight text |
| `success` | `✓` | U+2713 | check; the one mark nobody has to be told |

**`success` gets one, deliberately.** It is a tone rather than a severity, so the
letter of this entry does not demand it — but `success` carries hue today, and
leaving it bare would collapse a successful variation and a neutral one into the
same greyscale appearance, which is precisely the loss D1 exists to stop. `✓` is
the most greyscale-safe mark available, so the cost is nil.

**No glyph here is in the Unicode emoji set.** That is a hard filter applied
before legibility, and it is what disqualifies `⚠` (U+26A0) and `❗` (U+2757)
outright: a codepoint in the emoji set can be routed to a colour-emoji font,
where it ignores `fill` and paints itself a colour the tone never chose — hue
being severity's other channel, that is a corruption, not a cosmetic problem.
`❗` was observed doing exactly this: bright red in every tone, including
`success`.

**Rendered-size evidence.** Twenty-four candidates were drawn in the real stack
at 11.5px, 12px and 13px — the sizes `.wf-label-main` and `.legend b` actually
compute to — then again through a 1-bit threshold, which is what a photocopy
does to a page.

- `⚠` survives as a hollow triangle whose interior mark is gone by 11.5px, and
  what is left is hard to tell from a plain `△`. Thin outline, thins further
  under threshold. `▲` carries the same meaning with none of the fragility.
- `ℹ` collapses to a single stroke — the `↰` failure from D2, repeated. It can
  be missed entirely rather than merely misread, which is the worse failure.
  `ⓘ` degrades instead to a ring with a smudge in it: it loses its *i*, never
  its distinctness, and nothing else on a sheet is a ring.
- `✕` (U+2715) and `×` (U+00D7) read as noticeably lighter than the 600-weight
  label beside them. `✗` matches it. `✔` matches it too but is in the emoji set,
  so `✓` takes success.
- Checked against the three glyphs D2 already spent — `↩`, `→`, `↗`. No
  silhouette collides, and a test asserts it.

**Where it is done.** In `layout.mjs`, at the one point where the label text and
`labelW` are derived (`labelWithTone`, consumed in the label-extent pass). The
renderer only draws what it is handed. Decorating in `svg.mjs` instead would
draw text wider than the width layout reserved for it, and the geometric
checklist does not catch that — verified by mutation: it fails exactly one test,
the one written for it.

**The announced string never contains the glyph.** The label group carries
`aria-label="Variation, warning: Declined"`; a reader hearing "ballot X" learns
nothing.

**One thing this exposed.** A branch note was clamped against the next branch
drop and against any line running down through it, but never against a *box* on
its row, so ten notes across nine sheets already ran into one. Shifting every
note right by a glyph width made it visible and worse. The clamp now also stops
before a box — and treats a box the note starts *inside* as zero room, dropping
the note, since a note printed over a box cannot be read. All fifteen sheets are
now clean of label/label, label/line and label/box overlap.

---

## D2 — `→` meant two different things

**Problem.** The legend used `→` for both "rejoins further down this sheet" and
"continues in another sheet" — same symbol, very different destinations.

**Call: a distinct glyph for cross-sheet jumps.** `↗` for leaving the sheet, `→`
for rejoining below. The chip text already disambiguates for anyone who reads it,
but the glyph is what gets scanned, and a legend listing the same symbol twice
reads as a bug.

**Back-references keep `↩`, not `↰`.** The docs briefly claimed `↰` on the
reasoning that a chip standing in for a line we refuse to draw upward should point
upward. Measured at the size it actually renders — 15px in a chip, 13px in the
legend — `↰` collapses to a bare corner, because its mass is a long stem with a
small head and the head is what downscaling eats. `↩` carries its mass in the hook
and survives. Also rejected: `⟲` (becomes a dot), `↶` (becomes a tick), and
`←` / `↖` (leftward already means *merge*, and `↖` mirrors the cross-sheet
`↗` closely enough to confuse). Judge a glyph at its rendered size, not at
display size where every candidate looks fine.

---

## D3 — Verification does not scale

**Problem.** The model removes the writing bottleneck and enlarges the verification
one: a 60-step document is ~22,000 words of asserted fact, rendered with the same
authority whether or not anyone has checked it.

**Call: a review mode, plus assert less and cite more, plus a visible confidence
state.** Three parts:
1. Steps carry a verification state. Unverified and verified steps are **visually
   distinct on the canvas** — not buried in the modal.
2. The page itself is the review tool: walk the sheet, mark steps checked, export
   the marked document.
3. The prompt writes less unsourced assertion per step and cites more.

**Why.** The burden is real and cannot be argued away, so the artifact should carry
the review rather than pretend it is unnecessary. It is also the strongest available
differentiator — no diagramming tool has a review state.

**Channel note.** Confidence must not use hue; see D5.

**Implemented.** Six decisions were made in the doing.

**The field is `step.verification`, a bare string, defaulting to `unverified`.**
Named for the fact it records — *who has checked this* — rather than
`confidence`, which would be the author's belief about the material and is not
something a reader can check. A bare string rather than an object because it is
read far more often than parsed and because one changed line per step keeps an
export diffable; a reviewer's free-text note on a disputed step is a real want
and is deliberately left open rather than half-answered. An absent field means
`unverified`, and that is the whole argument: authority is earned by a human act
and never granted by omission. The five shipped examples carry no field anywhere
and therefore draw entirely unverified, which is the truth about them.

**Three states, because a binary loses the finding.** `unverified` / `verified` /
`disputed`. Without the third, a reviewer who finds something wrong must either
leave the step looking untouched — losing the finding, and lying about how far
the review got — or mark it verified, which is worse. It is also the difference
between "58 of 60 checked, review incomplete" and "60 of 60 checked, 2 problems
found", which is the only number anyone wants. `partial` and `n/a` were
considered and rejected: neither answers a question a reader has.

**Border weight only, and unverified is the light one.** `--conf` is a
multiplier on the four per-type stroke widths, so nothing changes but weight and
the proportions between shapes survive. Unverified sits at 1.04px and verified at
1.92px, against the old uniform 1.6px. Two consequences were deliberate. Nothing
ever grows enough to crowd a neighbour: the tightest clearance on any shipped
sheet is 12 user units and a verified stroke spends 0.16 of it per side.
And 1.04px is deliberately over one device pixel — below that a stroke
antialiases to grey, which starts borrowing from opacity's channel, and prints as
a broken line. Expressed as a custom property rather than literals so that every
interaction rule (`:focus-visible`, `.lit-focus`, `.walk-now`, the flash
keyframe) keeps its own literal `stroke-width` and wins the cascade exactly as
before — a confidence state that out-specified those would have made a focused
box change meaning depending on whether anyone had reviewed it.

**The canvas is binary; the third state lives elsewhere.** `disputed` draws at
the same light weight as `unverified`. The canvas answers one question — *can I
trust this box?* — and both answer no. This was not the first choice: an inner
outline was drawn for `disputed` and abandoned, because **border texture is not
actually free.** `insert` spends two inset vertical bars, `parallel` two inset
horizontal bars, `shelf` a divider and `choice` two inset chevrons — four of the
nine step types already use inner strokes as *type* ornaments, and an inset ring
collided with one or another at every inset tried. Weight is free; texture is
half spent, and the budget table should say so. The consolation is that the
fallback is good rather than merely acceptable: on a completed review the
disputed steps are the only light boxes left on the sheet, which is exactly where
the eye should go.

**Marking happens in the modal, not on the box.** Review mode adds a footer to
the detail panel with three buttons and V / X / U, and marking advances to the
next step — sixty steps is sixty keystrokes. Marking from the canvas is keyboard
only, on a focused box. Two reasons: verifying a step is a claim to have read it,
and the reading happens in the modal, so a canvas-wide click-to-verify would be
an invitation to rubber-stamp; and an on-canvas control would sit exactly where
D5's actor chip goes. Nothing automatic writes a state — there is one assignment
to the mark table in the whole interaction layer, `mark()` has three callers, all
of them a person pressing something, and a test asserts the count.

**Review mode suspends walk and leaves everything else alone.** Dimming is one
mechanism with three entry points and a reader can only be doing one at a time
(D5); review mode is not a fourth, because it dims nothing and touches no
opacity. Hover-route and "Dim secondary branches" keep working untouched while
reviewing, and were checked doing so. Walk is the real conflict — it drops
everything off the current step to 14% opacity, which hides the very outlines
being reviewed, and it claims Space, Enter and the arrows — so review holds the
Walk buttons disabled with a title saying why, using the same hold-and-hand-back
pattern walk already uses on Dim. The chain is linear: review holds walk, walk
holds Dim, Dim holds nothing. No cycle, so no deadlock, and the toggle that ends
review is in the document header where nothing can hold it.

**Marks are a scratchpad; the export is the document.** They live in
`localStorage`, keyed by title plus workflow ids, and by *step id* rather than by
node uid so they survive an edit to the document. There is no network, as D4.
`currentSource()` folds them into the page's own document, so D4's "Edit this
page's document" and D3's export hand out the same bytes — one source of truth,
not two paths. `unverified` is written by deleting the key rather than by stating
it, so an export is a minimal diff. The panel says which copy lasts, permanently
and in as many words, and says it more loudly once there is unexported work;
`beforeunload` warns only when marks changed in this session and were not
exported, because warning on every departure would train the reader to dismiss it.

**Two bugs fell out of building it, both older than this work.**
`showDoc` set `currentDoc` *after* binding the sheets, so anything asking which
document was open during binding got `null` — every mark was painted and then
silently dropped on the way to storage. And `.btn { display: inline-flex }`
outranks the user agent's `[hidden]`, so every button hidden by attribute was
still on screen — including D4's "Edit this page's document" on the very index
page it was written to stay off. One global `[hidden]` rule fixes both classes of
it; both are now covered by tests.

**Unvalidated until the regeneration pass.** The prompt now asks for
`detail.sources` and forbids the model writing `verification`, and a prompt
change is only truly tested by generating documents from it. That is the queued
regeneration pass, not this item.

---

## D4 — Nothing keeps a document true over time

**Problem.** The JSON lives inside the HTML, so revision means regenerating from
scratch, and nothing signals that reality has moved on.

**Call: round-trip editing plus a freshness signal.** The builder loads the page's
own embedded source for editing and rebuild, and the page shows the document's age,
warning past a threshold the author sets.

**Rejected.** Source-of-truth linkage to live systems — requires a network, which
breaks the single-file property that the whole distribution model rests on.

**Implemented.** Four decisions were made in the doing, and each of them could
have gone the other way.

**The threshold is `meta.reviewEvery`, an interval, not an expiry date.**
`"90 days"`, `"6 months"`, `"1 year"` — a whole number and a unit, plural
optional, measured from `meta.date`. Authors know how fast their subject moves,
not the date on which this particular file stops being true: "fees are reset
annually", "an org chart survives about two quarters". An absolute
`meta.expires` would also have to be edited twice on every real review — once
for the date checked, once for the new deadline — and the second edit is the one
that gets forgotten, which turns the whole signal into noise. A string rather
than `{ n, unit }` because it is read far more often than it is parsed, and a
strict grammar makes it validatable anyway: anything else is an error naming
`meta.reviewEvery`, and `reviewEvery` without a readable `meta.date` is an error
too, since an interval measured from nothing says nothing. A malformed
`meta.date` is only a warning — it is prose elsewhere on the page, and it costs
just this signal.

**The age is computed when the page is read, never when it is built.** No
build-time module may ask what day it is: a stamped date would freeze the age at
the moment of the build, and it would break the byte-identical guarantee in the
worst possible way — passing all day and failing across a midnight boundary. So
`fresh.mjs` is a pure calendar library that takes its `today` as an argument, the
only clock call in the project is in `assets/app.js`, and a test greps every
build-time module for `new Date` and friends. The reader's own clock is the only
time source a file with no network has, which is a limitation and also the whole
point.

**Nothing ever moves `meta.date` on its own.** A rebuild is not a review. A date
that advanced because the file was regenerated would make the page assert a
freshness nobody verified — the same dishonesty D3 exists to fight, arriving by
a side door. There is deliberately no "mark reviewed" button either: the honest
version of that action is editing the date in the document, which is exactly what
the round-trip editor now puts one click away. The round-trip status line says so
in as many words, once, at the moment the author is about to edit.

**Two states, one line of markup, no new channel.** With a date and inside the
interval — or with no interval at all — it is a quiet meta line under the
description: `Dated 4 March 2026 · 3 months old · review due 4 September 2026`.
Past the interval the same element is raised into the `meta.disclaimer` banner's
own geometry, border and amber, led by a bold **Overdue for review**, so the two
read as one family of "check this" notes rather than as two competing banner
styles. With no `meta.date` no element is rendered at all: a document that makes
no claim about its age cannot go stale, and is not nagged. Without scripting the
line still states what the document itself asserts — `Dated 4 March 2026 ·
reviewed every 6 months` — because that much needs no clock. **It spends nothing
in the channel budget:** it is page chrome in the document header, beside the
caveat, and nothing about it is drawn on a canvas. A test asserts both halves of
that.

**Round trip differs by page type, because the source does.** A generated
single-document page embeds its own document as `wfd-source`, so that is what the
builder loads. The library file has no single source — `wfd-source` is `{}` and
every example is carried separately — so what it loads is whichever document is
open. On the index with nothing open there is no document to edit, and the button
is hidden rather than left to fail quietly when pressed. Shipped as
`#build-source` in the builder's step 2, beside `Try an example`.

---

## D5 — Swimlanes without a second axis

**Problem.** Swimlanes answer three questions — who owns which parts, where work
changes hands, how much sits with each actor — by spending a spatial axis. Both
axes are already spent (y = sequence, x = severity), and a second one destroys the
no-crossing guarantee that everything else rests on.

**Call: actor chips + an interactive legend + handoff markers.**
- Every box carries a small monospace chip with the actor's initials. Greyscale-safe
  and self-describing.
- The legend under each diagram gains actor entries. Hovering one dims everything
  that is not that actor.
- Where two consecutive steps have different actors, the connecting line is marked
  with a tick and the receiving actor's initials. Handoffs are where processes fail,
  and this makes them visible with no interaction at all.

**Interaction model.** Dimming is one mechanism with three entry points — hover a
route, Dim secondary branches, filter by actor — and a reader can only be doing one
at a time, so they share the same treatment. Hovering a route while an actor filter
is active overrides the filter for the duration of the hover, then restores it.

**Prerequisite.** `detail.actor` is free text today and cannot be grouped on; string
variation alone would yield forty actors from a document with four. Needs a
document-level registry (`actors: [{ id, name, short }]`) with steps referencing it,
plus a prompt change, a validator rule, and a migration for the five shipped
examples. The registry is most of the work; the rendering is comparatively easy.

**Rejected.** Colouring boxes by actor (collides with severity and confidence). An
actor rail (fights the phase rail, and can only describe lane 0, so it lies about
branches). A derived handoff diagram (real value, but a second artifact to keep
true — revisit if the actor graph proves interesting alone).

**Implemented.** Seven decisions were made in the doing.

**The field is `step.actorId`, and `detail.actor` was not touched.** Every other
reference in this format is named for its target — `exit.to`, `goto.workflow`,
`insert.workflow` — so by convention this would be `actor`. It is not, for one
reason: `actor` is already taken, 165 times across the shipped examples, by the
prose field inside `detail`. A step carrying `"actor": "shopper"` six lines above
`"actor": "Shopper, with a pre-filled suggestion"` is a trap for a human editing
the JSON and an invitation for a model to write the sentence where the identity
belongs, which is the exact failure the registry exists to end. The `Id` suffix
says *this is a reference* in the one place a reader is looking.

The prose stays because it is a different field, not a worse one. `actorId`
answers *which of the five*, the only question that can be grouped, filtered and
counted; `detail.actor` answers *how this step is performed and by whom exactly*,
which is what the modal wanted. Migrating one into the other would delete 165
authored sentences to gain nothing — and would break every document already
written, which is the harder constraint: a shipped document has to keep building
at every point in the work. It does. Steps only, as with `verification`: a
terminal performs nothing.

**`short` is capped at three characters, and the cap is load-bearing.** The chip
is drawn inside a box that never grows, so its room comes out of the width the
title wraps to. Three is enough for every real case — SH, SYS, PAY, INV, REC,
APP, USC, TRI, OPS. Absent or empty is derived from `name` (initials of the first
three words, or the first three letters of one), so the common case needs no
thought; anything present but wrong is an error naming `actors[i].short`. Two
actors that would draw the same chip is an error either way, written or derived,
compared case-insensitively: two actors the reader cannot tell apart defeat the
one thing the chip does.

**The open question is decided: warn above six, never error.** A legend stops
being scannable around six entries, and the actor entries are only part of what
the legend already carries — two directions, up to four severity glyphs, three
navigation glyphs, two confidence weights and a review count. Measured on the
shipped page at 1100px, four actors already wraps it to three lines. But a real
process can have nine owners and must still build, so it is a warning naming
`actors`, and it is phrased as something to check rather than a scold: whether
some of these are one identity written twice, or whether this is two documents. A
fourteen-entry registry is far more likely to be this entry's own premise
recurring — prose mistaken for identity — than a genuinely fourteen-actor
process. None of the five migrated examples trips it, which is the calibration
test.

**The chip is charged to the title rows and to nothing else.** It sits
right-aligned in a reserved gutter on the **first title line's baseline**, and
`sizeNodes` narrows the title wrap by exactly that gutter — decorating in the
renderer alone would draw text wider than the space layout reserved, which is the
D1 failure repeated, and a test asserts the width. The note block is not charged,
because the chip is not on its rows: it is ten pixels tall on the first title
baseline and the note block starts at least twenty-four below. The rule is one
line long — **each paragraph is centred in the room its own rows have.**

That was not the first shape. Two others were built and measured against the five
migrated examples, counting truncation warnings:

| | title truncations | note truncations |
|---|---|---|
| before any of this | 4 | 26 |
| gutter charged to the whole text block | 4 | **51** |
| title narrowed symmetrically, notes untouched | 4 | **75** |
| **shipped: gutter on the title rows only** | **4** | **34** |

Symmetric narrowing is the worst because the budget is coupled: a narrower title
wraps onto another line, and every line the title takes is a line the note does
not get. **The cost of the chip is eight extra note truncations across 256 steps,
and not one title.** Notes are a gloss and the modal carries them in full; the
title is the box's job and it was not touched.

The first title line is also the only row that clears every type ornament at every
title height. A vertically-centred chip was tried first and collides with
`shelf`'s divider at one common combination of title and note lines — the divider
sits at `blockTop + titleH + 2`, which lands on the box's own centre when the
title is one line and the note is one line. `parallel`'s lower bar and `choice`'s
chevrons rule out the other obvious middles.

**Handoff marks: `seq` edges between two steps, and nothing else.** A `fan` edge
already carries a branch label and its note in exactly the space a marker needs,
and the clamp that keeps those off the boxes is one item old; a `merge` or
`bypass` rejoins a numbered step the reader has already met, chip and all, so a
mark there restates rather than reveals. The restriction turns out to be
structural as well as stated — a fan leaves the box's *side*, so its two ends
never share an x, and the straight-run guard excludes it independently. Placed
with the same discipline as a branch note: given only the room that exists —
below the box, below its primary label if it has one, above the next box, clear
of any line crossing the gap — and **dropped rather than drawn over something**
if that room is not there. On the five examples, 24 candidates and 24 drawn, none
dropped. It is `aria-hidden`: both boxes either side already announce their actor
by name, so a third reading of "PAY" between them is noise.

**The chain is still linear, and the actor filter hangs off its bottom.** The
persistent controls are, strongest first:

> **review mode → walk → Dim secondary branches → actor filter → nothing**

Each holds the next, disabling it with a title that says why and handing it back
in the state it was in. Hanging the filter off Dim rather than off walk is what
keeps it a chain rather than a tree: walk already holds Dim, so walk suspends the
filter too without knowing it exists, and review mode suspends all three the same
way. Hover-a-route is deliberately **not** a link in it — it holds nothing and
nothing holds it. Walk refuses it outright, Dim coexists with it as it always
has, and a latched actor filter yields to it for the length of the hover and
takes itself back, which is what this entry asked for. A momentary preemption is
not a hold, so it adds no cycle.

Hover previews and click latches, because pure hover cannot satisfy this entry's
own sentence about hovering a route *while a filter is active* — the pointer is
only ever in one place. Escape clears a latch, as it ends a walk.

**One bug was found by testing it and is worth recording.** Suspend/restore was
first written with a remembered-suspension map, and pointer events do not arrive
in matched pairs: sliding from one box straight to the next fires a `mouseout`
whose `relatedTarget` is the next box, which returns early without restoring, and
the map then made the *next* suspend a no-op — leaving the filter painted under a
lit route. Both functions are now stateless. The reader's choice already lives in
`actorLatched` and is never cleared by a hover, so suspending is "stop painting
it" and restoring is "paint it again", both idempotent. The shape cannot have the
bug.

**The five examples were migrated mechanically.** A small registry per document
and one ordered list of patterns matched against the prose already in
`detail.actor`, falling back to a per-workflow default; no prose was rewritten and
none was removed. checkout-ux 5 actors, agent-pipeline 4, naturalization 3,
workflow-builder 4, starter 1. Three of agent-pipeline's four sheets and one of
naturalization's come out single-actor, which is a true fact about them — those
sheets really are one agent's stage — and the honest rendering of it is a legend
with one entry and no handoff marks.

**Unvalidated until the regeneration pass.** The prompt now asks for an `actors`
registry of 2–6 entries and an `actorId` on every step, names the prose-for-
identity mistake explicitly, and its worked miniature carries five actors across
seventeen steps. As with D3, a prompt change is only truly tested by generating
documents from it, and that is the queued regeneration pass.

---

## D6 — Positioning

**Call: not positioned as a product.** It is a portfolio piece and a personal tool.
The index hero should still carry the three true claims — that it specifies AI agent
behaviour, that every box opens onto real material, and that the format forces
exhaustive exception enumeration so a missing failure mode shows up as a missing box.

**Sequencing note.** The hero rewrite comes last, after D3: the strongest thing the
hero can say may turn out to be the confidence model rather than any of the three.

**Implemented. The sequencing note was right, and the lead is the confidence
model.** Not because it is the most interesting of the four — depth probably is —
but because it is the only one that cannot be inflated. Every other claim a hero
makes is the page telling you it is good; *nothing on this page has been checked by
a human* is the page telling you where it is not yet trustworthy. A document whose
entire argument is that generated material overclaims cannot open by overclaiming,
so leading with the one sentence that reads as an admission is what buys the other
three their credit. It is also literally unique: no other diagramming tool carries a
review state.

Title `Diagrams that say what nobody has checked`; subtitle *A generated document
asserts everything with equal confidence. Here, an unchecked step is drawn in a
lighter outline until a person checks it.* All three of D6's claims survive
underneath — exception enumeration in the second paragraph, depth and agent
specification in the third.

**Every number in the hero and in the cards is counted, not typed.**
`libraryStats()` in `page.mjs` derives them from the built documents — 256 steps,
113 of them off the happy path, 197 enumerating failure modes, 66 carrying a model
and a tool list and a transcript, 35 of those 66 off the happy path — so an example
cannot change without the prose changing with it. It reads the build and never the
clock, so D4's byte-identical guarantee is untouched.

**Two claims were cut for being unverifiable on the page, and that is the rule
this entry is really about.** The freshness card was drafted saying that past its
interval the meta line is raised into an amber banner. True, and shipped in D4 —
but nothing on this page is overdue today, so a reader cannot check it, and the
first draft of the card's art drew the amber banner as if they could. Both were
replaced with what the page does show: naturalization asking for six months,
checkout-ux for a year, starter carrying no date and therefore no line at all. The
same test cut the old feature grid's fourth card — "no install, no server, no
account, nothing fetched" was the one sentence on the index written in product
voice, and D6 forbids that; the single-file property is still stated three times,
in the closing paragraph, the button's note and the footer.

**Eight cards, because eight is what the stated column count can spend.** The grid
declares 4 / 2 / 1 rather than `auto-fit`, and eight divides by all three, so no
breakpoint leaves an orphan cell painting the container's hairline. Verified at
1400, 1081, 1080, 1024, 900, 768, 561, 560, 430, 375 and 320, in both themes, with
zero horizontal page overflow at every one. Every colour in the five new pieces of
art is an existing token, so the `--accent` / `--accent-ink` split holds by
construction — accent appears only as a fill, accent-ink only as a stroke.

---

## D7 — Publication

**Call: deferred.** The repo will be created and published when the project is worth
showing. Until then the footer link to `ckluis.github.io/workflowforge` 404s, which
is a known and accepted cost.

---

## The visual channel budget

Four semantic axes now compete for a fixed set of channels. Anything added must
check this table first.

| Channel | Carries | Status |
|---|---|---|
| Fill / hue | Severity | taken |
| Branch label glyph | Severity (D1) | **taken — shipped** |
| Dashed border | Reference chips | taken |
| x position | Severity ordering | taken |
| y position | Sequence | taken |
| Left rail | Phases | taken |
| Top-left badge | Step number | taken |
| Top-right badge | Author tag | taken |
| Opacity | Interaction state — hover, dim, walk, actor filter | taken — four entry points, one linear chain |
| In-box chip | **Actor initials (D5)** | **taken — shipped**, first title line, right gutter |
| Edge decoration | **Handoff markers (D5)** | **taken — shipped**, `seq` step→step only |
| Border weight | **Confidence (D3)** | **taken — shipped** |
| Inner border strokes | Step-type ornaments (`insert`, `parallel`, `shelf`, `choice`) | taken — discovered by D3 |

Confidence takes border weight precisely because actor took the chip and severity
took hue. That allocation is the reason D1, D3 and D5 can coexist.

**Border *texture* was not free after all.** The row above it was written as
"border weight / texture", and the texture half turned out to be half spent
already: four of the nine step types draw inner strokes inside the box as their
type ornament, and an inset outline for a third confidence state collided with
one or another of them at every inset tried. Weight alone carries confidence, and
the third state is carried off-canvas. Anything reaching for an inner stroke next
should assume the space inside a box border belongs to the step type.
