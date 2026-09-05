/* WFD renderer — interaction layer. No dependencies. Degrades to a static page. */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var glide = calm ? "auto" : "smooth";
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ------------------------------------------------------- highlighting */

  function svgOf(el) { return el.closest("svg"); }

  function clearLight(svg) {
    if (!svg) return;
    svg.classList.remove("is-lit");
    $$(".lit, .lit-focus", svg).forEach(function (n) {
      n.classList.remove("lit"); n.classList.remove("lit-focus");
    });
  }

  function lightRoute(node) {
    var svg = svgOf(node);
    if (!svg || svg.classList.contains("is-walking")) return;
    clearLight(svg);
    // Hovering a route while an actor filter is latched overrides the filter
    // for the duration of the hover, and hands it back on the way out (D5).
    // Both are the same mechanism pointed at the same canvas, and a reader can
    // only be asking one of the two questions at a time.
    suspendActor(svg);

    var ids = {};
    ids[node.dataset.uid] = 1;
    (node.dataset.up || "").split(" ").forEach(function (i) { if (i) ids[i] = 1; });
    (node.dataset.down || "").split(" ").forEach(function (i) { if (i) ids[i] = 1; });

    svg.classList.add("is-lit");
    node.classList.add("lit", "lit-focus");

    $$(".wf-node", svg).forEach(function (n) {
      if (ids[n.dataset.uid]) n.classList.add("lit");
    });
    var branches = {};
    $$(".wf-edge", svg).forEach(function (e) {
      if (ids[e.dataset.from] && ids[e.dataset.to]) {
        e.classList.add("lit");
        if (e.dataset.branch) branches[e.dataset.branch] = 1;
      }
    });
    $$(".wf-label", svg).forEach(function (l) {
      if (branches[l.dataset.branch]) l.classList.add("lit");
    });
    // the "Yes" under a question belongs to that question
    $$(".wf-primary-label", svg).forEach(function (t) {
      if (ids[t.dataset.node]) t.classList.add("lit");
    });
  }

  function lightBranch(label) {
    var svg = svgOf(label);
    if (!svg) return;
    var b = label.dataset.branch;
    var edge = svg.querySelector('.wf-edge[data-branch="' + b + '"]');
    if (!edge) return;
    var target = svg.querySelector('[data-uid="' + edge.dataset.to + '"]');
    if (target) lightRoute(target);
  }

  document.addEventListener("mouseover", function (e) {
    var node = e.target.closest ? e.target.closest(".wf-node") : null;
    if (node) return lightRoute(node);
    var label = e.target.closest ? e.target.closest(".wf-label") : null;
    if (label) return lightBranch(label);
  });
  document.addEventListener("mouseout", function (e) {
    var from = e.target.closest ? (e.target.closest(".wf-node") || e.target.closest(".wf-label")) : null;
    if (!from) return;
    var to = e.relatedTarget && e.relatedTarget.closest
      ? (e.relatedTarget.closest(".wf-node") || e.relatedTarget.closest(".wf-label")) : null;
    if (to) return;
    var svg = svgOf(from);
    clearLight(svg);
    restoreActor(svg);
  });
  document.addEventListener("focusin", function (e) {
    var node = e.target.closest ? e.target.closest(".wf-node") : null;
    if (node) lightRoute(node);
    var label = e.target.closest ? e.target.closest(".wf-label") : null;
    if (label) lightBranch(label);
  });

  /* -------------------------------------------------------------- modal */

  var modal = $("#modal");
  var modalBody = $("#modal-body");
  var modalNav = $("#modal-nav");
  var lastFocus = null;
  var current = null;

  function orderedNodes(uid) {
    var node = document.getElementById(uid);
    if (!node) return [];
    return $$(".wf-node.is-clickable", svgOf(node));
  }

  function openDetail(uid, push) {
    var tpl = document.getElementById("d-" + uid);
    var node = document.getElementById(uid);
    if (!tpl || !node) return;
    var wasOpen = modal.classList.contains("is-open");
    if (!wasOpen) lastFocus = document.activeElement;
    current = uid;

    modalBody.innerHTML = "";
    modalBody.appendChild(tpl.content.cloneNode(true));
    // Twice: once now, and once after layout. Setting scrollTop before the new
    // content has been measured left the reader mid-runbook with the title off
    // screen, carrying the previous panel's offset into a shorter one.
    modalBody.scrollTop = 0;
    requestAnimationFrame(function () { modalBody.scrollTop = 0; });

    hideWhy();
    var said = $("#mor-said"); if (said) said.textContent = "";
    var siblings = orderedNodes(uid);
    var i = siblings.indexOf(node);
    // Say which lane this step is in. The arrow walks document order, so it
    // splices exception steps into the main line without announcing it, and a
    // reader following → believed they were still on the happy path while
    // reading the handling for a failure. The sheet says this in geometry; the
    // panel had no way to say it at all.
    var lane = node.classList.contains("is-primary")
      ? '<span class="mn-lane is-happy">happy path</span>'
      : '<span class="mn-lane is-branch">exception branch</span>';
    modalNav.innerHTML = i >= 0
      ? (i + 1) + " / " + siblings.length + " " + (node.classList.contains("k-step") ? lane : "")
      : "";
    $("#modal-prev").disabled = i <= 0;
    $("#modal-next").disabled = i < 0 || i >= siblings.length - 1;

    var heading = modalBody.querySelector(".mo-title h3");
    modal.setAttribute("aria-label", heading ? heading.textContent : "Step detail");
    modal.classList.add("is-open");
    document.body.classList.add("no-scroll");
    syncMarkButtons();
    $("#modal-close").focus();
    if (push !== false && history.pushState) {
      var url = currentDoc ? "#/" + currentDoc + "/" + uid : "#" + uid;
      // pushState on the FIRST open, replaceState while stepping between
      // siblings. Until 2026-09-04 this always replaced, so opening a step added
      // no history entry at all and the phone's back gesture skipped straight
      // past the whole document to whatever preceded it — a reader who opened
      // one box and swiped back landed on a blank page and lost the document.
      // Walking thirty panels must not stack thirty entries either, so only the
      // transition from closed to open earns one.
      if (wasOpen) history.replaceState(null, "", url);
      else history.pushState({ wfdDetail: uid }, "", url);
    }
  }

  function closeDetail() {
    modal.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    modalBody.innerHTML = "";
    // preventScroll is load-bearing. Restoring focus to the box that opened the
    // modal, under html{scroll-behavior:smooth}, launched a long animated scroll
    // that threw the page ~1866px down after every close. It was filed twice as
    // a keyboard-paging bug ("PageUp scrolled DOWN") before a dedicated
    // adjudication proved the canvas never captured a key and this focus call
    // was the real mechanism.
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus({ preventScroll: true }); }
      catch (e) { lastFocus.focus(); }
    }
    current = null;
    syncMarkButtons();
  }

  function step(delta) {
    if (!current) return;
    var node = document.getElementById(current);
    var siblings = orderedNodes(current);
    var i = siblings.indexOf(node) + delta;
    if (i < 0 || i >= siblings.length) return;
    openDetail(siblings[i].dataset.uid);
  }

  /**
   * A short-lived message in the corner.
   *
   * This exists because the copy handler called `flash("Copied")` — and flash()
   * takes a NODE ID, so it looked up an element called "Copied", found nothing
   * and returned. The confirmation was not merely brief, it never rendered at
   * all, on the single most important button in the builder.
   */
  var toastTimer = null;
  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2600);
  }

  function flash(uid) {
    var n = document.getElementById(uid);
    if (!n) return;
    n.scrollIntoView({ block: "center", inline: "center", behavior: glide });
    n.classList.remove("is-flash");
    void n.offsetWidth;
    n.classList.add("is-flash");
    setTimeout(function () { n.classList.remove("is-flash"); }, 2400);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;

    if (t.closest("#modal-close")) return closeDetail();
    if (t.closest(".modal-scrim")) {
      // each dialog owns its own scrim
      if (t.closest("#modal")) return closeDetail();
      return;
    }
    if (t.closest("#modal-prev")) return step(-1);
    if (t.closest("#modal-next")) return step(1);

    // jump affordances inside the modal
    var jump = t.closest("[data-jump]");
    if (jump && (t.closest(".modal") || t.closest(".wf-node"))) {
      var uid = jump.dataset.jump;
      var wf = jump.dataset.jumpWf;
      if (t.closest(".modal")) {
        closeDetail();
        setTimeout(function () {
          if (uid) flash(uid);
          else if (wf) { var s = document.getElementById("wf-" + wf); if (s) s.scrollIntoView({ behavior: glide }); }
        }, 60);
        return;
      }
    }

    var node = t.closest(".wf-node");
    if (node) {
      var cls = node.getAttribute("class") || "";
      var isChip = /\bk-(goback|goto|goforward)\b/.test(cls);
      if (isChip && node.dataset.jump) { e.preventDefault(); flash(node.dataset.jump); return; }
      if (isChip && node.dataset.jumpWf) {
        var sec = document.getElementById("wf-" + node.dataset.jumpWf);
        if (sec) { e.preventDefault(); sec.scrollIntoView({ behavior: glide }); return; }
      }
      if (node.classList.contains("is-clickable")) { e.preventDefault(); openDetail(node.dataset.uid); }
      return;
    }

    var jw = t.closest("[data-jump-wf]");
    if (jw && t.closest(".modal")) {
      closeDetail();
      var s2 = document.getElementById("wf-" + jw.dataset.jumpWf);
      if (s2) setTimeout(function () { s2.scrollIntoView({ behavior: glide }); }, 60);
    }
  });

  /* ----------------------------------------------------------- keyboard */

  document.addEventListener("keydown", function (e) {
    if (modal.classList.contains("is-open")) {
      if (e.key === "Escape") { e.preventDefault(); return closeDetail(); }
      if (e.key === "ArrowRight" || e.key === "j") { e.preventDefault(); return step(1); }
      if (e.key === "ArrowLeft" || e.key === "k") { e.preventDefault(); return step(-1); }
      if (e.key === "Tab") trapFocus(e);
      return;
    }
    if (e.key === "Escape") {
      // The overlay first. It advertised "Esc — close" and then ignored it: the
      // only key that dismissed it was a second press of "?", which the panel
      // did not mention. A help panel you cannot close with Escape is the one
      // place a reader is guaranteed to try it.
      var hintOpen = $("#shortcuts");
      if (hintOpen && !hintOpen.hasAttribute("hidden")) {
        e.preventDefault(); hintOpen.setAttribute("hidden", ""); return;
      }
      var full = $(".canvas.is-full");
      if (full) { e.preventDefault(); exitFull(full); return; }
    }
    var active = document.activeElement;
    if (active && active.classList && active.classList.contains("wf-node")) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (active.dataset.jump) flash(active.dataset.jump);
        else if (active.classList.contains("is-clickable")) openDetail(active.dataset.uid);
        return;
      }
      var nodes = $$(".wf-node", svgOf(active));
      var i = nodes.indexOf(active);
      if (e.key === "ArrowDown" && i < nodes.length - 1) { e.preventDefault(); nodes[i + 1].focus(); }
      if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); nodes[i - 1].focus(); }
    }
    if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
      var hint = $("#shortcuts");
      if (hint) hint.toggleAttribute("hidden");
    }
  });

  function focusables(root) {
    return $$('button:not([disabled]), a[href], textarea, input, select, summary, [tabindex="0"]', root)
      .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  function trapWithin(e, root) {
    var f = focusables(root);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  function trapFocus(e) {
    var f = $$('button:not([disabled]), a[href], [tabindex="0"]', modal);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ------------------------------------------------------- zoom and pan */

  var zoom = {};

  function applyZoom(canvas) {
    var id = canvas.dataset.wf;
    var z = zoom[id] || 1;
    var svg = $("svg", canvas);
    if (!svg) return;
    var w = +svg.dataset.w, h = +svg.dataset.h;
    svg.style.width = Math.round(w * z) + "px";
    svg.style.height = Math.round(h * z) + "px";
    var out = $('.zlevel[data-wf="' + id + '"]');
    if (out) out.textContent = Math.round(z * 100) + "%";
  }

  // The floor a human may zoom to by pressing the button, and the separate,
  // higher floor `fit` will not go below on its own. See fit().
  var ZOOM_MIN = 0.3;
  var ZOOM_MAX = 2.5;

  // The legibility floor. `.wf-title` is 14px in theme.css; below about 9px a
  // title stops being a word and becomes a grey smudge. A sheet auto-fitted to
  // a width where nothing resolves is complete and says nothing, which is the
  // worst of the two failures available here — so fit stops at the last zoom
  // where the sheet can still be read, and the reader pans for the rest.
  // Pressing the zoom-out button still goes all the way to ZOOM_MIN: this is a
  // floor on what the page does BY ITSELF, never on what a person may choose.
  var TITLE_PX = 14;
  var LEGIBLE_PX = 9;
  var FIT_FLOOR = LEGIBLE_PX / TITLE_PX;

  function setZoom(canvas, z, floor) {
    var lo = typeof floor === "number" ? floor : ZOOM_MIN;
    zoom[canvas.dataset.wf] = Math.max(lo, Math.min(ZOOM_MAX, z));
    applyZoom(canvas);
  }

  /**
   * Fit the sheet to the canvas.
   *
   * Two bugs lived here. The arithmetic subtracted a hard-coded 24px that did
   * not match the 8px padding either side plus the border, so on a narrow screen
   * "fit" left the sheet a few pixels wider than its frame and the reader was
   * pushed sideways by a scroll they never asked for — measured at 30px of
   * overflow on a 390px phone. It now measures the padding it actually has.
   *
   * And the result was passed through setZoom's 0.3 clamp, so on a wide sheet
   * the clamp silently won and "fit" did not fit at all.
   *
   * It now stops at FIT_FLOOR instead: a sheet wider than its frame opens at the
   * smallest zoom that is still READABLE and overflows sideways, rather than
   * shrinking until every word is a smudge. On a 390px phone against a 1195px
   * sheet the old arithmetic produced ~30%, where a 14px title renders at 4px.
   * The happy path is the left column, so what a reader must follow is what
   * stays in frame; the exception lanes are what they pan to.
   */
  function fit(canvas) {
    var svg = $("svg", canvas);
    if (!svg) return;
    var inner = $(".canvas-inner", canvas);
    var pad = 0;
    if (inner && window.getComputedStyle) {
      var cs = window.getComputedStyle(inner);
      pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }
    // clientWidth already excludes the border and any vertical scrollbar.
    var avail = canvas.clientWidth - pad - 1;
    var z = Math.min(1, avail / (+svg.dataset.w || 1));
    setZoom(canvas, z, FIT_FLOOR);
    // Tell the reader the sheet runs past the frame, rather than leaving them
    // to discover it by accident or not at all.
    flagOverflow(canvas);
  }

  /** Mark a canvas whose sheet is wider than its frame, so the CSS can say so. */
  function flagOverflow(canvas) {
    var svg = $("svg", canvas);
    if (!svg) return;
    var over = svg.getBoundingClientRect().width > canvas.clientWidth + 1;
    canvas.classList.toggle("is-wider", over);
  }

  function bindWalkNav(root) {
    unbound("[data-walk]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var canvas = $('.canvas[data-wf="' + b.dataset.wf + '"]');
        var svg = canvas && $("svg[data-w]", canvas);
        if (!svg) return;
        walkStep(svg, b.dataset.wf, b.dataset.walk === "next" ? 1 : -1);
      });
    });
  }

  function bindZoom(root) {
  unbound("[data-zoom]", root).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var canvas = $('.canvas[data-wf="' + btn.dataset.wf + '"]');
      if (!canvas) return;
      var z = zoom[btn.dataset.wf] || 1;
      if (btn.dataset.zoom === "in") setZoom(canvas, z + 0.15);
      else if (btn.dataset.zoom === "out") setZoom(canvas, z - 0.15);
      else fit(canvas);
    });
  });

  }

  function bindPan(root) {
  unbound(".canvas", root).forEach(function (canvas) {
    var down = null;
    canvas.addEventListener("pointerdown", function (e) {
      // In full screen the dialogs are moved inside the canvas so the browser's
      // top layer does not hide them — which puts the scrim within reach of this
      // handler. Capturing the pointer there retargets the click away from the
      // scrim, so clicking outside the panel stopped closing it.
      if (e.target.closest(".modal")) return;
      if (e.target.closest(".wf-node") || e.target.closest(".wf-label") || e.target.closest(".canvas-bar")) return;
      down = { x: e.clientX, y: e.clientY, l: canvas.scrollLeft, t: canvas.scrollTop };
      canvas.classList.add("is-grabbing");
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!down) return;
      canvas.scrollLeft = down.l - (e.clientX - down.x);
      canvas.scrollTop = down.t - (e.clientY - down.y);
    });
    var end = function () { down = null; canvas.classList.remove("is-grabbing"); };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.classList.add("is-grab");
  });
  }

  /* ------------------------------------------- filter by actor (D5) */
  //
  // Dimming is one mechanism with four entry points now — hover a route, "Dim
  // secondary branches", filter by actor, and review mode, which is in the list
  // only to say that it dims nothing. A reader can only be doing one at a time,
  // so they share one treatment and are arranged in a strictly linear
  // hold-and-hand-back chain with no cycle in it:
  //
  //     review mode  →  walk  →  Dim secondary branches  →  actor filter
  //
  // Each link disables the next, remembers the state it was in, and hands it
  // back untouched. Because the links compose, review mode suspending walk also
  // suspends Dim and the actor filter, without review mode knowing either of
  // them exists. Hover-a-route is not a link in that chain: it holds nothing and
  // nothing holds it. Walk refuses it outright, Dim coexists with it as it
  // always has, and a latched actor filter yields to it for the duration of the
  // hover and takes itself back — which is what D5 asks for, and adds no cycle
  // because a momentary preemption is not a hold.
  //
  // Hover previews, click latches. Pure hover could not satisfy D5's own
  // sentence about hovering a route "while an actor filter is active": the
  // pointer is only ever in one place.
  var ACTOR_LOCK_WHY = "Dimming the secondary branches and filtering by actor are the same " +
    "mechanism pointed at the same sheet. Clear the checkbox to filter by actor again.";
  var actorLatched = {};      // wfId -> actorId, the state the reader chose
  var actorHeld = {};         // wfId -> actorId, parked while Dim or walk owns the canvas

  function svgFor(wfId) {
    var canvas = $('.canvas[data-wf="' + wfId + '"]');
    return canvas && $("svg[data-w]", canvas);
  }
  function wfOf(svg) {
    var canvas = svg && svg.closest(".canvas");
    return canvas && canvas.dataset.wf;
  }

  /** Paint one actor's boxes and handoff marks at full strength, dim the rest. */
  function paintActor(svg, actorId) {
    if (!svg) return;
    $$(".actor-on", svg).forEach(function (n) { n.classList.remove("actor-on"); });
    if (!actorId) {
      svg.classList.remove("actor-filter");
      svg.removeAttribute("data-actor-filter");
      return;
    }
    svg.classList.add("actor-filter");
    svg.setAttribute("data-actor-filter", actorId);
    $$('[data-actor="' + actorId + '"]', svg).forEach(function (n) {
      n.classList.add("actor-on");
    });
  }

  /** Reflect the latched state on the legend buttons. */
  function syncActorButtons(wfId) {
    $$('.lg-actor[data-wf="' + wfId + '"]').forEach(function (b) {
      b.setAttribute("aria-pressed", actorLatched[wfId] === b.dataset.actor ? "true" : "false");
    });
  }

  function setActor(wfId, actorId) {
    if (actorId) actorLatched[wfId] = actorId; else delete actorLatched[wfId];
    paintActor(svgFor(wfId), actorId || null);
    syncActorButtons(wfId);
  }

  /** Preview without latching. Passing null returns to whatever is latched. */
  function previewActor(wfId, actorId) {
    if (wfId in actorHeld) return;                 // the canvas is not ours right now
    paintActor(svgFor(wfId), actorId || actorLatched[wfId] || null);
  }

  // Held by Dim (and so, transitively, by walk and by review mode).
  function holdActor(wfId) {
    if (wfId in actorHeld) return;
    actorHeld[wfId] = actorLatched[wfId] || null;
    delete actorLatched[wfId];
    paintActor(svgFor(wfId), null);
    $$('.lg-actor[data-wf="' + wfId + '"]').forEach(function (b) {
      b.disabled = true;
      b.setAttribute("aria-pressed", "false");
      if (b.dataset.why == null) b.dataset.why = b.title;
      b.title = ACTOR_LOCK_WHY;
    });
  }

  function releaseActor(wfId) {
    $$('.lg-actor[data-wf="' + wfId + '"]').forEach(function (b) {
      b.disabled = false;
      if (b.dataset.why != null) b.title = b.dataset.why;
    });
    if (!(wfId in actorHeld)) return;
    var was = actorHeld[wfId];
    delete actorHeld[wfId];
    setActor(wfId, was);
  }

  // Yielded to a hover, and taken straight back. Not a hold: nothing is
  // disabled, nothing is forgotten, and it lasts exactly as long as the pointer.
  //
  // Deliberately stateless — the reader's choice already lives in actorLatched
  // and is never cleared by a hover, so suspending is "stop painting it" and
  // restoring is "paint it again". Both are idempotent, which matters: pointer
  // events do not arrive in matched pairs. Sliding from one box straight to the
  // next fires a mouseout whose relatedTarget is the next box, and that one
  // returns early without restoring — correct, because the next lightRoute
  // suspends again. A remembered-suspension map made that sequence leave the
  // filter stuck on, which is exactly the bug this shape cannot have.
  function suspendActor(svg) {
    var wfId = wfOf(svg);
    if (!wfId || !actorLatched[wfId]) return;
    paintActor(svg, null);
  }

  function restoreActor(svg) {
    var wfId = wfOf(svg);
    if (!wfId || wfId in actorHeld || !actorLatched[wfId]) return;
    paintActor(svg, actorLatched[wfId]);
  }

  function bindActors(root) {
  unbound(".lg-actor", root).forEach(function (btn) {
    var wfId = btn.dataset.wf, id = btn.dataset.actor;
    btn.addEventListener("mouseenter", function () { if (!btn.disabled) previewActor(wfId, id); });
    btn.addEventListener("mouseleave", function () { if (!btn.disabled) previewActor(wfId, null); });
    btn.addEventListener("focus", function () { if (!btn.disabled) previewActor(wfId, id); });
    btn.addEventListener("blur", function () { if (!btn.disabled) previewActor(wfId, null); });
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      setActor(wfId, actorLatched[wfId] === id ? null : id);
    });
  });
  }

  // Escape clears a latched filter, the way it ends a walk.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (modal.classList.contains("is-open")) return;
    var any = false;
    Object.keys(actorLatched).forEach(function (wfId) { any = true; setActor(wfId, null); });
    if (any) e.preventDefault();
  });

  /* --------------------------------------------- dim and walk controls */

  function bindDim(root) {
  unbound("[data-dim]", root).forEach(function (box) {
    box.addEventListener("change", function () {
      var canvas = $('.canvas[data-wf="' + box.dataset.dim + '"]');
      var svg = canvas && $("svg[data-w]", canvas);
      if (!svg) return;
      svg.classList.toggle("dim-secondary", box.checked);
      // Dim is the third link in the chain and holds the fourth.
      if (box.checked) { endWalk(svg); holdActor(box.dataset.dim); }
      else releaseActor(box.dataset.dim);
    });
  });
  }

  // Walk mode and Dim fight over the same canvas, so walking takes the control
  // away rather than flipping it under the reader's hand: disabled, visibly
  // held, with a title that says why, and handed back in the state it was in.
  var DIM_LOCK_WHY = "Walking the sheet dims the secondary branches for you. Stop the walk to use this again.";
  var dimHeld = {};

  function holdDim(wfId) {
    var box = $('[data-dim="' + wfId + '"]');
    if (!box) return;
    dimHeld[wfId] = box.checked;
    box.checked = false;
    box.disabled = true;
    // Walk holds Dim, and Dim holds the actor filter — so walk suspends both
    // without having to know the filter exists.
    holdActor(wfId);
    var label = box.closest(".chk");
    if (label) { label.classList.add("is-locked"); label.title = DIM_LOCK_WHY; }
  }

  function releaseDim(wfId) {
    var box = $('[data-dim="' + wfId + '"]');
    if (!box) return;
    box.disabled = false;
    var label = box.closest(".chk");
    if (label) { label.classList.remove("is-locked"); label.removeAttribute("title"); }
    if (!(wfId in dimHeld)) return;
    var was = dimHeld[wfId];
    delete dimHeld[wfId];
    box.checked = was;
    var canvas = $('.canvas[data-wf="' + wfId + '"]');
    var svg = canvas && $("svg[data-w]", canvas);
    if (svg) svg.classList.toggle("dim-secondary", was);
    // Handed back only as far as Dim itself was: if Dim comes back on, it goes
    // on holding the filter.
    if (!was) releaseActor(wfId);
  }

  // Walking a sheet reveals the happy path one step at a time. It is the
  // fastest way to hand someone a process they have never seen.
  var walks = {};

  function primaryNodes(svg) {
    return $$(".wf-node.is-primary", svg);
  }

  function paintWalk(svg, i) {
    var nodes = primaryNodes(svg);
    $$(".walk-on, .walk-now", svg).forEach(function (n) {
      n.classList.remove("walk-on"); n.classList.remove("walk-now");
    });
    var seen = {};
    nodes.slice(0, i + 1).forEach(function (n) {
      n.classList.add("walk-on");
      seen[n.dataset.uid] = 1;
    });
    nodes[i].classList.add("walk-now");
    $$(".wf-edge.is-primary", svg).forEach(function (e) {
      if (seen[e.dataset.from] && seen[e.dataset.to]) e.classList.add("walk-on");
    });
    var title = nodes[i].querySelector("title");
    var cap = $('.walk-caption[data-wf="' + svg.closest(".canvas").dataset.wf + '"]');
    if (cap) {
      cap.textContent = (i + 1) + " / " + nodes.length + " — " + (title ? title.textContent : "");
    }
    nodes[i].scrollIntoView({ block: "center", inline: "nearest", behavior: glide });
  }

  /** Say something in the sheet's own caption line, where the walk speaks. */
  function walkSay(wfId, msg) {
    var cap = $('.walk-caption[data-wf="' + wfId + '"]');
    if (cap) cap.textContent = msg || "";
  }

  function startWalk(svg, wfId) {
    var nodes = primaryNodes(svg);
    // Used to `return` here in silence. A sheet whose happy path the layout put
    // nowhere primary would swallow the press and change nothing on screen, and
    // the run recorded exactly that: "Walk this sheet produces no visible
    // change." A control that declines to act has to say it declined.
    if (!nodes.length) {
      walkSay(wfId, "There is no happy path to walk on this sheet — every step here sits on a branch.");
      return;
    }
    svg.classList.add("is-walking");
    svg.classList.remove("dim-secondary");
    holdDim(wfId);
    walks[wfId] = 0;
    paintWalk(svg, 0);
    var btn = $('.btn-walk[data-wf="' + wfId + '"]');
    if (btn) { btn.textContent = "Stop walking"; btn.setAttribute("aria-pressed", "true"); }
    // The walk advanced on arrow keys only, so on a phone it started and then
    // could not be moved. Controls appear with the walk and leave with it.
    var nav = $('.walk-steps[data-wf="' + wfId + '"]');
    if (nav) nav.hidden = false;
  }

  function endWalk(svg) {
    if (!svg) return;
    svg.classList.remove("is-walking");
    $$(".walk-on, .walk-now", svg).forEach(function (n) {
      n.classList.remove("walk-on"); n.classList.remove("walk-now");
    });
    var wfId = svg.closest(".canvas").dataset.wf;
    delete walks[wfId];
    releaseDim(wfId);
    var cap = $('.walk-caption[data-wf="' + wfId + '"]');
    if (cap) cap.textContent = "";
    var btn = $('.btn-walk[data-wf="' + wfId + '"]');
    if (btn) { btn.textContent = "Walk this sheet"; btn.setAttribute("aria-pressed", "false"); }
    var nav = $('.walk-steps[data-wf="' + wfId + '"]');
    if (nav) nav.hidden = true;
  }

  function walkStep(svg, wfId, delta) {
    var nodes = primaryNodes(svg);
    var i = walks[wfId] + delta;
    // If a panel is open, the walk and the panel are two cursors on the same
    // sheet and they used to drift apart silently — the sheet highlighted one
    // step while the drawer showed another.
    var syncPanel = modal.classList.contains("is-open");
    // Clamp at both ends. Ending the walk on an accidental extra press, when the
    // other end merely clamps, is the kind of asymmetry that feels like a bug.
    if (i < 0 || i >= nodes.length) return;
    walks[wfId] = i;
    paintWalk(svg, i);
    if (syncPanel && nodes[i] && nodes[i].dataset.uid) openDetail(nodes[i].dataset.uid);
  }

  function bindWalk(root) {
  unbound(".btn-walk", root).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var canvas = $('.canvas[data-wf="' + btn.dataset.wf + '"]');
      var svg = canvas && $("svg[data-w]", canvas);
      if (!svg) return;
      if (btn.getAttribute("aria-disabled") === "true") {
        walkSay(btn.dataset.wf, WALK_LOCK_WHY);
        return;
      }
      if (svg.classList.contains("is-walking")) endWalk(svg);
      else startWalk(svg, btn.dataset.wf);
    });
  });
  }

  document.addEventListener("keydown", function (e) {
    if (modal.classList.contains("is-open")) return;
    var svg = $("svg.is-walking");
    if (!svg) return;
    var wfId = svg.closest(".canvas").dataset.wf;
    if (e.key === "Escape") { e.preventDefault(); endWalk(svg); }
    else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") { e.preventDefault(); walkStep(svg, wfId, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); walkStep(svg, wfId, -1); }
  });

  document.addEventListener("click", function (e) {
    var svg = $("svg.is-walking");
    if (!svg) return;
    if (e.target.closest(".canvas-bar") || e.target.closest(".modal")) return;
    var canvas = e.target.closest(".canvas");
    if (!canvas || canvas !== svg.closest(".canvas")) return;
    if (e.target.closest(".wf-node")) return;
    walkStep(svg, canvas.dataset.wf, 1);
  });

  /* ------------------------------------------------------- fullscreen */

  // Full screen belongs to the canvas, not to the section around it. Expanding
  // the whole section used to hide the description and the fact strip, which is
  // the opposite of what someone wants when they ask for a bigger diagram.
  // A natively fullscreened element becomes the browser's top layer, and
  // anything outside it is simply not painted — which is how a fullscreen
  // diagram ended up with an invisible detail panel. Move the dialogs inside
  // for the duration.
  function moveDialogs(into) {
    ["modal", "build-modal"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode !== into) into.appendChild(el);
    });
  }

  function enterFull(canvas) {
    canvas.classList.add("is-full");
    document.body.classList.add("no-scroll");
    moveDialogs(canvas);
    var btn = $(".btn-full", canvas);
    if (btn) { btn.setAttribute("aria-pressed", "true"); $(".btn-full-label", canvas).textContent = "Exit"; }
    if (canvas.requestFullscreen) canvas.requestFullscreen().catch(function () {});
    setTimeout(function () { fit(canvas); }, 40);
  }
  function exitFull(canvas) {
    canvas.classList.remove("is-full");
    document.body.classList.remove("no-scroll");
    moveDialogs(document.body);
    var btn = $(".btn-full", canvas);
    if (btn) { btn.setAttribute("aria-pressed", "false"); $(".btn-full-label", canvas).textContent = "Full screen"; }
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    setTimeout(function () { fit(canvas); }, 40);
  }
  function bindFull(root) {
  unbound(".btn-full", root).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var canvas = btn.closest(".canvas");
      if (!canvas) return;
      if (canvas.classList.contains("is-full")) exitFull(canvas); else enterFull(canvas);
    });
  });
  }

  // Everything a freshly rendered sheet needs wired up. Called once at load and
  // again each time the router paints an example.
  function bindDiagrams(root) {
    bindZoom(root); bindPan(root); bindDim(root); bindWalk(root); bindWalkNav(root); bindFull(root);
    bindActors(root);
    $$(".canvas", root).forEach(fit);
    syncReview(root);
  }

  /** Skip anything already wired, whatever order the callers run in. */
  function unbound(sel, root) {
    return $$(sel, root).filter(function (el) {
      if (el.dataset.bound) return false;
      el.dataset.bound = "1";
      return true;
    });
  }
  document.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement) {
      var f = $(".canvas.is-full");
      if (f) exitFull(f);
    }
  });

  /* ------------------------------------------------------- payloads */
  // A page carries its own source, renderer, styles and prompt. These readers
  // are what let the page rebuild itself — and build the next one.

  function payload(id) {
    var el = document.getElementById(id);
    if (!el) return "";
    return el.content ? el.content.textContent : el.textContent;
  }

  function sourceDoc() {
    try { return JSON.parse(payload("wfd-source")); } catch (e) { return null; }
  }

  /* ---------------------------------------------------------- freshness */
  //
  // A file outlives the truth inside it, and this one carries no network, so the
  // reader's own clock is the only time source there is. The age is therefore
  // computed here, at read time, from `meta.date` in the markup — never stamped
  // into the HTML at build time, which would freeze the age at the moment of the
  // build and break the byte-identical build besides.
  //
  // No date, no element in the markup, nothing to do: a document that makes no
  // claim about its own age cannot go stale, and is not nagged about it.

  var freshNow = null;                      // a test seam; see window.wfdFreshness

  function localDay(d) {
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function today() { return freshNow || localDay(new Date()); }

  function markFreshness(root) {
    if (!window.WFD || !window.WFD.freshness) return;
    $$(".doc-fresh", root || document).forEach(function (el) {
      var f = window.WFD.freshness(
        { date: el.getAttribute("data-date"),
          reviewEvery: el.getAttribute("data-review-every") || null },
        today());
      // Unreadable date: leave the build-time line exactly as it is. It states
      // only what the document itself asserts, which is never wrong.
      if (!f) return;
      if (f.lead) {
        el.innerHTML = "<b>" + escapeHtml(f.lead) + "</b> \u00b7 " + escapeHtml(f.body);
      } else {
        el.textContent = f.text;
      }
      var stale = f.state === "stale";
      el.classList.toggle("is-stale", stale);
      if (stale) el.setAttribute("role", "note"); else el.removeAttribute("role");
      el.setAttribute("data-state", f.state);
    });
  }

  // Seeing the overdue state should not require waiting six months or moving the
  // machine's clock. `wfdFreshness.at("2027-01-01")` re-reads every freshness
  // line as if it were that day; `wfdFreshness.at(null)` restores the real one.
  window.wfdFreshness = {
    at: function (iso) { freshNow = iso || null; markFreshness(document); return today(); },
    now: today
  };

  /* ------------------------------------------------------ prompt handoff */

  // A page emitted straight from the self-contained prompt has no prompt of its
  // own to hand on. Say so plainly rather than offering a button that copies
  // nothing.
  function promptMissing() {
    var step = document.querySelector(".bstep");
    if (!step || payload("wfd-prompt").trim().length > 200) return false;
    step.innerHTML = '<div class="bstep-h"><span class="bstep-n">1</span><div>' +
      "<h4>Take the prompt</h4><p>This page was built from the self-contained prompt, " +
      "so it does not carry a copy. Paste your document below to rebuild it, or get " +
      "the prompt from whoever sent you this file.</p></div></div>";
    return true;
  }

  function fillPromptView() {
    if (promptMissing()) return;
    var view = $("#prompt-view");
    if (view && !view.dataset.filled) {
      view.textContent = payload("wfd-prompt");
      view.dataset.filled = "1";
    }
  }

  function saveFile(text, name, type) {
    var blob = new Blob([text], { type: type + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // What was built last, so "Download again" and "Open in a new tab" have
  // something to act on. Held in memory only — nothing is written anywhere.
  var built = null;

  function offerHandle(file, html, held) {
    built = { file: file, html: html };
    var row = $("#build-handle");
    var where = $("#build-where");
    var again = $("#build-again");
    if (again) again.textContent = held ? "Download it anyway" : "Download again";
    if (where) {
      where.textContent = held
        ? "Not downloaded yet — the preview below is the page as it stands."
        : "Sent to wherever your browser saves downloads.";
    }
    if (row) row.hidden = false;
  }

  var againBtn = $("#build-again");
  if (againBtn) againBtn.addEventListener("click", function () {
    if (!built) return;
    saveFile(built.html, built.file, "text/html");
  });

  var openBtn = $("#build-open");
  if (openBtn) openBtn.addEventListener("click", function () {
    if (!built) return;
    // A blob URL, so the page it opens is the same bytes that were downloaded
    // rather than a re-render that might differ.
    var url = URL.createObjectURL(new Blob([built.html], { type: "text/html;charset=utf-8" }));
    var w = window.open(url, "_blank");
    if (!w) {
      var where = $("#build-where");
      if (where) where.textContent = "Your browser blocked the new tab. Allow pop-ups for this page, or use Download again.";
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  });

  var promptDl = $("#prompt-download");
  if (promptDl) {
    promptDl.addEventListener("click", function () {
      saveFile(payload("wfd-prompt"), "workflow-diagram-prompt.md", "text/markdown");
    });
  }

  // A page opened from disk is often not a secure context, where the Clipboard
  // API exists but rejects. Falling back only when the API is *absent* leaves
  // the button doing nothing at all in the most common case there is.
  function copyText(text, btn) {
    var label = btn && (btn.querySelector("span") || btn);
    var prev = label && label.textContent;
    var flash = function (msg) {
      if (!label) return;
      label.textContent = msg;
      setTimeout(function () { label.textContent = prev; }, 1800);
    };

    var legacy = function () {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (e) {}
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { toast("Prompt copied \u2014 paste it into your model"); return; }
      toast("Could not copy automatically — select the text below");
      showFallback(text);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Prompt copied \u2014 paste it into your model"); }, legacy);
      return;
    }
    legacy();
  }

  // Last resort: put the text somewhere the reader can select it themselves.
  function showFallback(text) {
    var box = document.getElementById("copy-fallback");
    if (!box) {
      box = document.createElement("textarea");
      box.id = "copy-fallback";
      box.setAttribute("readonly", "");
      box.addEventListener("blur", function () { box.remove(); });
      document.body.appendChild(box);
    }
    box.value = text;
    box.focus();
    box.select();
  }

  $$("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var src = document.getElementById(btn.dataset.copy);
      if (!src) return;
      copyText(src.content ? src.content.textContent : src.textContent, btn);
    });
  });

  /* ----------------------------------------------------------- builder */

  var buildModal = document.getElementById("build-modal");
  var lastHtml = null;

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /** A standing notice under the status line — what the build did to the
   *  document, as opposed to whether it succeeded. Survives until the next
   *  build rather than clearing itself, because dropping someone's review
   *  claims is not a transient message. */
  function note(msg) {
    var el = $("#build-note");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function status(msg, tone) {
    var el = $("#build-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "build-status" + (tone ? " is-" + tone : "");
  }

  // The rules behind almost every rejection, in the words the author needs
  // rather than the words the validator used.
  var REPAIR_RULES = [
    "`branches` is a key of the STEP, a sibling of `detail`. It is never a key inside `detail`. " +
      "Order the keys branches-then-detail so this stays obvious.",
    "Every `question` and `choice` needs at least one branch, and every branch needs an `exit`.",
    "`join` and `continue` may only point at a step BELOW the branch, in an ancestor lane. " +
      "To point at an earlier step use `goback`.",
    "`goback` may only point at a step at or ABOVE the branch. To point at a later step use `join`.",
    "Every id named by `join`, `goback`, `goto` or `insert` must exist. Step ids are unique " +
      "within a workflow; workflow ids are unique in the document.",
    "Titles fit about 45 characters and notes about 50. Longer text is truncated on the canvas — " +
      "put the long version in `detail`."
  ];

  function repairPrompt(errors) {
    var out = [];
    out.push("The workflow document you gave me did not validate. The renderer reported these");
    out.push("problems, quoted exactly:");
    out.push("");
    errors.forEach(function (e, i) {
      out.push((i + 1) + ". " + (e.path || "(document)"));
      out.push("   " + (e.message || String(e)));
      if (e.hint) out.push("   suggested fix: " + e.hint);
    });
    out.push("");
    out.push("The rules these come down to:");
    out.push("");
    REPAIR_RULES.forEach(function (r) { out.push("- " + r); });
    out.push("");
    out.push("Fix every problem above and return the COMPLETE corrected document as one JSON");
    out.push("document in a single fenced block, with nothing before or after it. Do not return");
    out.push("a patch, a diff, or only the changed steps.");
    return out.join("\n");
  }

  function report(kind, items) {
    var box = $("#build-report");
    if (!box) return;
    if (!items || !items.length) { box.innerHTML = ""; return; }
    // A long list of validator errors ran off the bottom with nothing saying so,
    // and a reader who fixed the three they could see believed they were done.
    var more = items.length > 3
      ? '<p class="report-more">' + items.length + " in total — the list continues below.</p>"
      : "";

    var head = "";
    if (kind === "errors") {
      head = '<div class="build-fixbar">' +
        '<button class="btn btn-primary btn-sm" type="button" id="build-fix">' +
        'Copy a prompt that fixes these</button>' +
        "<span>Paste it back into the model that wrote the document.</span></div>";
    }

    box.innerHTML = head + '<ul class="build-' + kind + '">' + items.map(function (e) {
      var hint = e.hint ? '<span class="bp-hint">' + escapeHtml(e.hint) + "</span>" : "";
      return "<li><code>" + escapeHtml(e.path || "") + "</code><span>" +
        escapeHtml(e.message || String(e)) + "</span>" + hint + "</li>";
    }).join("") + "</ul>" + more;

    var fix = $("#build-fix");
    if (fix) fix.addEventListener("click", function () { copyText(repairPrompt(items), fix); });
  }

  function renderFromInput() {
    var input = $("#build-input");
    var preview = $("#build-preview");
    lastHtml = null;
    note("");
    if (preview) preview.hidden = true;

    var raw = (input.value || "").trim();
    if (!raw) { status("Paste a WFD document first.", "warn"); report(null, []); return; }
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    var doc;
    try { doc = JSON.parse(raw); }
    catch (e) {
      status("That is not valid JSON.", "error");
      report("errors", [{ path: "JSON", message: e.message,
        hint: "Check for a trailing comma, a smart quote, or truncated output." }]);
      return;
    }

    if (!window.WFD || !window.WFD.buildDocument) {
      status("The renderer did not load in this page.", "error");
      return;
    }

    // Before anything is built. See stripReviewClaims.
    var dropped = stripReviewClaims(doc);

    var build;
    try { build = window.WFD.buildDocument(doc); }
    catch (e) {
      status("The renderer could not read that document.", "error");
      report("errors", [{ path: "document", message: e.message }]);
      return;
    }

    if (build.errors && build.errors.length) {
      status(build.errors.length + " problem(s) to fix.", "error");
      report("errors", build.errors);
      return;
    }

    var html;
    try {
      html = window.WFD.renderPage(build, {
        css: payload("wfd-css"),
        js: payload("wfd-app"),
        runtime: payload("wfd-runtime"),
        prompt: payload("wfd-prompt"),
        starter: payload("wfd-starter"),
        source: JSON.stringify(doc, null, 2)
      });
    } catch (e) {
      status("Rendering failed.", "error");
      report("errors", [{ path: "render", message: e.message }]);
      return;
    }

    lastHtml = html;
    var steps = 0;
    build.workflows.forEach(function (w) {
      w.nodes.forEach(function (n) { if (n.kind === "step") steps++; });
    });

    var name = (doc.title || "workflow").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "workflow";
    // Dated. Two builds of the same document used to land in the downloads
    // folder with identical names, and the on-page identity was identical too,
    // so which one was current could not be told from either.
    var d = new Date();
    var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
    var file = name + "-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + ".html";
    // The gate. The warnings used to arrive in the same breath as the save, so
    // "3 things to tidy" and "your file is downloaded" were one event and there
    // was no moment at which a reader could act on the first before the second
    // had already happened. A clean build still saves itself; one with things
    // to tidy stops here and hands over the choice.
    if (build.warnings.length) offerHandle(file, html, true);
    else { saveFile(html, file, "text/html"); offerHandle(file, html, false); }
    // "Saved <name>" was a claim with no handle behind it: no path, no reveal,
    // no way to open or re-download what had just been built, and every persona
    // in the run noticed. The page cannot know the reader's download directory —
    // no page can — so it says what it actually did, names where browsers put
    // it, and hands over two controls that work.

    // What survived the rebuild, counted rather than assumed. A document whose
    // detail fields were silently discarded produced a smaller page and said
    // nothing, so an author could not tell a clean build from a lossy one.
    var kept = 0, fields = 0;
    (doc.workflows || []).forEach(function (w) {
      eachStep(w && w.steps, function (st) {
        if (!st || !st.detail) return;
        for (var f in st.detail) { fields++; if (st.detail[f] != null) kept++; }
      });
    });
    // One notice, not two — they were separate note() calls and the second
    // silently overwrote the first, so a document that both lost review claims
    // and dropped detail fields only ever reported one of them.
    var notes = [];
    if (dropped.marks || dropped.record) {
      notes.push(
        (dropped.marks
          ? dropped.marks + " verification mark" + (dropped.marks === 1 ? "" : "s")
          : "A review record") +
        (dropped.marks && dropped.record ? " and a review record were" : " was") +
        " dropped from this document. This builder cannot tell where a pasted " +
        "document came from, so it will not repeat a claim that a human checked " +
        "it. Review the built page yourself and press Publish review to put your " +
        "own name on it.");
    }
    if (build.warnings.length) {
      notes.push("This build kept " + kept + " of " + fields + " detail fields. The list below " +
        "names every field whose shape means it will not be drawn.");
    }
    note(notes.join(" "));

    status((build.warnings.length ? "Built, not saved — " + build.warnings.length +
        " thing(s) the author could tidy \u2014 none of them stop you sending it. " : "Built and saved " + file + " — ") +
      build.workflows.length + " diagram" + (build.workflows.length === 1 ? "" : "s") +
      ", " + steps + " steps, " + Math.round(html.length / 1024) + " KB",
      build.warnings.length ? "warn" : "ok");
    report("warnings", build.warnings);

    if (preview) {
      // Keep the reader's place across a rebuild. Editing a step and pressing
      // Build again used to return them to the top of a long page every time,
      // so a fix three sheets down cost a scroll on every iteration.
      var keep = 0;
      try { keep = preview.contentWindow ? preview.contentWindow.scrollY || 0 : 0; } catch (err) {}
      preview.hidden = false;
      preview.srcdoc = html;
      if (keep) preview.addEventListener("load", function once() {
        preview.removeEventListener("load", once);
        try { preview.contentWindow.scrollTo(0, keep); } catch (err) {}
      });
    }
  }

  var buildOpener = null;

  /* ------------------------------------------------------- round trip (D4) */
  //
  // The document that produced this page is carried inside it, so a fix does not
  // mean going back to the model. Where it lives differs by page type:
  //
  //   * a generated single-document page embeds its own source as `wfd-source`;
  //   * the library file has no single source — it carries every example
  //     separately, so the document to edit is whichever one is open.
  //
  // On the library index with nothing open there is no document to edit, and the
  // button is hidden rather than left to fail quietly when pressed.

  function baseSource() {
    var own = sourceDoc();
    if (own && own.wfd) return own;
    if (typeof currentDoc === "string" && currentDoc) return docById(currentDoc);
    return null;
  }

  // The page's own document, with the reviewer's marks folded in. D4's "Edit
  // this page's document" and D3's export are therefore the same document by
  // construction — there is one source of truth on this page and this is it.
  function currentSource() {
    return applyMarks(baseSource());
  }

  function syncSourceButton() {
    var b = document.getElementById("build-source");
    if (b) b.hidden = !baseSource();
  }


  /* ------------------------------------------------------- review mode (D3) */
  //
  // A model removed the writing bottleneck and enlarged the verification one, so
  // the page is the review tool. Walk the sheet, mark each step checked, export
  // the marked document.
  //
  // Three rules this code exists to keep:
  //
  //   1. **Nothing automatic ever marks a step verified.** Every write to `marks`
  //      below comes from `mark()`, and `mark()` has exactly three callers: a
  //      click on a button in the modal footer, a V/X/U keypress, and the undo
  //      inside "Discard my marks". Entering review mode marks nothing. Loading,
  //      routing, exporting and rebuilding mark nothing. Same reasoning as D4's
  //      refusal to move `meta.date` on a rebuild.
  //   2. **The exported document is the source of truth.** localStorage is a
  //      scratchpad so a reviewer can close the lid mid-document; it is keyed to
  //      this browser and nobody else will ever see it. The UI says so, and says
  //      it louder once there is unexported work.
  //   3. **No network.** Same constraint as D4, for the same reason.
  //
  // How it sits beside the other interaction states: dimming is one mechanism
  // with three entry points (hover a route, "Dim secondary branches", and D5's
  // actor filter) and a reader can only be doing one at a time. Review mode is
  // not a fourth entry point into dimming — it dims nothing and changes no
  // opacity, so hover-route and Dim keep working untouched while reviewing.
  // Walk is the one real conflict: it drops everything not on the current step
  // to 14% opacity, which hides the very border weights being reviewed, and it
  // claims Space, Enter and the arrow keys. So review mode *suspends* walk,
  // using the same hold-and-hand-back pattern walk itself already uses on Dim.
  // The chain is linear — review holds walk, walk holds Dim, Dim holds nothing —
  // so there is no cycle to deadlock in, and the review toggle that ends it is
  // in the document header, never disabled and never inside a held control.

  var REVIEW_PREFIX = "wfd-review:";
  var STATES = { unverified: 1, verified: 1, disputed: 1 };

  var reviewing = false;
  var marks = {};             // "wfId/stepId" -> state, for the document on screen
  var marksKey = null;
  var marksDirty = false;
  // Why a step was disputed, keyed exactly like marks. Kept in its OWN map
  // rather than turning marks[key] into an object, because a test proves there
  // is exactly one assignment to a verification state in this whole file and
  // that proof is worth more than the tidier data structure.
  var notes = {};

  /** Stable per-document storage key: the title alone would collide. */
  function reviewKeyFor(doc) {
    if (!doc) return null;
    var ids = (doc.workflows || []).map(function (w) { return w && w.id; }).join(",");
    return REVIEW_PREFIX + (doc.title || "untitled") + "|" + ids;
  }

  function readStore(key) {
    if (!key) return {};
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { return {}; }
    if (!raw) return {};
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { return {}; }
    if (!obj || typeof obj !== "object") return {};
    var out = {};
    for (var k in obj) if (STATES[obj[k]]) out[k] = obj[k];
    return out;
  }

  function writeStore() {
    if (!marksKey) return;
    try {
      if (Object.keys(marks).length) localStorage.setItem(marksKey, JSON.stringify(marks));
      else localStorage.removeItem(marksKey);
      if (Object.keys(notes).length) localStorage.setItem(marksKey + "|why", JSON.stringify(notes));
      else localStorage.removeItem(marksKey + "|why");
    } catch (e) { /* private mode, quota, a file:// jail — the export still works */ }
  }

  function readNotes(key) {
    if (!key) return {};
    var raw = null;
    try { raw = localStorage.getItem(key + "|why"); } catch (e) { return {}; }
    if (!raw) return {};
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { return {}; }
    if (!obj || typeof obj !== "object") return {};
    var out = {};
    for (var k in obj) if (typeof obj[k] === "string" && obj[k].trim()) out[k] = obj[k];
    return out;
  }

  /** The step a canvas node stands for, in terms that survive an edit. */
  function markKey(node) {
    var id = node.dataset.step;
    if (!id) return null;                        // no step id, nothing stable to key on
    var canvas = node.closest(".canvas");
    if (!canvas) return null;
    return canvas.dataset.wf + "/" + id;
  }

  function stateOf(node) {
    var key = markKey(node);
    if (key && marks[key]) return marks[key];
    return node.dataset.v || "unverified";
  }

  function paintNode(node) {
    var state = stateOf(node);
    node.classList.remove("v-unverified", "v-verified", "v-disputed");
    node.classList.add("v-" + state);
    // Border weight says nothing to a screen reader, so the announced string
    // carries the state and has to be rewritten when the state changes.
    var aria = node.getAttribute("aria-label") || "";
    aria = aria.replace(/, (not verified|verified by a reviewer|disputed by a reviewer)$/, "");
    node.setAttribute("aria-label", aria + (
      state === "verified" ? ", verified by a reviewer"
        : state === "disputed" ? ", disputed by a reviewer" : ", not verified"));
  }

  // Scoped to a real canvas on purpose. A `.wf-node.k-step` also exists in the
  // landing page's hero diagram, which is a rendered sheet but not a document
  // anyone is reviewing — counting it inflated every tally on that page. Any
  // future preview would have done the same.
  function steps(root) { return $$(".canvas .wf-node.k-step", root || document); }

  /* ------------------------------------------------------------ progress */

  function tally() {
    var t = { total: 0, verified: 0, disputed: 0 };
    steps().forEach(function (n) {
      t.total++;
      var s = stateOf(n);
      if (s === "verified") t.verified++;
      else if (s === "disputed") t.disputed++;
    });
    return t;
  }

  function paintProgress() {
    var t = tally();
    var root = $("[data-review-root]");
    if (root) {
      var v = $("[data-review-verified]", root);
      if (v) v.textContent = String(t.verified);
      var d = $("[data-review-disputed]", root);
      if (d) d.textContent = String(t.disputed);
      else if (t.disputed) {
        var c = $(".dr-count", root);
        if (c) c.insertAdjacentHTML("beforeend",
          ' · <b class="dr-disputed" data-review-disputed>' + t.disputed + "</b> disputed");
      }
      var dis = $("[data-review-disputed]", root);
      if (dis) {
        dis.classList.toggle("is-walkable", t.disputed > 0);
        dis.setAttribute("title", t.disputed ? "Go to the next step marked as needing work" : "");
      }
      var fill = $("[data-review-fill]", root);
      if (fill) fill.style.width = (t.total ? (t.verified / t.total) * 100 : 0) + "%";
      var bar = $("[data-review-bar]", root);
      if (bar) bar.setAttribute("aria-label", t.verified + " of " + t.total + " steps verified");
      var gloss = $("[data-review-gloss]", root);
      if (gloss) gloss.textContent = glossFor(t);
    }
    // per-sheet, in each legend
    $$("[data-review-wf]").forEach(function (el) {
      var canvas = $('.canvas[data-wf="' + el.dataset.reviewWf + '"]');
      var s = { total: 0, verified: 0, disputed: 0 };
      if (canvas) steps(canvas).forEach(function (n) {
        s.total++;
        var st = stateOf(n);
        if (st === "verified") s.verified++;
        else if (st === "disputed") s.disputed++;
      });
      el.innerHTML = "<b>" + s.verified + "</b> of <b>" + s.total + "</b> checked" +
        (s.disputed ? ' · <b class="lg-disputed">' + s.disputed + "</b> disputed" : "");

      // And the swatches beside it. This was the third counter, and the one that
      // went stale: it was decided at build time, so a sheet could draw a heavy
      // outline the legend no longer explained the moment anyone marked a step.
      var legend = el.closest(".legend");
      if (legend) {
        var thin = $("[data-conf-thin]", legend);
        var solid = $("[data-conf-solid]", legend);
        if (thin) thin.hidden = !(s.total - s.verified);
        if (solid) solid.hidden = !s.verified;
      }
    });
    syncDirty();
  }

  function glossFor(t) {
    var done = t.verified + t.disputed;
    if (t.total && t.verified === t.total) return "Every step in this document has been checked by a human.";
    if (!done) return "No step in this document has been checked by a human. " +
      "Every box is drawn in a lighter outline until one is.";
    var left = t.total - done;
    return left + " step" + (left === 1 ? "" : "s") + " still to check." +
      (t.disputed ? " " + t.disputed + " marked as needing work." : "");
  }

  function syncDirty() {
    var warn = $("#review-dirty");
    var exp = $("#review-export");
    var clr = $("#review-clear");
    var pub = $("#review-publish");
    var any = Object.keys(marks).length > 0;
    if (exp) exp.hidden = !any;
    if (clr) clr.hidden = !any;
    if (pub) pub.hidden = !any;
    var where = $(".dr-where");
    if (where) where.hidden = any;
    if (!any) { var row = $("#review-publish-row"); if (row) row.hidden = true; }
    if (!warn) return;
    warn.hidden = !any;
    // REWRITTEN with the draft/published split. The old copy called an
    // unexported mark "not saved yet" and, once exported, said the export was
    // "the copy that lasts" — and a verifier found that ANY RELOAD swapped the
    // first message for the second on marks that had never left the browser, so
    // the page silently told you your work was safe when it was not. The state
    // being described is now the draft itself, which is true on every reload.
    warn.textContent = any
      ? (marksDirty
          ? "Draft review — held in this browser only. Publish to put it in a file you can send."
          : "Draft review — held in this browser only. Publishing writes the copy other people read.")
      : "";
    warn.classList.toggle("is-dirty", !!marksDirty);
  }

  /* --------------------------------------------------------- the one write */

  // The only function in this file that sets a verification state, and it is
  // only ever reached from a human pressing something.
  function mark(node, state) {
    if (!node || !STATES[state]) return false;
    var key = markKey(node);
    if (!key) return false;
    if (state === (node.dataset.v || "unverified")) delete marks[key];
    else marks[key] = state;
    marksDirty = true;
    writeStore();
    paintNode(node);
    paintProgress();
    return true;
  }

  /* ---------------------------------------------------------- the document */

  function eachStep(list, fn) {
    (list || []).forEach(function (st) {
      if (!st || typeof st !== "object") return;
      fn(st);
      (st.branches || []).forEach(function (br) { if (br) eachStep(br.steps, fn); });
    });
  }

  /**
   * The document with the marks written into it. Called by `currentSource()`,
   * so D4's round-trip editor and D3's export hand out the same bytes.
   * `unverified` is written by deleting the key rather than by stating it: the
   * absence *is* the default, and an export full of `"verification":
   * "unverified"` would be noise in every diff.
   */
  function applyMarks(doc) {
    if (!doc) return doc;
    var key = reviewKeyFor(doc);
    var m = (key && key === marksKey) ? marks : readStore(key);
    if (!m || !Object.keys(m).length) return doc;
    var copy;
    try { copy = JSON.parse(JSON.stringify(doc)); } catch (e) { return doc; }
    (copy.workflows || []).forEach(function (w) {
      eachStep(w && w.steps, function (st) {
        var k = w.id + "/" + st.id;
        var v = m[k];
        var why = (key && key === marksKey) ? notes[k] : readNotes(key)[k];
        if (v === "disputed" && why) st.verificationNote = why;
        else delete st.verificationNote;
        if (!v) return;
        if (v === "unverified") delete st.verification;
        else st.verification = v;
      });
    });
    return copy;
  }

  /**
   * Strip every claim about human review from a document the builder was handed.
   *
   * The attack this closes, found independently by two personas: take a real
   * document, rewrite a safety step into its opposite, forge
   * `"verification": "verified"` and a reviewedBy of someone senior, leave
   * `"author"` intact, press Build — and out comes a page wearing the original
   * author, a verified chip and a count saying a human checked it.
   *
   * Nothing here can be tamper-proof: the renderer is open source and runs on
   * the reader's machine, so anyone determined can run their own. What the
   * builder CAN do is refuse to launder the claim. It has no idea where a pasted
   * document came from, so it renders the workflow and drops the review — the
   * same rule the format already states about dates, that a rebuild is not a
   * review, applied to the thing a rebuild most obviously is not.
   *
   * Review re-enters a document exactly one way: marks you make yourself, in a
   * page you are reading, published deliberately with your name on them.
   */
  function stripReviewClaims(doc) {
    var marksDropped = 0;
    var hadRecord = false;
    if (!doc || typeof doc !== "object") return { marks: 0, record: false };
    if (doc.meta && doc.meta.review != null) { hadRecord = true; delete doc.meta.review; }
    (doc.workflows || []).forEach(function (w) {
      eachStep(w && w.steps, function (st) {
        if (st && st.verification != null) {
          // "unverified" is the default and asserts nothing, so removing it is
          // not a dropped claim and should not be counted as one.
          if (st.verification !== "unverified") marksDropped++;
          delete st.verification;
        }
      });
    });
    return { marks: marksDropped, record: hadRecord };
  }

  function exportMarked() {
    var doc = currentSource();
    if (!doc) { reviewSay("There is no document open to export."); return; }
    var name = (doc.title || "workflow").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "workflow";
    saveFile(JSON.stringify(doc, null, 2), name + ".wfd.json", "application/json");
    var c = countMarks(doc);
    marksDirty = false;
    syncDirty();
    // It used to name the file and stop, so the one thing a reviewer wanted to
    // know — did my marks actually go into it — was the one thing it did not
    // say. And it overwrote the standing warning in place, then restored it six
    // seconds later, so a reader who looked away saw nothing happen at all.
    reviewSay("Exported " + name + ".wfd.json with " + c.verified + " verified and " +
      c.disputed + " needing work, of " + c.total + " steps. This is the marks as data \u2014 " +
      "to send someone a readable page, use Publish review instead.", true);
    var pubBtn = $("#review-publish");
    if (pubBtn) pubBtn.classList.add("is-nudged");
  }

  /**
   * Publish the review as a new HTML file.
   *
   * The run found that a completed review left no attributable record anywhere:
   * a reviewer marked steps, sent the file, and every recipient opened it to
   * "No step in this document has been checked by a human". The marks CAN travel
   * — export, paste back, rebuild — but nobody found that path, so review state
   * was effectively local forever.
   *
   * This is the whole relay in one action. Working marks stay a private draft in
   * this browser; publishing is the deliberate act that puts a name and a date on
   * a document and produces the copy you actually send. The draft/published split
   * is the point: a half-finished review must not look authoritative, and a
   * published one must say who is standing behind it.
   */
  function publishReview(by) {
    var doc = currentSource();
    if (!doc) { reviewSay("There is no document open to publish."); return; }
    if (!window.WFD || !window.WFD.buildDocument || !window.WFD.renderPage) {
      reviewSay("The renderer did not load in this page, so nothing can be published.");
      return;
    }

    var counts = countMarks(doc);
    if (!counts.verified && !counts.disputed) {
      reviewSay("Nothing has been marked yet, so there is no review to publish.");
      return;
    }

    // The only clock call in the project is at read time, and publishing is a
    // read-time act. Stamped from the reviewer's own machine, in their own zone.
    var now = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var on = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());

    doc.meta = doc.meta || {};
    doc.meta.review = {
      by: String(by).trim().slice(0, 80),
      on: on,
      verified: counts.verified,
      disputed: counts.disputed,
      total: counts.total
    };

    var build;
    try { build = window.WFD.buildDocument(doc); }
    catch (e) { reviewSay("The renderer could not read this document: " + e.message); return; }
    if (build.errors && build.errors.length) {
      reviewSay("This document will not build: " + build.errors[0].path + " — " + build.errors[0].message);
      return;
    }

    var html;
    try {
      html = window.WFD.renderPage(build, {
        css: payload("wfd-css"), js: payload("wfd-app"), runtime: payload("wfd-runtime"),
        prompt: payload("wfd-prompt"), starter: payload("wfd-starter"),
        source: JSON.stringify(doc, null, 2)
      });
    } catch (e) { reviewSay("Publishing failed: " + e.message); return; }

    var name = (doc.title || "workflow").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "workflow";
    saveFile(html, name + "-reviewed.html", "text/html");

    marksDirty = false;
    syncDirty();
    reviewSay("Published " + name + "-reviewed.html \u2014 " + counts.verified + " of " +
      counts.total + " verified" + (counts.disputed ? ", " + counts.disputed + " needing work" : "") +
      ", with your name on the header. Send that file; this page still holds your working draft.");
  }

  /** Verified / disputed / total across the document, counted from the marks. */
  function countMarks(doc) {
    var verified = 0, disputed = 0, total = 0;
    (doc.workflows || []).forEach(function (w) {
      eachStep(w && w.steps, function (st) {
        total++;
        if (st.verification === "verified") verified++;
        else if (st.verification === "disputed") disputed++;
      });
    });
    return { verified: verified, disputed: disputed, total: total };
  }

  function reviewSay(msg, sticky) {
    var warn = $("#review-dirty");
    if (!warn) return;
    warn.hidden = false;
    warn.textContent = msg;
    warn.classList.remove("is-dirty");
    // A receipt that erases itself is a receipt the reader may never see. Only
    // transient nudges time out; anything reporting what a file now contains
    // stays until the next action replaces it.
    if (!sticky) setTimeout(syncDirty, 6000);
  }

  /* -------------------------------------------------- suspending the walk */

  var WALK_LOCK_WHY = "Walking a sheet dims everything off the current step, including the outlines " +
    "you are reviewing. Leave review mode to walk.";

  // The lock is no longer `disabled`. A disabled button fires no click, so the
  // only explanation was a `title` tooltip — which does not exist on a phone and
  // is invisible to a keyboard. The reason was therefore unreachable on the
  // device where the walk mattered most. It stays pressable and answers.
  function holdWalk() {
    $$("svg.is-walking").forEach(endWalk);
    $$(".btn-walk").forEach(function (b) {
      b.disabled = false;
      b.setAttribute("aria-disabled", "true");
      b.classList.add("is-locked");
      b.title = WALK_LOCK_WHY;
    });
  }

  function releaseWalk() {
    $$(".btn-walk").forEach(function (b) {
      b.disabled = false;
      b.removeAttribute("aria-disabled");
      b.classList.remove("is-locked");
      b.removeAttribute("title");
      walkSay(b.dataset.wf, "");
    });
  }

  /* ------------------------------------------------------------- the mode */

  function setReviewing(on) {
    reviewing = !!on;
    document.body.classList.toggle("is-reviewing", reviewing);
    // Remembered per document. A reload dropped review mode silently, and a mark
    // that had persisted then became invisible on the step until the reader
    // thought to re-enter — so the page looked like it had lost their work.
    try {
      if (marksKey) {
        if (reviewing) localStorage.setItem(marksKey + "|on", "1");
        else localStorage.removeItem(marksKey + "|on");
      }
    } catch (e) {}
    var btn = $("#review-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", reviewing ? "true" : "false");
      btn.textContent = reviewing ? "Done reviewing" : "Review this document";
      btn.classList.toggle("btn-primary", reviewing);
    }
    var footer = $("#modal-review");
    if (footer) footer.hidden = !reviewing;
    if (reviewing) holdWalk(); else releaseWalk();
    syncMarkButtons();
  }

  /** Which of the three buttons is showing the step's current state. */
  function syncMarkButtons() {
    var node = current && document.getElementById(current);
    var state = node && node.classList.contains("k-step") ? stateOf(node) : null;
    var footer = $("#modal-review");
    if (footer) footer.classList.toggle("is-off", !state);
    $$("[data-mark]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.mark === state ? "true" : "false");
      b.disabled = !state;
    });
  }

  /** Verified / disputed / total for the sheet the open step belongs to. */
  function liveCounts() {
    var v = 0, d = 0, t = 0;
    $$(".wf-node.k-step[data-step]").forEach(function (n) {
      t++;
      var st = stateOf(n);
      if (st === "verified") v++; else if (st === "disputed") d++;
    });
    return { verified: v, disputed: d, total: t };
  }

  /**
   * Say, where the mark was made, that it took.
   *
   * The drawer covers the counter in the document header, and marking
   * auto-advances to the next step — which reads "Not checked", because it is.
   * So the reviewer's confirmation that anything happened was on the far side of
   * a panel they could not see past, and the thing they COULD see said the
   * opposite. The confirmation now lives in the drawer, next to the buttons.
   */
  function saidMark(state) {
    var el = $("#mor-said");
    if (!el) return;
    var c = liveCounts();
    var what = state === "verified" ? "Marked verified"
             : state === "disputed" ? "Marked as needing work"
             : "Mark cleared";
    el.textContent = what + " \u00b7 " + c.verified + " of " + c.total + " verified" +
      (c.disputed ? " \u00b7 " + c.disputed + " needing work" : "");
  }

  /** Mark the open step, then move on — a sixty-step review is sixty keystrokes. */
  function markCurrent(state) {
    var node = current && document.getElementById(current);
    if (!node || !mark(node, state)) return false;
    saidMark(state);
    // A dispute without a reason is a flag the person who has to fix it cannot
    // act on. Asking here, while the step is still on screen, is the only
    // moment the reviewer still has the context to answer.
    if (state === "disputed") {
      showWhy(markKey(node));
      syncMarkButtons();
      return true;                                  // do NOT auto-advance past the question
    }
    hideWhy();
    if ($("#modal-next") && !$("#modal-next").disabled) step(1);
    else syncMarkButtons();
    return true;
  }

  var whyKey = null;

  function showWhy(key) {
    whyKey = key;
    var box = $("#mor-why");
    var ta = $("#mark-note");
    if (!box || !ta) return;
    ta.value = (key && notes[key]) || "";
    box.hidden = false;
    ta.focus();
  }

  function hideWhy() {
    var box = $("#mor-why");
    if (box) box.hidden = true;
    whyKey = null;
  }

  var noteBox = $("#mark-note");
  if (noteBox) {
    noteBox.addEventListener("input", function () {
      if (!whyKey) return;
      var v = noteBox.value.trim();
      if (v) notes[whyKey] = v; else delete notes[whyKey];
      marksDirty = true;
      writeStore();
      syncDirty();
    });
    // Enter commits and moves on; Shift+Enter is a newline.
    noteBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        hideWhy();
        if ($("#modal-next") && !$("#modal-next").disabled) step(1);
      }
      e.stopPropagation();                          // V/X/U are marks, not text
    });
  }

  // Walk the disputed steps from the header count. "1 disputed" named a number
  // and gave no way to reach it, so a reader who wanted the one step that had
  // been stopped had to open every box to find it.
  var disputeAt = -1;
  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var d = e.target.closest("[data-review-disputed]");
    if (d) {
      var bad = steps().filter(function (n) { return stateOf(n) === "disputed"; });
      if (!bad.length) return;
      e.preventDefault();
      disputeAt = (disputeAt + 1) % bad.length;
      var node = bad[disputeAt];
      node.scrollIntoView({ block: "center", behavior: glide });
      if (node.dataset.uid) openDetail(node.dataset.uid);
    }
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var b = e.target.closest("[data-mark]");
    if (b && reviewing) { e.preventDefault(); markCurrent(b.dataset.mark); return; }
    if (e.target.closest("#review-toggle")) { e.preventDefault(); setReviewing(!reviewing); return; }
    if (e.target.closest("#review-export")) { e.preventDefault(); exportMarked(); return; }
    if (e.target.closest("#review-publish")) {
      e.preventDefault();
      var row = $("#review-publish-row");
      if (row) {
        row.hidden = false;
        var by = $("#review-by");
        if (by) { if (!by.value) by.value = localStorage.getItem("wfd-review-by") || ""; by.focus(); }
      }
      return;
    }
    if (e.target.closest("#review-publish-cancel")) {
      e.preventDefault();
      var rowc = $("#review-publish-row"); if (rowc) rowc.hidden = true;
      return;
    }
    if (e.target.closest("#review-publish-go")) {
      e.preventDefault();
      var input = $("#review-by");
      var who = input ? (input.value || "").trim() : "";
      if (!who) {
        reviewSay("A review needs a name on it. Type who checked this document.");
        if (input) input.focus();
        return;
      }
      // Remembered so a weekly reviewer types it once, not every week.
      try { localStorage.setItem("wfd-review-by", who); } catch (err) {}
      var rowg = $("#review-publish-row"); if (rowg) rowg.hidden = true;
      publishReview(who);
      return;
    }
    if (e.target.closest("#review-clear")) {
      e.preventDefault();
      if (!window.confirm("Discard every mark you have made on this document in this browser? " +
        "Anything you have already exported is unaffected.")) return;
      marks = {};
      notes = {};
      marksDirty = false;
      writeStore();
      steps().forEach(paintNode);
      paintProgress();
      syncMarkButtons();
    }
  });

  // Marking without opening. In review mode the V / X / U keys act on whichever
  // step has focus on the canvas, so a sixteen-step sheet is sixteen keystrokes
  // rather than sixteen opens, a read, and sixteen closes. The panel remains the
  // way to mark something you actually want to read first.
  var MARK_KEY = { v: "verified", x: "disputed", u: "unverified" };

  document.addEventListener("keydown", function (e) {
    if (!reviewing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (modal.classList.contains("is-open")) return;         // the panel path owns it
    var state = MARK_KEY[(e.key || "").toLowerCase()];
    if (!state) return;
    var node = document.activeElement;
    if (!node || !node.classList || !node.classList.contains("wf-node")) return;
    if (!node.classList.contains("k-step")) return;
    e.preventDefault();
    if (mark(node, state)) {
      toast((state === "verified" ? "Verified" : state === "disputed" ? "Marked as needing work"
             : "Mark cleared") + " \u2014 " + liveCounts().verified + " of " + liveCounts().total + " verified");
      // Move to the next step so a pass down the spine is one key per step.
      var all = $$(".wf-node.k-step", svgOf(node));
      var i = all.indexOf(node);
      if (i > -1 && i < all.length - 1) all[i + 1].focus();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (!reviewing || e.metaKey || e.ctrlKey || e.altKey) return;
    var state = MARK_KEY[(e.key || "").toLowerCase()];
    if (!state) return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (modal.classList.contains("is-open")) { e.preventDefault(); markCurrent(state); return; }
    var node = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest(".wf-node.k-step") : null;
    if (node) { e.preventDefault(); mark(node, state); }
  });

  // Marks live in one browser and nowhere else. Say so on the way out, once
  // there is work that has not been exported.
  window.addEventListener("beforeunload", function (e) {
    if (!marksDirty || !Object.keys(marks).length) return;
    e.preventDefault();
    e.returnValue = "";
    return "";
  });

  /**
   * Re-read the marks for whatever document is now on screen and repaint.
   * Called for the page as loaded and again each time the router paints an
   * example, because the library file holds five documents and each has its own
   * marks. This paints; it never marks.
   */
  function syncReview(root) {
    var doc = baseSource();
    var key = reviewKeyFor(doc);
    if (key !== marksKey) {
      marksKey = key;
      marks = readStore(key);
      notes = readNotes(key);
      marksDirty = false;
      try { reviewing = localStorage.getItem(key + "|on") === "1"; } catch (e) {}
    }
    steps(root).forEach(paintNode);
    paintProgress();
    setReviewing(reviewing);
  }

  function closeBuild() {
    buildModal.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    if (buildOpener && buildOpener.focus) buildOpener.focus();
    buildOpener = null;
  }

  if (buildModal) {
    function showBuild(opener, focusStep) {
      fillPromptView();
      syncSourceButton();
      buildOpener = opener;
      buildModal.classList.add("is-open");
      document.body.classList.add("no-scroll");
      // Without this the dialog opens behind the reader's focus and Tab walks
      // straight into the page underneath it.
      var close = $("#build-close");
      if (close) close.focus();
      // "Read the prompt" is a different intent from "make one": it lands the
      // reader on step 1 rather than at the top of a three-step dialog. Deferred
      // a frame because the panel has no scroll height until it is displayed.
      if (focusStep) {
        requestAnimationFrame(function () {
          var t = $(focusStep);
          if (t && t.scrollIntoView) t.scrollIntoView({ block: "start" });
        });
      }
    }
    $$("[data-open-build]").forEach(function (b) {
      b.addEventListener("click", function () { showBuild(b, null); });
    });
    $$("[data-open-prompt]").forEach(function (b) {
      b.addEventListener("click", function () { showBuild(b, "#bstep-prompt"); });
    });
    buildModal.addEventListener("click", function (e) {
      if (e.target.closest(".modal-scrim") || e.target.closest("#build-close")) closeBuild();
    });
    var rb = $("#build-render"); if (rb) rb.addEventListener("click", renderFromInput);
    var sb = $("#build-source");
    if (sb) sb.addEventListener("click", function () {
      var doc = currentSource();
      if (!doc) { status("This page has no document open to edit.", "warn"); return; }
      var input = $("#build-input");
      input.value = JSON.stringify(doc, null, 2);
      input.scrollTop = 0;
      // Said once, on the one action where it matters. A rebuild is not a
      // review: nothing here moves meta.date, because moving it would make the
      // page assert a freshness nobody checked.
      status("Loaded this page's own document. Edit it and press Build my page. " +
        "meta.date is left alone \u2014 a rebuild is not a review, so change it " +
        "yourself only when you have actually re-checked the material.", "ok");
    });
    var eb = $("#build-example");
    if (eb) eb.addEventListener("click", function () {
      var rawEx = payload("wfd-starter");
      if (!rawEx || rawEx === "{}") { status("This page carries no example.", "error"); return; }
      $("#build-input").value = rawEx;
      status("Loaded a small example. Press Build my page.", "ok");
      $("#build-input").scrollTop = 0;
    });
    document.addEventListener("keydown", function (e) {
      if (!buildModal.classList.contains("is-open")) return;
      if (e.key === "Escape") { e.preventDefault(); closeBuild(); }
      if (e.key === "Tab") trapWithin(e, buildModal);
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); renderFromInput(); }
    });
  }

  /* ------------------------------------------------------------- theme */

  // Also inside the builder. The only theme control sat in the footer, which an
  // open builder covers — so a reader who wanted light mode while pasting a
  // document clicked the overlay and nothing happened, twice, silently.
  var themeBtn = $("#theme-toggle");
  if (themeBtn) {
    var stored = null;
    try { stored = localStorage.getItem("wfd-theme"); } catch (e) {}
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    var themeBtns = [themeBtn, $("#build-theme")].filter(Boolean);
    themeBtns.forEach(function (b) { b.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      if (!cur) {
        cur = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("wfd-theme", next); } catch (e) {}
    }); });
  }

  /* ----------------------------------------------------------- routing */
  //
  // A library file carries every example as JSON and paints one on demand, so
  // the whole collection is a single download instead of one file per example.

  var indexView = $("#index-view");
  var docView = $("#doc-view");
  var docCache = {};
  var currentDoc = null;

  function docById(id) {
    if (docCache[id]) return docCache[id];
    var el = document.querySelector('.wfd-doc[data-doc="' + id + '"]');
    if (!el) return null;
    try { docCache[id] = JSON.parse(el.textContent); } catch (e) { return null; }
    return docCache[id];
  }

  function showIndex() {
    if (!indexView) return;
    docView.hidden = true;
    docView.innerHTML = "";
    indexView.hidden = false;
    currentDoc = null;
    syncSourceButton();
    if (baseTitle) document.title = baseTitle;
  }

  function showDoc(id) {
    var doc = docById(id);
    if (!doc) { showIndex(); return; }
    // Set before the sheets are bound, not after. `bindDiagrams` calls
    // `syncReview`, which asks `baseSource()` which document is open in order to
    // key the reviewer's marks — and with this line at the end of the function
    // it got null, so every mark was painted and then silently dropped on the
    // way to localStorage.
    currentDoc = id;
    var build = window.WFD.buildDocument(doc);
    if (build.errors.length) {
      docView.innerHTML = '<div class="wrap" style="padding:60px 0"><h2>This example failed to build</h2></div>';
    } else {
      docView.innerHTML = window.WFD.renderDocBody(build);
      bindDiagrams(docView);
      markFreshness(docView);
      if (doc.title) document.title = doc.title;
    }
    if (indexView) indexView.hidden = true;
    docView.hidden = false;
    syncSourceButton();
    window.scrollTo(0, 0);
  }

  var baseTitle = document.title;

  function route() {
    if (!indexView) return false;                   // single-document file
    var h = location.hash.replace(/^#/, "");
    // Back out of a document and the hash returns to empty, not to "#/". Without
    // this branch the router did nothing and the reader was stranded on the page
    // they had just left.
    if (h === "") { showIndex(); return true; }
    if (h.indexOf("/") === 0) {
      var parts = h.slice(1).split("/");
      var id = parts[0];
      if (!id) { showIndex(); return true; }
      if (id !== currentDoc) showDoc(id);
      // "#/doc/uid" opens that panel, so a link to one survives a fresh load
      if (parts[1] && document.getElementById("d-" + parts[1])) openDetail(parts[1], false);
      return true;
    }
    return false;
  }

  window.addEventListener("hashchange", function () { route(); });

  /* -------------------------------------------------------- deep links */

  function openFromHash() {
    if (route()) return;
    var h = location.hash.replace("#", "");
    if (!h) return;
    if (document.getElementById("d-" + h)) {
      // Put the sheet behind the panel in the right place first. Landing
      // straight inside a modal after a reload was disorienting mostly because
      // closing it dropped the reader at the top of a document they had been
      // halfway down.
      var behind = document.getElementById(h);
      if (behind && behind.scrollIntoView) behind.scrollIntoView({ block: "center" });
      openDetail(h, false);
      return;
    }
    var el = document.getElementById(h);
    if (el) el.scrollIntoView();
  }
  window.addEventListener("hashchange", openFromHash);

  // Back closes the panel instead of leaving the document. The pushed entry is
  // what makes a back gesture mean "close this", which is what it means
  // everywhere else on a phone.
  window.addEventListener("popstate", function () {
    if (!modal.classList.contains("is-open")) return;
    var h = location.hash.replace(/^#\/?/, "");
    var uid = h.indexOf("/") > -1 ? h.slice(h.lastIndexOf("/") + 1) : h;
    if (!uid || !document.getElementById("d-" + uid)) closeDetail();
  });

  // Bind what is already in the page first. Routing renders a document and binds
  // it as it goes, so binding afterwards would attach a second listener to every
  // control it just created — walk would start and immediately end, and zoom
  // would step twice per click.
  bindDiagrams(document);
  markFreshness(document);
  syncSourceButton();
  if (indexView && !location.hash) showIndex();
  openFromHash();
  window.addEventListener("resize", function () {
    $$(".canvas").forEach(function (c) { if (!zoom[c.dataset.wf]) fit(c); });
  });
})();
