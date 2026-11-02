/* ==========================================================================
   NEBULA MUN 2026 — custom animated cursor
   Small glowing core + smooth trailing ring. Magnetic attraction to
   buttons/interactive elements. Disabled on touch devices and under
   prefers-reduced-motion. Single RAF loop; cleaned up on page hide.
   ========================================================================== */
(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const isTouchOrReduced = coarsePointer.matches || reducedMotion.matches;
  if (isTouchOrReduced) return;

  const cursor = document.createElement("div");
  cursor.className = "cursor";
  cursor.setAttribute("aria-hidden", "true");

  const ring = document.createElement("div");
  ring.className = "cursor__ring";
  ring.setAttribute("aria-hidden", "true");

  document.body.appendChild(cursor);
  document.body.appendChild(ring);
  document.body.classList.add("cursor-ready");

  const state = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    rx: 0,
    ry: 0,
    visible: false,
    hovered: false,
    active: false,
    raf: null,
    last: 0
  };

  const magnets = [];
  const MAGNET_RADIUS = 140;
  const MAGNET_STRENGTH = 0.18;

  function collectMagnets() {
    magnets.length = 0;
    document.querySelectorAll(
      "a, button, [role=button], input, select, textarea, .galaxy__node, [data-magnetic]"
    ).forEach(function (el) {
      if (!document.body.contains(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      magnets.push({
        el: el,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        w: rect.width,
        h: rect.height,
        enter() {
          if (!state.hovered) {
            state.hovered = true;
            cursor.classList.add("is-hovered");
            ring.classList.add("is-hovered");
          }
        },
        leave() {
          const still = magnets.some(function (m) {
            if (m === el) return false;
            const r2 = m.el.getBoundingClientRect();
            return (
              state.x >= r2.left &&
              state.x <= r2.right &&
              state.y >= r2.top &&
              state.y <= r2.bottom
            );
          });
          if (!still && state.hovered) {
            state.hovered = false;
            cursor.classList.remove("is-hovered");
            ring.classList.remove("is-hovered");
          }
        }
      });
    });
  }

  function updateMagnetHover(x, y) {
    let insideAny = false;
    for (let i = 0; i < magnets.length; i++) {
      const m = magnets[i];
      const r = m.el.getBoundingClientRect();
      const inRect = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (inRect) {
        insideAny = true;
        m.enter();
      } else {
        m.leave();
      }
    }
    if (!insideAny && state.hovered) {
      state.hovered = false;
      cursor.classList.remove("is-hovered");
      ring.classList.remove("is-hovered");
    }
  }

  function applyMagnetism(x, y) {
    let mx = 0;
    let my = 0;
    let influence = 0;
    for (let i = 0; i < magnets.length; i++) {
      const m = magnets[i];
      const dx = m.cx - x;
      const dy = m.cy - y;
      const dist = Math.hypot(dx, dy);
      if (dist < MAGNET_RADIUS) {
        const force = (1 - dist / MAGNET_RADIUS) * MAGNET_STRENGTH;
        mx += dx * force;
        my += dy * force;
        influence = Math.max(influence, force);
      }
    }
    state.rx += mx * 0.15;
    state.ry += my * 0.15;
    // damp magnetism
    state.rx *= 0.88;
    state.ry *= 0.88;
  }

  function loop(now) {
    if (!state.raf) return;
    if (!state.last) state.last = now;
    const dt = Math.min(0.05, Math.max(0, (now - state.last) / 1000));
    state.last = now;

    // ease cursor toward target (trailing feel)
    state.x += (state.tx - state.x) * 0.14;
    state.y += (state.ty - state.y) * 0.14;
    state.rx += 0;
    state.ry += 0;

    cursor.style.transform =
      "translate(" +
      (state.x + state.rx - cursor.offsetWidth / 2).toFixed(2) +
      "px, " +
      (state.y + state.ry - cursor.offsetHeight / 2).toFixed(2) +
      "px)";
    ring.style.transform =
      "translate(" +
      (state.x + state.rx - ring.offsetWidth / 2).toFixed(2) +
      "px, " +
      (state.y + state.ry - ring.offsetHeight / 2).toFixed(2) +
      "px)";

    updateMagnetHover(state.x, state.y);
    applyMagnetism(state.x, state.y);

    state.raf = requestAnimationFrame(loop);
  }

  function start() {
    if (state.raf) return;
    cursor.style.opacity = "1";
    ring.style.opacity = "1";
    state.visible = true;
    state.last = 0;
    state.raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(state.raf);
    state.raf = null;
    state.visible = false;
    cursor.style.opacity = "0";
    ring.style.opacity = "0";
  }

  document.addEventListener("pointermove", function (e) {
    if (!state.visible) start();
    state.tx = e.clientX;
    state.ty = e.clientY;
  });

  document.addEventListener("pointerenter", start);
  document.addEventListener("pointerleave", stop);

  // click active state
  document.addEventListener("mousedown", function () {
    state.active = true;
    cursor.classList.add("is-active");
  });
  document.addEventListener("mouseup", function () {
    state.active = false;
    cursor.classList.remove("is-active");
  });

  // re-collect magnets on resize / nav open
  let resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(collectMagnets, 150);
  });
  document.addEventListener("nebula:gateway-complete", collectMagnets);
  document.addEventListener("nebula:world-closed", collectMagnets);

  // start after first interaction so we don't steal focus / cause layout shift
  let started = false;
  document.addEventListener(
    "pointermove",
    function () {
      if (!started) {
        started = true;
        start();
        collectMagnets();
      }
    },
    { once: true }
  );
})();
