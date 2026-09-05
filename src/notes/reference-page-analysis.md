# Reference page analysis — thariqs.github.io/html-effectiveness/13-flowchart-diagram.html

Source saved verbatim at `research/reference-page.html` (396 lines, ~13KB, zero
dependencies — one inline `<style>` block, one inline `<script>` block, no
libraries). Page renders a fixed 12-node deploy-pipeline flowchart
(`git push main` → CI → tests → build → canary → promote → smoke tests →
done, with two failure branches to "Post failure status" and
"Auto-rollback"). Diagram is a single hand-authored `<svg viewBox="0 0 620
920">`; there is no D3/Mermaid/Cytoscape/dagre — every coordinate is a
literal number typed into the file.

User's verdict: "the arrows suck, but it does show clicking on an item to
see more details." This doc backs that up with exact mechanics and specific
defects.

---

## A) What it does well — the click-to-detail interaction

**Wiring.** Every interactive shape (rects and the two diamond `<path>`
decision nodes) is wrapped in `<g class="node ..." data-k="push">` etc.
Twelve keys total: `push, ci, test, gate-tests, status, build, canary,
gate-canary, promote, rollback, smoke, done`. A flat JS object keyed by the
same strings holds the copy:

```js
const DETAIL = {
  push: {
    title: "git push main",
    meta: "trigger · 0s",
    body: "A push or merge to <code>main</code> fires the <code>deploy</code> workflow. …",
    code: "on:\n  push:\n    branches: [main]"
  },
  ci: { title: "CI · lint + typecheck", meta: "github actions · ~2 min", ... },
  ...
};
```

**Click handling** — not delegated; a listener is attached to each of the
12 `.node` groups individually:

```js
const nodes = document.querySelectorAll(".node");
const T = document.getElementById("p-title");
const M = document.getElementById("p-meta");
const B = document.getElementById("p-body");
const C = document.getElementById("p-code");

nodes.forEach(n => {
  n.addEventListener("click", () => {
    nodes.forEach(x => x.classList.remove("active"));
    n.classList.add("active");
    const d = DETAIL[n.dataset.k];
    if (!d) return;
    T.textContent = d.title;
    M.textContent = d.meta;
    B.innerHTML = d.body;      // raw HTML — body copy contains inline <code> spans
    C.textContent = d.code;    // safe text — code block
  });
});
document.querySelector('.node[data-k="push"]').classList.add("active");
```

**Selection indicator on canvas.** Clicking clears `.active` from all nodes
then adds it to the clicked one. The only visual feedback is a CSS border
recolor:

```css
.node.active rect,
.node.active path { stroke: var(--clay); stroke-width: 2; }
```

Default node stroke is `--gray-300` at 1.5px; selection swaps it to orange
`--clay` at 2px. No glow, no fill change, no scale — a thin ring is the
entire "you are here" signal.

**Detail surface is not a modal.** `<aside id="panel">` is a permanent
second grid column (300px fixed), `position: sticky; top: 24px`, so it
rides along with scroll and stays beside the diagram — no overlay, no
backdrop, no open/close animation, because it's never closed. Below the
920px breakpoint the grid collapses to one column and the aside drops below
the chart (loses the "always visible while you scan the diagram"
property).

**Population is direct DOM mutation of four fixed elements**, no
re-render/diff, no framework: `h3#p-title` (textContent), `div#p-meta`
(textContent, a pre-joined string like `"argo rollouts · 10 min soak"`, not
structured fields), `p#p-body` (`innerHTML`, because copy embeds inline
`<code>` tags), `pre#p-code` (`textContent`, literal `\n` in the string,
rendered via `white-space: pre-wrap`).

**Dismissal: there isn't one.** No "click elsewhere to close," no empty
state — the panel always shows the last-selected node's detail. Initial
state is the `push` node, hardcoded **twice**: once as static fallback
markup inside `<aside>` (so the page looks correct before JS runs / if JS
fails) and again via `document.querySelector('.node[data-k="push"]').classList.add("active")`
on load. The two copies must be kept manually in sync — a maintenance
smell if the copy ever changes.

