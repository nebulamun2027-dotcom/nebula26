/* ==========================================================================
   NEBULA MUN 2026 — Phase 4: THE NEBULA GATEWAY
   Cinematic entrance experience, dependency-free.

   Layer 1 — deep-space ambient field (stars, galaxies, haze, dust)
             rendered on the gateway canvas itself; identical visual
             language to the homepage sky.
   Layer 2 — THE GATEWAY: a monumental portal structure — nested
             concentric rings, segmented arcs, orbiting light motes,
             travelling filaments, volumetric central light, light rays,
             horizon mist. Procedural canvas art direction; no images
             needed and no cheap "glowing circle behind a title".
   Layer 3 — staged narrative: SIGNAL DETECTED → GATE ACTIVATION →
             access panel → INITIATE ENTRY. Skip control, footer replay,
             sessionStorage seen-flag, reduced-motion short path.
   Cleans up every loop, listener and DOM node it creates. If this file
   throws, the veil is lifted and the homepage renders normally.
   ========================================================================== */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var STORE_KEY = "nebula.gateway.seen";
  var SEQ = { A: 0, B: 1, C: 2, EXIT: 3, DONE: 4 };
  var SKY_SPAN_MIN = 1800;

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ======================================================================
     1. DEEP-SPACE AMBIENT FIELD
     Drawn beneath the gateway on the same canvas. Same palette and
     behaviour as the homepage sky so the transition reads as one place.
     ====================================================================== */
  function SpaceField() {
    this.w = 0; this.h = 0;
    this.stars = [];
    this.galaxies = [];
    this.dust = [];
    this.clusters = [];
  }

  SpaceField.prototype.reseed = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    var area = w * h, areaScale = Math.sqrt(area / (1440 * 900));
    var n = Math.round(240 * areaScale);
    n = clamp(n, 90, 520);
    var palette = [
      [233, 236, 246], [233, 236, 246], [233, 236, 246],
      [183, 169, 255], [92, 157, 255], [255, 226, 200]
    ];
    this.stars = [];
    for (var i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * w, y: Math.random() * h,
        r: rand(0.35, 1.5),
        base: rand(0.25, 0.85),
        amp: rand(0.15, 0.45),
        phase: Math.random() * Math.PI * 2,
        speed: rand(0.25, 1.2),
        tw: Math.random() < 0.18,
        col: palette[(Math.random() * palette.length) | 0]
      });
    }
    /* layered galactic smudges — luminous distant structures */
    this.galaxies = [
      { x: 0.72, y: 0.2, r: 0.11, a: 0.4, tilt: -0.5, sq: 0.55, hue: [206, 205, 255] },
      { x: 0.18, y: 0.26, r: 0.06, a: 0.28, tilt: 0.6, sq: 0.4, hue: [180, 170, 255] },
      { x: 0.3, y: 0.72, r: 0.08, a: 0.22, tilt: -0.2, sq: 0.5, hue: [160, 190, 255] },
      { x: 0.86, y: 0.62, r: 0.05, a: 0.2, tilt: 0.2, sq: 0.45, hue: [210, 200, 255] },
      { x: 0.52, y: 0.1, r: 0.045, a: 0.18, tilt: -0.9, sq: 0.35, hue: [190, 180, 255] },
      { x: 0.08, y: 0.5, r: 0.04, a: 0.16, tilt: 0.1, sq: 0.5, hue: [170, 180, 255] }
    ];
    /* fine luminous dust — two depths */
    this.dust = [];
    var dn = clamp(Math.round(90 * areaScale), 30, 150);
    for (var d = 0; d < dn; d++) {
      this.dust.push({
        x: Math.random() * w, y: Math.random() * h,
        r: rand(0.8, 2.4), a: rand(0.05, 0.2),
        dx: rand(-2.5, 2.5), dy: rand(-1.5, 1.5),
        depth: Math.random() < 0.5 ? 0 : 1
      });
    }
    /* realistic-looking star clusters: gaussian clumps of faint stars */
    this.clusters = [];
    var cn = clamp(Math.round(7 * areaScale), 4, 9);
    for (var c = 0; c < cn; c++) {
      var cx = Math.random() * w, cy = Math.random() * h;
      var sig = rand(18, 55), count = Math.round(rand(14, 34) * areaScale);
      var members = [];
      for (var m = 0; m < count; m++) {
        var g1 = Math.random(), g2 = Math.random();
        var ang = Math.random() * Math.PI * 2;
        var rad = sig * Math.sqrt(-2 * Math.log(g1 || 0.001));
        members.push({
          x: cx + Math.cos(ang) * rad,
          y: cy + Math.sin(ang) * rad * 0.72,
          r: rand(0.3, 1.1), a: rand(0.2, 0.6)
        });
      }
      this.clusters.push({ cx: cx, cy: cy, sig: sig, members: members });
    }
  };

  SpaceField.prototype.draw = function (ctx, time, par, reduce, phase) {
    var w = this.w, h = this.h, i, s, d;
    var t = reduce ? 8 : time / 1000;

    /* --- drifting nebula haze (two soft moving radial fields) --- */
    if (!reduce) {
      var hx1 = w * (0.18 + 0.04 * Math.sin(t * 0.05 + 1));
      var hy1 = h * (0.3 + 0.05 * Math.cos(t * 0.04));
      var hx2 = w * (0.82 + 0.05 * Math.cos(t * 0.035 + 2));
      var hy2 = h * (0.68 + 0.04 * Math.sin(t * 0.045 + 1));
      var g1 = ctx.createRadialGradient(hx1, hy1, 0, hx1, hy1, w * 0.5);
      g1.addColorStop(0, "rgba(96, 78, 200, 0.11)");
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      var g2 = ctx.createRadialGradient(hx2, hy2, 0, hx2, hy2, w * 0.55);
      g2.addColorStop(0, "rgba(56, 96, 190, 0.09)");
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
    }

    /* --- distant galaxies (soft elliptical smudges) --- */
    for (i = 0; i < this.galaxies.length; i++) {
      var gx = this.galaxies[i];
      var cx0 = gx.x * w - par.x * 6, cy0 = gx.y * h - par.y * 4;
      ctx.save();
      ctx.translate(cx0, cy0);
      ctx.rotate(gx.tilt);
      var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, gx.r * w);
      gr.addColorStop(0, "rgba(" + gx.hue[0] + "," + gx.hue[1] + "," + gx.hue[2] + "," + gx.a + ")");
      gr.addColorStop(0.35, "rgba(" + gx.hue[0] + "," + gx.hue[1] + "," + gx.hue[2] + "," + (gx.a * 0.4) + ")");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.scale(1, gx.sq);
      ctx.fillStyle = gr;
      ctx.fillRect(-gx.r * w, -gx.r * w, gx.r * w * 2, gx.r * w * 2);
      ctx.restore();
    }

    /* --- star clusters (gaussian clumps) --- */
    for (i = 0; i < this.clusters.length; i++) {
      var cl = this.clusters[i];
      for (var m = 0; m < cl.members.length; m++) {
        s = cl.members[m];
        ctx.fillStyle = "rgba(226,232,255," + (s.a * 0.5).toFixed(3) + ")";
        ctx.fillRect(s.x - par.x * 3 - s.r, s.y - par.y * 2 - s.r, s.r * 2, s.r * 2);
      }
    }

    /* --- stars: deep layer drifts slowly, near layer with slight parallax --- */
    for (i = 0; i < this.stars.length; i++) {
      s = this.stars[i];
      var deep = i % 3 === 0;
      var drift = reduce ? 0 : (deep ? 1.5 : 4) * t;
      var sx = (s.x - par.x * (deep ? 4 : 10)) % w;
      var sy = (s.y - drift * (deep ? 0.35 : 1) - par.y * (deep ? 3 : 7)) % h;
      if (sx < 0) sx += w;
      if (sy < 0) sy += h;
      var alpha = s.base + (reduce ? 0 : s.amp * Math.sin(t * s.speed + s.phase));
      if (alpha > 0.02) {
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + s.col[0] + "," + s.col[1] + "," + s.col[2] + "," + alpha.toFixed(3) + ")";
        ctx.fill();
        if (s.r > 1.25) { /* faint glow on the brightest stars */
          ctx.fillStyle = "rgba(" + s.col[0] + "," + s.col[1] + "," + s.col[2] + "," + (alpha * 0.14).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(sx, sy, s.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    /* --- luminous dust motes (two depths, slow wander) --- */
    for (i = 0; i < this.dust.length; i++) {
      d = this.dust[i];
      var dxp = d.depth === 0 ? 8 : 16;
      var dxx = (d.x - par.x * dxp + (reduce ? 0 : d.dx * t * 2)) % w;
      var dyy = (d.y - par.y * dxp * 0.6 + (reduce ? 0 : d.dy * t * 2)) % h;
      if (dxx < 0) dxx += w;
      if (dyy < 0) dyy += h;
      var tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(t * 1.1 + d.x);
      ctx.fillStyle = "rgba(200,196,255," + (d.a * tw).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(dxx, dyy, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* --- occasional soft shooting stars (ambient layer, not intro-only) --- */
    if (!reduce) {
      this._shoot = this._shoot || [];
      if (Math.random() < 0.006 && this._shoot.length < 2) {
        this._shoot.push({
          x: Math.random() * w, y: Math.random() * h * 0.4,
          vx: rand(220, 380), vy: rand(40, 130),
          life: 0, max: rand(0.7, 1.2)
        });
      }
      for (i = this._shoot.length - 1; i >= 0; i--) {
        var sh = this._shoot[i];
        sh.life += 1 / 60;
        if (sh.life > sh.max) { this._shoot.splice(i, 1); continue; }
        var lp = sh.life / sh.max;
        var fade = Math.sin(lp * Math.PI);
        sh.x += sh.vx / 60; sh.y += sh.vy / 60;
        ctx.save();
        ctx.strokeStyle = "rgba(214,222,255," + (0.5 * fade).toFixed(3) + ")";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 0.09, sh.y - sh.vy * 0.09);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* --- bottom horizon mist (multi-stop gradient) --- */
    var mist = ctx.createLinearGradient(0, h * 0.78, 0, h);
    mist.addColorStop(0, "rgba(0,0,0,0)");
    mist.addColorStop(0.65, "rgba(24, 20, 52, 0.30)");
    mist.addColorStop(1, "rgba(10, 8, 26, 0.5)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
  };

  /* ======================================================================
     2. THE GATEWAY — a monumental art-directed portal structure
     ====================================================================== */
  function Gateway() {
    this.motes = [];
    this.filaments = [];
    this.pulses = [];
    this.built = false;
  }

  Gateway.prototype.build = function (cx, cy, baseR) {
    this.cx = cx; this.cy = cy; this.baseR = baseR;
    /* orbiting light motes: individual angular speeds per ring */
    this.motes = [];
    var ringCount = RINGS.length;
    for (var ri = 0; ri < ringCount; ri++) {
      var count = 2 + (RINGS[ri].w > 2 ? 4 : 2);
      for (var k = 0; k < count; k++) {
        this.motes.push({
          ring: ri,
          ang: Math.random() * Math.PI * 2,
          speed: rand(0.14, 0.4) * (ri % 2 ? -1 : 1),
          size: rand(0.8, 1.9)
        });
      }
    }
    /* filament particles travelling between rings along arc segments */
    this.filaments = [];
    var fn = 26;
    for (var f = 0; f < fn; f++) {
      this.filaments.push({
        ring: (Math.random() * ringCount) | 0,
        prog: Math.random(),
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: rand(0.05, 0.22),
        a: rand(0.25, 0.85),
        wdt: rand(0.6, 1.6)
      });
    }
    this.built = true;
  };

  /* ring spec: radius factor, line width, opacity, tint */
  var RINGS = [
    { r: 0.30, w: 2.6, a: 0.95, tint: [200, 210, 255] },
    { r: 0.40, w: 1.5, a: 0.65, tint: [183, 169, 255] },
    { r: 0.515, w: 1.2, a: 0.5, tint: [150, 160, 255] },
    { r: 0.63, w: 3.2, a: 0.85, tint: [143, 123, 255] },
    { r: 0.775, w: 1.4, a: 0.55, tint: [92, 157, 255] },
    { r: 0.92, w: 2.0, a: 0.7, tint: [183, 169, 255] },
    { r: 1.06, w: 1.1, a: 0.4, tint: [150, 160, 255] },
    { r: 1.2, w: 1.8, a: 0.5, tint: [92, 157, 255] },
    { r: 1.35, w: 1.0, a: 0.3, tint: [150, 160, 255] },
    { r: 1.5, w: 1.4, a: 0.35, tint: [183, 169, 255] }
  ];

  Gateway.prototype.draw = function (ctx, w, h, time, par, gate, reduce) {
    if (!this.built) this.build(w * 0.5, h * 0.46, Math.min(w, h) * 0.155);
    var cx = w * 0.5 + par.x * 14;
    var cy = h * 0.46 + par.y * 10;
    var t = reduce ? 8 : time / 1000;
    var baseR = Math.min(w, h) * 0.155;
    var i;

    /* ---------- 2.1 volumetric central light ---------- */
    var coreR = baseR * (1.05 + 0.06 * Math.sin(t * 0.7)) * gate.coreBoost;
    var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.6);
    cg.addColorStop(0, "rgba(240,244,255," + (0.85 * gate.core) + ")");
    cg.addColorStop(0.16, "rgba(206,214,255," + (0.55 * gate.core) + ")");
    cg.addColorStop(0.4, "rgba(143,123,255," + (0.3 * gate.core) + ")");
    cg.addColorStop(0.72, "rgba(70,80,190," + (0.14 * gate.core) + ")");
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 2.6, 0, Math.PI * 2);
    ctx.fill();

    /* ---------- 2.2 light rays (rotating, masked to radius) ---------- */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 2.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    var rayCount = 9;
    for (i = 0; i < rayCount; i++) {
      var a = t * 0.045 + (i / rayCount) * Math.PI * 2;
      var len = baseR * (2.1 + 0.35 * Math.sin(t * 0.6 + i * 2.1));
      var wid = 0.05 + 0.02 * Math.sin(t * 0.8 + i);
      var rgrad = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      rgrad.addColorStop(0, "rgba(214,220,255," + (0.32 * gate.core) + ")");
      rgrad.addColorStop(0.55, "rgba(160,150,255," + (0.14 * gate.core) + ")");
      rgrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rgrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, len, a - wid, a + wid);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    /* ---------- 2.3 rings: arcs, tick segments, gradients, pulses ---------- */
    for (i = 0; i < RINGS.length; i++) {
      var R = RINGS[i];
      var rr = baseR * R.r;
      /* slow ring rotation for tick segments */
      var rot = reduce ? 0 : t * (0.045 + i * 0.011) * (i % 2 ? -1 : 1);
      /* radial gradient stroke: brighter on the inner-lit side */
      var ringGrad = ctx.createLinearGradient(
        cx - rr, cy - rr, cx + rr, cy + rr
      );
      var ringAlpha = R.a * gate.ring;
      ringGrad.addColorStop(0, "rgba(" + R.tint[0] + "," + R.tint[1] + "," + R.tint[2] + "," + (ringAlpha * 1.0) + ")");
      ringGrad.addColorStop(0.5, "rgba(" + R.tint[0] + "," + R.tint[1] + "," + R.tint[2] + "," + (ringAlpha * 0.45) + ")");
      ringGrad.addColorStop(1, "rgba(" + R.tint[0] + "," + R.tint[1] + "," + R.tint[2] + "," + (ringAlpha * 0.85) + ")");
      ctx.strokeStyle = ringGrad;
      ctx.lineWidth = R.w;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();

      /* travelling energy pulses on the two main rings */
      if ((i === 0 || i === 3) && gate.ring > 0.6 && !reduce) {
        if (this.pulses.length < 6 && Math.random() < 0.02) {
          this.pulses.push({ ring: i, ang: Math.random() * Math.PI * 2, life: 0, max: 1.6 });
        }
      }
      for (var p = this.pulses.length - 1; p >= 0; p--) {
        var pu = this.pulses[p];
        if (pu.ring !== i) continue;
        pu.life += 1 / 60;
        if (pu.life > pu.max) { this.pulses.splice(p, 1); continue; }
        var pa = pu.ang + (pu.life / pu.max) * Math.PI * 2.2 * (pu.ring ? -1 : 1);
        var prr = baseR * RINGS[pu.ring].r;
        var pulseGlow = Math.sin((pu.life / pu.max) * Math.PI);
        var pg = ctx.createRadialGradient(cx + Math.cos(pa) * prr, cy + Math.sin(pa) * prr, 0, cx + Math.cos(pa) * prr, cy + Math.sin(pa) * prr, 26);
        pg.addColorStop(0, "rgba(225,230,255," + (0.5 * pulseGlow * gate.ring) + ")");
        pg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(pa) * prr, cy + Math.sin(pa) * prr, 26, 0, Math.PI * 2);
        ctx.fill();
      }

      /* tick segments on the outermost rings */
      if (R.r >= 1.2) {
        var segs = 42, tw = 0.028;
        ctx.lineWidth = R.w * 2.4;
        ctx.strokeStyle = "rgba(183,169,255," + (0.5 * gate.ring) + ")";
        for (var sg = 0; sg < segs; sg++) {
          var sa = rot + (sg / segs) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx, cy, rr, sa, sa + tw);
          ctx.stroke();
          /* dash shadow */
          ctx.beginPath();
          ctx.arc(cx, cy, rr - 5, sa + 0.004, sa + tw - 0.004);
          ctx.strokeStyle = "rgba(120,140,255,0.16)";
          ctx.stroke();
        }
      }
    }

    /* ---------- 2.4 orbiting light motes ---------- */
    for (i = 0; i < this.motes.length; i++) {
      var mo = this.motes[i];
      var R2 = RINGS[mo.ring];
      mo.ang += mo.speed / 60;
      var mx = cx + Math.cos(mo.ang) * baseR * R2.r;
      var my = cy + Math.sin(mo.ang) * baseR * R2.r;
      var tw2 = reduce ? 0.8 : 0.6 + 0.4 * Math.sin(t * 2 + mo.ang * 3);
      ctx.fillStyle = "rgba(215,220,255," + (0.75 * tw2 * gate.ring) + ")";
      ctx.beginPath();
      ctx.arc(mx, my, mo.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(180,170,255," + (0.2 * tw2 * gate.ring) + ")";
      ctx.beginPath();
      ctx.arc(mx, my, mo.size * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ---------- 2.5 filaments: particles travelling along rings ---------- */
    for (i = 0; i < this.filaments.length; i++) {
      var fi = this.filaments[i];
      fi.prog += fi.speed * fi.dir / 60;
      if (fi.prog > 1) fi.prog -= 1;
      if (fi.prog < 0) fi.prog += 1;
      var fa = fi.prog * Math.PI * 2;
      var frr = baseR * RINGS[fi.ring].r;
      var fx = cx + Math.cos(fa) * frr, fy = cy + Math.sin(fa) * frr;
      var tail = 0.08 * fi.dir;
      ctx.strokeStyle = "rgba(196,205,255," + (fi.a * gate.ring) + ")";
      ctx.lineWidth = fi.wdt;
      ctx.beginPath();
      ctx.arc(cx, cy, frr, Math.min(fa, fa + tail), Math.max(fa, fa + tail));
      ctx.stroke();
      ctx.fillStyle = "rgba(230,234,255," + (fi.a * 0.9 * gate.ring) + ")";
      ctx.beginPath();
      ctx.arc(fx, fy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ---------- 2.6 acceleration ring streaks on ENTRY ---------- */
    if (gate.exitRush > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      var streaks = 22;
      for (i = 0; i < streaks; i++) {
        var sa2 = (i / streaks) * Math.PI * 2 + gate.exitRush * 1.3;
        var inR = baseR * (0.2 + gate.exitRush * 2.2);
        var len2 = 40 + gate.exitRush * 260;
        var sg2 = ctx.createLinearGradient(
          Math.cos(sa2) * inR, Math.sin(sa2) * inR,
          Math.cos(sa2) * (inR + len2), Math.sin(sa2) * (inR + len2)
        );
        sg2.addColorStop(0, "rgba(226,230,255," + (0.4 * gate.exitRush) + ")");
        sg2.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = sg2;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(sa2) * inR, Math.sin(sa2) * inR);
        ctx.lineTo(Math.cos(sa2) * (inR + len2), Math.sin(sa2) * (inR + len2));
        ctx.stroke();
    }
      ctx.restore();
    }

    /* ---------- 2.7 concentric halo waves on entry ---------- */
    if (gate.exitRush > 0) {
      var waves = 3;
      for (i = 0; i < waves; i++) {
        var wp = clamp(gate.exitRush * 1.35 - i * 0.22, 0, 1);
        if (wp <= 0) continue;
        var wr = baseR * (0.4 + wp * 5.5);
        ctx.strokeStyle = "rgba(200,205,255," + (0.34 * (1 - wp)) + ")";
        ctx.lineWidth = 2.2 - i * 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, wr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    /* ---------- 2.8 axial glow: vertical light column behind the rings ---------- */
    var colG = ctx.createLinearGradient(cx, cy - baseR * 2.4, cx, cy + baseR * 2.4);
    colG.addColorStop(0, "rgba(0,0,0,0)");
    colG.addColorStop(0.5, "rgba(120,110,220," + (0.12 * gate.core) + ")");
    colG.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = colG;
    ctx.fillRect(cx - baseR * 0.16, cy - baseR * 2.4, baseR * 0.32, baseR * 4.8);

    /* ---------- 2.9 horizon reflection of the portal light ---------- */
    var refl = ctx.createRadialGradient(cx, h * 1.02, 0, cx, h * 1.02, baseR * 2.4);
    refl.addColorStop(0, "rgba(120,100,230," + (0.14 * gate.core) + ")");
    refl.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = refl;
    ctx.fillRect(cx - baseR * 2.4, h * 0.86, baseR * 4.8, h * 0.16);
  };

  window.NEBULA_GATEWAY = { SpaceField: SpaceField, Gateway: Gateway };
})();