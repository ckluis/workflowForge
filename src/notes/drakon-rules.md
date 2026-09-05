# DRAKON rules digest

Sources fetched directly and read in full:
- https://drakonflow.com/read/drakon ("The DRAKON Language")
- https://drakonflow.com/read/guidelines-for-drawing-drakon ("Guidelines for drawing drakon flowcharts")
- https://drakonflow.com/read/drakon-reference ("DRAKON Language Reference" — linked from the `drakon` page's "See also"; fetched because the two assigned pages do not themselves contain icon geometry, only prose)
- https://en.wikipedia.org/wiki/DRAKON

Icon geometry below was extracted by downloading and visually inspecting the actual icon PNGs served from `drakonflow.com/assets/images/` (the reference page's icon thumbnails plus its "illustration" example images), since none of the four source pages describe shapes in prose — DRAKON's own reference material shows shape, it does not write it out in words. Where a claim comes from visual inspection rather than a quoted sentence, it is marked **(observed)**; everything else is a direct quote with its source page named inline.

---

## A) ICON VOCABULARY

Every icon below was confirmed either from `drakon-reference.html`'s table (which lists exactly this set) or from example diagrams on the guidelines page. The DRAKON reference page's own table of contents is the authoritative enumeration used here (icon name → anchor): Action, Question, Formal parameters, Comment, Choice, Insertion, FOR loop, Concurrent processes, Input, Output, Simple input, Simple output, Shelf, Process, Control period (start/end), Duration, Pause, Timer, Group duration. Begin/End (Title/silhouette-header icons) are not in that table but appear in every example diagram on the `drakon` and `guidelines` pages, so they are documented here from those images.

### Title / Begin
**Shape (observed):** a fully rounded "stadium"/pill — both left and right ends are semicircles, top and bottom edges are straight and parallel. Holds the diagram's name, usually bold.
**Meaning:** the root of a diagram (or, in a silhouette, the header of the whole silhouette — see `about-flowchart.png`, where the pill is labeled "Long one").
**Entry/exit:** 0 entries (it is the root); exactly 1 exit, from the bottom-center, going straight down.

### End
**Shape (observed):** identical pill/stadium shape to Begin, usually drawn smaller, labeled "End".
**Meaning:** a terminal point of the algorithm.
**Entry/exit:** exactly 1 entry, into the top-center; 0 exits.

### Action
**Shape (observed):** a plain rectangle, square (90°) corners, no internal divider.
**Meaning:** "An Action icon is a command or an order to do something." (`drakon-reference.html`)
**Entry/exit:** 1 entry (top-center), 1 exit (bottom-center).

### Question
**Shape (observed):** an elongated hexagon — pointed at a single vertex on the left, horizontal top and bottom edges, and a flat vertical edge on the right (i.e., only the left end is tapered to a point; the right end is square).
**Meaning:** "A Question icon can be answered as either Yes or No. The Yes and No labels can be swapped from the context menu, if you right-click on the Question icon." (`drakon-reference.html`)
**Entry/exit:** 1 entry, top-center. 2 exits: the **primary** exit continues straight down through the bottom-center (default label "Yes"); the **secondary** exit leaves through the flat right edge, turning the line 90° to travel right (default label "No").

### Choice (header) / Case (branches) — "Select"
**Choice header shape (observed):** a quadrilateral resembling a rectangle with its bottom-right corner chamfered off by a diagonal edge — a banner/pennant silhouette, distinct from both the Action rectangle and the Question hexagon.
**Case shape (observed):** a rectangle whose bottom edge is folded inward into a V — two slanted edges meeting at a single point at the bottom-center, like a downward-pointing pennant.
**Meaning:** "A Choice icon contains a question that may have several specific answers, not just a Yes and a No. An empty Case icon on the right side means 'all other answers'." (`drakon-reference.html`) The guidelines page adds a cardinality rule: "If a question can have several answers, but not too many, use the 'Choice' icon. What is 'too many'? It's hard to tell accurately. Probably, eight answers are not too many yet." For larger fan-out: "do not draw them in a DRAKON chart. Create a table that maps the answers to the corresponding actions... reference it from an 'Action' icon."
**Entry/exit:** Choice header — 1 entry (top), 1 exit (bottom) into a horizontal line that fans out to N Case icons. Each Case — 1 entry (top-center), 1 exit (the bottom V-point); all Case exits are gathered by a shared horizontal line below and continue as one vertical (example: `example-choice.png`, "Apples" / "Oranges" / blank-for-"other" cases under "What is your favorite fruit?").

### Insertion (subroutine call)
**Shape (observed):** a rectangle like Action, but with two short vertical bars set slightly inward from the left and right edges (the classic "predefined process" double-bar notation).
**Meaning:** "An Insertion icon points at another DRAKON flowchart which is defined elsewhere. In this example, we start the procedure 'Publish report' and wait until it finishes." (`drakon-reference.html`) This is call-and-return, not a one-way jump.
**Entry/exit:** 1 entry (top), 1 exit (bottom) — execution blocks until the referenced diagram completes, then continues.

### Input
**Shape (observed):** a two-part icon: an upper zone shaped like a pennant/flag (a notch cut into the top-left, giving it an angled top edge) sitting directly above a plain lower rectangle, divided by one horizontal line.
**Meaning:** "An Input icon receives data from the outside world. It has two parts: upper and lower. The upper part contains a key word or a key phrase. Usually, it is based on a verb. The lower part contains the object or some descriptive information. Usually, it is based on a noun." (`drakon-reference.html`)
**Entry/exit:** 1 entry (top-center of upper part), 1 exit (bottom-center of lower part).

### Output
**Shape (observed):** the mirror-image two-part icon: upper zone has a triangular point on its right side (signpost/arrow silhouette pointing right) over a plain lower rectangle.
**Meaning:** "An Output icon sends data or a command to the outside world. Just like the Input icon, the Output icon has two parts: one for a verb-based key phrase and one for descriptive information." (`drakon-reference.html`)
**Entry/exit:** 1 entry (top), 1 exit (bottom).

### Simple input
**Shape (observed):** single-zone version of Input — just the pennant/flag shape, no divider, one text field.
**Meaning:** "A Simple input icon also receives data from the outside world like the normal Input icon. However, it has only one part." (`drakon-reference.html`)
**Entry/exit:** 1 entry (top), 1 exit (bottom).

### Simple output
**Shape (observed):** single-zone version of Output — the right-pointing signpost/arrow shape only, one text field.
**Meaning:** "A Simple output icon also sends data or a command to the outside world like the normal Output icon. However, it has only one part." (`drakon-reference.html`)
**Entry/exit:** 1 entry (top), 1 exit (bottom).

### Shelf
**Shape (observed):** a rectangle split by one horizontal divider into an upper and a lower cell (square corners throughout).
**Meaning:** table from `drakon-reference.html`, verbatim:

| Meaning | Upper part | Lower part |
|---|---|---|
| Send an order to an actor | An actor (e.g. the accountant) | An order to an actor (e.g. Print out the invoice) |
| Send a message from a sender to a receiver | The sender and the receiver (e.g. from browser to app server) | A message to send (e.g. Request "Logon with Facebook") |
| Perform an action on an object | An action key phrase | The object the action will be performed on |
| Assign a value to a variable | A variable | A value to put into that variable |

The guidelines page adds the actor rule: "If there is one actor for the whole algorithm, do not mention the actor... Use 'Action' icons... If there are several actors in the algorithm, use the 'Shelf' icon. Put the actor on the upper shelf and the order on the lower shelf. If one actor sends a message to another actor, put both the sender and the receiver on the upper shelf. Separate them with an arrow, or the > sign."
**Entry/exit:** 1 entry (top-center of upper cell), 1 exit (bottom-center of lower cell).

### Process (parallel-process control: Start / Pause / Continue / Stop)
**Shape (observed):** two-part icon like Shelf, but the upper cell has a triangular notch cut into its left edge (a bookmark/ribbon-end silhouette), distinguishing it from the plain Shelf divider; lower cell is a plain rectangle.
**Meaning:** "A Process icon controls a parallel process. The upper part of a Process icon can have one of the following commands: Start, Pause, Continue, Stop. The newly started parallel process runs in the background. The algorithm of the parallel process is defined in another DRAKON flowchart. The execution of the current flowchart resumes immediately, without waiting for the parallel process to complete. Communication with the parallel process can be carried out through Input and Output icons." (`drakon-reference.html`)
**Entry/exit:** 1 entry (top), 1 exit (bottom) — non-blocking ("Start" does not wait, unlike Insertion).

### Control period (Start / End)
**Shape (observed):** a trapezoid with its top two corners rounded and its bottom edge shorter/flat, for the Start icon; the mirrored shape (bottom corners rounded, top edge shorter) for the End icon.
**Meaning:** "A Start of control period defines the beginning of a critical procedure that needs to complete within a specified period of time. The time period is written inside the icon. An End of control period icon defines the end of the critical procedure." (`drakon-reference.html`)
**Entry/exit:** each icon is inline on the skewer: 1 entry (top), 1 exit (bottom).

### Duration
**Shape (observed):** a trapezoid, wide top edge tapering to a narrower bottom edge, attached from its right side by a short horizontal connector into the left side of another icon.
**Meaning:** "A Duration icon is attached from the left to some other icon... If there is a Timer icon above, the Duration icon with text '10 sec' means 'Run this action after 10 seconds since the start of the timer.'... If there is no Timer icon, the Duration icon with text '10 sec' means 'Carry out this action for 10 seconds.'" (`drakon-reference.html`)
**Entry/exit:** it is a side-attachment, not part of the vertical flow — 1 horizontal connector to its host icon, 0 top/bottom flow entries or exits of its own.

### Pause
**Shape (observed):** the same tapering trapezoid family as Duration, but placed inline on the main vertical skewer instead of attached sideways.
**Meaning:** "A Pause action delays the next action. The time of the delay is written inside the Pause icon." (`drakon-reference.html`)
**Entry/exit:** 1 entry (top), 1 exit (bottom) — inline, unlike Duration.

### Timer
**Shape (observed):** the same tapering trapezoid as Pause/Duration, plus small rectangular tab notches cut into its upper-left and lower-left corners, distinguishing it visually from Pause.
**Meaning:** "A Timer icon works together with Duration icons. A Timer icon starts the timer. The icon contains the name of the timer. Below the Timer icon, there should be one or more Duration icons that reference the name of the timer. The Duration icons schedule certain actions at certain moments of time since the start of the timer." (`drakon-reference.html`)
**Entry/exit:** inline, 1 entry / 1 exit, like Pause; Duration icons attach sideways to icons positioned below/near it.

### Group duration
**Shape (observed):** a Duration-family trapezoid combined with a bracket that spans and re-touches several icons at once (seen in `example-group-right.png` as dashed lines running from a Question's "No" exit back up into the bracketed group).
**Meaning:** "A Group duration icon specifies that a certain set of actions must be completed within a specified period of time." (`drakon-reference.html`)
**Entry/exit:** side-attachment like Duration, but scoped to a bracketed group of icons rather than a single one.

### Formal parameters
**Shape (observed):** a small rounded-rectangle ("stadium," same family as Title/Begin) connected by a short horizontal line to a smaller plain rectangle beside it.
**Meaning:** "A Formal parameters icon lists the inputs for the algorithm. For example, in order to build a route, we need to know the start and the destination." (`drakon-reference.html`) Guidelines page: "If you want to show that your algorithm has clearly defined inputs and outputs, add a 'Parameters' icon to the header. List both the inputs and the outputs in the 'Parameters' icon."
**Entry/exit:** attaches sideways to the Title/Begin icon only; not part of the flow skewer (0 flow entries/exits).

### Comment
**Shape (observed):** a small rounded-square ("squircle," more tightly rounded than the stadium shapes), attached by a short horizontal connector line to whichever icon it annotates.
**Meaning:** "A Comment icon explains something to the reader. It can be ignored during execution of the procedure." (`drakon-reference.html`)
**Entry/exit:** 1 side-connector to its host icon; 0 flow entries/exits (never inline).

### FOR loop
**Shape (observed):** a matched header/footer pair of hexagonal "banner" icons — the header has its top two corners cut diagonally inward (a wide hexagon flattened across the top), the footer is the mirror image (bottom two corners cut). The loop body sits between them on the same vertical skewer.
**Meaning:** "A For loop icon can be used for either of two things: Apply the same action to several objects. Repeat the same action several times." (`drakon-reference.html`) — examples show "For each person in the room" / "Repeat 10 times" text in the header.
**Entry/exit:** the macro-icon as a whole has 1 entry (into the header, top) and 1 exit (out of the footer, bottom); internally it is a single unbroken skewer — DRAKON does not draw a return/back arrow for the repetition, it is implied by the paired icon semantics.

### Concurrent processes
**Shape (observed):** N parallel vertical skewers side by side, each usually headed by a Shelf-style rounded icon naming the actor/process (e.g. "Medic 1" / "Medic 2" in `example-concurrent.png`); a single incoming line fans out at the top into all N verticals via a horizontal bar, and a small solid triangular marker sits on that fan-out line (the only arrowhead-like glyph found on an otherwise-plain connector in the corpus); the branches rejoin at the bottom into one horizontal merge line that continues down as a single vertical.
**Meaning:** "The Concurrent processes macro-icon specifies two or more parallel paths of execution." (`drakon-reference.html`)
**Entry/exit:** 1 entry, 1 exit for the whole macro-icon; each internal branch is itself a normal 1-in/1-out skewer.

### Silhouette branch header / "address" icon
Not in the reference-page table, but visible in `about-flowchart.png`'s "modern DRAKON flowchart" panel: a silhouette breaks one long skewer into several side-by-side columns ("branches"/"chapters"), each column headed by a banner/hexagon icon (same family as the FOR-loop header) naming the branch, and terminating either in its own End icon or by falling through to the next column to its right. The column headers are joined along the top by one continuous horizontal line; in the example this line carries a small right-pointing triangular marker establishing left-to-right branch order — again, one of the very few arrowhead-like glyphs in the whole corpus, and used only for this structural connector, never for an ordinary flow line.
**Entry/exit:** 1 entry (from the previous branch, or from the silhouette's Title), 1 exit (into the branch body, which either ends the silhouette or falls through right).

---

## B) LAYOUT LAWS

Quoting `drakonflow.com/read/drakon` directly, this is the normative floor:

> Line intersections are forbidden; Only straight lines and right angles are allowed; Arrows are replaced with plain lines; and Time in the diagram flows downwards; branching goes to the right.

And DRAKON's three signature features, same page:

> The *skewer* highlights the happy path through the diagram; The *silhouette* breaks up the diagram into its logical parts and helps manage complexity; and *Common fate* shows implicit connections between items on different paths.

**Skewer.** Wikipedia: "The main path of each tree is shown by highlighting [a] thick vertical line which is called a skewer." A skewer is a maximal vertical run of directly-connected icons sharing one x-coordinate — the icons are "threaded" on it like food on a shish-kebab skewer. Every branch point spins off a new skewer at a greater x-offset; every skewer either terminates in its own End icon or rejoins ("merges into") an existing vertical.

**Lines only go down and right; no upward or leftward travel except joins.** This falls directly out of "Time in the diagram flows downwards; branching goes to the right" plus the observed behavior in every example image: a branch line leaves a Question/Choice icon, turns right, goes down, and if it needs to reunite with the trunk it turns onto a horizontal segment that runs back toward (i.e., leftward to) the trunk's x-coordinate before continuing straight down. That leftward run is the single sanctioned exception — it is a *join* segment, not a new branch, and it is always drawn at the bottom of the branch, immediately before the branch's line reconnects to (or falls into) a shared vertical. `example-question.png`'s "Show error screen" branch demonstrates this exactly: right, down, then left back into the main vertical, then down.

**No line crossings.** "Line intersections are forbidden" (verbatim, `drakon` page). Confirmed structurally: because branches only move right and merges only move back left onto an already-established vertical (never across a third, unrelated vertical), no two lines can cross.

**Question icon: vertical entry at top, primary exit at bottom, secondary exit at right.** Directly evidenced by the icon's own geometry (a hexagon pointed on the left, flat on the right — see Icon Vocabulary above) and by `example-question.png`: the incoming vertical enters top-center, the "Yes" branch exits straight down through the bottom-center (the primary/continuing exit), and the "No" branch turns 90° out through the flat right edge (the secondary exit).

**Happy path / "royal road."** Guidelines page, verbatim:

> Use the rule "the further to the right, the worse." According to this rule, the happy path should go straight down the leftmost vertical line. The less desired routes should take a detour through the right-hand side of the diagram.

And its fallback when there is no clean good/bad axis:

> If it's hard to call a specific outcome good or bad, then place the most probable path on the leftmost vertical. No matter what you do, do not put the worst-case scenario on the left side of the DRAKON flowchart.

`guide-happy-path.png` captions this rule on the diagram itself as "The further to the right, the worse it is," with an explicit annotation: "The happy path goes straight down the leftmost vertical line" and "The worst-case scenario is on the right."

**Further-right-is-worse.** Same rule as above — it is not a separate law, it is the generalization the "happy path" rule is an instance of: rank order of desirability decreases monotonically left→right across sibling branches at any one branch point.

**Joins merge by becoming one line, never by an arrowhead into a box's side.** Not stated in prose anywhere in the three articles, but demonstrated as an explicit before/after teaching example in `about-flowchart.png`: the "old messy flowchart" on the left merges paths using small filled black circles with multiple arrowheads converging on them (classic flowchart OR-junction glyphs), and even has one line running backward/upward (B → C). The "modern DRAKON flowchart" on the right redraws the same logic with every merge as a plain horizontal line joining directly onto a shared vertical, and the single upward/backward line is eliminated entirely by re-deriving the control flow as pure top-to-bottom skewers. No circles, no arrowheads, anywhere in the DRAKON-side panel.

**No arrowheads at all on ordinary lines.** "Arrows are replaced with plain lines" (`drakon` page, verbatim). The only two glyphs in the entire fetched corpus that resemble an arrowhead are (a) the small triangular marker on the top connecting-line of a silhouette's branch headers in `about-flowchart.png`, and (b) the small triangular marker on the fan-out/fork line of the Concurrent-processes macro-icon in `example-concurrent.png` — both are structural connectors (branch order, fork/join), never ordinary action-to-action or branch-to-merge flow lines, which are uniformly plain.

**Question branch label ("Yes"/"No") placement.** `example-question.png`: "Yes" is set just below-left of the icon, immediately above where the primary/vertical exit line continues down; "No" is set above-right of the icon, next to the horizontal line leaving through the flat right edge, before that line turns downward. Reference page, verbatim: "The Yes and No labels can be swapped from the context menu, if you right-click on the Question icon" — confirmed visually in `guide-not.png`, where negation-removal is paired 1:1 with a label swap: "- The word NOT is removed - The Yes and No exits are swapped."

**Diagram-growth / vertical-fit constraint (why silhouette exists).** Guidelines page, verbatim:

> Here is a rule of thumb: while the diagram fits the screen vertically, do not do anything. When it grows taller than that, it's time to take measures.

Two remedies are offered — Insertion-based decomposition (cut a fragment into its own diagram) and the silhouette ("arrange several smaller flowcharts on one visual scene... reminiscent of dividing a long text into chapters"). Silhouette's own constraint: "A silhouette diagram can become broader than the screen, but it's okay. As long as the drawing fits the screen vertically, don't worry." So DRAKON's canonical layout tolerates *horizontal* overflow but never tolerates *vertical* overflow without splitting the diagram.

**Common fate.** Guidelines page, verbatim: "If there is an action that must be performed regardless of the conditions, use 'common fate.' ... it is possible to show a hidden relationship between icons that sit on different vertical lines." Demonstrated in `guide-common-fate.png` by horizontally aligning "Go to your friend's place by foot" / "Take a train" / "Take a boat" — three icons on three different skewers, at the same height — with the annotation: "These icons are aligned horizontally. This helps us control that a certain action is performed in any case. Here, we get to our friend's place no matter where he lives." Common fate is a *positional* convention (shared row = implicit rendezvous), not a drawn line.

**Reachability guarantee of the silhouette (structural, not stylistic).** Wikipedia, verbatim: "The flow graph always has a path from the Headline icon to each vertex (node) of the control flow graph. Consequently, a silhouette can't have unreachable code in any conditions." This is the payoff of building branch jumps out of column order rather than goto-style lines — see Part C(i) for what we lose by not implementing silhouette.

---

## C) RULES WE ARE DELIBERATELY BREAKING OR SKIPPING

### (i) No silhouette — we allow unlimited vertical scrolling instead

**What DRAKON does instead:** once a diagram would exceed one screen's height, DRAKON mandates splitting it — either by Insertion (cut a fragment into a separate diagram, replace it with an Insertion icon that calls and returns) or by silhouette (arrange the diagram as side-by-side columns/"chapters," each with its own header and address, so the *page* grows wider instead of the *skewer* growing taller). Per the guidelines page, this isn't optional taste, it's the stated remedy the moment "it grows taller than that" (i.e. the screen).

**What we lose:** the structural reachability guarantee that comes from building the silhouette out of column order rather than free-floating jumps — "The flow graph always has a path from the Headline icon to each vertex... a silhouette can't have unreachable code in any conditions" (Wikipedia). That guarantee is a *byproduct of the layout*: because a silhouette's only way to jump is "fall through to the next column," a column can never be orphaned. Once we allow the diagram to simply keep scrolling instead of being chaptered, reachability is no longer something the shape of the diagram proves by construction — it has to be checked separately (e.g. by a linter walking the graph), because nothing about "just keep going down" prevents an unreachable branch from existing off to the side.

**What we gain:** we drop the entire silhouette layout algorithm (column placement, branch-header/address bookkeeping, deciding where a chapter boundary goes) and the horizontal-scroll tradeoff silhouette explicitly accepts ("A silhouette diagram can become broader than the screen, but it's okay"). Vertical scrolling is the native interaction of essentially every tool our users already use, so we avoid asking anyone to scroll sideways at all, and long, irregular procedures that don't cleanly decompose into a fixed number of "chapters" don't have to be forced into that shape.

### (ii) Back-edges rendered as a terminal "Go back to #N" reference box rather than a loop line

**What DRAKON does instead:** DRAKON never draws a line traveling back upward. Bounded repetition is expressed with the FOR-loop macro-icon — a header/footer banner pair enclosing the loop body on one uninterrupted downward skewer; the repetition is implied by the paired icon's semantics, not drawn as a returning arrow. Unbounded or irregular "go back and retry" flows are expressed spatially, by silhouette column placement (an address earlier in reading order), never as a line pointing backward.

**What we lose:** in DRAKON, "no upward line" is true *by construction* — there is no icon whose semantics require one, so a reader can trust that literally tracing top-to-bottom on any visible line always shows correct execution order, with zero exceptions to hold in their head. Our "Go back to #N" box reintroduces exactly the thing DRAKON's whole design avoids: a symbolic reference the reader must look up rather than a line they can trace with their eye. We also lose the loop icon's automatic scoping — DRAKON's structured loop can only jump back to its own immediately-enclosing header, so there's no way to accidentally reference something out of scope; our box can point at *any* earlier node, so nothing about the diagram's shape stops a stray or dangling back-reference except a separate validity check (see checklist item 16 below).

**What we gain:** the ability to express retries/back-edges to an arbitrary earlier point, not just the nearest structured loop header — useful for state-machine-like retry logic that doesn't nest cleanly. We also avoid needing to lay out a visual loop-back bracket or manage silhouette column addresses purely to express "try this step again from here."

### (iii) Cross-diagram jumps rendered as a "Go to diagram #M" box

**What DRAKON does instead:** the Insertion icon — "An Insertion icon points at another DRAKON flowchart which is defined elsewhere. In this example, we start the procedure 'Publish report' and wait until it finishes" (`drakon-reference.html`). This is a call, not a jump: control always returns to the calling diagram when the referenced one finishes. DRAKON has no icon in this corpus for a one-way, non-returning handoff between diagrams.

**What we lose:** the call/return discipline that keeps the *whole multi-diagram workspace* traceable as a simple call tree rooted at whichever diagram you started reading. Because Insertion always returns, you can always answer "who called this diagram, and where do we go when it's done?" by looking at the call stack. A one-way "Go to diagram #M" box breaks that: the diagram graph becomes a general directed graph rather than a tree of calls, so questions like "does this ever come back?" or "is this diagram even reachable from the root?" stop being structurally self-evident and become things a linter has to compute.

**What we gain:** the ability to express a genuine one-way transition between independent flows (e.g. "this workflow's outcome is really a different workflow now, permanently") without inventing an artificial return path just to satisfy Insertion's call semantics — useful for state-machine-style workflows where "then go do a different flow, forever" is the actual intended behavior, not a subroutine call that happens to never return.

---

## D) CHECKLIST — mechanically verifiable "the diagram is correct iff…" assertions

1. The diagram has exactly one Begin/Title icon, and it has zero incoming lines.
2. The Begin icon has exactly one outgoing line, leaving from its bottom-center, traveling straight down.
3. Every End icon has exactly one incoming line, into its top-center, and zero outgoing lines.
4. Every Action, Insertion, Shelf, Input, Output, Simple input, Simple output, Pause, Process, and Control-period icon has exactly one entry (top-center) and exactly one exit (bottom-center) — none of these icon types branches.
5. Every Question icon has exactly one entry (top-center) and exactly two exits: one continuing straight down (x unchanged) and one leaving through the right side before turning downward.
6. Every Question icon has both a "Yes" and a "No" label present (or a user-confirmed swapped pair), never zero or one.
7. Every Choice header has exactly one entry and fans out to two or more Case icons, each with exactly one entry and one exit.
8. No line segment ever decreases in y (travels upward), except a horizontal join segment that reconnects a finished branch back onto an existing vertical.
9. No line segment ever decreases in x (travels left), except that same horizontal join segment.
10. No two line segments intersect at a point that is not an icon's connection point.
11. No line terminates with an arrowhead pointed into the side of a box; every merge is a line joining another line, not an arrow-into-box.
12. Every skewer (maximal vertical run of directly linked icons) has all its icons sharing one x-coordinate, with no icon off-axis from the line entering or leaving it.
13. At every branch point, sibling branches are ordered left-to-right by non-increasing desirability — no branch to the right of another is the more-correct/happy-path option.
14. Following only "continues straight down" exits from Begin reaches an End icon with no gap in the line (the happy path is a single unbroken vertical).
15. Every branch spawned at a Question/Choice icon either terminates in its own End icon or rejoins some vertical line via exactly one join segment — no branch dead-ends without merging or terminating.
16. Every "Go back to #N" reference box names an icon ID that (a) exists in the same diagram and (b) occurs strictly earlier in top-to-bottom, left-to-right reading order than the box itself.
17. Every "Go to diagram #M" reference box names a diagram ID that exists in the workspace, and that diagram has exactly one Begin icon.
18. No two icons overlap in screen space.
19. Every Comment, Duration, Group-duration, and Formal-parameters icon attaches via exactly one horizontal side-connector to exactly one host icon, and has zero top/bottom flow entries or exits of its own.
20. Every FOR-loop header/footer pair shares one x-coordinate (same skewer), the footer appears strictly below its matching header with only loop-body icons between them, and the header's condition text is non-empty.
21. Every Concurrent-processes macro-icon's branches all originate from one shared fan-out line above and rejoin one shared merge line below, and each branch is itself a valid 1-in/1-out skewer.
22. The rendered diagram's total width never exceeds the viewport at any scroll depth (only vertical growth is permitted — this replaces DRAKON's silhouette-driven horizontal growth per Part C(i)).
