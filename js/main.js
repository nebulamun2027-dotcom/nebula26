/* ==========================================================================
   NEBULA MUN 2026 - interaction layer
   Star field, live countdown, reveal-on-scroll, scroll-spy nav,
   mobile menu, and card tilt. All motion honors prefers-reduced-motion.
   ========================================================================== */

(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");

  /* ---------- 1. Star field (canvas) ---------- */
  const canvas = document.getElementById("starfield");
  const ctx = canvas ? canvas.getContext("2d") : null;
  let stars = [];
  let rafId = null;
  let loopStart = 0;

  function sizeCanvas() {
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Star colors: white / electric blue / violet
  function pickStarRgb() {
    const roll = Math.random();
    if (roll < 0.12) return "183, 169, 255";
    if (roll < 0.62) return "233, 236, 246";
    return "92, 157, 255";
  }

  function buildStars() {
    const count = Math.min(340, Math.round((window.innerWidth * window.innerHeight) / 4000));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.4 + Math.random() * 1.3,
      base: 0.3 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.4,
      depth: 0.25 + Math.random() * 0.75,
      rgb: pickStarRgb()
    }));
  }

  /* pointer-driven depth (layer 6): eased parallax, fine pointers only */
  const par = { x: 0, y: 0 };
  const parTarget = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    if (reducedMotion.matches || !finePointer.matches) return;
    parTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    parTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  const shooters = []; // occasional soft light streaks (layer 5)

  function drawFrame(time) {
    if (!ctx) return;
    const t = time / 1000;
    const reduce = reducedMotion.matches;
    const gw = window.innerWidth, gh = window.innerHeight;

    /* layer 1+6: ease parallax toward pointer (restrained depth) */
    par.x += (parTarget.x - par.x) * 0.05;
    par.y += (parTarget.y - par.y) * 0.05;

    ctx.clearRect(0, 0, gw, gh);

    /* layer 4: subtle pulsing galactic light source (upper-right) */
    const pulse = reduce ? 0.5 : 0.45 + 0.25 * Math.sin(t * 0.55);
    const gx = gw * 0.78, gy = gh * 0.24;
    const gr = Math.min(gw, gh) * 0.6;
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    gg.addColorStop(0, `rgba(150, 140, 240, ${(0.16 * pulse).toFixed(3)})`);
    gg.addColorStop(0.55, `rgba(110, 130, 250, ${(0.09 * pulse).toFixed(3)})`);
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);

    /* layer 1: stars with parallax offset by depth */
    for (const s of stars) {
      const alpha = s.base * (reduce ? 0.7 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
      const px = -par.x * 18 * s.depth;
      const py = -par.y * 12 * s.depth;
      if (alpha > 0.02) {
        ctx.beginPath();
        ctx.arc(s.x + px, s.y + py, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.rgb}, ${alpha.toFixed(3)})`;
        ctx.fill();
      }
    }

    /* layer 5: occasional soft shooting stars (reduced motion skips) */
    if (!reduce) {
      if (Math.random() < 0.005 && shooters.length < 2) {
        shooters.push({
          x: Math.random() * gw,
          y: Math.random() * gh * 0.35,
          vx: 240 + Math.random() * 220,
          vy: 60 + Math.random() * 120,
          life: 0,
          max: 0.7 + Math.random() * 0.5
        });
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const sh = shooters[i];
        sh.life += 1 / 60;
        if (sh.life > sh.max) { shooters.splice(i, 1); continue; }
        sh.x += sh.vx / 60;
        sh.y += sh.vy / 60;
        const fade = Math.sin((sh.life / sh.max) * Math.PI);
        const grad = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 0.09, sh.y - sh.vy * 0.09);
        grad.addColorStop(0, `rgba(220, 226, 255, ${(0.6 * fade).toFixed(3)})`);
        grad.addColorStop(1, "rgba(220,226,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 0.09, sh.y - sh.vy * 0.09);
        ctx.stroke();
      }
    }
  }

  function frame(now) {
    drawFrame(now - loopStart);
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (rafId !== null) return;
    loopStart = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function staticStars() {
    // Reduced motion: a single calm frame, no looping twinkle
    stopLoop();
    drawFrame(1.0);
  }

  function applyMotionMode() {
    if (reducedMotion.matches) {
      staticStars();
      document.querySelectorAll("[data-tilt]").forEach((c) => (c.style.transform = ""));
    } else {
      startLoop();
    }
  }

  if (ctx) {
    sizeCanvas();
    buildStars();
    applyMotionMode();
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        sizeCanvas();
        buildStars();
        applyMotionMode();
      }, 150);
    });
    reducedMotion.addEventListener("change", applyMotionMode);
    // If the new 3D cosmos is active, hide/disable the legacy 2D starfield
    window.addEventListener("nebula:cosmos-ready", function () {
      stopLoop();
      if (canvas) canvas.style.display = "none";
    }, { once: true });
  }

  /* ---------- 2. Live countdown to 26 December 2026 (IST midnight) ---------- */
  const TARGET = new Date("2026-12-26T00:00:00+05:30");

  const cdDays = document.getElementById("cd-days");
  const cdHours = document.getElementById("cd-hours");
  const cdMins = document.getElementById("cd-mins");
  const cdSecs = document.getElementById("cd-secs");

  function setVal(el, n) {
    if (el) el.textContent = String(n).padStart(2, "0");
  }

  function tick() {
    let diff = TARGET - new Date();
    if (diff < 0) diff = 0;
    setVal(cdDays, Math.floor(diff / 86400000));
    setVal(cdHours, Math.floor((diff % 86400000) / 3600000));
    setVal(cdMins, Math.floor((diff % 3600000) / 60000));
    setVal(cdSecs, Math.floor((diff % 60000) / 1000));
  }
  tick();
  setInterval(tick, 1000);

  /* ---------- 3. Reveal on scroll (cinematic, staggered, parallax) ---------- */
  const revealEls = document.querySelectorAll("[data-reveal]");
  const ioOptions = { threshold: 0.12, rootMargin: "0px 0px -8% 0px" };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          const delay = el.dataset.delay;
          if (delay) el.style.setProperty("--reveal-delay", delay + "ms");
          el.classList.add("is-visible");
          io.unobserve(el);
        }
      },
      ioOptions
    );
    /* staggered groups: children reveal one after another */
    document.querySelectorAll("[data-reveal-stagger]").forEach((group) => {
      const children = Array.from(
        group.querySelectorAll("[data-reveal]")
      );
      children.forEach((child, i) => {
        child.style.setProperty("--reveal-delay", (i * 120) + "ms");
      });
      io.observe(group);
    });
    revealEls.forEach((el) => {
      if (reducedMotion.matches) el.classList.add("is-visible");
      else io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* subtle parallax on reveal elements that carry data-reveal-parallax */
  if (!reducedMotion.matches && finePointer.matches) {
    const parallaxEls = document.querySelectorAll("[data-reveal-parallax]");
    const pState = { y: 0, ty: 0 };
    window.addEventListener("scroll", () => {
      pState.ty = window.scrollY;
    }, { passive: true });
    (function pLoop() {
      pState.y += (pState.ty - pState.y) * 0.06;
      parallaxEls.forEach((el) => {
        const strength = parseFloat(el.dataset.revealParallax || "0.06");
        const offset = pState.y * strength;
        el.style.transform = "translateY(" + offset.toFixed(2) + "px)";
      });
      window.requestAnimationFrame(pLoop);
    })();
  }

  /* ---------- 4. Mobile navigation menu ---------- */
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");

  function setMenu(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  if (toggle) {
    toggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));

    document.querySelectorAll(".nav__links a, .nav__menu .btn").forEach((a) => {
      a.addEventListener("click", () => setMenu(false));
    });

    document.addEventListener("click", (e) => {
      if (nav.classList.contains("is-open") && !nav.contains(e.target)) setMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("is-open")) setMenu(false);
    });
  }

  /* ---------- 5. Scroll-spy: highlight the active section in nav ---------- */
  const spyTargets = document.querySelectorAll("main section[id], footer#contact");
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.id;
          document.querySelectorAll(".nav__links a").forEach((a) => {
            const isActive = a.getAttribute("href") === "#" + id;
            a.classList.toggle("is-active", isActive);
          });
        }
      },
      { rootMargin: "-35% 0px -55% 0px" }
    );
    spyTargets.forEach((s) => spy.observe(s));
  }

  /* ---------- 6. Subtle 3D tilt on committee cards (fine pointers only) ---------- */
  function initTilt() {
    if (reducedMotion.matches || !finePointer.matches) return;
    document.querySelectorAll("[data-tilt]").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(700px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg) translateY(-2px)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });
    });
  }
  initTilt();
  reducedMotion.addEventListener("change", () => {
    if (!reducedMotion.matches && finePointer.matches) initTilt();
  });
})();