**No transitions.** Content swap is instantaneous — zero fade/crossfade on
the panel. The only CSS transition anywhere in the file is
`.node { transition: transform 120ms ease; }` for the 1px hover lift; the
panel itself has no `transition` property at all.

**No keyboard support.** `.node` is an SVG `<g>` with `cursor:pointer` and
a click listener only — no `tabindex`, no `role="button"`, no `aria-*`, no
keydown handler for Enter/Space. The entire interaction is mouse/touch-only:
not Tab-reachable, not announced to screen readers, fails basic a11y for
what is functionally a set of 12 buttons.

**State tracking is purely the DOM** — no JS variable holds "currently
selected key"; selection is encoded only in which node carries `.active`,
queried fresh each click via the closure, never read back elsewhere.

---

## B) Why the arrows suck

**Technique**: raw hand-authored SVG `<path>` elements with literal,
hand-typed coordinates (`M310,56 L310,92`, cubic beziers for branches) plus
three near-identical `<marker>` arrowhead defs (`arrow`, `arrow-rust`,
`arrow-olive` — same 10×10 triangle path, only `fill` differs). No routing
library, no automatic layout, no collision detection. Every one of the 12
edges is a constant baked to match this exact 12-node graph; adding or
moving a single node means manually recomputing every downstream
coordinate, path, and label position.

**Concrete, verified defects** (found by reading the literal path
coordinates against each node's rect geometry, not by eyeballing the
render):

