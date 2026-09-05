# workflowForge

**A rendering engine for workflow diagrams. You bring the workflow; it draws it,
mechanically, without ever reading what is in it.**

**`index.html` is the project.** One file, no dependencies, nothing fetched. Open
it, send it, put it on a static host — it works the same everywhere.

### How it works

1. **Copy the prompt.** It lives inside `index.html`, along with the renderer.
   Nothing is fetched to give it to you.
2. **Paste it into your own model,** with a description of your process. Claude,
   ChatGPT, whichever you already use — *you* run this step. It hands back a
   workflow document as JSON.
3. **Paste that back into the page.** The renderer turns it into one
   self-contained HTML file you can send to anyone. Or clone this repo and run
   the renderer yourself; both paths produce the same bytes.

Step 2 is the only point at which your process text leaves your machine, and it
goes to the model vendor you already chose, on their terms. The page itself sends
nothing: no account, no server, no telemetry, and no network requests after it
loads.

Inside `index.html`: five worked examples with a preview of each, a renderer that
draws DRAKON-derived workflow diagrams, and the prompt that writes the documents
those diagrams come from. The page you get back carries the same builder and the
same prompt, so whoever you send it to can do it again.

```
your process ──▶ [ the prompt + any model ] ──▶ a JSON document
                                                      │
                          the renderer inside the file ◀┘
                                      │
                          one .html ──▶ contains the renderer,
                                        so it can do it again
```

---

## Why the diagrams look like this

