/* ==========================================================================
   NEBULA MUN 2026 — Astronaut mascot overlay
   A detailed Three.js character rendered on a fixed overlay canvas.
   Walks, sits, floats, waves and reacts to the cursor across the page.
   Reuses the page's shared Three.js instance when available; otherwise
   boots its own lightweight renderer. Honors prefers-reduced-motion.
   ========================================================================== */
(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  if (reducedMotion.matches || coarsePointer.matches) return;

  const canvas = document.getElementById("astronaut-canvas");
  if (!canvas) return;

  // ---------- Three.js instance (shared or standalone) ----------
  let THREE = window.THREE;
  let renderer = null, scene = null, camera = null;
  let ownRenderer = false;

  function ensureThree() {
    if (!THREE) {
      THREE = window.THREE;
    }
    if (!THREE) return false;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      ownRenderer = true;
    }
    if (!scene) {
      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x04050c, 5, 40);
    }
    if (!camera) {
      camera = new THREE.OrthographicCamera(
        window.innerWidth / -2, window.innerWidth / 2,
        window.innerHeight / 2, window.innerHeight / -2,
        -100, 100
      );
      camera.position.set(0, 0, 30);
    }
    return true;
  }

  // ---------- material helpers ----------
  const suitWhite = 0xe8ecf4;
  const suitGrey = 0x8a94a6;
  const visorDark = 0x0b1220;
  const gloveDark = 0x4a5568;
  const gold = 0xc9a227;

  function matStandard(color, opts) {
    const o = opts || {};
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(o.color !== undefined ? o.color : color),
      roughness: o.roughness !== undefined ? o.roughness : 0.55,
      metalness: o.metalness !== undefined ? o.metalness : 0.25,
      emissive: new THREE.Color(o.emissive || 0x000000),
      emissiveIntensity: o.emissiveIntensity !== undefined ? o.emissiveIntensity : 0,
      transparent: !!o.transparent,
      opacity: o.opacity !== undefined ? o.opacity : 1,
      flatShading: !!o.flat
    });
  }

  function matGlow(color, opacity) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
  }

  // ---------- build the astronaut character ----------
  let astro = null; // { group, parts: {...}, actions: {...} }

  function buildAstronaut() {
    const group = new THREE.Group();
    const parts = {};

    // --- Helmet ---
    const helmet = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 32, 24, 0, Math.PI * 2, 0, 1.55),
      matStandard(suitWhite, { roughness: 0.3, metalness: 0.35 })
    );
    dome.scale.set(1, 1, 0.92);
    dome.position.y = 0.25;
    helmet.add(dome);
    const neckRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.16, 16, 40),
      matStandard(suitGrey, { metalness: 0.7, roughness: 0.25 })
    );
    neckRing.rotation.x = Math.PI / 2;
    helmet.add(neckRing);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(1.75, 32, 24, 0, Math.PI * 2, 0, 1.55),
      matStandard(visorDark, { roughness: 0.05, metalness: 0.95, transparent: true, opacity: 0.55 })
    );
    visor.position.z = 0.6;
    visor.scale.set(1, 1, 0.05);
    visor.userData.visor = true;
    helmet.add(visor);
    const visorGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1.82, 32, 24, 0, Math.PI * 2, 0, 1.55),
      matGlow(0xb7a9ff, 0.35)
    );
    visorGlow.position.z = 0.62;
    visorGlow.scale.set(1, 1, 0.02);
    helmet.add(visorGlow);
    helmet.position.y = 5.6;
    group.add(helmet);
    parts.helmet = helmet;
    parts.visor = visor;
    parts.visorGlow = visorGlow;

    // --- Suit torso ---
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.75, 4.4, 24),
      matStandard(suitWhite, { roughness: 0.6, metalness: 0.2 })
    );
    torso.position.y = 2.4;
    const chestBand = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.09, 12, 60),
      matStandard(gold, { metalness: 0.85, roughness: 0.25 })
    );
    chestBand.rotation.x = Math.PI / 2;
    chestBand.position.y = 0.1;
    torso.add(chestBand);
    const zipper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
      matStandard(gold, { metalness: 0.9, roughness: 0.1 })
    );
    zipper.position.set(0, 0, 1.71);
    torso.add(zipper);
    group.add(torso);
    parts.torso = torso;

    // --- Arms ---
    function makeArm(side) {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.34, 2.4, 16),
        matStandard(suitWhite, { roughness: 0.6, metalness: 0.2 })
      );
      upper.position.set(side * 1.05, 1.1, 0);
      upper.rotation.z = side * 0.25;
      arm.add(upper);
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.3, 1.7, 12),
        matStandard(suitWhite, { roughness: 0.6, metalness: 0.2 })
      );
      lower.position.set(side * 1.45, -1.35, 0);
      lower.rotation.z = side * 0.15;
      arm.add(lower);
      const glove = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 16, 12),
        matStandard(gloveDark, { roughness: 0.5, metalness: 0.4 })
      );
      glove.position.set(side * 1.68, -2.5, 0);
      arm.add(glove);
      arm.userData = { side: side, upper: upper, lower: lower, glove: glove,
        baseZ: side * 0.25, baseLowerZ: side * 0.15 };
      return arm;
    }
    const armL = makeArm(-1);
    const armR = makeArm(1);
    armL.position.y = 3.6;
    armR.position.y = 3.6;
    group.add(armL);
    group.add(armR);
    parts.armL = armL;
    parts.armR = armR;

    // --- Legs ---
    function makeLeg(side) {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.42, 2.6, 16),
        matStandard(suitWhite, { roughness: 0.6, metalness: 0.2 })
      );
      thigh.position.set(side * 0.55, -1.05, 0);
      leg.add(thigh);
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.36, 2.4, 14),
        matStandard(suitWhite, { roughness: 0.6, metalness: 0.2 })
      );
      shin.position.set(side * 0.55, -3.75, 0);
      leg.add(shin);
      const boot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52, 0.58, 1.4, 14),
        matStandard(gloveDark, { roughness: 0.5, metalness: 0.4 })
      );
      boot.position.set(side * 0.55, -5.25, 0);
      leg.add(boot);
      leg.userData = { side: side, thigh: thigh, shin: shin, boot: boot };
      return leg;
    }
    const legL = makeLeg(-1);
    const legR = makeLeg(1);
    legL.position.y = 0.3;
    legR.position.y = 0.3;
    group.add(legL);
    group.add(legR);
    parts.legL = legL;
    parts.legR = legR;

    // --- Backpack ---
    const backpack = new THREE.Group();
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 2.2, 0.7),
      matStandard(suitGrey, { metalness: 0.6, roughness: 0.35 })
    );
    pack.position.y = 0.55;
    pack.position.z = 1.25;
    backpack.add(pack);
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.4, 10),
      matStandard(suitGrey, { metalness: 0.6, roughness: 0.35 })
    );
    tube.position.set(0.5, 1.6, 1.55);
    tube.rotation.z = 0.3;
    backpack.add(tube);
    backpack.position.y = 4.4;
    group.add(backpack);
    parts.backpack = backpack;

    // --- Floating antenna ---
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8),
      matStandard(gold, { metalness: 0.9, roughness: 0.1 })
    );
    antenna.position.set(0.9, 6.9, 0.6);
    antenna.rotation.z = -0.3;
    group.add(antenna);
    parts.antenna = antenna;

    group.scale.setScalar(0.85);
    group.position.y = 0;
    scene.add(group);
    astro = { group: group, parts: parts };
  }

  // ---------- behavior system ----------
  const state = {
    enabled: true,
    mode: "idle", // idle, walking, sitting, floating, waving, reacting
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    targetX: window.innerWidth / 2,
    targetY: window.innerHeight / 2,
    vx: 0,
    vy: 0,
    dir: 1, // 1 = right, -1 = left
    phase: 0,
    time: 0,
    timer: 0,
    nextAction: 0,
    reactTimer: 0,
    visible: true
  };

  // mode configs
  const MODES = {
    idle: { min: 1.5, max: 4 },
    walking: { min: 2, max: 5 },
    sitting: { min: 3, max: 6 },
    floating: { min: 4, max: 8 },
    waving: { min: 1, max: 2 },
    reacting: { min: 0.6, max: 1.2 }
  };

  function pickMode() {
    const keys = Object.keys(MODES);
    const w = { idle: 25, walking: 20, sitting: 15, floating: 12, waving: 8, reacting: 10 };
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const k of keys) {
      r -= w[k];
      if (r <= 0) return k;
    }
    return "idle";
  }

  function scheduleNext() {
    const m = MODES[state.mode];
    state.timer = 0;
    state.nextAction = rand(m.min, m.max);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // ---------- animation helpers ----------
  function easeBack(t) { return t * t * (2.7 * t - 1.7); }

  function updateWalk(dt) {
    const p = astro.parts;
    state.phase += dt * 6;
    const s = Math.sin(state.phase);
    const c = Math.cos(state.phase);
    // torso bob
    astro.group.position.y = Math.abs(s) * 0.15;
    // legs cycle
    p.legL.thigh.rotation.x = -s * 0.35;
    p.legR.thigh.rotation.x = s * 0.35;
    p.legL.shin.rotation.x = s > 0 ? s * 0.5 : 0;
    p.legR.shin.rotation.x = s < 0 ? -s * 0.5 : 0;
    // arms counter-cycle
    p.armL.upper.rotation.z = p.armL.baseZ + c * 0.3;
    p.armR.upper.rotation.z = p.armR.baseZ - c * 0.3;
    p.armL.lower.rotation.z = p.armL.baseLowerZ + c * 0.2;
    p.armR.lower.rotation.z = p.armR.baseLowerZ - c * 0.2;
    // head look around
    p.helmet.rotation.y = Math.sin(state.time * 1.3) * 0.12;
    p.helmet.rotation.x = Math.cos(state.time * 0.9) * 0.08;
  }

  function updateSit(dt) {
    const p = astro.parts;
    // legs dangling
    p.legL.thigh.rotation.x = 0.25 + Math.sin(state.time * 2) * 0.05;
    p.legR.thigh.rotation.x = 0.25 + Math.sin(state.time * 2 + 1) * 0.05;
    p.legL.shin.rotation.x = -0.4;
    p.legR.shin.rotation.x = -0.4;
    p.legL.position.y = -0.6;
    p.legR.position.y = -0.6;
    // arms resting
    p.armL.upper.rotation.z = p.armL.baseZ + 0.5;
    p.armR.upper.rotation.z = p.armR.baseZ - 0.5;
    p.armL.lower.rotation.z = p.armL.baseLowerZ + 0.3;
    p.armR.lower.rotation.z = p.armR.baseLowerZ - 0.3;
    // head curious look
    p.helmet.rotation.y = Math.sin(state.time * 1.1) * 0.15;
    p.helmet.rotation.x = -0.1 + Math.cos(state.time * 0.8) * 0.06;
  }

  function updateFloat(dt) {
    const p = astro.parts;
    const bob = Math.sin(state.time * 1.2) * 0.12;
    astro.group.position.y = bob;
    astro.group.rotation.z = Math.sin(state.time * 0.7) * 0.06;
    p.legL.thigh.rotation.x = 0.1;
    p.legR.thigh.rotation.x = 0.1;
    p.legL.shin.rotation.x = 0;
    p.legR.shin.rotation.x = 0;
    p.armL.upper.rotation.z = p.armL.baseZ + Math.sin(state.time) * 0.2;
    p.armR.upper.rotation.z = p.armR.baseZ - Math.sin(state.time) * 0.2;
    p.helmet.rotation.y = Math.sin(state.time * 1.3) * 0.1;
    p.helmet.rotation.x = Math.cos(state.time * 0.9) * 0.05;
  }

  function updateWave(dt) {
    const p = astro.parts;
    const t = state.time;
    // right arm waves up
    const wave = Math.min(1, Math.sin((t % 2) * Math.PI));
    p.armR.upper.rotation.z = p.armR.baseZ - 1.0 + wave * 0.8;
    p.armR.lower.rotation.z = p.armR.baseLowerZ - 0.3 + wave * 0.4;
    p.armL.upper.rotation.z = p.armL.baseZ + 0.3;
    p.armL.lower.rotation.z = p.armL.baseLowerZ + 0.2;
    p.legL.thigh.rotation.x = 0.05;
    p.legR.thigh.rotation.x = 0.05;
    p.helmet.rotation.y = -0.15;
    p.helmet.rotation.x = 0.05;
    // visor flash
    if (Math.floor(t * 8) % 2 === 0) {
      p.visor.material.opacity = 0.45;
    } else {
      p.visor.material.opacity = 0.55;
    }
  }

  function updateReact(dt) {
    const p = astro.parts;
    // look at cursor
    const dx = state.cursorX - astro.group.position.x * (window.innerWidth / 40);
    const dy = -(state.cursorY - astro.group.position.y * (window.innerHeight / 40));
    const targetYaw = Math.atan2(dx, -dy) * 0.3;
    p.helmet.rotation.y = THREE.MathUtils.lerp(p.helmet.rotation.y, targetYaw, dt * 4);
    p.helmet.rotation.x = THREE.MathUtils.lerp(p.helmet.rotation.x, -dy * 0.001, dt * 4);
    // slight body lean
    astro.group.rotation.z = THREE.MathUtils.lerp(astro.group.rotation.z, -dx * 0.0005, dt * 4);
    p.legL.thigh.rotation.x = 0.1;
    p.legR.thigh.rotation.x = 0.1;
    p.armL.upper.rotation.z = p.armL.baseZ + 0.2;
    p.armR.upper.rotation.z = p.armR.baseZ - 0.2;
  }

  function getModeUpdate(mode) {
    return { idle: updateWalk, walking: updateWalk, sitting: updateSit, floating: updateFloat, waving: updateWave, reacting: updateReact }[mode];
  }

  // ---------- main loop ----------
  let last = 0;
  let raf = null;
  let cursorX = window.innerWidth / 2;
  let cursorY = window.innerHeight / 2;

  function loop(now) {
    if (!state.enabled) return;
    raf = requestAnimationFrame(loop);
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.time += dt;
    state.timer += dt;

    const mUpdate = getModeUpdate(state.mode);
    if (mUpdate) mUpdate(dt);

    // move position toward target with easing
    astro.group.position.x += (state.targetX - astro.group.position.x) * 0.06;
    astro.group.position.y += (state.targetY - astro.group.position.y) * 0.06;

    // facing direction
    if (state.targetX > astro.group.position.x + 5) state.dir = 1;
    else if (state.targetX < astro.group.position.x - 5) state.dir = -1;
    astro.group.scale.x = Math.abs(astro.group.scale.x) * state.dir;

    // cursor reaction proximity
    const dx = cursorX - (window.innerWidth / 2 + astro.group.position.x);
    const dy = cursorY - (window.innerHeight / 2 - astro.group.position.y);
    const dist = Math.hypot(dx, dy);
    if (dist < 120 && state.mode !== "reacting") {
      state.mode = "reacting";
      state.reactTimer = 0;
      scheduleNext();
    } else if (state.mode === "reacting") {
      state.reactTimer += dt;
      if (state.reactTimer > state.nextAction || dist > 160) {
        state.mode = pickMode();
        scheduleNext();
      }
    } else {
      state.timer += dt;
      if (state.timer > state.nextAction) {
        state.mode = pickMode();
        scheduleNext();
        // set target for walking/sitting/floating
        if (state.mode === "walking") {
          state.targetX = rand(60, window.innerWidth - 60);
          state.targetY = rand(window.innerHeight * 0.35, window.innerHeight * 0.85);
        } else if (state.mode === "sitting") {
          state.targetX = rand(80, window.innerWidth - 80);
          state.targetY = rand(window.innerHeight * 0.5, window.innerHeight * 0.8);
        } else if (state.mode === "floating") {
          state.targetX = rand(100, window.innerWidth - 100);
          state.targetY = rand(window.innerHeight * 0.15, window.innerHeight * 0.55);
        } else {
          // idle / waving: small jitter
          state.targetX = astro.group.position.x + rand(-30, 30);
          state.targetY = astro.group.position.y + rand(-30, 30);
        }
      }
    }

    // render
    renderer.render(scene, camera);
  }

  // ---------- input ----------
  window.addEventListener("pointermove", (e) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
  }, { passive: true });

  // ---------- lifecycle ----------
  function start() {
    if (!ensureThree()) return;
    if (!astro) buildAstronaut();
    // initial position
    state.x = window.innerWidth * 0.75;
    state.y = window.innerHeight * 0.7;
    state.targetX = state.x;
    state.targetY = state.y;
    astro.group.position.set(state.x - window.innerWidth / 2, -(state.y - window.innerHeight / 2), 0);
    state.mode = pickMode();
    scheduleNext();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    state.enabled = false;
  }

  function onResize() {
    if (!renderer || !camera) return;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.left = window.innerWidth / -2;
    camera.right = window.innerWidth / 2;
    camera.top = window.innerHeight / 2;
    camera.bottom = window.innerHeight / -2;
    camera.updateProjectionMatrix();
  }

  function pause() { state.enabled = false; }
  function resume() {
    if (state.enabled && astro) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else if (astro) resume();
  });
  document.addEventListener("nebula:world-closed", () => {
    // astronaut stays visible; nothing to reset
  });

  // deferred start after page paint
  requestAnimationFrame(() => {
    setTimeout(start, 500);
  });

  // expose for debugging
  window.__ASTRO_DEBUG__ = { start, stop, pause, resume, state: () => state };

})();
