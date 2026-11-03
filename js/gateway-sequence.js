/* ==========================================================================
   NEBULA MUN 2026 — Phase 4: Gateway sequence controller
   State machine + DOM staging for the cinematic entrance.
   Stages: A "SIGNAL DETECTED" -> B "GATE ACTIVATION" -> C access panel
   -> EXIT (warp) -> homepage reveal. Skip control, footer replay,
   sessionStorage seen-flag, reduced-motion short path, full cleanup.
   Fails safe: any throw lifts the veil and reveals the homepage.
   ========================================================================== */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var STORE_KEY = "nebula.gateway.seen";
  var STAGE = { A: 0, B: 1, C: 2, EXIT: 3 };
  var INTRO = { PLAYING: 0, COMPLETED: 1, SKIPPED: 2 };
  var introState = INTRO.PLAYING;

  /* stage timings (ms) — kept short so nobody waits */
  var T = {
    fadeIn: 900,
    holdA: 2100,     /* signal detected */
    buildB: 2600,    /* gate activation */
    settleB: 500,
    exitWarp: 1250,
    veilFade: 850,
    reducedCut: 450
  };

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function sessionSeen() {
    try { return sessionStorage.getItem(STORE_KEY) === "1"; }
    catch (e) { return false; } /* storage may be blocked */
  }
  function markSeen() {
    try { sessionStorage.setItem(STORE_KEY, "1"); } catch (e) { /* ignore */ }
  }

  function boot() {
    var root = $("gateway");
    var canvas = $("gateway-canvas");
    if (!root || !canvas) return;

    var body = document.body;
    var mod = window.NEBULA_GATEWAY;
    if (!mod || !canvas.getContext) { revealSite(true); return; }

    var ctx = canvas.getContext("2d");
    if (!ctx) { revealSite(true); return; }

    var field = new mod.SpaceField();
    var gate = new mod.Gateway();
    var w = 0, h = 0;

    var state = {
      stage: STAGE.A,
      stageT: 0,
      running: false,
      raf: 0,
      last: 0,
      par: { x: 0, y: 0 },
      parT: { x: 0, y: 0 },
      exitRush: 0,
      reduce: reduced.matches
    };

    var ui = {
      signal: $("gw-signal"),
      title: $("gw-title"),
      panel: $("gw-panel"),
      skip: $("gw-skip"),
      enter: $("gw-enter")
    };

    var exitTimer = 0;

    /* ====================================================================
       Site reveal — the overlay is removed and the page rises into place
       ==================================================================== */
    var arriveTimer = 0;
    function revealSite(instant) {
      state.running = false;
      cancelAnimationFrame(state.raf);
      if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
      document.documentElement.style.overflow = "";
      body.classList.remove("gw-active");
      if (root.parentNode) root.parentNode.removeChild(root);
      try {
        window.dispatchEvent(new CustomEvent("nebula:gateway-complete", { detail: { intro: introState } }));
      } catch (e) { /* ignore */ }
      if (instant !== true) {
        body.classList.add("gw-arriving");
        if (arriveTimer) clearTimeout(arriveTimer);
        arriveTimer = setTimeout(function () {
          body.classList.remove("gw-arriving");
          arriveTimer = 0;
        }, 1500);
      }
    }

    /* keyboard users who leave the intro land at the top of the page */
    function handFocusBack() {
      var active = document.activeElement;
      if (active && root.contains(active)) {
        active.blur();
        var brand = document.querySelector(".brand");
        if (brand) brand.focus({ preventScroll: true });
      }
    }

    function showSkip(show) {
      if (ui.skip) ui.skip.classList.toggle("gw-hidden", !show);
    }

    function setStageUI(stage) {
      if (ui.signal) ui.signal.classList.toggle("is-live", stage === STAGE.A);
      if (ui.title) ui.title.classList.toggle("is-live", stage === STAGE.B);
      if (ui.panel) ui.panel.classList.toggle("is-live", stage === STAGE.C);
    }

    /* ====================================================================
       Canvas sizing
       ==================================================================== */
    function size() {
      var vw = window.innerWidth, vh = window.innerHeight;
      var dpr = clamp(window.devicePixelRatio || 1, 1, 1.75);
      w = Math.max(1, Math.round(vw * dpr));
      h = Math.max(1, Math.round(vh * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      field.reseed(w, h, dpr);
      gate.build(w * 0.5, h * 0.46, Math.min(w, h) * 0.155);
    }

    /* ====================================================================
       Main loop
       ==================================================================== */
    function frame(now) {
      if (!state.running) return;
      if (!state.last) state.last = now;
      var dt = clamp(now - state.last, 0, 64);
      state.last = now;

      state.par.x += (state.parT.x - state.par.x) * 0.05;
      state.par.y += (state.parT.y - state.par.y) * 0.05;

      state.stageT += dt;
      if (state.stage === STAGE.A) {
        var aLimit = state.reduce ? T.reducedCut : T.holdA + T.fadeIn;
        if (state.stageT >= aLimit) toStage(STAGE.B);
      } else if (state.stage === STAGE.B) {
        var bLimit = state.reduce ? 500 : T.buildB + T.settleB;
        if (state.stageT >= bLimit) toStage(STAGE.C);
      }

      draw(now);
      state.raf = requestAnimationFrame(frame);
    }

    function gateLevel() {
      var g = { core: 0.35, ring: 0.4, coreBoost: 1, exitRush: 0 };
      var t = state.last / 1000;
      if (state.stage === STAGE.A) return g;
      var bp = clamp(state.stageT / (state.reduce ? 500 : T.buildB), 0, 1);
      g.ring = lerp(0.4, 1, ease(bp));
      g.core = lerp(0.35, 1, ease(bp));
      if (state.stage >= STAGE.C) {
        g.ring = 1;
        g.core = state.reduce ? 1 : 0.92 + 0.08 * Math.sin(t * 0.8);
      }
      if (state.stage === STAGE.EXIT) {
        var ep = clamp(state.stageT / T.exitWarp, 0, 1);
        g.exitRush = ease(ep);
        g.core = lerp(1, 2.1, ep);
        g.coreBoost = lerp(1, 2.3, ep);
      }
      return g;
    }

    function draw(now) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#04050c";
      ctx.fillRect(0, 0, w, h);
      field.draw(ctx, now, state.par, state.reduce);
      gate.draw(ctx, w, h, now, state.par, gateLevel(), state.reduce);
    }

    /* ====================================================================
       Stage transitions + exit
       ==================================================================== */
    function toStage(stage) {
      state.stage = stage;
      state.stageT = 0;
      setStageUI(stage);
      if (stage === STAGE.C) showSkip(true);
    }

    function leave(fast) {
      if (state.stage === STAGE.EXIT) return;
      state.stage = STAGE.EXIT;
      state.stageT = 0;
      setStageUI(STAGE.EXIT);
      showSkip(false);
      var wait = fast ? 240 : Math.round(T.exitWarp * 0.55 + T.veilFade);
      exitTimer = setTimeout(function () {
        finalizeIntro(fast);
      }, wait);
    }

    function finalizeIntro(skipped) {
      introState = skipped ? INTRO.SKIPPED : INTRO.COMPLETED;
      markSeen();
      handFocusBack();
      revealSite(false);
      destroy();
    }

    /* ====================================================================
       Playback — (re)arms listeners each run; destroy() unwinds them
       ==================================================================== */
    var listeners = [];
    function on(el, type, fn, opts) {
      el.addEventListener(type, fn, opts);
      listeners.push([el, type, fn, opts]);
    }
    function destroy() {
      state.running = false;
      cancelAnimationFrame(state.raf);
      for (var i = 0; i < listeners.length; i++) {
        listeners[i][0].removeEventListener(listeners[i][1], listeners[i][2], listeners[i][3]);
      }
      listeners = [];
    }

    function play() {
      if (state.running) return;
      if (!root.parentNode) body.insertBefore(root, body.firstChild);

      state.stage = STAGE.A;
      state.stageT = 0;
      state.last = 0;
      state.exitRush = 0;
      state.reduce = reduced.matches;
      state.par.x = 0; state.par.y = 0;
      state.parT.x = 0; state.parT.y = 0;

      size();
      setStageUI(STAGE.A);
      showSkip(true);
      introState = INTRO.PLAYING;

      root.classList.remove("gw-run");
      void root.offsetWidth;
      root.classList.add("gw-run");

      root.hidden = false;
      root.removeAttribute("aria-hidden");
      body.classList.add("gw-active");
      document.documentElement.style.overflow = "hidden";

      listeners.forEach(function (l) {
        l[0].removeEventListener(l[1], l[2], l[3]);
      });
      listeners = [];

      on(ui.enter, "click", function () { leave(false); });
      on(ui.skip, "click", function () { leave(true); });
      on(document, "keydown", function (e) {
        if (e.key === "Escape") leave(true);
        else if (e.key === "Enter" && state.stage === STAGE.C) leave(false);
      });
      on(window, "pointermove", function (e) {
        if (state.reduce || (e.pointerType && e.pointerType !== "mouse")) return;
        state.parT.x = (e.clientX / window.innerWidth) * 2 - 1;
        state.parT.y = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });
      on(window, "resize", size);
      on(reduced, "change", function () {
        state.reduce = reduced.matches;
        if (state.reduce && state.stage === STAGE.A) toStage(STAGE.C);
      });

      state.running = true;
      state.raf = requestAnimationFrame(frame);

      /* keyboard entry point lands on the primary control */
      setTimeout(function () {
        if (!state.running) return;
        var target = state.reduce ? ui.enter : ui.skip;
        if (target) target.focus({ preventScroll: true });
      }, 700);
    }

    /* ====================================================================
       Boot behaviour
       ==================================================================== */
    if (state.reduce) {
      /* reduced motion: shorter stages, near-static composition */
      T.buildB = 700;
      T.exitWarp = 500;
      T.veilFade = 420;
    }

    /* footer replay control — delegated, survives every destroy() */
    document.addEventListener("click", function (e) {
      var trigger = e.target && e.target.closest && e.target.closest("[data-replay-gateway]");
      if (!trigger) return;
      e.preventDefault();
      play();
    });

    /* first open in this session: play; otherwise lift the veil at once */
    if (!sessionSeen()) {
      play();
    } else {
      revealSite(true);
    }

    /* exposed for automated verification */
    window.__GATEWAY_DEBUG__ = {
      state: state,
      play: play,
      leave: leave,
      T: T,
      root: function () { return root; }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();