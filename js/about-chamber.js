/* ==========================================================================
   NEBULA MUN 2026 — The Celestial Diplomacy Chamber (About section)
   A self-contained WebGL scene for the About section: a slowly rotating
   Earth-like central planet with two metallic rings, three smaller
   planets riding those rings around it (distinct speeds, sizes and
   starting angles — never crossing the central body),
   drifting particles and pointer parallax.
   Dependency-free: follows the patterns of js/nebula.js and adds real
   3D geometry. Honors prefers-reduced-motion (static frame), and falls
   back to a 2D canvas when WebGL is unavailable.
   ========================================================================== */
(function () {
  "use strict";

  const glCanvas = document.getElementById("about-chamber");
  const fbCanvas = document.getElementById("about-chamber-2d");
  if (!glCanvas || !fbCanvas) return;

  // --- state / stubs (filled in below)
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");

  let gl = null;
  let rafId = null;
  let projMat = null;
  let viewMat = null;
  let globe, ringA, ringB, planetA, planetB, planetC;
  let pPos, pSize, pPhase, pPosLoc, pSizeLoc, pPhaseLoc;
  let partProg = null;
  let pCount = 0;
  const camPos = [2.6, 1.2, 5.2];
  const parallax = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const PARALLAX_STRENGTH = 0.35;
  let t0 = 0;

  /* ---------------- matrix helpers (column-major) ---------------- */
  function identity() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    const m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f;
    m[10] = (far + near) * nf; m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
  }
  function lookAt(eye, center, up) {
    const ex = eye[0], ey = eye[1], ez = eye[2];
    const fx = center[0] - ex, fy = center[1] - ey, fz = center[2] - ez;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const fxn = fx / fl, fyn = fy / fl, fzn = fz / fl; // forward (OpenGL-style)
    const rx = up[1] * fzn - up[2] * fyn;
    const ry = up[2] * fxn - up[0] * fzn;
    const rz = up[0] * fyn - up[1] * fxn;
    const rl = Math.hypot(rx, ry, rz) || 1;
    const rX = rx / rl, rY = ry / rl, rZ = rz / rl;
    const ux = rY * fzn - rZ * fyn;
    const uy = rZ * fxn - rX * fzn;
    const uz = rX * fyn - rY * fxn;
    const m = new Float32Array(16);
    m[0] = rX; m[1] = ux; m[2] = -fxn; m[3] = 0;
    m[4] = rY; m[5] = uy; m[6] = -fyn; m[7] = 0;
    m[8] = rZ; m[9] = uz; m[10] = -fzn; m[11] = 0;
    m[12] = -(rX * ex + rY * ey + rZ * ez);
    m[13] = -(ux * ex + uy * ey + uz * ez);
    m[14] = fxn * ex + fyn * ey + fzn * ez;
    m[15] = 1;
    return m;
  }
  function rotateX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  }
  function rotateY(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  }
  function mul(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }
  function modelMatrix(pos, scale, rotZ, squashY) {
    // T * Rz * S  (suspension objects may be flattened in Y)
    const s = identity();
    s[0] = scale; s[5] = squashY ? scale * squashY : scale; s[10] = scale;
    const c = rotZ ? Math.cos(rotZ) : 1;
    const sn = rotZ ? Math.sin(rotZ) : 0;
    const rz = new Float32Array([
      c, 0, sn, 0,
      0, 1, 0, 0,
      -sn, 0, c, 0,
      0, 0, 0, 1
    ]);
    const p = identity();
    p[12] = pos[0]; p[13] = pos[1]; p[14] = pos[2];
    return mul(mul(p, rz), s);
  }

  const MESH_VS = [
    "attribute vec3 aPos;",
    "attribute vec3 aNormal;",
    "attribute vec2 aUV;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform mat4 uModel;",
    "varying vec3 vN;",
    "varying vec3 vWorld;",
    "varying vec2 vUV;",
    "void main() {",
    "  vec4 wp = uModel * vec4(aPos, 1.0);",
    "  float wpx = wp.x; float wpy = wp.y; float wpz = wp.z;",
    "  vWorld = vec3(wpx, wpy, wpz);",
    "  vN = mat3(uModel) * aNormal;",
    "  vUV = aUV;",
    "  gl_Position = uProj * uView * wp;",
    "}"
  ].join("\n");


  const MESH_FS = [
    "precision mediump float;",
    "uniform float uTime;",
    "uniform vec3 uCamPos;",
    "uniform vec4 uTint;",
    "uniform float uSpec;",
    "uniform float uGlobe;",
    "varying vec3 vN;",
    "varying vec3 vWorld;",
    "varying vec2 vUV;",
    "float hash11(vec3 p) {",
"  p = fract(p * 0.3183098862);",
"  p = p * 17.0;",
"  float px = p.x; float py = p.y; float pz = p.z;",
"  return fract(px * (py + 13.7) * (pz + 1.9));",
"}",
    "float noise3(vec3 p) {",
    "  vec3 i = floor(p); vec3 f = fract(p);",
    "  vec3 u = f * f * (3.0 - 2.0 * f);",
    "  float ux = u.x; float uy = u.y; float uz = u.z;",
    "  float n000 = hash11(i);",
    "  float n100 = hash11(i + vec3(1.0, 0.0, 0.0));",
    "  float n010 = hash11(i + vec3(0.0, 1.0, 0.0));",
    "  float n110 = hash11(i + vec3(1.0, 1.0, 0.0));",
    "  float n001 = hash11(i + vec3(0.0, 0.0, 1.0));",
    "  float n101 = hash11(i + vec3(1.0, 0.0, 1.0));",
    "  float n011 = hash11(i + vec3(0.0, 1.0, 1.0));",
    "  float n111 = hash11(i + vec3(1.0, 1.0, 1.0));",
    "  float x0 = n000 + (n100 - n000) * ux;",
    "  float x1 = n010 + (n110 - n010) * ux;",
    "  float y0 = x0 + (x1 - x0) * uy;",
    "  float z0 = n001 + (n101 - n001) * ux;",
    "  float z1 = n011 + (n111 - n011) * ux;",
    "  float y1 = z0 + (z1 - z0) * uy;",
    "  return y0 + (y1 - y0) * uz;",
    "}",
    "float fbm3(vec3 p, float seed) {",
    "  float v = 0.0; float amp = 0.55;",
    "  vec3 w = vec3(noise3(p) * 1.3); p += w;",
    "  for (int i = 0; i < 4; i++) {",
    "    v += amp * noise3(p);",
    "    p = p * 2.03 + vec3(11.3, 7.1, 3.7) + seed;",
    "    amp *= 0.5;",
    "  }",
    "  return v;",
    "}",
    "void main() {",
    "  vec3 N = normalize(vN);",
    "  vec3 V = normalize(uCamPos - vWorld);",
    "  vec3 L = normalize(vec3(-0.55, 0.72, 0.42));",
    "  vec3 H = normalize(L + V);",
    "  float nx = N.x; float ny = N.y; float nz = N.z;",
    "  float lx = L.x; float ly = L.y; float lz = L.z;",
    "  float hx = H.x; float hy = H.y; float hz = H.z;",
    "  float vx = V.x; float vy = V.y; float vz = V.z;",
    "  float diff = max(nx * lx + ny * ly + nz * lz, 0.0);",
    "  float spec = pow(max(nx * hx + ny * hy + nz * hz, 0.0), 48.0) * uSpec;",
    "  vec3 surf;",
    "  if (uGlobe > 0.5) {",
    "    vec3 dir = normalize(vWorld);",
    "    vec3 ocean = vec3(0.03, 0.16, 0.42);",
    "    float cont = fbm3(dir * 1.7, 0.0);",
    "    float landMask = smoothstep(0.52, 0.58, cont);",
    "    vec3 land = mix(vec3(0.16, 0.28, 0.14), vec3(0.32, 0.30, 0.16), fbm3(dir * 3.1, 3.0));",
    "    float polar = smoothstep(0.86, 0.93, abs(dir.y));",
    "    surf = mix(ocean, land, landMask);",
    "    surf = mix(surf, vec3(0.85, 0.88, 0.95), polar);",
    "    float cloud = fbm3(dir * 2.4 + vec3(uTime * 0.004, 0.0, 0.0), 7.0);",
    "    surf = mix(surf, vec3(1.0), smoothstep(0.55, 0.75, cloud) * 0.5);",
    "  } else {",
    "    float tr = uTint.x; float tg = uTint.y; float tb = uTint.z;",
    "    surf = vec3(tr, tg, tb);",
    "  }",
    "  // atmospheric rim (blue) + champagne edge glow on the globe",
    "  float rim = pow(1.0 - max(nx * vx + ny * vy + nz * vz, 0.0), 3.0);",
    "  vec3 rimCol = (uGlobe > 0.5) ? vec3(0.36, 0.61, 1.0) : vec3(0.85, 0.75, 0.55);",
    "  vec3 col = surf * (0.22 + 0.78 * diff) + rimCol * rim * 0.8 + vec3(1.0) * spec;",
    "  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "}"
  ].join("\n");
  
  const PART_VS = [
    "attribute vec3 aPos;",
    "attribute float aSize;",
    "attribute float aPhase;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform float uTime;",
    "varying float vAlpha;",
    "void main() {",
    "  vec3 p = aPos;",
    "  p = p + vec3(sin(uTime * 0.12 + aPhase) * 0.25, cos(uTime * 0.09 + aPhase * 1.7) * 0.18, sin(uTime * 0.07 + aPhase * 2.3) * 0.2);",
    "  vec4 vp = uView * vec4(p, 1.0);",
    "  gl_Position = uProj * vp;",
    "  float vzp = -vp.z;",
    "  float persp = 1.0 / max(vzp, 0.01);",
    "  gl_PointSize = clamp(aSize * 30.0 * persp, 1.0, 14.0);",
    "  vAlpha = 0.35 + 0.45 * (0.5 + 0.5 * sin(uTime * 0.5 + aPhase));",
    "}"
  ].join("\n");
  const PART_FS = [
    "precision mediump float;",
    "uniform vec3 uTint;",
    "varying float vAlpha;",
    "void main() {",
    "  float r = length(gl_PointCoord - vec2(0.5));",
    "  float a = smoothstep(0.5, 0.15, r) * vAlpha;",
    "  gl_FragColor = vec4(uTint, a);",
    "}"
  ].join("\n");

  function resize() {
    const rect = glCanvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w;
      glCanvas.height = h;
      if (gl) gl.viewport(0, 0, w, h);
    }
  }

  /* ---------------- geometry builders ---------------- */
  function makeSphere(radius, seg) {
    const pos = [], nor = [], uv = [], idx = [];
    for (let y = 0; y <= seg; y++) {
      const v = y / seg, phi = v * Math.PI;
      for (let x = 0; x <= seg; x++) {
        const u = x / seg, theta = u * Math.PI * 2;
        const sx = -Math.cos(theta) * Math.sin(phi);
        const sy = Math.cos(phi);
        const sz = Math.sin(theta) * Math.sin(phi);
        pos.push(radius * sx, radius * sy, radius * sz);
        nor.push(sx, sy, sz);
        uv.push(u, v);
      }
    }
    for (let y = 0; y < seg; y++) {
      for (let x = 0; x < seg; x++) {
        const a = y * (seg + 1) + x;
        const b = a + seg + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }
  function makeRing(radius, tube, seg) {
    const pos = [], nor = [], uv = [], idx = [];
    const h = 0.012; // half-height of the metallic ribbon ring
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, theta = u * Math.PI * 2;
      const cx = Math.cos(theta) * radius, cz = Math.sin(theta) * radius;
      pos.push(cx, h, cz); nor.push(0, 1, 0); uv.push(u, 1);
      pos.push(cx, -h, cz); nor.push(0, -1, 0); uv.push(u, 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 2;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }
  function makePoints(count, spread) {
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * spread.x;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * spread.y;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * spread.z;
      size[i] = 0.35 + Math.random() * 1.1;
      phase[i] = Math.random() * Math.PI * 2;
    }
    return { pos, size, phase };
  }

  function modelOf(obj, time) {
    const T = identity();
    T[12] = obj.pos[0];
    T[13] = obj.pos[1] + (obj.bob ? Math.sin(time * obj.bobSpeed + (obj.phase || 0)) * 0.12 : 0);
    T[14] = obj.pos[2];
    const R = mul(rotateX(obj.tilt || 0), rotateY(time * (obj.spin || 0)));
    return mul(T, R);
  }

  function orbitModel(radius, angle, tilt, orbitSpin, pos, size) {
    // Ring rider: the planet's centre is placed exactly on a ring's
    // centreline by transforming the ring-plane point (cos·r, 0, sin·r)
    // with the same T(pos) * rotateX(tilt) * rotateY(spin) transform the
    // ring mesh uses (via the stored rotateX/rotateY matrices below). The
    // orbit radius stays safely outside the central planet, so the small
    // planets circle the big one along the visible rings without ever
    // crossing its surface or silhouette.
    const local = identity();
    local[12] = Math.cos(angle) * radius;
    local[14] = Math.sin(angle) * radius;
    const spin = rotateY(orbitSpin);
    const tiltM = rotateX(tilt);
    const world = mul(tiltM, mul(spin, local));
    const m = identity();
    m[0] = size; m[5] = size; m[10] = size;
    m[12] = pos[0] + world[12];
    m[13] = pos[1] + world[13];
    m[14] = pos[2] + world[14];
    return m;
  }

  function drawParticles(eye, time) {
    if (!gl || !partProg || !pPos) return;
    gl.useProgram(partProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(partProg, "uProj"), false, projMat);
    gl.uniformMatrix4fv(gl.getUniformLocation(partProg, "uView"), false, viewMat);
    gl.uniform3fv(gl.getUniformLocation(partProg, "uCamPos"), eye);
    gl.uniform1f(gl.getUniformLocation(partProg, "uTime"), time);
    gl.uniform3f(gl.getUniformLocation(partProg, "uTint"), 0.7, 0.75, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, pPos);
    gl.enableVertexAttribArray(pPosLoc);
    gl.vertexAttribPointer(pPosLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, pSize);
    gl.enableVertexAttribArray(pSizeLoc);
    gl.vertexAttribPointer(pSizeLoc, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, pPhase);
    gl.enableVertexAttribArray(pPhaseLoc);
    gl.vertexAttribPointer(pPhaseLoc, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, pCount);
  }

  function frame(now) {
    if (!gl) return;
    if (!t0) t0 = now;
    parallax.x += (target.x - parallax.x) * 0.04;
    parallax.y += (target.y - parallax.y) * 0.04;
    const time = (now - t0) / 1000;
    const aspect = glCanvas.width / Math.max(1, glCanvas.height);
    projMat = perspective(40 * Math.PI / 180, aspect, 0.1, 100);
    const eye = [
      camPos[0] + parallax.x * PARALLAX_STRENGTH,
      camPos[1] - parallax.y * PARALLAX_STRENGTH * 0.6,
      camPos[2]
    ];
    viewMat = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    ringB.draw(modelOf({ pos: [0, -0.1, 0], tilt: 0.45, spin: 0.05 }, time), eye, time);
    ringA.draw(modelOf({ pos: [0, -0.1, 0], tilt: 0.55, spin: 0.09 }, time), eye, time);
    const globeModel = mul(modelMatrix([0, 0.05, 0], 1.15, 0, 0), rotateY(time * 0.06));
    globe.draw(globeModel, eye, time);
    // Three small planets riding the two rings around the central planet:
    // two co-orbital on ring A (same speed, fixed separation — they never
    // collide), one on ring B, each with its own size and starting angle.
    // Depth testing (globe drawn first) hides a planet while its orbit
    // carries it behind the central body, so no planet ever crosses the
    // central planet's surface or silhouette.
    planetA.draw(orbitModel(1.85, time * 0.22, 0.55, time * 0.09, [0, -0.1, 0], 0.24), eye, time);
    planetB.draw(orbitModel(1.85, time * 0.22 + 2.7, 0.55, time * 0.09, [0, -0.1, 0], 0.30), eye, time);
    planetC.draw(orbitModel(2.35, time * 0.15, 0.45, time * 0.05, [0, -0.1, 0], 0.20), eye, time);
    drawParticles(eye, time);
    rafId = requestAnimationFrame(frame);
  }

  function staticFrame() {
    if (!gl) return;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    const time = 3.0; // deterministic static composition
    const aspect = glCanvas.width / Math.max(1, glCanvas.height);
    projMat = perspective(40 * Math.PI / 180, aspect, 0.1, 100);
    viewMat = lookAt(camPos, [0, 0, 0], [0, 1, 0]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    ringB.draw(modelOf({ pos: [0, -0.1, 0], tilt: 0.45, spin: 0.05 }, time), camPos, time);
    ringA.draw(modelOf({ pos: [0, -0.1, 0], tilt: 0.55, spin: 0.09 }, time), camPos, time);
    globe.draw(mul(modelMatrix([0, 0.05, 0], 1.15, 0, 0), rotateY(time * 0.06)), camPos, time);
    planetA.draw(orbitModel(1.85, time * 0.22, 0.55, time * 0.09, [0, -0.1, 0], 0.24), camPos, time);
    planetB.draw(orbitModel(1.85, time * 0.22 + 2.7, 0.55, time * 0.09, [0, -0.1, 0], 0.30), camPos, time);
    planetC.draw(orbitModel(2.35, time * 0.15, 0.45, time * 0.05, [0, -0.1, 0], 0.20), camPos, time);
    drawParticles(camPos, time);
  }

  function applyMotionMode() {
    if (!gl) return;
    if (reducedMotion.matches) {
      staticFrame();
    } else if (rafId === null) {
      t0 = 0;
      rafId = requestAnimationFrame(frame);
    }
  }
  function fallback2D() {
    if (!fbCanvas.getContext) return;
    const ctx = fbCanvas.getContext("2d");
    if (!ctx) return;
    if (gl) { gl = null; if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }
    glCanvas.style.display = "none";
    fbCanvas.style.display = "block";

    let w = 0, h = 0, dpr = 1;
    let stars = [];
    let fbRafId = null;
    let fbT0 = 0;

    function sizeCanvas() {
      const rect = fbCanvas.parentElement.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.max(1, Math.round(rect.width * dpr));
      h = Math.max(1, Math.round(rect.height * dpr));
      fbCanvas.width = w; fbCanvas.height = h;
      const coarse = coarsePointer.matches;
      const count = coarse ? 40 : 140;
      stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.6 + Math.random() * 1.6,
          p: Math.random() * Math.PI * 2,
          sp: 0.3 + Math.random() * 0.7
        });
      }
    }

    function drawScene(time) {
      const coarse = coarsePointer.matches;
      const cx = w * 0.40, cy = h * 0.52; // globe off-centre (left of text block)
      const R = Math.min(w, h) * (coarse ? 0.24 : 0.28);

      // background wash (section-local, over site sky)
      const bg = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, Math.max(w, h) * 0.9);
      bg.addColorStop(0, "rgba(93, 78, 190, 0.20)");
      bg.addColorStop(1, "rgba(4, 6, 13, 0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // distant stars
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * s.sp + s.p));
        ctx.globalAlpha = reducedMotion.matches ? 0.5 : a;
        ctx.fillStyle = "#cdd6ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // orbital rings (two tilted ellipses around the globe)
      ctx.lineWidth = Math.max(1.5, dpr * 1.5);
      const ring = (radius, tilt, color, phase) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, R * radius, R * radius * 0.30, 0, 0, Math.PI * 2);
        ctx.stroke();
        // light trail: a bright arc segment moving around the ring
        const a0 = time * 0.25 + phase;
        ctx.strokeStyle = "rgba(255, 244, 214, 0.55)";
        ctx.beginPath();
        ctx.ellipse(0, 0, R * radius, R * radius * 0.30, 0, a0, a0 + 0.9);
        ctx.stroke();
        ctx.restore();
      };
      ring(1.55, -0.12, "rgba(214, 196, 148, 0.5)", 0);
      ring(1.95, -0.32, "rgba(150, 160, 255, 0.45)", 2.1);

      // planets riding the two rings around the globe: distinct speeds,
      // sizes and starting angles (two share ring A at a fixed separation,
      // one travels ring B). Each ring's top half passes behind the globe
      // and its bottom half in front — two passes give correct depth.
      const drawPlanets = (pass) => {
        const specs = [
          { rf: 1.55, tilt: -0.12, speed: 0.25, phase: 0, r: 0.075, c1: "#a58fd6", c2: "#41356e" },
          { rf: 1.55, tilt: -0.12, speed: 0.25, phase: 2.7, r: 0.11, c1: "#e8b45f", c2: "#6e4c1e" },
          { rf: 1.95, tilt: -0.32, speed: 0.18, phase: 1.1, r: 0.065, c1: "#7fa8ff", c2: "#27437e" }
        ];
        const drift = reducedMotion.matches ? 0 : time;
        for (let i = 0; i < specs.length; i++) {
          const s = specs[i];
          const a = s.phase + drift * s.speed;
          const lx = Math.cos(a) * R * s.rf;
          const ly = Math.sin(a) * R * s.rf * 0.30;
          const px = cx + lx * Math.cos(s.tilt) - ly * Math.sin(s.tilt);
          const py = cy + lx * Math.sin(s.tilt) + ly * Math.cos(s.tilt);
          const behind = ly < 0;
          if ((pass === "back") !== behind) continue;
          const pr = R * s.r;
          const g = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.4, pr * 0.1, px, py, pr * 1.02);
          g.addColorStop(0, s.c1);
          g.addColorStop(1, s.c2);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      };
      drawPlanets("back");

      // Earth: ocean + procedural-style continents + clouds + atmospheric rim
      const oc = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.15);
      oc.addColorStop(0, "#2b5fae");
      oc.addColorStop(0.7, "#132c5c");
      oc.addColorStop(1, "#0a1a3a");
      ctx.fillStyle = oc;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // continents (deterministic blobs that drift with time)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      const drift = reducedMotion.matches ? 0 : time * 0.05;
      for (let i = 0; i < 5; i++) {
        const ang = drift + i * 1.9;
        const lx = cx + Math.cos(ang) * R * 0.5;
        const ly = cy + Math.sin(ang * 0.7) * R * 0.45;
        const lw = R * (0.30 + 0.12 * Math.sin(i * 2.3));
        const lh = R * (0.20 + 0.08 * Math.cos(i * 1.7));
        ctx.fillStyle = i % 2 ? "rgba(58, 84, 52, 0.85)" : "rgba(80, 100, 60, 0.85)";
        ctx.beginPath();
        ctx.ellipse(lx, ly, lw, lh, ang * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // polar caps
      ctx.fillStyle = "rgba(230, 236, 245, 0.75)";
      ctx.beginPath();
      ctx.ellipse(cx, cy - R * 0.9, R * 0.5, R * 0.18, 0, 0, Math.PI * 2);
      ctx.ellipse(cx, cy + R * 0.9, R * 0.55, R * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // clouds
      if (!reducedMotion.matches) {
        for (let i = 0; i < 4; i++) {
          const ang = time * 0.03 + i * 2.2;
          const lx = cx + Math.cos(ang) * R * 0.55;
          const ly = cy + Math.sin(ang * 0.8) * R * 0.5;
          ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
          ctx.beginPath();
          ctx.ellipse(lx, ly, R * 0.32, R * 0.12, ang * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      // atmospheric rim glow (blue)
      const rim = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.18);
      rim.addColorStop(0, "rgba(92, 157, 255, 0)");
      rim.addColorStop(0.55, "rgba(92, 157, 255, 0.35)");
      rim.addColorStop(1, "rgba(92, 157, 255, 0)");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.2, 0, Math.PI * 2);
      ctx.fill();
      drawPlanets("front");

      // vignette
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
      vg.addColorStop(0, "rgba(2, 3, 8, 0)");
      vg.addColorStop(1, "rgba(2, 3, 8, 0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    function fbFrame(now) {
      if (!fbT0) fbT0 = now;
      const time = (now - fbT0) / 1000;
      drawScene(time);
      fbRafId = requestAnimationFrame(fbFrame);
    }
    function fbStatic() {
      if (fbRafId !== null) { cancelAnimationFrame(fbRafId); fbRafId = null; }
      drawScene(3.0);
    }

    sizeCanvas();
    const onFbResize = () => {
      sizeCanvas();
      if (reducedMotion.matches) fbStatic();
    };
    window.addEventListener("resize", onFbResize);
    const onFbMotion = () => {
      if (reducedMotion.matches) fbStatic();
      else if (fbRafId === null) { fbT0 = 0; fbRafId = requestAnimationFrame(fbFrame); }
    };
    reducedMotion.addEventListener("change", onFbMotion);
    if (reducedMotion.matches) fbStatic();
    else fbRafId = requestAnimationFrame(fbFrame);

    // cleanup: stop loop + remove listeners (satisfies "clean up animation loops and listeners")
    window.addEventListener("beforeunload", function cleanup() {
      if (fbRafId !== null) { cancelAnimationFrame(fbRafId); fbRafId = null; }
      window.removeEventListener("resize", onFbResize);
      reducedMotion.removeEventListener("change", onFbMotion);
    });
  }

  function makeBuf(gl, data, target) {
    const buf = gl.createBuffer();
    gl.bindBuffer(target || gl.ARRAY_BUFFER, buf);
    gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }
  function uploadMesh(gl, prog, geo, opts) {
    const o = opts || {};
    const vb = makeBuf(gl, geo.pos);
    const nb = makeBuf(gl, geo.nor);
    const ub = makeBuf(gl, geo.uv);
    const ib = makeBuf(gl, geo.idx, gl.ELEMENT_ARRAY_BUFFER);
    const aPos = gl.getAttribLocation(prog, "aPos");
    const aNor = gl.getAttribLocation(prog, "aNormal");
    const aUV = gl.getAttribLocation(prog, "aUV");
    function bindMesh() {
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.enableVertexAttribArray(aNor);
      gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, ub);
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    }
    return {
      geo,
      draw(model, camPos, time) {
        gl.useProgram(prog);
        bindMesh();
        gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uProj"), false, projMat);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uView"), false, viewMat);
        gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uModel"), false, model);
        gl.uniform3fv(gl.getUniformLocation(prog, "uCamPos"), camPos);
        gl.uniform1f(gl.getUniformLocation(prog, "uTime"), time);
        gl.uniform4fv(gl.getUniformLocation(prog, "uTint"), o.tint || [0.65, 0.55, 0.4, 1.0]);
        gl.uniform1f(gl.getUniformLocation(prog, "uSpec"), o.spec != null ? o.spec : 0.6);
        gl.uniform1f(gl.getUniformLocation(prog, "uGlobe"), o.globe ? 1 : 0);
        gl.drawElements(gl.TRIANGLES, geo.idx.length, gl.UNSIGNED_SHORT, 0);
      }
    };
  }

  function buildProgram(gl, vs, fs) {
    function sh(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        if (typeof console !== "undefined") console.warn("[about-chamber] shader compile failed:", log);
        throw new Error(log);
      }
      return s;
    }
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      if (typeof console !== "undefined") console.warn("[about-chamber] link failed:", log);
      throw new Error(log);
    }
    return p;
  }

  function initGL() {
    const opts = { antialias: true, alpha: true, depth: true, stencil: true, powerPreference: "high-performance" };
    gl = glCanvas.getContext("webgl", opts) || glCanvas.getContext("experimental-webgl", opts);
    if (!gl) { fallback2D(); return; }
    gl.clearColor(0.016, 0.024, 0.055, 0); // transparent over the site sky
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // programs
    const meshProg = buildProgram(gl, MESH_VS, MESH_FS);
    partProg = buildProgram(gl, PART_VS, PART_FS);

    // scene objects
    const coarse = coarsePointer.matches;
    const sphereSeg = coarse ? 48 : 64;
    globe = uploadMesh(gl, meshProg, makeSphere(1.15, sphereSeg), { globe: true, spec: 0.25, tint: [0.3, 0.5, 0.85, 1.0] });
    // Ring radii leave clearance for the ring-riding planets: with the
    // globe at radius 1.3225 and the ring centre 0.15 below it, the closest
    // planet surface stays ~0.05 outside the globe's silhouette.
    ringA = uploadMesh(gl, meshProg, makeRing(1.85, 0.012, 96), { spec: 0.9, tint: [0.65, 0.55, 0.4, 1.0] });
    ringB = uploadMesh(gl, meshProg, makeRing(2.35, 0.012, 96), { spec: 0.9, tint: [0.58, 0.62, 0.92, 1.0] });
    planetA = uploadMesh(gl, meshProg, makeSphere(1, 24), { spec: 0.35, tint: [0.72, 0.58, 0.92, 1.0] });
    planetB = uploadMesh(gl, meshProg, makeSphere(1, 24), { spec: 0.3, tint: [0.85, 0.66, 0.35, 1.0] });
    planetC = uploadMesh(gl, meshProg, makeSphere(1, 24), { spec: 0.4, tint: [0.45, 0.52, 0.95, 1.0] });

    // particle system
    pCount = coarsePointer.matches ? 120 : 320;
    const pts = makePoints(pCount, { x: 7, y: 4, z: 3 });
    pPos = makeBuf(gl, pts.pos);
    pSize = makeBuf(gl, pts.size);
    pPhase = makeBuf(gl, pts.phase);
    pPosLoc = gl.getAttribLocation(partProg, "aPos");
    pSizeLoc = gl.getAttribLocation(partProg, "aSize");
    pPhaseLoc = gl.getAttribLocation(partProg, "aPhase");
    const onPointer = (e) => {
      if (reducedMotion.matches || coarsePointer.matches) return;
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    const onResize = () => {
      resize();
      if (reducedMotion.matches) staticFrame();
    };
    window.addEventListener("resize", onResize);
    reducedMotion.addEventListener("change", applyMotionMode);
    // cleanup: stop the animation loop and remove listeners (satisfies "clean up animation loops and listeners")
    window.addEventListener("beforeunload", function cleanup() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      reducedMotion.removeEventListener("change", applyMotionMode);
    });

    resize();
    applyMotionMode();
  }

  try {
    initGL();
  } catch (err) {
    if (typeof console !== "undefined") console.warn("[about-chamber] WebGL init failed, using 2D fallback:", (err && err.message) || err);
    try { fallback2D(); } catch (e2) { /* section stays dark */ }
  }
})();