Borrowed from [DRAKON](https://drakonflow.com/read/drakon), with three deliberate
departures. Seven rules do all the work:

1. **The happy path is a straight vertical line down the left edge.** Read it top
   to bottom and you have read the process.
2. **Every deviation fans out to the right.** The further right a box sits, the
   more exceptional the situation that put you there. Severity is also written
   on the branch label as a mark — `ⓘ` worth knowing, `▲` needs attention, `✗`
   something failed, `✓` went well — so the axis survives a greyscale print, a
   photocopy and a colour-blind reader, none of which can see the hue. Each
   sheet's legend lists exactly the marks that sheet draws.
3. **Lines never travel upward, and never leftward except to merge.**
4. **A path that returns to an earlier step ends in a `↩ Go back to N` chip.** A
   path that leaves for another process ends in a `↗ Go to sheet M` chip. Both are
   dead ends on the canvas; your eye never has to backtrack.
5. **There are no arrowheads.** Direction is implied by rules 1–3.
6. **Every line on the sheet ends on the same row.** DRAKON's common-fate rule:
   icons that play the same role sit at the same height, so the whole set of
   endings reads in a glance instead of as a staircase.
7. **A sheet has two box sizes and only two.** Neither grows to fit its text. The
   lines inside flex — a long title borrows a line from the note — and past that
   the text is truncated with an ellipsis and reported as a build warning. Titles
   fit about 45 characters, notes about 50. Nothing is lost: every box opens.

What we left behind: DRAKON's **silhouette**, its answer to running out of
vertical room. Scrolling is free, so we spend it. `src/notes/drakon-rules.md` has
the full accounting of what was taken and what was dropped.

**Every box has a room behind it.** Click one and a modal opens with the real
material for that step — a simulated agent transcript with its tool calls for an
AI workflow, a wireframe with every control wired to the step it leads to for an
interface workflow, a runbook and alert table for an operational one. The diagram
is an index into the detail, not a substitute for it.

**When a document does not validate**, the builder hands you a prompt that names
every error in the renderer's own words, with the rule behind it, ready to paste
back to the model that wrote the document. And the one malformation models make
constantly — nesting `branches` inside `detail` instead of beside it — is simply
repaired, with a warning, rather than rejected.

**A page can be edited without going back to the model.** Every generated file
carries the JSON document it was made from, so the builder can load that document
back, let you fix the step that was wrong, and rebuild the file. On the index the
document loaded is whichever example is open; on a page of your own it is that
page's own source. Nothing is round-tripped through a model to change a word.

**And a page says how old it is.** Set `meta.date` and the page shows the
document's age under the description; add `meta.reviewEvery` — `"90 days"`,
`"6 months"`, `"1 year"` — and once that interval has run out the line becomes a
banner reading **Overdue for review**. The age is computed in the reader's
browser from the document's own date, because the build may not ask what day it
is and there is no network to ask anything else. A document with no date says
nothing and is not nagged, and nothing ever moves `meta.date` on its own — a
rebuild is not a review.

**A page carries its own review state, and is the tool for reviewing itself.** A
sixty-step document is about 22,000 words of asserted fact, and without this it
renders with the same authority whether or not anyone has read a word of it. So
every step has a `verification` state — `unverified`, `verified` or `disputed` —
and the canvas draws it in border weight: unverified boxes are outlined lightly,
a verified box is solid. **An absent field means unverified**, which is why a
freshly generated document is drawn provisional everywhere, and reviewing it
solidifies the boxes one at a time. Press **Review this document** and each step's
detail panel gains three buttons and the keys `V`, `X` and `U`; the header keeps a
running count and a progress bar; and **Export marked document** hands you the
same JSON with your marks written into it. Marks are held in your browser so you
can close the lid mid-document, but the exported file is the copy that lasts, and
the page says so. Nothing automatic ever marks a step verified — that is a human
act, for the same reason a rebuild never moves `meta.date`.

**Every box says who owns it, and the sheet marks where work changes hands.**
Swimlanes answer that by spending a spatial axis, and both axes here are already
spent — down is sequence, right is severity — so the answer is bought without the
axis. The document names its actors once, in a small registry; each step points at
one; and each box carries the actor's initials as a monospace chip, which survives
a photocopy in a way a colour never does. Each sheet's legend lists exactly the
actors that sheet draws, and hovering one dims everything that is not theirs —
click to keep it. And wherever two consecutive steps belong to different actors,
the line between them is ticked and labelled with whoever is picking it up, so the
handoffs — where processes actually fail — are visible without touching anything.

**Hovering a box lights the whole route through it** — including the branch labels,
their notes and the primary answers, so nothing on a lit path stays greyed out.
Above every sheet sit the controls that act on the diagram: **Walk this sheet**
reveals the happy path one step at a time, **Dim secondary branches** leaves only
that path at full strength, and **Full screen** expands the canvas without hiding
the description that explains it. Dimming is one mechanism with several ways in
and a reader can only be using one at a time, so they form a single chain in which
each hands the canvas back exactly as it found it: review mode holds the walk, the
walk holds Dim, Dim holds the actor filter, and hovering a route borrows the
canvas from the filter for as long as the pointer is there.

---

## Review, and what a document may claim about itself

Every step carries a verification state, and the default is `unverified`.
Authority is earned by a human act, never granted by omission — a document nobody
has reviewed says so, in its header and in the weight of every outline it draws.

- **Reviewing** is a mode on any page. Open a step, mark it `verified` or
  `needs work`, and a dispute asks *why* — the reason travels with the document
  and opens at the top of that step's panel.
- **A disputed step is drawn.** It carries a flag outside its box, top-right. It
  is a shape before it is a colour, so it survives greyscale, printing and a
  colour-blind reader.
- **Marks are a draft.** They live in your browser and nowhere else until you
  publish. Publishing writes a *new* HTML file stamped with your name, the date
  and the counts — that file is the one you send.
- **The builder will not launder a review.** Paste any document into it and it
  renders the workflow but strips every verification mark and review record,
  saying what it dropped. It cannot know where a pasted document came from, so it
  refuses to repeat a claim that a human checked it. This is the same rule the
  format already applies to dates: a rebuild is not a review.

Nothing here is tamper-proof and it does not pretend to be — the renderer is open
source and runs on the reader's machine, so anyone determined can run their own.
What it will not do is help a doctored document look reviewed.

---

## Determinism

The model chooses the content graph. The renderer owns every pixel. Nothing in the
layout is measured at runtime, sampled, or iterated to a fixed point: rows come
from longest-path layering, lanes from a depth-first walk, text wrapping from a
fixed character-advance table rather than the browser, merge lines from a defined
gutter-band order, and columns from a fixed greedy pack that is discarded if it
would cross a line.

**No two lines cross.** After routing, every horizontal is tested against every
vertical. Endpoint contact is a junction and is fine; an intersection interior to
both segments is not. The one shape that cannot be drawn — a nested branch
rejoining above its own parent's rejoin point — is redrawn as a `→ Continue at N`
chip and the sheet is laid out again.

This is the whole argument for a DSL. Ask a model to emit SVG directly and you get
hand-placed coordinates, lines ending inside boxes, and no collision avoidance.
Ask it for structure and let code do geometry, and the diagram is correct by
construction.

---

## Changing it

```bash
./build.sh                 # test, rebuild index.html, verify
./build.sh --svg           # also write one standalone .svg per sheet to out/
./build.sh --standalone    # also write the prompt-with-renderer variant to out/

node src/build/social-card.mjs > /tmp/card.html   # then screenshot at 1200x630
```

The social card is a committed PNG rather than a build output: turning a page into
an image needs a browser, and this builds with Node and nothing else.

Everything that builds the file lives in `src/`. Nothing else is committed —
`out/` is scratch.

| path | what it is |
|---|---|
| `index.html` | **the product** |
| `build.sh` | the only command |
| `src/prompt.md` | the prompt handed to a model; teaches the DSL and nothing else |
| `src/spec.md` | normative spec for WFD v1, including the layout algorithm |
| `src/text.mjs` | deterministic character metrics and word wrap |
| `src/fresh.mjs` | document age, review intervals and review provenance; takes "today" as an argument, never reads a clock |
| `src/md.mjs` | small markdown renderer |
| `src/layout.mjs` | flatten → columns → layer → reserve → align → pack → route |
| `src/svg.mjs` | shapes, paths, and the index previews |
| `src/detail.mjs` | the click-through modal, per lens |
| `src/page.mjs` | page assembly: document body, library shell, embedded payloads |
| `src/assets/` | stylesheet and interaction layer, inlined at build time |
| `src/build/` | the bundler and the build entry points |
| `social-card.png` | the 1200x630 link preview, committed; regenerate with `src/build/social-card.mjs` and a browser |
| `src/examples/` | the five documents the file ships with, plus `how-it-works` — the explainer drawn in the hero |
| `src/test.mjs` | module tests plus the geometric correctness checklist |
| `src/notes/` | the DRAKON digest and the reference-page critique |

Node 18+. No dependencies, nothing to install.

---

## What the tests assert

`src/test.mjs` checks these against every example, per sheet:

- no two boxes overlap, and **no two lines cross**;
- no line segment cuts through a box it does not connect to;
- every edge travels downward; only merges travel left;
- the start has no incoming line; every terminal has none outgoing;
- no step dead-ends without terminating;
- lane 0 is a single unbroken skewer;
- every `goback` names a step at or above its own branch;
- all terminals share one row, and sibling branches appear in authored order;
- a sheet has at most two box heights, and no text block is taller than its box;
- every line of text fits inside the box that contains it, and no marginal text
  runs into a line, into a box, or into the next label;
- every branch label carries the mark its tone calls for, `neutral` carries none,
  and the width reserved for a label is the width of the label as drawn;
- every mark a sheet draws is explained by that sheet's own legend, and nothing
  the sheet does not draw is listed;
- everything drawn sits inside the canvas;
- the same document yields identical geometry on a second build;
- a review interval is parsed exactly as documented and rejected otherwise, a
  document with no date produces no freshness signal at all, and the age
  arithmetic is checked against fixed dates rather than the machine's clock;
- a generated page carries back the document that made it, unchanged, `meta.date`
  included;
- no build-time module calls `new Date()`, `Date.now()` or anything like them —
  which is what keeps the build byte-identical across a midnight boundary;
- a step with no `verification` is unverified, an unknown value is an error that
  names the field, the confidence treatment moves no box and no line by a
  fraction of a pixel, the progress count is page chrome and never drawn on a
  sheet, and there is exactly one place in the whole interaction layer that can
  write a verification state — so nothing automatic can ever mark a step
  verified.
- an unknown `actorId` is an error that names the field and lists the ids that do
  exist, no two actors may draw the same chip, and adding actors to a document
  moves no box, no line, no branch label and no note by a fraction of a pixel —
  the chip is charged to the width the title wraps to, at the one place that width
  is derived, so it can never be drawn wider than the room reserved for it;
- a handoff mark is drawn only between two consecutive steps with different
  actors, and is dropped rather than printed over a box, a line or a branch label
  when the gap has no room for it;
- a review record must name a person, carry a real calendar date, and may not
  claim more checked steps than the document has — a malformed one is an error,
  never a field quietly dropped;
- a `detail` field written in the wrong shape is named rather than discarded in
  silence, because the panel reads lists through an `Array.isArray` guard and a
  clean green build used to say nothing about whether the author's material
  survived;
- a tag may not impersonate a verification state, so `meta.tags: ["verified"]`
  is rejected rather than rendered as a chip that reads like a human review;
- the builder strips review claims before it builds, and the publish path — your
  own marks, with your own name — does not;
- a disputed step is distinguishable on the sheet from one nobody has looked at,
  and the mark is geometry rather than only hue;
- the legend explains exactly the weights the sheet draws *at read time*, not
  only at build time, and is repainted as marks change;
- the modal's scrolling pane can shrink below its content, which is what makes it
  scroll rather than handing every wheel to the page behind it;
- `app.js`'s title-size constant matches `.wf-title` in the stylesheet, so the
  legibility floor cannot silently drift into fitting a sheet to a smudge;
- every keyboard shortcut the help panel advertises is handled somewhere.
