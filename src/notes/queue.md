# Working queue

One issue at a time, one agent at a time. Each entry is decided in
`decisions.md`; this file only tracks order and state.

| # | Item | State |
|---|---|---|
| D2 | Distinct glyph for cross-sheet jumps (`↗` vs `→`, `↩` for back) | **done** |
| D1 | Severity glyph + text on branch labels | **done** |
| D4 | Round-trip editing + freshness signal | **done** |
| D3 | Review mode, assert-less/cite-more, visually distinct unverified steps | **done** |
| D5 | Actor chips + interactive legend + handoff markers | **done** |
| D6 | Index hero rewrite carrying the three claims | **done** |
| D7 | Publication | deferred by the author |

## After the queue: the regeneration pass

Requested 2026-08-23. Two different tests, and they must not be conflated.

**1. Renderer regression.** Rebuild the five shipped documents through the
current code. Already automatic in `./build.sh`; catches geometry and layout
breaks. This is not the test being asked for.

**2. Prompt conformance.** Generate documents *fresh from the updated prompt*
and check they use the new fields correctly and validate clean. By the time the
queue closes the prompt will have changed in at least four places — D1 tone
guidance, D4's freshness threshold, D3's confidence state, D5's actor registry —
and none of those changes is exercised by re-rendering documents that were
authored before them. A prompt that describes a field the model never emits is
a prompt that is quietly broken.

**D5 left three things for this pass.** The prompt now asks for a document-level
`actors` registry of 2–6 entries and an `actorId` on every step, and names the
mistake it exists to prevent — writing the sentence where the identity belongs.
Check specifically that the registry is emitted at all; that it holds *identities*
and not one party written five times (the tell: several entries whose names start
with the same word); that no `actorId` is a sentence and no `detail.actor` is a
bare id; and that a fresh document's actor count sits inside the six-entry warning
rather than tripping it.

**D3 left two things for this pass.** The prompt now asks for `detail.sources`
on every load-bearing external fact and forbids the model writing
`verification` at all. Neither is exercised by re-rendering documents authored
before them, and neither is validated until documents are generated fresh. Check
specifically that `sources` appears with judgement rather than on every step, and
that `"verification"` appears nowhere in generated output.

**Scope.** Regenerate the four process documents — `checkout-ux`,
`naturalization`, `agent-pipeline`, `starter`. **Do not regenerate
`workflow-builder`.** It is the self-describing document: it carries the
project's own explainer prose, the DRAKON accounting of what was taken and what
was dropped, and the glossary. That text is authored, not derived, and a model
regenerating it would destroy content that cannot be recovered from the prompt.
Re-render it, and hand-edit its prose where the new features need describing.

**What the pass is checking.** That the prompt causes the new fields to be
emitted at all; that they are emitted with judgement rather than on everything;
that generated documents validate with no errors; that warning counts are
comparable to the shipped examples; and that the geometry checklist still passes
on documents no human hand-tuned.

## Prompt fixes after the regeneration pass — state

The pass validated D3's `sources`/no-`verification` rules and D5's registry, then
exposed five residual defects. All five are fixed and re-probed with documents
generated blind from the updated prompt.

| # | Defect | Mechanism | Outcome |
|---|---|---|---|
| 1 | `sources` vs `links` boundary untestable | §4.7.1 prose **then** §5.1 rule 5 + §7 check 4e | prose alone: **0 links in 50 steps**. With the checklist line: **13 entries over 12 steps**, zero misfiled |
| 2 | 150–400 words had no stated unit | §5.1 rule 1 + §7 check 29 | prose over 400: 9/82 → 1/50 |
| 3 | `failureModes` missing from ai/ui recipes | §5.2/§5.3 bullets **then** §7 check 28c | bullets alone moved nothing; the check moved gates 10/21 → **13/13** |
| 4 | §6.7 contradicted §3.4 on polarity | §6.7 rewrite + §3.4 clause | no contradiction in 13 gates; the contested shape now validates |
| 5 | `disclaimer` fired on unregulated subjects | rule 6 scope + leave-it-off + redirect to the review state | 3/4 → **0/3** on internal flows; still set on two genuinely in-scope subjects |

**The transferable finding.** Prose in a section the model reads once for field
names does not change behaviour. A line in the §7 checklist it executes does.
Defects 1 and 3 each tried both mechanisms and each moved only on the checklist
line — 1 is the cleanest evidence, because the prose shipped first and produced
nothing at all. Write future prompt changes as checks, not as description.

**Untested.** Whether check 4e moves the `ui` and `ai` lenses: both regen3 probes
were subjects chosen because links belong, and both are ops/data. The cheap next
probe is a `ui` flow with an internal design-system wiki behind it.
