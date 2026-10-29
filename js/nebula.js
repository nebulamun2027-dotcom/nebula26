/* ==========================================================================
   NEBULA MUN 2026 — cinematic space environment
   A dependency-free WebGL fragment-shader nebula (volumetric FBM gas,
   luminous dust, distant galaxy, star clusters, light rays, slow
   camera drift + pointer parallax), with a 2D canvas fallback.
   All motion honors prefers-reduced-motion (single static frame).
   ========================================================================== */
(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const glCanvas = document.getElementById("nebula-gl");
  const fbCanvas = document.getElementById("nebula-2d");
  if (!glCanvas || !fbCanvas) return;

  const VERTEX_SRC = [
    "attribute vec2 aPos;",
    "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  const FRAGMENT_SRC = [
    "precision highp float;",
    "uniform vec2 uRes;",
    "uniform float uTime;",
    "uniform vec2 uParallax;",
    "const int OCTAVES = 6;",
    "",
    "float hash11(float p) {",
    "  p = fract(p * 0.1031);",
    "  p *= p + 33.33;",
    "  return fract(p * p * (p + 15.0));",
    "}",
    "vec2 hash21(float p) {",
    "  return vec2(hash11(p), hash11(p + 13.7));",
    "}",
    "float noise(vec2 p) {",
    "  vec2 i0 = floor(p);",
    "  vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  float a = hash11(dot(i0, vec2(17.0, 59.0)) * 43758.5453;",
    "  float b = hash11(dot(i0 + vec2(1.0, 0.0), vec2(17.0, 59.0)) * 43758.5453;",
    "  float c = hash11(dot(i0 + vec2(0.0, 1.0), vec2(17.0, 59.0)) * 43758.5453;",
    "  float d = hash11(dot(i0 + vec2(1.0, 1.0), vec2(17.0, 59.0)) * 43758.5453;",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",
    "float fbm(vec2 p) {",
    "  float v = 0.0;",
    "  float a = 0.55;",
    "  vec2 w = vec2(noise(p) * 1.35);",
    "  p += w;",
    "  for (int i = 0; i < OCTAVES; i++) {",
    "    v += a * noise(p);",
    "    p = p * 2.03 + vec2(11.3, 7.1);",
    "    a *= 0.5;",
    "  }",
    "  return v;",
    "}",
    "",
    "void main() {",
    "  vec2 f = gl_FragCoord / uRes;",
    "  vec2 uv = f * 1.4 + uParallax;",
    "  uv.y *= 0.75;",
    "  float t = uTime * 0.008;",
    "",
    "  // ---------- volumetric gas (layered FBM with domain warp) ----------",
    "  float n1 = fbm(uv * 0.85 + t);",
    "  float n2 = fbm(uv * 1.7 - t * 0.7 + 31.4);",
    "  float n3 = fbm(uv * 3.1 + t * 0.5 + 55.2);",
    "",
    "  // deep-space base with a faint central darkening for hero readability",
    "  vec3 col = mix(vec3(0.012, 0.016, 0.045), vec3(0.03, 0.02, 0.07), f.y);",
    "",
    "  // primary violet-indigo cloud",
    "  float cloud = smoothstep(0.42, 0.78, n1);",
    "  col += vec3(0.56, 0.48, 1.0) * cloud * 0.55;",
    "  // blue underglow",
    "  col += vec3(0.36, 0.61, 1.0) * smoothstep(0.5, 0.85, n2) * 0.38;",
    "  // restrained magenta accents",
    "  col += vec3(0.62, 0.3, 0.7) * smoothstep(0.55, 0.9, n3) * 0.18;",
    "",
    "  // luminous dust filaments (fine detail)",
    "  float fil = noise(uv * 6.5 + t * 0.4);",
    "  col += vec3(0.75, 0.7, 1.0) * smoothstep(0.62, 0.9, fil) * 0.22;",
    "",
    "  // distant spiral galaxy (small, subtle, upper-right)",
    "  vec2 g = f - vec2(0.66, 0.36);",
    "  mat2 rot = mat2(0.42, -0.91, 0.91, 0.42);",
    "  vec2 gg = rot * g;",
    "  float gal = exp(-dot(gg, gg) * 140.0);",
    "  col += vec3(0.85, 0.82, 1.0) * gal * 0.5;",
    "",
    "  // soft light rays / atmospheric scattering from upper-left light source",
    "  vec2 toLight = normalize(vec2(-0.4, -0.9));",
    "  float ang = atan(gl_FragCoord.y - uRes.y * 0.12, gl_FragCoord.x - uRes.x * 0.18);",
    "  float rays = 0.5 + 0.5 * sin(ang * 22.0 + t);",
    "  col += vec3(0.55, 0.5, 0.95) * rays * 0.05 * cloud;",
    "",
    "  // star clusters: high-frequency noise thresholded into points",
    "  float sn = noise(uv * 40.0);",
    "  float stars = smoothstep(0.965, 0.995, sn);",
    "  col += vec3(0.9, 0.92, 1.0) * stars * 1.6;",
    "  // a few brighter, gently twinkling stars",
    "  float bn = noise(uv * 9.0 + 91.0);",
    "  float bright = smoothstep(0.975, 0.995, bn) * (0.7 + 0.3 * sin(uTime * 1.3));",
    "  col += vec3(0.8, 0.86, 1.0) * bright * 2.2;",
    "",
    "  // cinematic vignette + center darkening so centered hero text stays readable",
    "  float v = distance(f, vec2(0.5));",
    "  col *= 1.0 - 0.4 * smoothstep(0.35, 0.85, v);",
    "  float cx = distance(f, vec2(0.5, 0.42));",
    "  col = mix(col, col * 0.55, 0.38 * smoothstep(0.55, 0.15, cx));",
    "",
    "  // 4x4 dithering against gradient banding",
    "  float dith = hash11(dot(gl_FragCoord.xy, vec2(12.9898, 78.233) * 0.112);",
    "  col += (dith - 0.5) / 255.0;",
    "",
    "  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "}"
  ].join("\n");

  function createShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  function buildProgram(gl, vs, fs) {
    const prog = gl.createProgram();
    gl.attachShader(prog, createShader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, createShader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  function initGL() {
    const opts = { antialias: true, depth: false, stencil: false, alpha: false, powerPreference: "high-performance" };
    const gl =
      glCanvas.getContext("webgl", opts) ||
      glCanvas.getContext("experimental-webgl", opts);
    if (!gl) {
      fallback2D();
      return;
    }
    const prog = buildProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uPar = gl.getUniformLocation(prog, "uParallax");

    let rafId = null;
    let t0 = 0;
    const parallax = { x: 0, y: 0 }; // smoothed pointer offset
    const target = { x: 0, y: 0 };
    const PARALLAX_STRENGTH = 0.05;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75); // cap fill-rate cost
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (glCanvas.width !== w || glCanvas.height !== h) {
        glCanvas.width = w;
        glCanvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    function frame(now) {
      if (!t0) t0 = now;
      // ease parallax toward pointer target (restrained)
      parallax.x += (target.x - parallax.x) * 0.04;
      parallax.y += (target.y - parallax.y) * 0.04;
      gl.uniform2f(uRes, glCanvas.width, glCanvas.height);
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.uniform2f(uPar, parallax.x * PARALLAX_STRENGTH, parallax.y * PARALLAX_STRENGTH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      rafId = requestAnimationFrame(frame);
    }

    function staticFrame() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      gl.uniform2f(uRes, glCanvas.width, glCanvas.height);
      gl.uniform1f(uTime, 1.0);
      gl.uniform2f(uPar, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function applyMotionMode() {
      if (reducedMotion.matches) {
        staticFrame();
      } else if (rafId === null) {
        t0 = 0;
        rafId = requestAnimationFrame(frame);
      }
    }

    window.addEventListener("pointermove", (e) => {
      if (reducedMotion.matches || window.matchMedia("(pointer: coarse)").matches) return;
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    window.addEventListener("resize", () => {
      resize();
      if (reducedMotion.matches) staticFrame();
    });

    resize();
    applyMotionMode();
    reducedMotion.addEventListener("change", applyMotionMode);
  }

  /* ---------- 2D canvas fallback: procedural nebula when WebGL is unavailable ---------- */
  function fallback2D() {
    // A canvas can hold only one context type: the 2D fallback must draw on its
    // own canvas (#nebula-2d), not on the WebGL canvas.
    fbCanvas.style.display = "block";
    glCanvas.style.display = "none";
    const ctx = fbCanvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const rect = fbCanvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (fbCanvas.width !== w || fbCanvas.height !== h) {
        fbCanvas.width = w;
        fbCanvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = rect.width, ch = rect.height; // CSS pixels
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#05070f";
      ctx.fillRect(0, 0, cw, ch);

      const blobs = [
        { x: 0.72, y: 0.18, r: 0.55, c: "rgba(143,123,255,0.20)" },
        { x: 0.2, y: 0.8, r: 0.5, c: "rgba(92,157,255,0.16)" },
        { x: 0.5, y: 0.55, r: 0.4, c: "rgba(158,102,201,0.14)" },
        { x: 0.85, y: 0.75, r: 0.3, c: "rgba(190,120,220,0.10)" },
        { x: 0.35, y: 0.3, r: 0.35, c: "rgba(120,90,220,0.18)" }
      ];
      ctx.save();
      try { ctx.filter = "blur(60px)"; } catch (e) {}
      for (const b of blobs) {
        const bx = b.x * cw, by = b.y * ch, br = b.r * Math.min(cw, ch);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, b.c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      ctx.restore();

      // star specks
      const n = Math.min(400, (cw * ch) / 3000);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * cw, y = Math.random() * ch;
        const r = 0.4 + Math.random() * 1.1;
        const a = 0.25 + Math.random() * 0.5;
        ctx.fillStyle = `rgba(233,236,246,${a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    draw();
    let rt = null;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(draw, 150);
    });
  }

  try {
    initGL();
  } catch (err) {
    // graceful degradation to the 2D fallback
    try { fallback2D(); } catch (e2) { /* sky simply stays dark */ }
  }
})();