1. **An arrowhead is rendered behind its target node and is effectively
   invisible.** The "fail → status" branch edge is:
   `<path class="edge no" d="M268,294 C190,294 150,294 150,212 L150,212"/>`
   with `marker-end: url(#arrow-rust)`. The target, `status`, is
   `<rect x="60" y="176" width="180" height="48"/>` — i.e. it spans
   y = 176 to 224. The path's endpoint, `(150, 212)`, lands **12px above
   the box's bottom edge but fully inside its y-range (176–224)** — the
   arrow pierces into the node's interior instead of stopping at its
   border, unlike every other edge in the diagram (e.g. `ci`→`test`:
   `M310,140 L310,176` terminates exactly at `test`'s top edge y=176).
   Worse: the entire `<!-- edges -->` block is emitted **before** the
   `<!-- nodes -->` block in DOM/paint order, so every node rect paints
   over every edge. Since `status` is `class="node bad"` →
   `.node.bad rect { fill: rgba(176,74,63,0.10); }`, the arrowhead is only
   ~10%-opacity visible — a faint smudge under a translucent box rather
   than a clean arrow touching an edge. Compare the *other* branch edge
   into `rollback` (`M352,570 C470,570 470,690 392,720`), whose endpoint
   `(392,720)` lands exactly on `rollback`'s left border (`x=392`) and
   renders correctly — the two branch edges are inconsistent in whether
   they actually reach the node boundary.

2. **Global z-order is edges-under-nodes with no per-edge exception**,
   so any future edge whose endpoint math is even slightly off will
   silently disappear under translucent node fills rather than throwing a
   visible bug — the failure mode is invisible, not glaring.

3. **Mixed connector language with no consistent geometry.** Straight
   "spine" edges are plain vertical `M x,y1 L x,y2` segments. Branch edges
   are ad hoc cubic Béziers with manually chosen control points that first
   run flat, then hook — not a true orthogonal/elbow router and not a
   uniform curve style either. The two techniques look visually
   unrelated on the same canvas.

4. **Edge labels are unattached, manually placed text**, not anchored to
   the path (no `textPath`, no computed midpoint): e.g. `<text class="lbl"
   x="138" y="260" fill="#B04A3F">fail → status</text>` is just a guessed
   coordinate near where the curve happens to pass. If the curve's control
   points ever change, the label desyncs from the line it's supposed to
   label. Labels also have no background/halo — legible today only because
   they happen not to cross a node or another edge; that's luck, not a
   guarantee.

5. **No overlap/crossing avoidance**, verified rather than assumed: the
   branch curves were hand-tuned to detour around the spine (e.g. bulging
   out to x=470 to reach `rollback`), which works for this fixed
   12-node graph but does not generalize — there's no algorithm checking
   that a curve avoids a third node's bounding box, so any edit to the
   graph risks a new, silent overlap.

6. **The legend documents node shapes only, never edge semantics.** Four
   legend chips explain "process step / decision / terminal success /
   failure path" (all about node fill), but nothing in the legend explains
   that solid-gray = default flow, solid-olive = "yes" branch, or
   dashed-rust = "no" branch. Colorblind mitigation exists for the "no"
   case (dash pattern in addition to rust color) but the "yes" branch is
   color-only (olive vs default gray), and none of it is explained on the
   page.

7. **Arrowhead scale is coupled to overall SVG scale**, not to viewport
   pixels — because the whole `<svg>` is `width:100%; height:auto` against
   a fixed `viewBox="0 0 620 920"`, shrinking the container (e.g. mobile)
   shrinks the arrowheads and everything else uniformly. Not wrong per se,
   but combined with defect 8 below it means small screens get
   proportionally tiny arrows and unreadably small labels simultaneously
   with no independent control.

---

## C) Everything else worth stealing or avoiding

**Steal:**
- **Typography system**: serif (`ui-serif, Georgia`) for `h1`/`h3`, mono
  (`ui-monospace, "SF Mono", Menlo, Consolas`) for eyebrow/meta/code/all
  SVG text, sans for body copy — a deliberate three-family editorial mix
  that reads as intentional, not accidental.
- **Palette**: warm neutral base (`--ivory #FAF9F5` bg, `--slate #141413`
  text — near-black on near-white, strong contrast) with a small semantic
  set (`--clay` orange = selection accent, `--olive` green = success,
  `--rust` red = failure) applied as **soft tinted node fills at 10–12%
  alpha** (`rgba(120,140,93,0.12)`) rather than solid color blocks — low
  saturation, legible, doesn't fight the mono/serif type.
  - This is literally Claude.ai's/Anthropic's brand palette (ivory/clay/
    slate naming) — worth knowing if replicating "looks official" affect
    is a goal, and worth deliberately diverging from if not.
- **Zero-dependency footprint**: one file, ~13KB, no network requests, no
  build step, inline `<style>`/`<script>` only. Loads instantly. This is a
  genuinely strong baseline to match on performance.
- **`data-k` + flat detail-object pattern** is a clean, easily-portable
  data model for click-to-detail (see Section A) — trivial to steal
  wholesale.
- **Sticky detail panel beside the canvas** rather than a modal keeps the
  diagram visible while reading detail — good default for desktop widths.

**Avoid / fix:**
- **No keyboard access at all** on the primary interaction (Section A) —
  fails WCAG 2.1.1 outright. `.node` needs `role="button" tabindex="0"`
  plus Enter/Space handling and a visible focus ring (there currently is
  none — the only interactive-state CSS is `:hover` and `.active`, no
  `:focus-visible`).
- **Text scales down with the canvas on narrow viewports and has no
  floor.** SVG text font-size is defined in *viewBox units* (12px/10px)
  inside a fixed `620×920` viewBox rendered at `width:100%`. On a ~340px
  phone width (after body padding), the effective on-screen text size is
  roughly 12 × (340/620) ≈ 6.6px — illegible. `overflow-x:auto` on
  `.canvas` exists as a scroll fallback but the SVG's own `width:100%`
  means it shrinks to fit rather than triggering that scrollbar until the
  container is narrower than the *shrunk* SVG, i.e. the scroll fallback
  rarely engages before legibility is already broken.
- **Inconsistent terminal-node styling.** Only `push` and `done` get
  `.term` (pill shape, `rx:22`, tinted `--gray-150`/`--olive` fill).
  `rollback`, which is also a pipeline-terminal state (page goes to
  on-call, nothing continues from it), is styled identically to a regular
  mid-pipeline process step (`class="node bad"`, standard 8px-radius rect)
  — visually it doesn't read as an ending.
- **Duplicated default-state content** (Section A) — the initial "push"
  detail is written out twice, once in static HTML fallback and once in
  the `DETAIL` object; a copy edit to one and not the other silently
  desyncs them.
- **Legend uses `<i class="chip">`** — semantic misuse of `<i>` for a
  decorative color swatch, and the "decision" chip fakes a diamond via
  `transform: rotate(45deg)` on a square (`.chip.gate`), a completely
  different rendering technique from the actual SVG diamond `<path>` in
  the diagram — the two could visually drift apart if either is edited
  independently.
- **No `<title>`/`<desc>` on the SVG or per-node**, no `aria-live` region
  on the detail panel to announce content swaps to assistive tech, no ARIA
  role on the diagram as a whole (e.g. `role="img"` or `role="group"`
  with a label) — an SVG this interactive should not be accessibility-inert.
- **No hover preview** — you must click to see anything; hovering only
  nudges the node 1px (`translateY(-1px)`), no tooltip, no preview of
  what a click will show.
- **Single breakpoint (920px)** for the entire responsive strategy — grid
  collapses from 2 columns to 1, nothing else adapts (chart doesn't
  re-layout, node/text sizing doesn't change independently of overall SVG
  scale).

---

## D) Requirements for our renderer to be strictly better

1. **Compute edge endpoints from live node geometry** (border-intersection
   points), never hardcode coordinates — eliminates the class of bug in
   Section B.1 where an arrow overshoots/undershoots a node's border.
2. **Guarantee arrowhead visibility**: either paint edges after nodes at
   the endpoint region, or clip/route edges so the arrowhead always lands
   fully outside any node's fill — never let an arrow terminate inside a
   translucent or opaque shape that can paint over it.
3. **One consistent connector style**: real orthogonal/elbow routing (or a
   single uniform curve style) for all edges, not straight lines for the
   spine and ad hoc hand-tuned Béziers for branches.
4. **Automatic overlap/crossing avoidance** in edge routing — verified
   computationally (edge path doesn't intersect any non-endpoint node's
   bounding box), not achieved by manually eyeballing control points.
5. **Anchor edge labels to their path** (computed midpoint/offset, or
   `textPath`) with a background halo, so labels stay attached and legible
   regardless of edge color, curve changes, or nearby nodes.
6. **Legend covers edge semantics too** — line color and dash pattern get
   explained, not just node fill/shape.
7. **Decouple label legibility from diagram scale** — either a minimum
   font-size floor with reflow/scroll below it, or re-layout (not just
   uniform shrink) at narrow widths, so mobile never renders sub-8px text.
8. **Full keyboard + screen-reader support on click-to-detail**: focusable
   nodes (`tabindex`, `role="button"`), visible `:focus-visible` ring,
   Enter/Space activation, and an `aria-live` region on the detail panel
   so assistive tech announces content swaps.
9. **Consistent terminal-state styling** — every node with no outgoing
   edge (success or failure) gets the same "this is an ending" visual
   treatment, not just the success path.
10. **A real transition on detail-panel content swap** (fade/slide, even
    if brief) instead of an instantaneous replace, and a single source of
    truth for default/initial state (no duplicated hardcoded copy between
    markup and data).
11. **No hand-placed per-diagram coordinates required** — at minimum a
    semi-automatic layered layout (rank assignment + simple routing) so
    adding/removing/reordering a step doesn't require manually
    recalculating a dozen unrelated numbers.
