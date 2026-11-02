/* ==========================================================================
   NEBULA MUN 2026 — the eight committee worlds
   A single shared Three.js renderer/overlay powers every committee
   destination. Selecting a node in the Galaxy Archive opens that world:
   the rest of the map recedes, a short theme-specific startup plays, and
   the existing mission dossier is revealed as a cinematic card.

   The visual identity for each world lives in js/committee-themes.js.
   Committee names, agendas, fees and portfolios always come from
   js/data.js (the caller passes the authoritative record in).

   Performance: one WebGL context, capped DPR, pause when the tab is
   hidden, full scene disposal on exit, and a CSS-only fallback when
   Three.js/WebGL is unavailable. Reduced motion renders a single frame.
   ========================================================================== */
(function () {
  "use strict";

  const root = document.getElementById("committee-world");
  const canvas = document.getElementById("committee-world-canvas");
  if (!root || !canvas) return;

  const $ = (sel, scope) => (scope || root).querySelector(sel);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");

  const parchment = {
    startup: $("#world-startup"),
    eyebrow: $("#world-startup-eyebrow"),
    title: $("#world-startup-title"),
    line: $("#world-startup-line"),
    hudCode: $("#world-hud-code"),
    hudStatus: $("#world-hud-status"),
    hudMeta: $("#world-hud-meta"),
    coord: $("#world-coord"),
    exit: $("#world-exit"),
    slot: $("#world-dossier-slot"),
    dossier: document.getElementById("dossier"),
    sheet: document.getElementById("sheet")
  };

  const state = {
    open: false,
    closing: false,
    ready: false,
    fallback: false,
    current: null,
    onReveal: null,
    enterT: 0,
    elapsed: 0,
    raf: null,
    last: 0,
    revealTimer: 0,
    exitTimer: 0,
    reduced: reducedMotion.matches,
    lastFocus: null,
    dossierHome: null
  };

  let THREE = window.THREE;
  let renderer = null;
  let scene = null;
  let camera = null;
  let worldUpdate = null;
  let transition = null;
  let baseCamera = null;
  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a || 0.0001), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function setText(el, value) { if (el) el.textContent = value; }

  /* ======================================================================
     renderer + scene
     ====================================================================== */
  function dprCap() {
    return Math.min(window.devicePixelRatio || 1, coarsePointer.matches ? 1.25 : 1.6);
  }

  function initRenderer() {
    if (renderer) return true;
    THREE = window.THREE;
    if (!THREE) { state.fallback = true; return false; }
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: !coarsePointer.matches,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false
      });
      renderer.setPixelRatio(dprCap());
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      canvas.addEventListener("webglcontextlost", function (e) {
        e.preventDefault();
        dropToFallback();
      });
      return true;
    } catch (err) {
      if (window.console) console.warn("[committee-worlds] WebGL unavailable:", (err && err.message) || err);
      state.fallback = true;
      renderer = null;
      return false;
    }
  }

  function dropToFallback() {
    state.fallback = true;
    stopLoop();
    root.classList.add("is-fallback");
    if (renderer) {
      try { renderer.dispose(); } catch (e) { /* ignore */ }
      renderer = null;
    }
    if (state.open) {
      window.clearTimeout(state.revealTimer);
      state.revealTimer = window.setTimeout(revealNow, 900);
    }
  }

  function disposeScene() {
    if (!scene) return;
    scene.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!mat) continue;
          for (const key in mat) {
            const value = mat[key];
            if (value && value.isTexture) value.dispose();
          }
          mat.dispose();
        }
      }
    });
    scene = null;
    camera = null;
    worldUpdate = null;
    transition = null;
  }

  /* ======================================================================
     small shared 3D helpers
     ====================================================================== */
  function makeGlowTexture(core, mid) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, core);
    g.addColorStop(0.34, mid);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeGlow(colorHex, size, opacity) {
    const tex = makeGlowTexture("rgba(255,255,255,0.95)", colorHex);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: 0xffffff,
      transparent: true,
      opacity: opacity != null ? opacity : 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  function standard(colorHex, opts) {
    const o = opts || {};
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(o.color || colorHex),
      roughness: o.roughness != null ? o.roughness : 0.55,
      metalness: o.metalness != null ? o.metalness : 0.35,
      emissive: new THREE.Color(o.emissive || colorHex),
      emissiveIntensity: o.emissiveIntensity != null ? o.emissiveIntensity : 0.12,
      transparent: !!o.transparent,
      opacity: o.opacity != null ? o.opacity : 1,
      side: o.side || THREE.FrontSide,
      flatShading: !!o.flat,
      depthWrite: o.depthWrite != null ? o.depthWrite : true
    });
  }

  function additive(colorHex, opacity, side) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: opacity != null ? opacity : 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: side || THREE.DoubleSide,
      fog: false
    });
  }

  function torus(radius, tube, colorHex, opacity, seg) {
    return new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 8, seg || 120),
      additive(colorHex, opacity)
    );
  }

  function addBackdrop(group, theme) {
    const neb = theme.palette.nebula;
    // tint the otherwise white core with the world's own light
    const warm = makeGlow(neb[1], 46, 0.5);
    warm.position.set(0, 7, -46);
    group.add(warm);

    const cool = makeGlow(neb[2], 30, 0.32);
    cool.position.set(-24, 2, -38);
    group.add(cool);

    const far = makeGlow(theme.palette.primary, 22, 0.22);
    far.position.set(26, 14, -54);
    group.add(far);
  }

  function addStars(group, theme, count) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const accent = new THREE.Color(theme.palette.accent);
    const primary = new THREE.Color(theme.palette.primary);
    const white = new THREE.Color("#ffffff");
    for (let i = 0; i < count; i++) {
      const u = rand(-0.55, 1);
      const theta = rand(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u);
      const radius = rand(40, 105);
      positions[i * 3] = Math.cos(theta) * r * radius;
      positions[i * 3 + 1] = u * radius * 0.7 + 12;
      positions[i * 3 + 2] = Math.sin(theta) * r * radius - 26;
      const mixed = Math.random();
      const c = mixed < 0.16 ? accent : mixed < 0.36 ? primary : white;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: coarsePointer.matches ? 0.22 : 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    return points;
  }

  function addGrid(group, colorHex, size, divisions, y, opacity) {
    const pts = [];
    const step = size / divisions;
    const half = size / 2;
    for (let i = 0; i <= divisions; i++) {
      const p = -half + i * step;
      pts.push(-half, y, p, half, y, p);
      pts.push(p, y, -half, p, y, half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: opacity != null ? opacity : 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const grid = new THREE.LineSegments(geo, mat);
    group.add(grid);
    return grid;
  }

  function addMotes(group, colorHex, count, opts) {
    const o = opts || {};
    const radius = o.radius || 7;
    const height = o.height || 6;
    const yBase = o.y || 0;
    const size = o.size || 0.09;
    const positions = new Float32Array(count * 3);
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        angle: rand(0, Math.PI * 2),
        radius: rand(radius * 0.18, radius),
        y: rand(0, height),
        speed: rand(0.12, 0.55),
        wobble: rand(0, Math.PI * 2)
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(colorHex),
      size: size,
      transparent: true,
      opacity: o.opacity != null ? o.opacity : 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    return function update(dt, t) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const d = data[i];
        d.y += d.speed * dt;
        if (d.y > height) { d.y = 0; d.angle = rand(0, Math.PI * 2); }
        const a = d.angle + t * 0.05;
        arr[i * 3] = Math.cos(a) * d.radius + Math.sin(t * 0.7 + d.wobble) * 0.3;
        arr[i * 3 + 1] = yBase + d.y;
        arr[i * 3 + 2] = Math.sin(a) * d.radius * 0.72;
      }
      geo.attributes.position.needsUpdate = true;
    };
  }

  function addPlatform(group, theme, radius, y) {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.04, 0.36, 64),
      standard(theme.palette.nebula[0], {
        emissive: theme.palette.secondary,
        emissiveIntensity: 0.08,
        roughness: 0.72,
        metalness: 0.3
      })
    );
    disc.position.y = y;
    group.add(disc);

    const rim = torus(radius, 0.035, theme.palette.primary, 0.6, 128);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y + 0.2;
    group.add(rim);
    return disc;
  }

  function makeTransition(theme) {
    const count = coarsePointer.matches ? 420 : 720;
    const positions = new Float32Array(count * 3);
    const data = [];
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const radius = rand(0.8, 13);
      const z = rand(-58, 2);
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = rand(-4, 9);
      positions[i * 3 + 2] = z;
      data.push({ x: positions[i * 3], y: positions[i * 3 + 1], speed: rand(10, 28) });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(theme.palette.accent),
      size: 0.16,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return {
      points: points,
      update: function (dt, t) {
        const arr = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
          arr[i * 3 + 2] += data[i].speed * dt;
          if (arr[i * 3 + 2] > 4) {
            arr[i * 3 + 2] = -58;
            arr[i * 3] = Math.cos(i * 2.4) * rand(1, 13);
            arr[i * 3 + 1] = rand(-4, 9);
          }
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - smoothstep(0.45, 1.9, t);
        points.visible = mat.opacity > 0.01;
      }
    };
  }

  /* ======================================================================
     world builders — each returns an update(dt, elapsed) function
     ====================================================================== */
  const BUILDERS = {
    /* 01 · UNHRC — an orbital human-rights council chamber */
    council: function (group, theme) {
      const pal = theme.palette;
      const updates = [];
      addPlatform(group, theme, 8.6, -1.3);

      const stone = standard(pal.nebula[0], {
        emissive: pal.secondary, emissiveIntensity: 0.12, roughness: 0.7, metalness: 0.34
      });
      const columns = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = 6.7;
        const h = 2.8 + (i % 3) * 0.34;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, h, 10), stone);
        col.position.set(Math.cos(a) * r, -1.1 + h / 2, Math.sin(a) * r * 0.82);
        group.add(col);
        const cap = makeGlow(pal.accent, 0.55, 0.5);
        cap.position.set(col.position.x, col.position.y + h / 2 + 0.08, col.position.z);
        group.add(cap);
        columns.push(col);
      }

      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(1.3, 44, 30),
        standard(pal.primary, {
          emissive: pal.primary, emissiveIntensity: 0.9, roughness: 0.28, metalness: 0.5
        })
      );
      globe.position.y = 2.0;
      group.add(globe);

      const wire = new THREE.Mesh(
        new THREE.SphereGeometry(1.34, 22, 16),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(pal.accent), wireframe: true, transparent: true,
          opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })
      );
      wire.position.copy(globe.position);
      group.add(wire);

      const haloA = torus(2.35, 0.018, pal.primary, 0.62);
      haloA.rotation.x = 1.22;
      haloA.rotation.z = -0.2;
      haloA.position.y = 2.0;
      group.add(haloA);

      const haloB = torus(2.9, 0.012, pal.accent, 0.4);
      haloB.rotation.x = 1.02;
      haloB.rotation.z = 0.35;
      haloB.position.y = 2.0;
      group.add(haloB);

      const glow = makeGlow(pal.primary, 9, 0.5);
      glow.position.set(0, 2.0, -0.2);
      group.add(glow);

      // soft light columns sweeping up from the colonnade
      for (let i = 0; i < 4; i++) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.62, 0.06, 8.5, 20, 1, true),
          additive(pal.primary, 0.045)
        );
        const a = (i / 4) * Math.PI * 2 + 0.4;
        beam.position.set(Math.cos(a) * 5.4, 2.6, Math.sin(a) * 4.6);
        group.add(beam);
      }

      updates.push(addMotes(group, pal.accent, 80, { radius: 7, height: 7, y: -0.6, size: 0.1 }));
      let spin = 0;
      updates.push(function (dt, t) {
        spin += dt * 0.16;
        globe.rotation.y = spin;
        wire.rotation.y = -spin * 0.72;
        wire.rotation.x = Math.sin(t * 0.2) * 0.08;
        haloA.rotation.z = -0.2 + t * 0.055;
        haloB.rotation.z = 0.35 - t * 0.038;
        const pulse = 0.42 + Math.sin(t * 1.25) * 0.08;
        glow.material.opacity = pulse;
      });
      return function (dt, t) { for (const u of updates) u(dt, t); };
    },

    /* 02 · UNCSW — iconic women & women's empowerment gallery */
    celestial: function (group, theme) {
      const pal = theme.palette;
      const updates = [];
      const burgundy = pal.primary;
      const purple = pal.secondary;
      const gold = pal.accent;
      const deep = pal.deep;
      const ivory = pal.ivory;

      /* ---------- helper: text sprite (name/label billboard) ---------- */
      function makeTextSprite(text, color, pxSize) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 512;
        canvas.height = 140;
        ctx.clearRect(0, 0, 512, 140);
        ctx.font = "bold " + pxSize + "px 'Cormorant Garamond', Georgia, serif";
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 256, 70);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({
          map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(pxSize * 0.45, pxSize * 0.12, 1);
        return { sprite, mat };
      }

      /* ---------- soft burgundy-purple atmosphere ---------- */
      const skyGroup = new THREE.Group();
      group.add(skyGroup);
      const cloudCount = 8;
      const clouds = [];
      for (let i = 0; i < cloudCount; i++) {
        const cloud = new THREE.Group();
        cloud.position.set(rand(-24, 24), rand(4, 14), rand(-34, -10));
        const segments = 2 + Math.floor(Math.random() * 2);
        for (let s = 0; s < segments; s++) {
          const puff = new THREE.Mesh(
            new THREE.SphereGeometry(rand(1.6, 3), 10, 8),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color("#1e0a1a"), transparent: true, opacity: 0.8,
              depthWrite: false, fog: false
            })
          );
          puff.position.set(rand(-1.4, 1.4), rand(-0.7, 0.7), rand(-1.4, 1.4));
          cloud.add(puff);
        }
        skyGroup.add(cloud);
        clouds.push({ mesh: cloud, speed: rand(0.12, 0.3), phase: Math.random() * Math.PI * 2 });
      }

      /* ---------- gallery hall floor ---------- */
      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(20, 20, 0.4, 64),
        standard("#140812", { emissive: deep, emissiveIntensity: 0.05, roughness: 0.9, metalness: 0.1 })
      );
      floor.position.y = -1.62;
      group.add(floor);

      /* ---------- central installation: intertwined women figures ---------- */
      const sculpture = new THREE.Group();
      sculpture.position.set(0, 1.0, 0);
      group.add(sculpture);
      const sculptureFigures = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const figure = new THREE.Group();
        const x = Math.cos(a) * 3.0;
        const z = Math.sin(a) * 3.0;
        figure.position.set(x, 0.7, z);
        figure.rotation.y = -a + Math.PI / 2;
        const robe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.55, 2.4, 10),
          standard("#2a1a2e", { emissive: purple, emissiveIntensity: 0.05, roughness: 0.9, metalness: 0.05 })
        );
        robe.position.y = 1.2;
        figure.add(robe);
        const torso = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.75, 0.22),
          standard("#1e0a16", { emissive: burgundy, emissiveIntensity: 0.04, roughness: 0.92, metalness: 0.05 })
        );
        torso.position.y = 2.35;
        figure.add(torso);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.17, 16, 12),
          standard("#e8c39e", { emissive: "#e8c39e", emissiveIntensity: 0.02, roughness: 0.95, metalness: 0 })
        );
        head.position.y = 2.72;
        figure.add(head);
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.06, 1.2, 8),
          standard("#2a1a2e", { emissive: purple, emissiveIntensity: 0.05, roughness: 0.9, metalness: 0.05 })
        );
        arm.position.set(0, 2.45, 0.45);
        arm.rotation.x = -0.5;
        figure.add(arm);
        const heartGlow = makeGlow(gold, 1.6, 0);
        heartGlow.position.y = 2.35;
        figure.add(heartGlow);
        sculpture.add(figure);
        sculptureFigures.push({ mesh: figure, heartGlow, angle: a, baseY: 0.7 });
      }
      const sculptureRing = torus(4.0, 0.022, gold, 0, 160);
      sculptureRing.rotation.x = Math.PI / 2;
      sculptureRing.position.y = 0.02;
      sculpture.add(sculptureRing);

      /* ---------- engraved words ring around central sculpture ---------- */
      const WORDS = ["EQUALITY", "EDUCATION", "FREEDOM", "LEADERSHIP", "JUSTICE", "EMPOWERMENT"];
      const wordSprites = [];
      for (let i = 0; i < WORDS.length; i++) {
        const a = (i / WORDS.length) * Math.PI * 2;
        const ws = makeTextSprite(WORDS[i], "#d8b48a", 34);
        ws.sprite.position.set(Math.cos(a) * 5.6, 0.45, Math.sin(a) * 5.6);
        ws.sprite.rotation.y = -a;
        group.add(ws.sprite);
        wordSprites.push(ws);
      }

      /* ---------- iconic women portrait gallery ---------- */
      const WOMEN = [
        {
          name: "Savitribai Phule",
          desc: "Pioneer of girls' education in India",
          angle: 0, radius: 11
        },
        {
          name: "Malala Yousafzai",
          desc: "Advocate for girls' education",
          angle: 1, radius: 11
        },
        {
          name: "Ruth Bader Ginsburg",
          desc: "Champion of gender equality & women's rights",
          angle: 2, radius: 11
        },
        {
          name: "Rosa Parks",
          desc: "Symbol of civil rights & resistance",
          angle: 3, radius: 11
        },
        {
          name: "Eleanor Roosevelt",
          desc: "Human rights leader",
          angle: 4, radius: 11
        },
        {
          name: "Wangari Maathai",
          desc: "Environmental & women's rights advocate",
          angle: 5, radius: 11
        }
      ];
      const portraits = [];
      for (let i = 0; i < WOMEN.length; i++) {
        const w = WOMEN[i];
        const a = (w.angle / WOMEN.length) * Math.PI * 2;
        const x = Math.cos(a) * w.radius;
        const z = Math.sin(a) * w.radius;
        const pg = new THREE.Group();
        pg.position.set(x, 0, z);
        pg.rotation.y = -a;
        group.add(pg);

        // pedestal
        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 1.1, 2.2, 16),
          standard("#1e0a16", { emissive: deep, emissiveIntensity: 0.04, roughness: 0.92, metalness: 0.08 })
        );
        pedestal.position.y = 1.1;
        pg.add(pedestal);

        // portrait plinth (framed display)
        const plinth = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 1.6, 0.2),
          standard("#2a1a2e", { emissive: burgundy, emissiveIntensity: 0.03, roughness: 0.85, metalness: 0.1 })
        );
        plinth.position.y = 2.6;
        pg.add(plinth);

        // abstract sculptural bust form on plinth
        const bust = new THREE.Group();
        bust.position.set(0, 2.6, 0.12);
        const bustCore = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.5, 0.9, 10),
          standard("#3a1a2e", { emissive: purple, emissiveIntensity: 0.05, roughness: 0.9, metalness: 0.05 })
        );
        bustCore.position.y = 0.45;
        bust.add(bustCore);
        const bustHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 14, 10),
          standard("#e8c39e", { emissive: "#e8c39e", emissiveIntensity: 0.02, roughness: 0.95, metalness: 0 })
        );
        bustHead.position.y = 0.95;
        bust.add(bustHead);
        pg.add(bust);

        // name sprite
        const nameSprite = makeTextSprite(w.name, ivory, 30);
        nameSprite.sprite.position.set(0, 3.7, 0.15);
        pg.add(nameSprite.sprite);

        // description sprite
        const descSprite = makeTextSprite(w.desc, "#c9a227", 18);
        descSprite.sprite.position.set(0, 3.3, 0.15);
        pg.add(descSprite.sprite);

        // portrait glow
        const portGlow = makeGlow(gold, 3.2, 0);
        portGlow.position.set(0, 2.6, 0.25);
        pg.add(portGlow);

        portraits.push({
          group: pg, pedestal, plinth, bustCore, bustHead, portGlow,
          nameSprite: nameSprite.sprite, nameMat: nameSprite.mat,
          descSprite: descSprite.sprite, descMat: descSprite.mat,
          baseY: 0, angle: a, radius: w.radius, name: w.name
        });
      }

      /* ---------- subtle golden particles ---------- */
      const particleCount = 120;
      const particlePositions = new Float32Array(particleCount * 3);
      const particleData = [];
      for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3] = rand(-20, 20);
        particlePositions[i * 3 + 1] = rand(0, 16);
        particlePositions[i * 3 + 2] = rand(-26, 2);
        particleData.push({ phase: Math.random() * Math.PI * 2, speed: rand(0.06, 0.18), float: rand(0.05, 0.15) });
      }
      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
      const particleMat = new THREE.PointsMaterial({
        color: new THREE.Color(gold), size: 0.05, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false
      });
      const particles = new THREE.Points(particleGeo, particleMat);
      particles.frustumCulled = false;
      group.add(particles);

      /* ---------- soft light rays ---------- */
      const rays = [];
      for (let i = 0; i < 5; i++) {
        const ray = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 14, 8),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#f0d8b0"), transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
          })
        );
        ray.position.set(rand(-8, 8), 8, rand(-20, -6));
        ray.rotation.x = Math.PI / 2 + rand(-0.3, 0.3);
        group.add(ray);
        rays.push(ray);
      }

      /* ---------- intro sequence ---------- */
      updates.push(function (dt, t) {
        const enter = smoothstep(0, 7.4, state.enterT);
        const power = lerp(0, 1, enter);

        // clouds drift slowly
        for (let i = 0; i < clouds.length; i++) {
          const c = clouds[i];
          c.mesh.position.x += c.speed * dt * 0.5;
          c.mesh.position.y += Math.sin(t * 0.5 + c.phase) * 0.02;
          if (c.mesh.position.x > 26) c.mesh.position.x = -26;
        }

        // gallery hall emerges from darkness
        floor.material.emissiveIntensity = 0.05 * power;

        // central sculpture emerges
        const sculpPower = smoothstep(2.0, 4.2, enter);
        sculpture.position.y = 1.0 - (1 - sculpPower) * 3;
        sculpture.scale.setScalar(0.5 + 0.5 * sculpPower);
        sculpture.rotation.y = t * 0.015 * sculpPower;
        for (const f of sculptureFigures) {
          f.heartGlow.material.opacity = sculpPower * 0.5;
          f.mesh.position.y = f.baseY + Math.sin(t * 0.9 + f.angle) * 0.12 * sculpPower;
        }
        sculptureRing.material.opacity = sculpPower * 0.45;

        // engraved words appear around sculpture
        for (let i = 0; i < wordSprites.length; i++) {
          const wp = smoothstep(2.6, 4.6, enter);
          wordSprites[i].sprite.scale.setScalar(wp);
          wordSprites[i].mat.opacity = wp * 0.6;
        }

        // portraits illuminate one by one in sequence
        for (let i = 0; i < portraits.length; i++) {
          const p = portraits[i];
          // staggered reveal per portrait
          const revealStart = 1.0 + i * 0.55;
          const revealEnd = revealStart + 1.6;
          const pPower = smoothstep(revealStart, revealEnd, enter);
          p.portGlow.material.opacity = pPower * 0.55;
          p.pedestal.material.emissiveIntensity = 0.04 * pPower;
          p.plinth.material.emissiveIntensity = 0.03 * pPower;
          p.bustCore.material.emissiveIntensity = 0.05 * pPower;
          p.bustHead.material.emissiveIntensity = 0.02 * pPower;

          // name appears after portrait glows
          const namePower = smoothstep(revealStart + 0.6, revealEnd, enter);
          p.nameMat.opacity = namePower * 0.9;
          p.nameSprite.scale.setScalar(namePower);

          // description appears after name
          const descPower = smoothstep(revealStart + 1.1, revealEnd, enter);
          p.descMat.opacity = descPower * 0.7;
          p.descSprite.scale.setScalar(descPower);
        }

        // golden particles rise
        const particlePower = smoothstep(1.8, 4.4, enter);
        particleMat.opacity = particlePower * 0.5;
        const ppos = particleGeo.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
          ppos[i * 3 + 1] += particleData[i].float * dt * (1 + particlePower);
          if (ppos[i * 3 + 1] > 17) ppos[i * 3 + 1] = 0;
          ppos[i * 3] += Math.sin(t * 0.5 + particleData[i].phase) * 0.02;
        }
        particleGeo.attributes.position.needsUpdate = true;

        // light rays sweep
        for (let i = 0; i < rays.length; i++) {
          const r = rays[i];
          const rayPower = smoothstep(3.0, 5.6, enter) * (0.4 + 0.6 * Math.sin(t * 0.8 + i));
          r.material.opacity = rayPower * 0.25;
        }

        // ambient warmth builds
        scene.traverse(function (o) {
          if (o.isAmbientLight) o.intensity = lerp(0.1, 0.5, power);
        });
      });

      return function (dt, t) { for (const u of updates) u(dt, t); };
    },

    /* 03 · Lok Sabha — the house in session */
    parliament: function (group, theme) {
      const pal = theme.palette;
      const updates = [];
      addPlatform(group, theme, 8.8, -1.5);

      const wood = standard("#2a1a08", {
        color: "#3a240c", emissive: pal.secondary, emissiveIntensity: 0.13,
        roughness: 0.62, metalness: 0.25
      });
      const gold = standard(pal.primary, {
        emissive: pal.primary, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.8
      });

      // tiered benches (the House)
      const benchGeos = [];
      for (let i = 0; i < 4; i++) {
        const radius = 3.1 + i * 1.15;
        const bench = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.42, 8, 96), wood);
        bench.rotation.x = Math.PI / 2;
        bench.position.y = -0.95 + i * 0.36;
        group.add(bench);
        benchGeos.push(bench);

        const trim = torus(radius + 0.42, 0.018, pal.primary, 0.3, 96);
        trim.rotation.x = Math.PI / 2;
        trim.position.y = -0.73 + i * 0.36;
        group.add(trim);
      }

      // central table and the mace
      const table = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.42, 56), wood);
      table.position.y = -0.35;
      group.add(table);

      const mace = new THREE.Group();
      mace.position.y = 0.1;
      group.add(mace);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 3.2, 12), gold);
      shaft.position.y = 1.6;
      mace.add(shaft);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), gold);
      head.position.y = 3.26;
      mace.add(head);
      const maceGlow = makeGlow(pal.primary, 3.4, 0.55);
      maceGlow.position.y = 3.2;
      mace.add(maceGlow);

      // overhead dome arches
      for (let i = 0; i < 3; i++) {
        const arch = torus(7.1, 0.028, pal.primary, 0.11, 120);
        arch.rotation.y = (i / 3) * Math.PI;
        arch.position.y = 1.8;
        group.add(arch);
      }

      // speaker's beam
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.35, 0.12, 9, 28, 1, true),
        additive(pal.primary, 0.05)
      );
      beam.position.y = 3.2;
      group.add(beam);

      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const lamp = makeGlow(pal.accent, 0.7, 0.5);
        lamp.position.set(Math.cos(a) * 7.2, 1.4, Math.sin(a) * 6.2);
        group.add(lamp);
      }

      updates.push(addMotes(group, pal.accent, 70, { radius: 7.5, height: 6, y: -1, size: 0.08, opacity: 0.62 }));
      updates.push(function (dt, t) {
        mace.rotation.y = t * 0.12;
        maceGlow.material.opacity = 0.48 + Math.sin(t * 1.6) * 0.1;
        beam.material.opacity = 0.04 + Math.sin(t * 1.15) * 0.012;
        for (let i = 0; i < benchGeos.length; i++) {
          benchGeos[i].rotation.z = Math.sin(t * 0.1 + i) * 0.006;
        }
      });
      return function (dt, t) { for (const u of updates) u(dt, t); };
    },

    /* 04 · Influencer Summit — the neon network */
    digital: function (group, theme) {
      const pal = theme.palette;
      const updates = [];
      const grid = addGrid(group, pal.primary, 34, 24, -1.7, 0.13);
      grid.position.z = -4;

      const core = new THREE.Group();
      core.position.y = 2.0;
      group.add(core);

      const inner = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.05, 1),
        standard(pal.primary, {
          emissive: pal.primary, emissiveIntensity: 1.4, roughness: 0.22,
          metalness: 0.6, flat: true
        })
      );
      core.add(inner);
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.5, 1),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(pal.accent), wireframe: true, transparent: true,
          opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })
      );
      core.add(shell);

      const ringA = torus(2.35, 0.02, pal.accent, 0.7);
      ringA.rotation.x = 1.4;
      ringA.position.y = 2.0;
      group.add(ringA);
      const ringB = torus(3.0, 0.014, pal.secondary, 0.46);
      ringB.rotation.x = 0.8;
      ringB.rotation.y = 0.5;
      ringB.position.y = 2.0;
      group.add(ringB);

      const coreGlow = makeGlow(pal.primary, 10, 0.52);
      coreGlow.position.set(0, 2.0, -0.4);
      group.add(coreGlow);

      // network nodes + links
      const nodeData = [];
      const nodeMat = standard(pal.accent, {
        emissive: pal.accent, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.4
      });
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + rand(-0.2, 0.2);
        const r = rand(3.4, 8.2);
        const node = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.05, 0.16), 0), nodeMat);
        node.position.set(Math.cos(a) * r, rand(-0.2, 5.6), Math.sin(a) * r * 0.62 - 1);
        group.add(node);
        nodeData.push({ mesh: node, baseY: node.position.y, phase: rand(0, Math.PI * 2) });
      }

      const linkPts = [];
      for (let i = 0; i < nodeData.length; i++) {
        const n = nodeData[i];
        const m = nodeData[(i * 5 + 3) % nodeData.length];
        linkPts.push(n.mesh.position.x, n.mesh.position.y, n.mesh.position.z);
        linkPts.push(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z);
      }
      const linkGeo = new THREE.BufferGeometry();
      linkGeo.setAttribute("position", new THREE.Float32BufferAttribute(linkPts, 3));
      const linkLines = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({
        color: new THREE.Color(pal.secondary), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      group.add(linkLines);

      // vertical data streams
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const stream = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, rand(2, 5.5), 0.02),
          additive(i % 2 ? pal.accent : pal.primary, 0.36)
        );
        stream.position.set(Math.cos(a) * rand(5, 9), rand(1, 3), Math.sin(a) * rand(3, 6) - 1);
        group.add(stream);
      }

      updates.push(addMotes(group, pal.accent, 110, { radius: 8.5, height: 7, y: -1.2, size: 0.075, opacity: 0.8 }));
      updates.push(function (dt, t) {
        inner.rotation.y = t * 0.42;
        inner.rotation.x = t * 0.18;
        shell.rotation.y = -t * 0.3;
        shell.rotation.z = t * 0.12;
        ringA.rotation.z = t * 0.24;
        ringB.rotation.z = -t * 0.16;
        coreGlow.material.opacity = 0.46 + Math.sin(t * 2.1) * 0.08;
        grid.material.opacity = 0.1 + Math.sin(t * 0.8) * 0.035;
        for (let i = 0; i < nodeData.length; i++) {
          const n = nodeData[i];
          n.mesh.position.y = n.baseY + Math.sin(t * 0.8 + n.phase) * 0.18;
          const s = 1 + Math.sin(t * 1.4 + n.phase) * 0.18;
          n.mesh.scale.setScalar(s);
        }
        linkLines.material.opacity = 0.16 + Math.sin(t * 0.9) * 0.06;
      });
      return function (dt, t) { for (const u of updates) u(dt, t); };
    },

    /* 05 · Mythology Crisis — the celestial court */
    mythic: function (group, theme) {
      const pal = theme.palette;
      const updates = [];
      addPlatform(group, theme, 8.2, -1.6);

      // sun disc behind the court
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(3.6, 64),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(pal.primary), transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
        })
      );
      disc.position.set(0, 4.2, -12);
      group.add(disc);
      const discGlow = makeGlow(pal.primary, 17, 0.36);
      discGlow.position.set(0, 4.2, -12.4);
      group.add(discGlow);

      // rotating mandala floor
      const mandala = new THREE.Group();
      mandala.position.y = 0.2;
      group.add(mandala);
      const ringSpecs = [
        { r: 2.5, tube: 0.02, op: 0.72 },
        { r: 3.6, tube: 0.014, op: 0.5 },
        { r: 4.8, tube: 0.011, op: 0.34 }
      ];
      for (const rs of ringSpecs) {
        const ring = torus(rs.r, rs.tube, pal.primary, rs.op, 160);
        ring.rotation.x = Math.PI / 2;
        mandala.add(ring);
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.02, 4.7),
          additive(pal.primary, 0.38)
        );
        spoke.position.set(Math.cos(a) * 2.35, 0, Math.sin(a) * 2.35);
        spoke.rotation.y = -a;
        mandala.add(spoke);
      }

      // the chakra at the heart of the court
      const chakra = new THREE.Group();
      chakra.position.set(0, 2.9, 0);
      group.add(chakra);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(1.55, 0.09, 10, 72),
        standard(pal.primary, {
          emissive: pal.primary, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.7
        })
      );
      chakra.add(rim);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 1.34, 0.07),
          standard(pal.accent, {
            emissive: pal.accent, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.6
          })
        );
        spoke.position.set(Math.cos(a) * 0.74, Math.sin(a) * 0.74, 0);
        spoke.rotation.z = a - Math.PI / 2;
        chakra.add(spoke);
      }
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), standard(pal.secondary, {
        emissive: pal.secondary, emissiveIntensity: 1.3, roughness: 0.3, metalness: 0.5
      }));
      chakra.add(hub);
      const chakraGlow = makeGlow(pal.accent, 8, 0.55);
      chakraGlow.position.set(0, 2.9, -0.3);
      group.add(chakraGlow);

      // fire pillars
      const flames = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const x = Math.cos(a) * 6.2;
        const z = Math.sin(a) * 5.2;
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.42, 3.4, 10),
          standard("#2a0b06", {
            emissive: pal.secondary, emissiveIntensity: 0.22, roughness: 0.75, metalness: 0.2
          })
        );
        pillar.position.set(x, 0.1, z);
        group.add(pillar);
        const flame = makeGlow(pal.accent, 2.5, 0.7);
        flame.position.set(x, 2.1, z);
        group.add(flame);
        flames.push(flame);
      }

      updates.push(addMotes(group, pal.accent, 120, { radius: 7.4, height: 7, y: -1.2, size: 0.09, opacity: 0.75 }));
      updates.push(function (dt, t) {
        mandala.rotation.y = t * 0.06;
        chakra.rotation.z = t * 0.12;
        chakra.position.y = 2.9 + Math.sin(t * 0.7) * 0.1;
        chakraGlow.position.y = chakra.position.y;
        chakraGlow.material.opacity = 0.48 + Math.sin(t * 1.4) * 0.09;
        discGlow.material.opacity = 0.32 + Math.sin(t * 0.55) * 0.05;
        for (let i = 0; i < flames.length; i++) {
          flames[i].material.opacity = 0.55 + Math.sin(t * 2.2 + i * 1.7) * 0.18;
        }
      });
      return function (dt, t) { for (const u of updates) u(dt, t); };
    },

    /* 06 · Wizarding Crisis — the spellbound castle */
    castle: function (group, theme) {
      const pal = theme.palette;
      const updates = [];
      const burgundy = pal.primary;
      const midnight = pal.secondary;
      const gold = pal.accent;
      const deep = pal.deep;

      /* ---------- night sky layers ---------- */
      const skyGroup = new THREE.Group();
      group.add(skyGroup);

      // distant dark clouds (slow drifting)
      const cloudCount = 10;
      const clouds = [];
      for (let i = 0; i < cloudCount; i++) {
        const cloud = new THREE.Group();
        cloud.position.set(rand(-35, 35), rand(4, 16), rand(-40, -10));
        const segments = 2 + Math.floor(Math.random() * 2);
        for (let s = 0; s < segments; s++) {
          const puff = new THREE.Mesh(
            new THREE.SphereGeometry(rand(1.5, 3.0), 10, 8),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color("#0e0b14"),
              transparent: true,
              opacity: 0.82,
              depthWrite: false,
              fog: false
            })
          );
          puff.position.set(rand(-1.4, 1.4), rand(-0.7, 0.7), rand(-1.4, 1.4));
          cloud.add(puff);
        }
        skyGroup.add(cloud);
        clouds.push({ mesh: cloud, speed: rand(0.12, 0.30), phase: Math.random() * Math.PI * 2 });
      }

      // distant lightning flash - warm amber glow
      const lightning = new THREE.Mesh(
        new THREE.PlaneGeometry(56, 36),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color("#f0d8b0"),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false
        })
      );
      lightning.position.set(0, 12, -32);
      skyGroup.add(lightning);
      let lightningNext = rand(7, 18);
      let lightningActive = false;
      let lightningLife = 0;

      /* ---------- full moon ---------- */
      const moonGroup = new THREE.Group();
      moonGroup.position.set(-14, 11, -24);
      group.add(moonGroup);
      const moonGlow = makeGlow(burgundy, 26, 0);
      moonGlow.position.set(0, 0, -0.6);
      moonGroup.add(moonGlow);
      const moonCore = new THREE.Mesh(
        new THREE.SphereGeometry(2.9, 48, 32),
        standard("#efe9e0", { emissive: "#efe9e0", emissiveIntensity: 0, roughness: 0.75, metalness: 0 })
      );
      moonCore.position.z = -0.5;
      moonGroup.add(moonCore);
      const moonRim = torus(3.05, 0.022, gold, 0, 140);
      moonRim.position.z = -0.75;
      moonGroup.add(moonRim);

      /* ---------- magical lake (reflecting castle) ---------- */
      const lake = new THREE.Mesh(
        new THREE.CylinderGeometry(24, 24, 0.4, 64),
        standard("#06091a", {
          emissive: midnight, emissiveIntensity: 0, roughness: 0.15, metalness: 0.6
        })
      );
      lake.rotation.x = Math.PI / 2;
      lake.position.y = -1.62;
      group.add(lake);
      const lakeRim = torus(25, 0.018, gold, 0, 120);
      lakeRim.rotation.x = Math.PI / 2;
      lakeRim.position.y = -1.6;
      group.add(lakeRim);

      /* ---------- forbidden forest (dark tree silhouettes) ---------- */
      const trees = [];
      for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = rand(13, 26);
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.26, 3.6, 8),
          standard("#060403", { emissive: deep, emissiveIntensity: 0, roughness: 0.95, metalness: 0.1 })
        );
        trunk.position.y = 1.8;
        tree.add(trunk);
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(1.1, 3.4, 6),
          standard("#030602", { emissive: midnight, emissiveIntensity: 0, roughness: 0.95, metalness: 0.1 })
        );
        crown.position.y = 3.9;
        tree.add(crown);
        tree.position.set(Math.cos(angle) * radius, -1.62, Math.sin(angle) * radius);
        tree.rotation.y = Math.random() * Math.PI * 2;
        group.add(tree);
        trees.push({ mesh: tree, phase: Math.random() * Math.PI * 2 });
      }

      /* ---------- ancient ground / courtyard ---------- */
      const ground = new THREE.Mesh(
        new THREE.CylinderGeometry(22, 22, 0.6, 64),
        standard("#0a0809", { emissive: deep, emissiveIntensity: 0.03, roughness: 0.92, metalness: 0.15 })
      );
      ground.position.y = -1.7;
      group.add(ground);

      /* giant ancient spell circle on the ground - subtle */
      const spellCircle = torus(9.5, 0.018, "#c9a227", 0, 160);
      spellCircle.rotation.x = Math.PI / 2;
      spellCircle.position.y = -1.58;
      group.add(spellCircle);
      const spellCircleB = torus(10.2, 0.012, "#8b6b2f", 0, 160);
      spellCircleB.rotation.x = Math.PI / 2;
      spellCircleB.position.y = -1.56;
      group.add(spellCircleB);
      const spellRunes = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const rune = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.12, 0.03),
          additive(gold, 0)
        );
        rune.position.set(Math.cos(a) * 9.8, -1.54, Math.sin(a) * 9.8);
        rune.rotation.y = a;
        group.add(rune);
        spellRunes.push(rune);
      }

      /* ---------- gothic castle ---------- */
      const castle = new THREE.Group();
      castle.position.y = -1.2;
      group.add(castle);

      const stone = standard("#1a1614", {
        emissive: deep, emissiveIntensity: 0.03, roughness: 0.95, metalness: 0.1
      });
      const roofMat = standard("#140d0d", {
        emissive: burgundy, emissiveIntensity: 0.04, roughness: 0.92, metalness: 0.15
      });
      const windowMat = standard("#c99a3c", {
        emissive: "#d4a846", emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.1
      });

      const keep = new THREE.Mesh(new THREE.BoxGeometry(3.2, 8.2, 3.0), stone);
      keep.position.set(0, 2.9, 0);
      castle.add(keep);
      const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.4, 6), roofMat);
      keepRoof.position.set(0, 7.7, 0);
      keepRoof.rotation.y = Math.PI / 4;
      castle.add(keepRoof);
      const keepSpire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.8, 6), roofMat);
      keepSpire.position.set(0, 9.4, 0);
      keepSpire.rotation.y = Math.PI / 4;
      castle.add(keepSpire);

      const towers = [
        [-4.6, 5.6, -0.9, 1.3], [4.6, 6.2, -0.9, 1.4],
        [-3.4, 6.9, -2.6, 1.1], [3.4, 5.9, -2.8, 1.0],
        [-2.6, 5.2, -4.4, 0.95], [2.6, 4.9, -4.6, 0.85]
      ];
      for (const t of towers) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(t[3], t[1], t[3]), stone);
        tower.position.set(t[0], t[1] / 2 + 0.2, t[2]);
        castle.add(tower);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(t[3] * 1.05, t[1] * 0.5, 6), roofMat);
        roof.position.set(t[0], t[1] + 0.2 + t[1] * 0.26, t[2]);
        roof.rotation.y = Math.PI / 4;
        castle.add(roof);
        const spire = new THREE.Mesh(new THREE.ConeGeometry(t[3] * 0.35, 1.2, 6), roofMat);
        spire.position.set(t[0], t[1] + 0.2 + t[1] * 0.5 + 0.6, t[2]);
        spire.rotation.y = Math.PI / 4;
        castle.add(spire);
      }

      // magical bridges between towers
      const bridges = [];
      const bridgeDefs = [
        [-4.6, 5.6, -0.9, 4.6, 6.2, -0.9],
        [-3.4, 6.9, -2.6, 3.4, 5.9, -2.8],
        [-2.6, 5.2, -4.4, 2.6, 4.9, -4.6]
      ];
      for (const b of bridgeDefs) {
        const dx = b[3] - b[0];
        const dy = b[4] - b[1];
        const dz = b[5] - b[2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const bridge = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.16, len),
          standard("#16100f", { emissive: burgundy, emissiveIntensity: 0, roughness: 0.82, metalness: 0.3 })
        );
        bridge.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2 + 0.1, (b[2] + b[5]) / 2);
        const angleY = Math.atan2(dx, dz);
        const angleX = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
        bridge.rotation.set(angleX, angleY, 0);
        castle.add(bridge);
        bridges.push(bridge);
      }

      // glowing windows
      const windows = [];
      const winSpots = [
        [-0.8, 2.4, 1.52], [0.8, 2.4, 1.52], [-0.8, 4.2, 1.52], [0.8, 4.2, 1.52],
        [-4.6, 3.6, -0.2], [4.6, 4.2, -0.2], [-3.4, 4.9, -1.9], [3.4, 3.9, -2.0],
        [-2.6, 4.0, -3.7], [2.6, 3.7, -3.9], [-0.9, 6.2, 1.52], [0.9, 6.2, 1.52]
      ];
      for (const w of winSpots) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.52, 0.05), windowMat);
        win.position.set(w[0], w[1], w[2]);
        castle.add(win);
        windows.push(win);
      }

      /* ---------- floating candles ---------- */
      const candles = [];
      for (let i = 0; i < 18; i++) {
        const candle = new THREE.Group();
        const wax = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.072, 0.52, 8),
          standard("#f0e6d2", { emissive: "#e8dcc0", emissiveIntensity: 0.04, roughness: 0.9, metalness: 0 })
        );
        candle.add(wax);
        const flame = makeGlow(gold, 0.6, 0);
        flame.position.y = 0.38;
        candle.add(flame);
        const a = Math.random() * Math.PI * 2;
        const r = rand(4, 9);
        candle.position.set(Math.cos(a) * r, rand(0.6, 5), Math.sin(a) * r * 0.9);
        candle.userData.baseY = candle.position.y;
        candle.userData.phase = Math.random() * Math.PI * 2;
        candle.userData.angle = a;
        candle.userData.radius = r;
        group.add(candle);
        candles.push(candle);
      }

      /* ---------- magical dust particles ---------- */
      const dustCount = 220;
      const dustPositions = new Float32Array(dustCount * 3);
      const dustData = [];
      for (let i = 0; i < dustCount; i++) {
        dustPositions[i * 3] = rand(-20, 20);
        dustPositions[i * 3 + 1] = rand(-1, 14);
        dustPositions[i * 3 + 2] = rand(-30, 5);
        dustData.push({
          phase: Math.random() * Math.PI * 2,
          speed: rand(0.08, 0.25),
          drift: rand(-0.05, 0.05),
          floatY: rand(0.04, 0.12)
        });
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
      const dustMat = new THREE.PointsMaterial({
        color: new THREE.Color("#e8dcc0"), size: 0.04, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false
      });
      const dust = new THREE.Points(dustGeo, dustMat);
      dust.frustumCulled = false;
      group.add(dust);

      /* ---------- magical motes (burgundy & gold) ---------- */
      updates.push(addMotes(group, burgundy, 150, { radius: 14, height: 11, y: -1, size: 0.07, opacity: 0 }));
      updates.push(addMotes(group, gold, 80, { radius: 11, height: 9, y: -0.8, size: 0.05, opacity: 0 }));

      /* ---------- floating spell books ---------- */
      const books = [];
      for (let i = 0; i < 7; i++) {
        const bookGroup = new THREE.Group();
        const a = (i / 7) * Math.PI * 2 + Math.random() * 0.6;
        const r = rand(6, 9);
        const h = rand(1.0, 3.2);
        bookGroup.position.set(Math.cos(a) * r, h, Math.sin(a) * r * 0.9);
        // dark brown leather cover
        const cover = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.8, 0.26),
          standard("#3d2b1f", { emissive: "#2a1e16", emissiveIntensity: 0.05, roughness: 0.95, metalness: 0.05 })
        );
        bookGroup.add(cover);
        // aged cream page block
        const pages = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.76, 0.05),
          standard("#f5ead6", { emissive: "#e8dcc0", emissiveIntensity: 0.02, roughness: 0.98, metalness: 0 })
        );
        pages.position.z = 0.135;
        bookGroup.add(pages);
        // golden border band around cover
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(0.52, 0.84, 0.28),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#b8860b"), transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
          })
        );
        bookGroup.add(band);
        // embossed symbol: thin gold ring on cover
        const symbol = new THREE.Mesh(
          new THREE.TorusGeometry(0.16, 0.014, 8, 24),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#c9a227"), transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
          })
        );
        symbol.position.set(0, 0, 0.14);
        symbol.rotation.x = Math.PI / 2;
        bookGroup.add(symbol);
        // subtle golden magical particles around each book
        const bookGlow = makeGlow("#c9a227", 1.4, 0);
        bookGlow.position.z = 0;
        bookGroup.add(bookGlow);
        group.add(bookGroup);
        books.push({
          group: bookGroup, baseY: h, phase: Math.random() * Math.PI * 2,
          angle: a, radius: r, speed: rand(0.04, 0.1), cover, band, symbol, glow: bookGlow,
          bobOffset: Math.random() * Math.PI * 2
        });
      }

      /* ---------- Hogwarts Express on distant bridge ---------- */
      const trainGroup = new THREE.Group();
      trainGroup.position.set(-28, 0.5, -18);
      group.add(trainGroup);
      const engine = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 3.6), standard("#2a1a1a", {
        emissive: deep, emissiveIntensity: 0.05, roughness: 0.85, metalness: 0.4
      }));
      engine.position.z = -1.8;
      trainGroup.add(engine);
      const tender = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 1.8), standard("#221515", {
        emissive: deep, emissiveIntensity: 0.04, roughness: 0.85, metalness: 0.35
      }));
      tender.position.z = 0.1;
      trainGroup.add(tender);
      const trainLight = makeGlow(gold, 1.4, 0);
      trainLight.position.set(0, 0.7, -3.3);
      trainGroup.add(trainLight);
      const trainGlow = makeGlow(gold, 3, 0);
      trainGlow.position.set(0, 0.7, -3.3);
      trainGroup.add(trainGlow);
      const trainSteam = [];
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(0.3, 0.6), 8, 6), new THREE.MeshBasicMaterial({
          color: new THREE.Color("#2a2a3a"), transparent: true, opacity: 0, depthWrite: false, fog: false
        }));
        puff.position.set(rand(-0.5, 0.5), rand(0.8, 1.4), -3.6 - i * 0.9);
        trainGroup.add(puff);
        trainSteam.push({ mesh: puff, life: Math.random(), speed: rand(0.08, 0.18) });
      }
      let trainX = -34;

      /* ---------- intro sequence + animation ---------- */
      updates.push(function (dt, t) {
        const enter = smoothstep(0, 5.4, state.enterT);
        const power = lerp(0, 1, enter);

        // sky: clouds drift slowly
        for (let i = 0; i < clouds.length; i++) {
          const c = clouds[i];
          c.mesh.position.x += c.speed * dt * 0.6;
          c.mesh.position.y += Math.sin(t * 0.4 + c.phase) * 0.02;
          if (c.mesh.position.x > 32) c.mesh.position.x = -32;
        }

        // lightning flashes randomly
        lightningNext -= dt;
        if (lightningNext <= 0 && !lightningActive && power > 0.3) {
          lightningActive = true;
          lightningLife = 0;
          lightningNext = rand(8, 20);
          lightning.material.opacity = 0;
        }
        if (lightningActive) {
          lightningLife += dt;
          const flash = Math.sin(lightningLife * 40) * Math.exp(-lightningLife * 6);
          lightning.material.opacity = Math.max(0, flash * 0.5);
          if (lightningLife > 0.7) { lightningActive = false; lightning.material.opacity = 0; }
        }

        // moon emerges from darkness
        moonGroup.position.y = 11 - (1 - power) * 6;
        moonGlow.material.opacity = power * 0.55;
        moonCore.material.emissiveIntensity = 0.45 * power;
        moonRim.material.opacity = power * 0.5;

        // ground appears
        ground.material.emissiveIntensity = 0.05 * power;

        // lake appears & reflects
        lake.material.emissiveIntensity = 0.04 * power;
        lakeRim.material.opacity = power * 0.35;

        // forest trees emerge
        for (let i = 0; i < trees.length; i++) {
          const tr = trees[i];
          const tp = smoothstep(2.0, 3.4, enter);
          tr.mesh.scale.setScalar(0.4 + 0.6 * tp);
          tr.mesh.position.y = -1.62 + (1 - tp) * 2;
        }

        // spell circle activates
        const spellPower = smoothstep(2.6, 4.0, enter);
        spellCircle.material.opacity = spellPower * 0.5;
        spellCircleB.material.opacity = spellPower * 0.38;
        spellCircle.rotation.z = t * 0.12 * spellPower;
        spellCircleB.rotation.z = -t * 0.09 * spellPower;
        for (let i = 0; i < spellRunes.length; i++) {
          const r = spellRunes[i];
          r.material.opacity = spellPower * 0.75;
          r.position.y = -1.54 + Math.sin(t * 1.6 + i) * 0.18 * spellPower;
        }

        // castle emerges from below
        castle.position.y = -1.2 + (1 - power) * 5;
        castle.scale.setScalar(0.45 + 0.45 * power);
        castle.rotation.y = t * 0.018 * power;

        // bridges appear
        for (let i = 0; i < bridges.length; i++) {
          bridges[i].material.emissiveIntensity = 0.09 * power;
        }

        // windows illuminate in sequence - warm candlelight, not neon
        for (let i = 0; i < windows.length; i++) {
          const w = windows[i];
          const winPower = smoothstep(2.2, 3.8, enter) * (0.45 + 0.55 * Math.sin(t * 1.2 + i * 2.1));
          w.material.emissiveIntensity = winPower * 1.6;
        }

        // floating candles awaken
        for (let i = 0; i < candles.length; i++) {
          const c = candles[i];
          const cp = smoothstep(1.4, 3.0, enter);
          c.position.y = c.userData.baseY + Math.sin(t * 1.0 + c.userData.phase) * 0.18 * cp;
          c.position.x = Math.cos(c.userData.angle + t * 0.04) * c.userData.radius;
          c.position.z = Math.sin(c.userData.angle + t * 0.04) * c.userData.radius * 0.9;
          const flame = c.children[1];
          flame.material.opacity = cp * 0.8;
          flame.scale.setScalar(0.8 + 0.4 * Math.sin(t * 3 + i));
        }

        // magical dust rises
        const dustPower = smoothstep(1.0, 3.2, enter);
        dustMat.opacity = dustPower * 0.5;
        const dpos = dustGeo.attributes.position.array;
        for (let i = 0; i < dustCount; i++) {
          dpos[i * 3 + 1] += dustData[i].floatY * dt * (1 + dustPower);
          if (dpos[i * 3 + 1] > 15) dpos[i * 3 + 1] = -1;
          dpos[i * 3] += dustData[i].drift * dt;
        }
        dustGeo.attributes.position.needsUpdate = true;

        // floating books awaken - slow, organic enchanted movement
        for (let i = 0; i < books.length; i++) {
          const b = books[i];
          const bp = smoothstep(1.8, 3.4, enter);
          const floatOff = t * 0.7 + b.bobOffset;
          b.group.position.y = b.baseY + Math.sin(floatOff + b.phase) * 0.15 * bp;
          b.group.rotation.y = t * b.speed * 0.5 * bp;
          b.group.rotation.x = Math.sin(t * 0.4 + b.phase) * 0.08 * bp;
          b.group.rotation.z = Math.cos(t * 0.3 + b.phase) * 0.06 * bp;
          b.group.position.x = Math.cos(b.angle + t * 0.025) * b.radius;
          b.group.position.z = Math.sin(b.angle + t * 0.025) * b.radius * 0.9;
          // golden particles pulse gently around each book
          const particlePulse = 0.35 + 0.25 * Math.sin(t * 1.3 + i);
          b.band.material.opacity = bp * 0.35 * particlePulse;
          b.symbol.material.opacity = bp * 0.5 * particlePulse;
          b.glow.material.opacity = bp * 0.3 * particlePulse;
        }

        // Hogwarts Express travels across the distant bridge
        trainX += dt * 2.2 * power;
        trainGroup.position.x = trainX;
        trainGroup.position.y = 0.5 + Math.sin(t * 1.5) * 0.05;
        const trainVis = smoothstep(1.8, 4.6, enter);
        engine.material.emissiveIntensity = 0.08 * trainVis;
        tender.material.emissiveIntensity = 0.06 * trainVis;
        trainLight.material.opacity = trainVis * 0.7;
        trainGlow.material.opacity = trainVis * 0.4;
        for (let i = 0; i < trainSteam.length; i++) {
          const s = trainSteam[i];
          s.life += dt * s.speed;
          if (s.life > 1) { s.life = 0; s.mesh.position.z = -3.6; }
          s.mesh.position.z += dt * 2.2 * power;
          s.mesh.position.y += 0.15 * dt;
          s.mesh.material.opacity = trainVis * (1 - s.life) * 0.5;
        }

        // particles awaken
        scene.traverse(function (o) {
          if (o.isAmbientLight) o.intensity = lerp(0.15, 0.9, power);
        });
      });

      return function (dt, t) { for (const u of updates) u(dt, t); };
    },

    /* 07 · IPL Auction — the night stadium, live auction block */
    arena: function (group, theme) {
      const pal = theme.palette;
      const updates = [];
      const gold = pal.primary;
      const blue = pal.accent;
      const black = pal.secondary;

      /* ---------- stadium bowl / stands with packed audience lights ---------- */
      const stands = [];
      const standCount = 5;
      for (let i = 0; i < standCount; i++) {
        const r = 6.4 + i * 1.15;
        const stand = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.7, 10, 140),
          standard("#0d0d0d", {
            emissive: black, emissiveIntensity: 0.1, roughness: 0.85, metalness: 0.25
          })
        );
        stand.rotation.x = Math.PI / 2;
        stand.position.y = -1.6 + i * 0.62;
        group.add(stand);

        // audience light dots on each tier
        const nLights = 90 + i * 25;
        const positions = new Float32Array(nLights * 3);
        const data = [];
        for (let k = 0; k < nLights; k++) {
          const a = Math.random() * Math.PI * 2;
          const rr = r * (0.55 + Math.random() * 0.45);
          positions[k * 3] = Math.cos(a) * rr;
          positions[k * 3 + 1] = -1.6 + i * 0.62 + 0.35;
          positions[k * 3 + 2] = Math.sin(a) * rr * 0.85;
          data.push({ angle: a, radius: rr, phase: Math.random() * Math.PI * 2 });
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const crowdMat = new THREE.PointsMaterial({
          color: new THREE.Color(gold), size: 0.035, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false
        });
        const crowd = new THREE.Points(geo, crowdMat);
        crowd.frustumCulled = false;
        group.add(crowd);
        stands.push({ mesh: stand, crowd: crowd, crowdMat: crowdMat, data: data, geo: geo });
      }

      const outerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(13.2, 13.2, 2.4, 100, 1, true),
        standard("#080808", {
          emissive: black, emissiveIntensity: 0.06, roughness: 0.9, metalness: 0.3, side: THREE.DoubleSide
        })
      );
      outerWall.position.y = 0.0;
      group.add(outerWall);

      /* ---------- floodlight towers + powerful cones ---------- */
      const towers = [];
      const beams = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.cos(a) * 11.6;
        const z = Math.sin(a) * 9.8;
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.11, 7.2, 10),
          standard("#121212", { emissive: black, emissiveIntensity: 0.08, roughness: 0.7, metalness: 0.6 })
        );
        pole.position.set(x, 2.6, z);
        group.add(pole);
        const head = makeGlow(blue, 1.4, 0);
        head.position.set(x, 6.4, z);
        group.add(head);
        const headGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 12, 12),
          standard(blue, { emissive: blue, emissiveIntensity: 2, roughness: 0.1, metalness: 0.4 })
        );
        headGlow.position.copy(head.position);
        group.add(headGlow);
        const cone = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 3.4, 9.2, 32, 1, true),
          additive(blue, 0)
        );
        cone.position.set(x * 0.55, 1.9, z * 0.55);
        cone.rotation.x = -0.35;
        group.add(cone);
        towers.push({ pole: pole, head: head, headGlow: headGlow, cone: cone, angle: a, x: x, z: z });
        beams.push(cone);
      }

      /* ---------- pitch ---------- */
      const pitch = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 0.12, 8.4),
        standard("#0b3d1d", {
          emissive: "#14532e", emissiveIntensity: 0.35, roughness: 0.85, metalness: 0.06
        })
      );
      pitch.position.y = -1.26;
      group.add(pitch);
      for (let i = 0; i < 5; i++) {
        const crease = new THREE.Mesh(
          new THREE.BoxGeometry(3.6, 0.012, 0.05),
          additive("#ffffff", 0.5)
        );
        crease.position.set(0, -1.19, -2.6 + i * 1.55);
        group.add(crease);
      }
      const pitchGlow = makeGlow("#14532e", 10, 0.35);
      pitchGlow.position.y = -1.18;
      group.add(pitchGlow);

      /* ---------- auction stage (central platform) ---------- */
      const stage = new THREE.Group();
      stage.position.y = 0.35;
      group.add(stage);
      const stageDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.4, 0.5, 64),
        standard("#0e0e0e", {
          emissive: black, emissiveIntensity: 0.2, roughness: 0.85, metalness: 0.4
        })
      );
      stageDisc.position.y = -0.26;
      stage.add(stageDisc);
      const stageRing = torus(4.35, 0.018, gold, 0.85, 160);
      stageRing.rotation.x = Math.PI / 2;
      stageRing.position.y = 0.01;
      stage.add(stageRing);
      const stageRingB = torus(4.55, 0.012, blue, 0.5, 160);
      stageRingB.rotation.x = Math.PI / 2;
      stageRingB.position.y = 0.02;
      stage.add(stageRingB);

      /* LED ribbons rotating around the stage */
      const ribbons = [];
      for (let i = 0; i < 3; i++) {
        const ribbon = torus(2.6 + i * 0.9, 0.016, i % 2 ? gold : blue, 0.7, 120);
        ribbon.rotation.x = Math.PI / 2 + (i * 0.35);
        ribbon.position.y = 0.55 + i * 0.28;
        group.add(ribbon);
        ribbons.push(ribbon);
      }

      /* ---------- holographic auction screens ---------- */
      const screens = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.cos(a) * 5.2;
        const z = Math.sin(a) * 4.4;
        const screenGroup = new THREE.Group();
        screenGroup.position.set(x, 2.4, z);
        screenGroup.rotation.y = -a;
        group.add(screenGroup);
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(3.2, 1.9),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#0a0a0a"), transparent: true, opacity: 0.92,
            side: THREE.DoubleSide, fog: false
          })
        );
        screenGroup.add(panel);
        const frame = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.2, 1.9)),
          new THREE.LineBasicMaterial({
            color: new THREE.Color(gold), transparent: true, opacity: 0.6,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
          })
        );
        screenGroup.add(frame);
        const inner = new THREE.Mesh(
          new THREE.PlaneGeometry(2.95, 1.65),
          additive(blue, 0.35)
        );
        screenGroup.add(inner);
        const scan = new THREE.Mesh(
          new THREE.PlaneGeometry(3.0, 0.07),
          additive(gold, 0.45)
        );
        scan.position.y = -0.6;
        screenGroup.add(scan);
        screens.push({ group: screenGroup, panel: panel, frame: frame, inner: inner, scan: scan, phase: Math.random() * Math.PI * 2, baseY: 2.4 });
      }

      /* center auction block + gavel */
      const blockGroup = new THREE.Group();
      blockGroup.position.y = 1.55;
      group.add(blockGroup);
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.1, 1.1),
        standard(gold, { emissive: gold, emissiveIntensity: 1.2, roughness: 0.28, metalness: 0.85 })
      );
      blockGroup.add(block);
      const blockWire = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 1.18, 1.18),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(blue), wireframe: true, transparent: true,
          opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })
      );
      blockGroup.add(blockWire);
      const blockGlow = makeGlow(gold, 7, 0.55);
      blockGlow.position.y = 1.55;
      group.add(blockGlow);
      const blockLight = new THREE.PointLight(new THREE.Color(blue), 60, 12, 2);
      blockLight.position.set(0, 1.55, 0);
      group.add(blockLight);

      /* ---------- giant floating 3D cricket ball ---------- */
      const ballGroup = new THREE.Group();
      ballGroup.position.set(0, 2.9, 0);
      group.add(ballGroup);
      const ballCore = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 48, 32),
        standard("#ffffff", {
          emissive: "#e8e8e8", emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.15
        })
      );
      ballGroup.add(ballCore);
      // seam: two curved half-toruses + an equator ring
      const seamMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#c92a2a"), transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      });
      const seamEquator = new THREE.Mesh(
        new THREE.TorusGeometry(1.07, 0.018, 16, 64, Math.PI),
        seamMat
      );
      seamEquator.rotation.x = Math.PI / 2;
      ballGroup.add(seamEquator);
      const seamMeridian = new THREE.Mesh(
        new THREE.TorusGeometry(1.07, 0.018, 16, 64, Math.PI),
        seamMat
      );
      ballGroup.add(seamMeridian);
      const seamSpiralA = new THREE.Mesh(
        new THREE.TorusGeometry(1.07, 0.014, 12, 48, Math.PI * 1.5),
        seamMat
      );
      seamSpiralA.rotation.z = Math.PI / 4;
      ballGroup.add(seamSpiralA);
      const seamSpiralB = new THREE.Mesh(
        new THREE.TorusGeometry(1.07, 0.014, 12, 48, Math.PI * 1.5),
        seamMat
      );
      seamSpiralB.rotation.z = -Math.PI / 4;
      ballGroup.add(seamSpiralB);
      const ballGlow = makeGlow("#ffffff", 4.5, 0.45);
      ballGlow.position.set(0, 2.9, 0);
      group.add(ballGlow);
      const ballLight = new THREE.PointLight(new THREE.Color("#ffffff"), 80, 14, 2);
      ballLight.position.set(0, 2.9, 0);
      group.add(ballLight);

      /* ---------- crowd lights update ---------- */
      updates.push(function (dt, t) {
        const enter = smoothstep(0, 2.6, state.enterT);
        const bright = lerp(0, 0.75, enter);
        for (const s of stands) {
          const arr = s.geo.attributes.position.array;
          for (let k = 0; k < s.data.length; k++) {
            const d = s.data[k];
            const blink = 0.25 + 0.75 * Math.abs(Math.sin(t * (1.2 + k * 0.02) + d.phase));
            arr[k * 3 + 1] = s.mesh.position.y + 0.35 + Math.sin(t * 0.6 + d.phase * 2) * 0.02;
          }
          s.geo.attributes.position.needsUpdate = true;
          s.crowdMat.opacity = bright * (0.45 + 0.35 * Math.sin(t * 0.5 + s.mesh.position.y));
        }
      });

      /* ---------- floodlights switching on + sweeping ---------- */
      updates.push(function (dt, t) {
        const enter = smoothstep(0, 2.2, state.enterT);
        const power = lerp(0, 1, enter);
        const sweep = Math.sin(t * 0.9) * 0.5 + 0.5;
        for (let i = 0; i < towers.length; i++) {
          const tw = towers[i];
          tw.head.material.opacity = power * 0.9;
          tw.headGlow.material.emissiveIntensity = 2 * power;
          tw.cone.material.opacity = power * 0.14 * (0.5 + 0.5 * sweep);
          // slow aim drift
          const aim = Math.sin(t * 0.3 + i * 1.1) * 0.15;
          tw.cone.rotation.x = -0.35 + aim;
          tw.cone.rotation.z = Math.cos(tw.angle + t * 0.2) * 0.08;
        }
        // ambient lift as lights come on
        scene.traverse(function (o) {
          if (o.isAmbientLight) o.intensity = lerp(0.35, 1.15, power);
        });
      });

      /* ---------- stage, ribbons, screens ---------- */
      updates.push(function (dt, t) {
        const enter = smoothstep(0, 3.0, state.enterT);
        stage.rotation.y = t * 0.05;
        stageRing.rotation.z = t * 0.18;
        stageRingB.rotation.z = -t * 0.12;
        for (let i = 0; i < ribbons.length; i++) {
          ribbons[i].rotation.z = t * (0.12 + i * 0.06) * (i % 2 ? -1 : 1);
          ribbons[i].material.opacity = 0.45 + 0.35 * Math.sin(t * 0.9 + i);
        }
        blockGroup.rotation.y = t * 0.25;
        blockGroup.position.y = 1.55 + Math.sin(t * 1.1) * 0.06;
        blockWire.rotation.x = t * 0.3;
        blockLight.intensity = 40 + 30 * Math.sin(t * 1.6);
        blockGlow.material.opacity = 0.45 + 0.15 * Math.sin(t * 1.4);
        for (let i = 0; i < screens.length; i++) {
          const s = screens[i];
          s.group.position.y = s.baseY + Math.sin(t * 0.6 + s.phase) * 0.08;
          s.scan.position.y = ((t * 0.75 + s.phase) % 2.6) - 0.7;
          s.inner.material.opacity = 0.25 + 0.25 * Math.sin(t * 1.1 + i);
          s.frame.material.opacity = 0.35 + 0.25 * Math.sin(t * 1.3 + i);
        }
      });

      /* ---------- cricket ball: appears during intro, then floats ---------- */
      let ballRevealed = false;
      updates.push(function (dt, t) {
        const enter = smoothstep(0, 4.0, state.enterT);
        // ball fades/scales in between t=2.2 and t=3.6
        const show = smoothstep(2.2, 3.6, state.enterT);
        const scale = lerp(0, 1, show);
        ballGroup.scale.setScalar(scale);
        ballCore.visible = scale > 0.01;
        seamEquator.visible = scale > 0.05;
        seamMeridian.visible = scale > 0.05;
        seamSpiralA.visible = scale > 0.05;
        seamSpiralB.visible = scale > 0.05;
        ballGlow.visible = scale > 0.1;
        ballLight.visible = scale > 0.1;
        ballGlow.material.opacity = show * 0.45;
        ballLight.intensity = show * 60;
        ballGroup.position.y = 2.9 + Math.sin(t * 0.9) * 0.15;
        ballCore.rotation.y = t * 0.18;
        ballCore.rotation.x = Math.sin(t * 0.4) * 0.08;
        seamEquator.rotation.y = t * 0.18;
        seamMeridian.rotation.y = t * 0.18;
        seamSpiralA.rotation.y = t * 0.18;
        seamSpiralB.rotation.y = t * 0.18;
        ballRevealed = show > 0.99;
      });

      /* ---------- distant stadium ambience motes ---------- */
      updates.push(addMotes(group, blue, 150, { radius: 14, height: 10, y: -1.0, size: 0.07, opacity: 0.6 }));
      updates.push(addMotes(group, gold, 90, { radius: 11, height: 8, y: -0.8, size: 0.05, opacity: 0.5 }));

      return function (dt, t) { for (const u of updates) u(dt, t); };
    },

    /* 08 · International Press — the holographic newsroom */
    press: function (group, theme) {
      const pal = theme.palette;
      const updates = [];

      const globe = new THREE.Group();
      globe.position.set(0, 2.1, 0);
      group.add(globe);

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.5, 36, 26),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(pal.primary), wireframe: true, transparent: true,
          opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })
      );
      globe.add(sphere);
      const innerGlobe = new THREE.Mesh(
        new THREE.SphereGeometry(2.42, 32, 22),
        standard(pal.nebula ? pal.nebula[0] : pal.deep, {
          emissive: pal.secondary, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.4
        })
      );
      globe.add(innerGlobe);

      // city lights scattered on the globe
      const dotPositions = new Float32Array(150 * 3);
      for (let i = 0; i < 150; i++) {
        const u = rand(-1, 1);
        const theta = rand(0, Math.PI * 2);
        const r = Math.sqrt(1 - u * u);
        dotPositions[i * 3] = Math.cos(theta) * r * 2.53;
        dotPositions[i * 3 + 1] = u * 2.53;
        dotPositions[i * 3 + 2] = Math.sin(theta) * r * 2.53;
      }
      const dotGeo = new THREE.BufferGeometry();
      dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPositions, 3));
      const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({
        color: new THREE.Color(pal.accent), size: 0.07, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false
      }));
      globe.add(dots);

      const globeGlow = makeGlow(pal.primary, 11, 0.36);
      globeGlow.position.set(0, 2.1, -0.7);
      group.add(globeGlow);

      // satellites on tilted orbits
      const satellites = [];
      const orbitDefs = [
        { r: 3.6, tilt: 1.15, speed: 0.28, color: pal.accent },
        { r: 4.3, tilt: 0.62, speed: -0.2, color: pal.secondary },
        { r: 4.9, tilt: 1.48, speed: 0.15, color: pal.primary }
      ];
      for (const o of orbitDefs) {
        const ring = torus(o.r, 0.009, o.color, 0.22, 120);
        ring.rotation.x = o.tilt;
        ring.position.y = 2.1;
        group.add(ring);
        const sat = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.12, 0.14),
          standard("#b9c8e0", {
            emissive: o.color, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.7
          })
        );
        sat.add(body);
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.01, 0.16),
          standard("#3d5575", { emissive: o.color, emissiveIntensity: 0.3, roughness: 0.6, metalness: 0.4 })
        );
        sat.add(wing);
        const beacon = makeGlow(o.color, 0.5, 0.9);
        beacon.position.y = 0.16;
        sat.add(beacon);
        group.add(sat);
        satellites.push({ mesh: sat, radius: o.r, tilt: o.tilt, speed: o.speed, phase: rand(0, Math.PI * 2) });
      }

      // floating newsroom screens
      const screens = [];
      for (let i = 0; i < 5; i++) {
        const x = -6.6 + i * 3.3;
        const screen = new THREE.Group();
        screen.position.set(x, 3.0 + Math.sin(i) * 0.5, -6.5 - Math.abs(i - 2) * 0.4);
        screen.rotation.y = -x * 0.035;
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(2.3, 1.35),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(pal.deep), transparent: true, opacity: 0.86,
            side: THREE.DoubleSide, fog: false
          })
        );
        screen.add(panel);
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.3, 1.35)),
          new THREE.LineBasicMaterial({
            color: new THREE.Color(pal.accent), transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
          })
        );
        screen.add(edge);
        const scan = new THREE.Mesh(
          new THREE.PlaneGeometry(2.1, 0.08),
          additive(pal.accent, 0.24)
        );
        scan.position.y = 0.44;
        screen.add(scan);
        group.add(screen);
        screens.push({ group: screen, panel: panel, edge: edge, scan: scan, baseY: screen.position.y, phase: rand(0, Math.PI * 2) });
      }

      // ticker lines
      const tickers = [];
      for (let i = 0; i < 4; i++) {
        const ticker = new THREE.Mesh(
          new THREE.BoxGeometry(rand(4, 7), 0.025, 0.025),
          additive(i % 2 ? pal.accent : pal.primary, 0.3)
        );
        ticker.position.set(rand(-6, 6), 0.5 + i * 0.35, -3.5 - i * 0.5);
        group.add(ticker);
        tickers.push({ mesh: ticker, speed: rand(0.6, 1.4) * (i % 2 ? -1 : 1) });
      }

      updates.push(addMotes(group, pal.accent, 80, { radius: 9, height: 7, y: -1, size: 0.07, opacity: 0.6 }));
      updates.push(function (dt, t) {
        globe.rotation.y = t * 0.12;
        innerGlobe.rotation.y = t * 0.08;
        dots.rotation.y = t * 0.12;
        globeGlow.material.opacity = 0.32 + Math.sin(t * 1.1) * 0.05;
        for (const s of satellites) {
          const a = t * s.speed + s.phase;
          s.mesh.position.set(
            Math.cos(a) * s.radius,
            2.1 + Math.sin(a) * s.radius * Math.cos(s.tilt) * 0.42,
            Math.sin(a) * s.radius * Math.sin(s.tilt) * 0.55
          );
          s.mesh.rotation.y = -a;
        }
        for (let i = 0; i < screens.length; i++) {
          const s = screens[i];
          s.group.position.y = s.baseY + Math.sin(t * 0.55 + s.phase) * 0.1;
          s.scan.position.y = ((t * 0.55 + s.phase) % 2.4) - 0.6;
          s.edge.material.opacity = 0.36 + Math.sin(t * 1.4 + i) * 0.12;
          s.panel.material.opacity = 0.74 + Math.sin(t * 0.9 + i) * 0.1;
        }
        for (const tk of tickers) {
          tk.mesh.position.x += tk.speed * dt;
          if (tk.mesh.position.x > 8) tk.mesh.position.x = -8;
          if (tk.mesh.position.x < -8) tk.mesh.position.x = 8;
        }
      });
      return function (dt, t) { for (const u of updates) u(dt, t); };
    }
  };

  function addLights(theme) {
    const pal = theme.palette;
    scene.add(new THREE.AmbientLight(0x6f7fa8, 1.15));
    scene.add(new THREE.HemisphereLight(new THREE.Color(pal.accent), new THREE.Color(pal.deep), 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-7, 13, 9);
    scene.add(key);
    const rim = new THREE.PointLight(new THREE.Color(pal.primary), 160, 70, 2);
    rim.position.set(0, 4.5, 5);
    scene.add(rim);
    const fill = new THREE.PointLight(new THREE.Color(pal.secondary), 90, 80, 2);
    fill.position.set(-9, 3, -8);
    scene.add(fill);
    const back = new THREE.PointLight(new THREE.Color(pal.accent), 60, 90, 2);
    back.position.set(9, 6, -14);
    scene.add(back);
  }

  function buildScene(theme, c) {
    if (!initRenderer()) return false;
    disposeScene();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.palette.deep);
    scene.fog = new THREE.FogExp2(new THREE.Color(theme.palette.deep), 0.0125);

    const cam = theme.camera || { distance: 16, height: 3.2, target: [0, 1.5, 0] };
    baseCamera = {
      distance: cam.distance,
      height: cam.height,
      target: new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2])
    };
    camera = new THREE.PerspectiveCamera(
      coarsePointer.matches ? 58 : 52,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      coarsePointer.matches ? 160 : 240
    );
    camera.position.set(0, baseCamera.height, baseCamera.distance);
    camera.lookAt(baseCamera.target);

    addLights(theme);

    const group = new THREE.Group();
    scene.add(group);
    addBackdrop(group, theme);
    addStars(group, theme, coarsePointer.matches ? 700 : 1200);

    const builder = BUILDERS[theme.world] || BUILDERS.council;
    worldUpdate = builder(group, theme, c);

    transition = makeTransition(theme);
    scene.add(transition.points);

    state.enterT = 0;
    state.elapsed = 0;
    state.ready = true;
    return true;
  }

  /* ======================================================================
     loop / camera
     ====================================================================== */
  function updateCamera(t) {
    if (!camera || !baseCamera) return;
    const enter = smoothstep(0, 2.2, t);
    const dolly = lerp(baseCamera.distance + 8.5, baseCamera.distance, enter);
    const px = state.reduced ? 0 : pointer.x;
    const py = state.reduced ? 0 : pointer.y;
    const bob = state.reduced ? 0 : Math.sin(state.elapsed * 0.23) * 0.08;
    camera.position.x = px * 0.9;
    camera.position.y = baseCamera.height - py * 0.55 + bob + (1 - enter) * 1.4;
    camera.position.z = dolly;
    camera.lookAt(
      baseCamera.target.x + px * 0.22,
      baseCamera.target.y - py * 0.12,
      baseCamera.target.z
    );
  }

  function render() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
  }

  function tick(now) {
    if (!state.open || state.reduced) { state.raf = null; return; }
    state.raf = requestAnimationFrame(tick);
    if (!state.last) state.last = now;
    const dt = clamp((now - state.last) / 1000, 0, 0.05);
    state.last = now;
    state.enterT += dt;
    state.elapsed += dt;

    pointer.x += (pointerTarget.x - pointer.x) * 0.045;
    pointer.y += (pointerTarget.y - pointer.y) * 0.045;

    updateCamera(state.enterT);
    if (transition) transition.update(dt, state.enterT);
    if (worldUpdate) worldUpdate(dt, state.elapsed);
    render();
  }

  function startLoop() {
    if (state.raf !== null || state.reduced || state.fallback) return;
    if (!state.open || document.hidden) return;
    state.last = 0;
    state.raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (state.raf !== null) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
  }

  function staticFrame() {
    stopLoop();
    state.enterT = 8;
    state.elapsed = 8;
    if (transition) transition.update(0, 8);
    if (worldUpdate) worldUpdate(0, 8);
    updateCamera(8);
    render();
  }

  /* ======================================================================
     dossier placement
     ====================================================================== */
  function mountDossier() {
    const d = parchment.dossier;
    const slot = parchment.slot;
    if (!d || !slot || d.parentNode === slot) return;
    if (window.innerWidth < 900) return;
    state.dossierHome = { parent: d.parentNode, next: d.nextSibling };
    slot.appendChild(d);
    root.classList.add("has-dossier");
  }

  function unmountDossier() {
    const d = parchment.dossier;
    if (!d || !state.dossierHome) { root.classList.remove("has-dossier"); return; }
    const home = state.dossierHome;
    if (d.parentNode === parchment.slot && home.parent) {
      const next = home.next && home.next.parentNode === home.parent ? home.next : null;
      home.parent.insertBefore(d, next);
    }
    state.dossierHome = null;
    root.classList.remove("has-dossier");
  }

  /* ======================================================================
     enter / reveal / exit
     ====================================================================== */
  function paintTheme(theme, c) {
    const pal = theme.palette;
    root.style.setProperty("--w-primary", pal.primary);
    root.style.setProperty("--w-secondary", pal.secondary);
    root.style.setProperty("--w-accent", pal.accent);
    root.style.setProperty("--w-deep", pal.deep);
    root.style.setProperty("--w-glow", pal.glow);

    setText(parchment.hudCode, "COMMITTEE " + String(c.num).padStart(2, "0") + " · " + c.short.toUpperCase());
    setText(parchment.hudStatus, "WORLD SIGNAL LOCKED");
    setText(parchment.hudMeta, theme.startup.hud);
    setText(parchment.eyebrow, theme.startup.eyebrow);
    setText(parchment.title, theme.startup.title);
    setText(parchment.line, theme.startup.line);
    setText(parchment.coord, "SECTOR 26.27 · " + c.short.toUpperCase() + " · NEBULA MUN 2026");
    root.setAttribute("aria-label", c.short + " — " + c.name + " committee world");
  }

  function scheduleReveal() {
    window.clearTimeout(state.revealTimer);
    const delay = state.reduced ? 320 : state.fallback ? 1500 : 2450;
    state.revealTimer = window.setTimeout(revealNow, delay);
  }

  function revealNow() {
    state.revealTimer = 0;
    if (!state.open) return;
    mountDossier();
    root.classList.add("is-revealed");
    root.classList.remove("is-loading");
    setText(parchment.hudStatus, "DOSSIER ARCHIVE OPEN");
    if (state.onReveal) {
      const cb = state.onReveal;
      state.onReveal = null;
      try { cb(); } catch (err) {
        if (window.console) console.warn("[committee-worlds] reveal callback failed:", err);
      }
    }
  }

  function enter(c, onReveal) {
    if (!c) return;
    const themes = window.NEBULA_COMMITTEE_THEMES || {};
    const theme = themes[c.id] || themes.unhrc;
    if (!theme) { if (onReveal) onReveal(); return; }

    if (state.open && !state.closing) {
      if (state.current && state.current.id === c.id) {
        if (onReveal) onReveal();
        return;
      }
      exit(true);
    }

    state.open = true;
    state.closing = false;
    state.current = c;
    state.onReveal = onReveal || null;
    state.reduced = reducedMotion.matches;
    state.lastFocus = document.activeElement;
    state.fallback = false;

    paintTheme(theme, c);
    root.hidden = false;
    root.removeAttribute("hidden");
    root.setAttribute("aria-hidden", "false");
    root.classList.remove("is-revealed", "is-exiting", "is-fallback", "is-loading");
    root.classList.add("is-entering", "is-loading");
    // restart the startup animation for every entry
    void root.offsetWidth;

    document.body.classList.add("world-active");
    if (window.NEBULA_COSMOS && window.NEBULA_COSMOS.setWorldOpen) {
      window.NEBULA_COSMOS.setWorldOpen(true);
    }

    // Schedule the dossier reveal from the moment of selection so shader
    // compilation on slower devices cannot stretch the startup sequence.
    scheduleReveal();

    let built = false;
    try {
      built = buildScene(theme, c);
    } catch (err) {
      if (window.console) console.warn("[committee-worlds] scene build failed:", err);
      built = false;
    }

    if (!built) {
      state.fallback = true;
      state.ready = false;
      root.classList.add("is-fallback");
      if (renderer) {
        try { renderer.dispose(); } catch (e) { /* ignore */ }
        renderer = null;
      }
      // The first scheduleReveal() ran before the fallback state was known and
      // picked the 3D delay. Re-arm it now so the CSS world reveals promptly.
      scheduleReveal();
    } else {
      if (state.reduced) staticFrame();
      else startLoop();
    }

    if (parchment.exit) {
      window.setTimeout(function () {
        if (state.open) parchment.exit.focus({ preventScroll: true });
      }, state.reduced ? 380 : 900);
    }
  }

  function finishExit() {
    stopLoop();
    window.clearTimeout(state.revealTimer);
    state.revealTimer = 0;
    window.clearTimeout(state.exitTimer);
    state.exitTimer = 0;
    disposeScene();
    unmountDossier();
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.classList.remove("is-entering", "is-revealed", "is-exiting", "has-dossier", "is-fallback", "is-loading");
    document.body.classList.remove("world-active");
    if (window.NEBULA_COSMOS && window.NEBULA_COSMOS.setWorldOpen) {
      window.NEBULA_COSMOS.setWorldOpen(false);
    }
    const focus = state.lastFocus;
    state.open = false;
    state.closing = false;
    state.ready = false;
    state.fallback = false;
    state.current = null;
    state.onReveal = null;
    state.lastFocus = null;
    if (focus && focus.focus && document.contains(focus)) {
      try { focus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    try {
      window.dispatchEvent(new CustomEvent("nebula:world-closed"));
    } catch (e) { /* ignore */ }
  }

  function exit(immediate) {
    if (!state.open || state.closing) return;
    state.closing = true;
    window.clearTimeout(state.revealTimer);
    state.revealTimer = 0;

    if (immediate === true || state.reduced || state.fallback) {
      finishExit();
      return;
    }
    root.classList.remove("is-loading");
    root.classList.add("is-exiting");
    setText(parchment.hudStatus, "RETURNING TO THE GALAXY");
    state.exitTimer = window.setTimeout(finishExit, 640);
  }

  /* ======================================================================
     wiring
     ====================================================================== */
  if (parchment.exit) {
    parchment.exit.addEventListener("click", function () { exit(false); });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !state.open) return;
    // On mobile the dossier sheet handles Escape first; its close handler
    // exits the world through the galaxy controller.
    if (parchment.sheet && !parchment.sheet.hidden) return;
    e.preventDefault();
    exit(false);
  });

  window.addEventListener("pointermove", function (e) {
    if (!state.open || state.reduced || coarsePointer.matches) return;
    pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  window.addEventListener("resize", function () {
    if (!state.open) return;
    if (renderer && camera) {
      renderer.setPixelRatio(dprCap());
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      camera.updateProjectionMatrix();
      if (state.reduced) staticFrame();
    }
    // Cross the 900px breakpoint cleanly: the desktop dossier belongs in the
    // world slot, while the mobile sheet takes over on small screens.
    if (state.dossierHome && window.innerWidth < 900) unmountDossier();
    if (!state.dossierHome && window.innerWidth >= 900 && root.classList.contains("is-revealed")) mountDossier();
  });

  document.addEventListener("visibilitychange", function () {
    if (!state.open || state.reduced) return;
    if (document.hidden) stopLoop();
    else startLoop();
  });

  reducedMotion.addEventListener("change", function () {
    state.reduced = reducedMotion.matches;
    if (!state.open) return;
    if (state.reduced) staticFrame();
    else if (!state.closing) startLoop();
  });

  window.NEBULA_WORLDS = {
    enter: enter,
    exit: exit,
    isOpen: function () { return state.open && !state.closing; },
    isFallback: function () { return state.fallback; },
    current: function () { return state.current; },
    debug: function () {
      let meshes = 0, points = 0, lines = 0;
      if (scene) {
        scene.traverse(function (o) {
          if (o.isMesh) meshes++;
          if (o.isPoints) points++;
          if (o.isLine) lines++;
        });
      }
      return {
        open: state.open,
        closing: state.closing,
        fallback: state.fallback,
        ready: state.ready,
        reduced: state.reduced,
        enterT: state.enterT,
        world: state.current && state.current.id,
        three: !!window.THREE,
        renderer: !!renderer,
        meshes: meshes,
        points: points,
        lines: lines,
        calls: renderer && renderer.info ? renderer.info.render.calls : 0,
        triangles: renderer && renderer.info ? renderer.info.render.triangles : 0
      };
    }
  };
})();
