/* ==========================================================================
   NEBULA MUN 2026 — the living cosmic environment
   One shared real-time Three.js universe rendered on #nebula-gl:
     · three-layer 3D star field with depth + pointer parallax
     · a huge procedural terrestrial planet (continents, oceans, clouds,
       polar ice, city lights, atmosphere rim)
     · a central star with orbiting worlds and orbit rings
     · a giant ringed gas planet partially visible in the foreground
     · shader nebula clouds, shooting stars with luminous trails,
       instanced asteroids and a distant spacecraft
     · cinematic intro (stars illuminate → core ignites → worlds emerge)
       coordinated with the existing gateway via "nebula:gateway-complete"
   Falls back to the previous 2D procedural sky when Three.js/WebGL fails.
   Honors prefers-reduced-motion (single high-quality frame), pauses when the
   tab is hidden or a committee world is open, caps DPR, and cleans up.
   ========================================================================== */
(function () {
  "use strict";

  const glCanvas = document.getElementById("nebula-gl");
  const fbCanvas = document.getElementById("nebula-2d");
  if (!glCanvas || !fbCanvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");

  const state = {
    ready: false,
    paused: false,
    worldOpen: false,
    introStart: 0,
    introDone: false,
    raf: null,
    elapsed: 0,
    last: 0,
    failures: 0
  };

  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let starLayer = null;
  let starMaterial = null;
  let core = null;
  let coreGlow = null;
  let heroPlanet = null;
  let ringedPlanet = null;
  let nebulaMeshes = [];
  let asteroidMesh = null;
  let asteroidData = [];
  let spacecraft = null;
  let shootingStars = [];
  let shooterTimer = 1.2;
  let orbiters = [];
  let orbitRings = [];
  let starPointScale = 1;
  let sceneSignature = null;

  /* opening title overlay */
  const openTitle = document.getElementById("open-title");
  const openTitleContent = openTitle ? openTitle.querySelector(".open-title__content") : null;
  const openTitleSkip = document.getElementById("open-title-skip");

  /* ---------- small math helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a || 0.0001), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ======================================================================
     GLSL building blocks
     ====================================================================== */
  const NOISE3 = [
    "float hash31(vec3 p) {",
    "  p = fract(p * 0.1031);",
    "  p += dot(p, p.yzx + 33.33);",
    "  return fract((p.x + p.y) * p.z);",
    "}",
    "float noise3(vec3 p) {",
    "  vec3 i = floor(p);",
    "  vec3 f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  float n000 = hash31(i);",
    "  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));",
    "  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));",
    "  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));",
    "  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));",
    "  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));",
    "  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));",
    "  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));",
    "  float x00 = mix(n000, n100, f.x);",
    "  float x10 = mix(n010, n110, f.x);",
    "  float x01 = mix(n001, n101, f.x);",
    "  float x11 = mix(n011, n111, f.x);",
    "  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);",
    "}",
    "float fbm3(vec3 p) {",
    "  float v = 0.0;",
    "  float a = 0.52;",
    "  for (int i = 0; i < 5; i++) {",
    "    v += a * noise3(p);",
    "    p = p * 2.03 + vec3(17.1, 9.2, 13.7);",
    "    a *= 0.5;",
    "  }",
    "  return v;",
    "}"
  ].join("\n");

  const NOISE2 = [
    "float hash21(vec2 p) {",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",
    "float noise2(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash21(i);",
    "  float b = hash21(i + vec2(1.0, 0.0));",
    "  float c = hash21(i + vec2(0.0, 1.0));",
    "  float d = hash21(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}"
  ].join("\n");

  /* ======================================================================
     texture helpers (procedural only — no external image requests)
     ====================================================================== */
  let glowTexture = null;
  function getGlowTexture() {
    if (glowTexture) return glowTexture;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.12, "rgba(255,250,235,0.92)");
    g.addColorStop(0.32, "rgba(190,205,255,0.42)");
    g.addColorStop(0.68, "rgba(110,125,255,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(c);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    return glowTexture;
  }

  function makeGlow(size, color, opacity) {
    const mat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: color,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  /* ======================================================================
     scene building
     ====================================================================== */
  function buildScene() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      600
    );
    camera.position.set(0, 0.7, 16.5);

    scene.add(new THREE.AmbientLight(0x1a2748, 1.4));
    const key = new THREE.DirectionalLight(0xbfd4ff, 1.2);
    key.position.set(-3, 4, 6);
    scene.add(key);

    buildStars();
    buildCentralCore();
    buildHeroPlanet();
    buildRingedPlanet();
    buildNebulae();
    buildOrbiters();
    buildAsteroids();
    buildSpacecraft();
    buildShooters();
  }

  /* ---------- 3D star field (real depth, perspective, twinkle) ---------- */
  function buildStars() {
    const mobile = coarsePointer.matches;
    const count = mobile ? 2300 : 4200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    const palette = [
      [0.90, 0.93, 1.00],
      [0.90, 0.93, 1.00],
      [0.70, 0.78, 1.00],
      [0.84, 0.72, 1.00],
      [1.00, 0.88, 0.74],
      [0.62, 0.86, 1.00]
    ];

    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const radius = rand(22, 180);
      // bias most stars toward the far hemisphere while retaining wraparound depth
      const zBias = Math.random() < 0.84 ? -1 : 1;
      positions[i * 3] = Math.cos(theta) * r * radius;
      positions[i * 3 + 1] = u * radius;
      positions[i * 3 + 2] = Math.sin(theta) * r * radius * 0.64 + (zBias < 0 ? -18 : 8);

      const col = palette[(Math.random() * palette.length) | 0];
      const warm = Math.random() < 0.12 ? 1.14 : 1;
      colors[i * 3] = col[0] * warm;
      colors[i * 3 + 1] = col[1] * warm;
      colors[i * 3 + 2] = col[2] * warm;
      sizes[i] = Math.random() < 0.055 ? rand(2.4, 4.6) : rand(0.7, 2.0);
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

    starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) }
      },
      vertexShader: [
        "attribute vec3 aColor;",
        "attribute float aSize;",
        "attribute float aPhase;",
        "uniform float uTime;",
        "uniform float uPixelRatio;",
        "varying vec3 vColor;",
        "varying float vTwinkle;",
        "void main() {",
        "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
        "  gl_Position = projectionMatrix * mv;",
        "  float persp = 320.0 / max(-mv.z, 1.0);",
        "  gl_PointSize = clamp(aSize * uPixelRatio * persp, 0.8, 7.5);",
        "  vTwinkle = 0.62 + 0.38 * sin(uTime * (0.7 + aSize * 0.22) + aPhase);",
        "  vColor = aColor;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision mediump float;",
        "varying vec3 vColor;",
        "varying float vTwinkle;",
        "uniform float uOpacity;",
        "void main() {",
        "  float d = length(gl_PointCoord - vec2(0.5));",
        "  float core = smoothstep(0.18, 0.0, d);",
        "  float halo = smoothstep(0.5, 0.08, d) * 0.55;",
        "  float alpha = (core + halo) * vTwinkle * uOpacity;",
        "  gl_FragColor = vec4(vColor * (0.82 + core * 0.9), alpha);",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    starLayer = new THREE.Points(geo, starMaterial);
    starLayer.frustumCulled = false;
    scene.add(starLayer);
  }

  /* ---------- central star + its light ---------- */
  function buildCentralCore() {
    const corePos = new THREE.Vector3(-13.5, 5.6, -42);
    const geo = new THREE.SphereGeometry(2.35, 32, 24);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 }
      },
      vertexShader: [
        "varying vec3 vLocal;",
        "varying vec3 vNormalW;",
        "void main() {",
        "  vLocal = position;",
        "  vNormalW = normalize(mat3(modelMatrix) * normal);",
        "  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "uniform float uTime;",
        "uniform float uFade;",
        "varying vec3 vLocal;",
        "varying vec3 vNormalW;",
        NOISE3,
        "void main() {",
        "  vec3 dir = normalize(vLocal);",
        "  float n = fbm3(dir * 4.0 + vec3(0.0, uTime * 0.03, 0.0));",
        "  float veins = smoothstep(0.38, 0.78, n);",
        "  vec3 hot = vec3(1.0, 0.82, 0.48);",
        "  vec3 white = vec3(1.0, 0.97, 0.88);",
        "  vec3 col = mix(hot, white, veins);",
        "  col *= 1.55 + 0.22 * sin(uTime * 1.7 + n * 9.0);",
        "  gl_FragColor = vec4(col * uFade, 1.0);",
        "}"
      ].join("\n")
    });
    core = new THREE.Mesh(geo, mat);
    core.position.copy(corePos);
    scene.add(core);

    coreGlow = makeGlow(36, 0xffd6a0, 0);
    coreGlow.position.copy(corePos);
    scene.add(coreGlow);

    const light = new THREE.PointLight(0xffd2a1, 3.2, 190, 0);
    light.position.copy(corePos);
    scene.add(light);

    // subtle corona ring in the star's equatorial plane
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.5, 5.2, 80, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffb86b,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2 + 0.35;
    ring.position.copy(corePos);
    ring.userData.isCorona = true;
    scene.add(ring);
    coreGlow.userData.corona = ring;
  }

  /* ---------- procedural planet shader ---------- */
  function planetMaterial(opts) {
    const o = opts || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 0 },
        uSeed: { value: o.seed || 0 },
        uType: { value: o.type || 0 }, // 0 terrestrial, 1 gas, 2 ice
        uOcean: { value: new THREE.Color(o.ocean || "#07182f") },
        uLand: { value: new THREE.Color(o.land || "#315b48") },
        uIce: { value: new THREE.Color(o.ice || "#d9e6f2") },
        uCloud: { value: new THREE.Color(o.cloud || "#f3f7ff") },
        uAtmo: { value: new THREE.Color(o.atmo || "#5c9dff") },
        uLightDir: { value: new THREE.Vector3(-0.55, 0.62, 0.55).normalize() }
      },
      vertexShader: [
        "varying vec3 vLocal;",
        "varying vec3 vNormalW;",
        "varying vec3 vWorld;",
        "void main() {",
        "  vLocal = position;",
        "  vNormalW = normalize(mat3(modelMatrix) * normal);",
        "  vec4 wp = modelMatrix * vec4(position, 1.0);",
        "  vWorld = wp.xyz;",
        "  gl_Position = projectionMatrix * viewMatrix * wp;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "uniform float uTime;",
        "uniform float uFade;",
        "uniform float uSeed;",
        "uniform float uType;",
        "uniform vec3 uOcean;",
        "uniform vec3 uLand;",
        "uniform vec3 uIce;",
        "uniform vec3 uCloud;",
        "uniform vec3 uAtmo;",
        "uniform vec3 uLightDir;",
        "varying vec3 vLocal;",
        "varying vec3 vNormalW;",
        "varying vec3 vWorld;",
        NOISE3,
        "void main() {",
        "  vec3 N = normalize(vNormalW);",
        "  vec3 V = normalize(cameraPosition - vWorld);",
        "  vec3 L = normalize(uLightDir);",
        "  vec3 dir = normalize(vLocal);",
        "  float landMask = 0.0;",
        "  vec3 surf;",
        "  if (uType < 0.5) {",
        "    float n = fbm3(dir * 2.15 + vec3(uSeed));",
        "    landMask = smoothstep(0.49, 0.58, n);",
        "    vec3 landCol = mix(uLand * 0.68, uLand * 1.28, fbm3(dir * 5.0 + 7.0));",
        "    surf = mix(uOcean, landCol, landMask);",
        "    float polar = smoothstep(0.76, 0.95, abs(dir.y));",
        "    surf = mix(surf, uIce, polar);",
        "  } else if (uType < 1.5) {",
        "    float band = sin(dir.y * 22.0 + fbm3(dir * 3.0 + uSeed) * 4.5);",
        "    surf = mix(uOcean, uLand, 0.5 + 0.5 * band);",
        "    surf = mix(surf, uIce, smoothstep(0.62, 1.0, abs(dir.y)) * 0.4);",
        "  } else {",
        "    float n2 = fbm3(dir * 3.5 + uSeed);",
        "    surf = mix(uOcean, uIce, smoothstep(0.28, 0.72, n2));",
        "  }",
        "  float cloudNoise = fbm3(dir * 3.1 + vec3(uTime * 0.007, uSeed, 0.0));",
        "  float cloud = smoothstep(0.53, 0.74, cloudNoise) * (uType < 1.5 ? 0.64 : 0.28);",
        "  surf = mix(surf, uCloud, cloud);",
        "  float diff = clamp(dot(N, L), 0.0, 1.0);",
        "  float day = smoothstep(-0.13, 0.32, diff);",
        "  vec3 night = surf * 0.075 + uOcean * 0.035;",
        "  float cityMask = smoothstep(0.62, 0.73, fbm3(dir * 8.5 + 11.0)) * landMask * (1.0 - cloud);",
        "  night += vec3(1.0, 0.62, 0.25) * cityMask * 0.55;",
        "  vec3 col = mix(night, surf * (0.22 + 0.96 * diff), day);",
        "  vec3 H = normalize(L + V);",
        "  float spec = pow(max(dot(N, H), 0.0), 62.0) * (1.0 - landMask) * 0.55;",
        "  col += vec3(0.48, 0.70, 1.0) * spec * day;",
        "  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.7);",
        "  col += uAtmo * rim * 0.95;",
        "  gl_FragColor = vec4(col * uFade, 1.0);",
        "}"
      ].join("\n")
    });
  }

  function atmosphereMaterial(color, opacity) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity != null ? opacity : 0.75 },
        uFade: { value: 0 }
      },
      vertexShader: [
        "varying vec3 vNormalW;",
        "varying vec3 vWorld;",
        "void main() {",
        "  vNormalW = normalize(mat3(modelMatrix) * normal);",
        "  vec4 wp = modelMatrix * vec4(position, 1.0);",
        "  vWorld = wp.xyz;",
        "  gl_Position = projectionMatrix * viewMatrix * wp;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision mediump float;",
        "uniform vec3 uColor;",
        "uniform float uOpacity;",
        "uniform float uFade;",
        "varying vec3 vNormalW;",
        "varying vec3 vWorld;",
        "void main() {",
        "  vec3 N = normalize(vNormalW);",
        "  vec3 V = normalize(cameraPosition - vWorld);",
        "  float rim = 1.0 - abs(dot(N, V));",
        "  rim = pow(rim, 2.5);",
        "  gl_FragColor = vec4(uColor, rim * uOpacity * uFade);",
        "}"
      ].join("\n"),
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }

  function makePlanet(opts) {
    const group = new THREE.Group();
    const seg = coarsePointer.matches ? 48 : 72;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius, seg, Math.round(seg * 0.7)),
      planetMaterial(opts)
    );
    group.add(sphere);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius * 1.035, seg, Math.round(seg * 0.7)),
      atmosphereMaterial(opts.atmo || "#5c9dff", opts.atmoOpacity)
    );
    group.add(atmo);

    return {
      group: group,
      sphere: sphere,
      atmosphere: atmo,
      material: sphere.material,
      atmosphereMaterial: atmo.material,
      radius: opts.radius
    };
  }

  function makeRing(inner, outer, colorA, colorB) {
    const geo = new THREE.RingGeometry(inner, outer, 160, 3);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uInner: { value: inner },
        uOuter: { value: outer },
        uColorA: { value: new THREE.Color(colorA) },
        uColorB: { value: new THREE.Color(colorB) },
        uOpacity: { value: 0.82 },
        uFade: { value: 0 }
      },
      vertexShader: [
        "varying vec2 vLocal;",
        "void main() {",
        "  vLocal = position.xy;",
        "  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "uniform float uInner;",
        "uniform float uOuter;",
        "uniform vec3 uColorA;",
        "uniform vec3 uColorB;",
        "uniform float uOpacity;",
        "uniform float uFade;",
        "varying vec2 vLocal;",
        NOISE2,
        "void main() {",
        "  float r = length(vLocal);",
        "  float u = (r - uInner) / (uOuter - uInner);",
        "  float bands = 0.55 + 0.45 * sin(u * 74.0 + hash21(vec2(floor(u * 34.0), 3.0)) * 7.0);",
        "  float gaps = smoothstep(0.02, 0.10, u) * smoothstep(1.0, 0.90, u);",
        "  float fine = smoothstep(0.42, 0.58, noise2(vec2(u * 120.0, 7.0)));",
        "  float alpha = (0.20 + bands * 0.55 + fine * 0.18) * gaps * uOpacity * uFade;",
        "  vec3 col = mix(uColorA, uColorB, bands);",
        "  gl_FragColor = vec4(col, alpha);",
        "}"
      ].join("\n"),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    return new THREE.Mesh(geo, mat);
  }

  /* ---------- the huge hero planet ---------- */
  function buildHeroPlanet() {
    heroPlanet = makePlanet({
      radius: 7.8,
      type: 0,
      seed: 2.4,
      ocean: "#06162e",
      land: "#2c5f48",
      ice: "#dbe9f4",
      cloud: "#eef4ff",
      atmo: "#5c9dff",
      atmoOpacity: 0.82
    });
    heroPlanet.group.position.set(-11.6, 2.1, -26);
    heroPlanet.group.rotation.z = 0.18;
    heroPlanet.group.rotation.x = 0.08;
    scene.add(heroPlanet.group);
  }

  /* ---------- giant ringed gas planet, foreground ---------- */
  function buildRingedPlanet() {
    ringedPlanet = makePlanet({
      radius: 8.4,
      type: 1,
      seed: 7.7,
      ocean: "#2f1f3b",
      land: "#c69a6b",
      ice: "#e6d5bd",
      cloud: "#f3e6d3",
      atmo: "#a98fff",
      atmoOpacity: 0.55
    });
    ringedPlanet.group.position.set(13.8, -8.2, -27);
    ringedPlanet.group.rotation.z = -0.22;
    ringedPlanet.group.rotation.x = 0.16;

    const ring = makeRing(10.2, 15.8, "#c9a978", "#7a6a8e");
    ring.rotation.x = -Math.PI / 2 + 0.42;
    ring.rotation.z = 0.18;
    ring.position.y = 0.4;
    ringedPlanet.group.add(ring);
    ringedPlanet.ring = ring;

    const ring2 = makeRing(16.4, 17.1, "#8f7bff", "#e0cfae");
    ring2.rotation.x = -Math.PI / 2 + 0.42;
    ring2.rotation.z = 0.18;
    ring2.position.y = 0.4;
    ring2.material.uniforms.uOpacity.value = 0.34;
    ringedPlanet.group.add(ring2);
    ringedPlanet.ring2 = ring2;

    scene.add(ringedPlanet.group);
  }

  /* ---------- shader nebula clouds ---------- */
  function nebulaMaterial(colorA, colorB, seed, opacity) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uColorA: { value: new THREE.Color(colorA) },
        uColorB: { value: new THREE.Color(colorB) },
        uOpacity: { value: opacity },
        uFade: { value: 0 }
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "uniform float uTime;",
        "uniform float uSeed;",
        "uniform vec3 uColorA;",
        "uniform vec3 uColorB;",
        "uniform float uOpacity;",
        "uniform float uFade;",
        "varying vec2 vUv;",
        "float hash21(vec2 p) {",
        "  p = fract(p * vec2(123.34, 456.21));",
        "  p += dot(p, p + 45.32);",
        "  return fract(p.x * p.y);",
        "}",
        "float noise2(vec2 p) {",
        "  vec2 i = floor(p);",
        "  vec2 f = fract(p);",
        "  f = f * f * (3.0 - 2.0 * f);",
        "  float a = hash21(i);",
        "  float b = hash21(i + vec2(1.0, 0.0));",
        "  float c = hash21(i + vec2(0.0, 1.0));",
        "  float d = hash21(i + vec2(1.0, 1.0));",
        "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
        "}",
        "float fbm2(vec2 p) {",
        "  float v = 0.0;",
        "  float a = 0.55;",
        "  for (int i = 0; i < 5; i++) {",
        "    v += a * noise2(p);",
        "    p = p * 2.03 + vec2(11.3, 7.1);",
        "    a *= 0.5;",
        "  }",
        "  return v;",
        "}",
        "void main() {",
        "  vec2 uv = vUv * 2.0 - 1.0;",
        "  vec2 p = vUv * 4.2 + uSeed + vec2(uTime * 0.006, -uTime * 0.004);",
        "  float warp = fbm2(p * 1.4 + 9.0) - 0.5;",
        "  float n = fbm2(p + warp * 1.3);",
        "  float clouds = smoothstep(0.36, 0.76, n);",
        "  float filaments = smoothstep(0.58, 0.82, fbm2(p * 3.2 + 4.0));",
        "  float radial = smoothstep(1.0, 0.25, length(uv));",
        "  float alpha = (clouds * 0.62 + filaments * 0.24) * radial * uOpacity * uFade;",
        "  vec3 col = mix(uColorA, uColorB, clouds);",
        "  col += vec3(0.22, 0.18, 0.45) * filaments;",
        "  gl_FragColor = vec4(col, alpha);",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
  }

  function buildNebulae() {
    const specs = [
      { pos: [-34, 18, -78], size: [62, 46], a: "#241a55", b: "#6d5bd0", o: 0.24, seed: 1.2 },
      { pos: [30, -10, -88], size: [72, 52], a: "#102a52", b: "#3e7bd0", o: 0.20, seed: 4.8 },
      { pos: [2, 30, -96], size: [80, 56], a: "#381848", b: "#a05ac8", o: 0.16, seed: 8.1 },
      { pos: [-6, -30, -82], size: [70, 48], a: "#151a46", b: "#4f5dc9", o: 0.18, seed: 12.4 },
      { pos: [44, 30, -110], size: [60, 40], a: "#1b2e55", b: "#7fb0ff", o: 0.13, seed: 17.9 },
      { pos: [-50, -24, -120], size: [58, 44], a: "#2b1740", b: "#c46fb0", o: 0.12, seed: 21.3 }
    ];
    nebulaMeshes = [];
    for (const s of specs) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(s.size[0], s.size[1], 1, 1),
        nebulaMaterial(s.a, s.b, s.seed, s.o)
      );
      mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
      mesh.rotation.z = rand(-0.35, 0.35);
      mesh.renderOrder = -2;
      scene.add(mesh);
      nebulaMeshes.push(mesh);
    }
  }

  /* ---------- worlds orbiting the central star ---------- */
  function buildOrbiters() {
    const star = core.position;
    const specs = [
      { radius: 0.72, orbit: 5.4, speed: 0.22, tilt: 0.18, y: 0.1, type: 2, ocean: "#294d6e", land: "#b7d7ee", ice: "#f2f7ff", atmo: "#7fd0ff" },
      { radius: 1.05, orbit: 8.6, speed: 0.14, tilt: -0.26, y: 0.6, type: 0, ocean: "#1a2b22", land: "#6d7d44", ice: "#e6ead8", atmo: "#b7a9ff" },
      { radius: 0.86, orbit: 12.2, speed: 0.09, tilt: 0.34, y: -0.4, type: 1, ocean: "#3a2a44", land: "#d3a06a", ice: "#f0dcc0", atmo: "#ffb86b" },
      { radius: 0.58, orbit: 15.4, speed: 0.065, tilt: -0.12, y: 0.2, type: 2, ocean: "#233a58", land: "#9fc4e8", ice: "#f2f7ff", atmo: "#9fc4e8" }
    ];
    orbiters = [];
    for (const s of specs) {
      const p = makePlanet({
        radius: s.radius,
        type: s.type,
        seed: rand(1, 20),
        ocean: s.ocean,
        land: s.land,
        ice: s.ice,
        cloud: "#f2f6ff",
        atmo: s.atmo,
        atmoOpacity: 0.6
      });
      p.orbit = s.orbit;
      p.speed = s.speed;
      p.tilt = s.tilt;
      p.baseY = s.y;
      p.angle = rand(0, Math.PI * 2);
      p.group.position.copy(star);
      scene.add(p.group);
      orbiters.push(p);
    }

    // a few faint orbital lines for depth
    orbitRings = [];
    const ringSpecs = [
      { r: 8.6, tilt: -0.26 },
      { r: 12.2, tilt: 0.34 },
      { r: 15.4, tilt: -0.12 }
    ];
    for (const rs of ringSpecs) {
      const pts = [];
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * rs.r, 0, Math.sin(a) * rs.r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x8f7bff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const line = new THREE.Line(geo, mat);
      line.position.copy(star);
      line.rotation.x = Math.PI / 2 + rs.tilt;
      line.userData.fade = 1;
      scene.add(line);
      orbitRings.push(line);
    }
  }

  /* ---------- instanced asteroids ---------- */
  function buildAsteroids() {
    const count = coarsePointer.matches ? 34 : 58;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7a7f92,
      roughness: 0.93,
      metalness: 0.16,
      emissive: 0x11131e,
      transparent: true,
      opacity: 0,
      flatShading: true
    });
    asteroidMesh = new THREE.InstancedMesh(geo, mat, count);
    asteroidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    asteroidMesh.frustumCulled = false;
    asteroidData = [];
    for (let i = 0; i < count; i++) {
      asteroidData.push({
        radius: rand(8, 44),
        angle: rand(0, Math.PI * 2),
        speed: rand(-0.055, 0.055),
        y: rand(-8, 12),
        z: rand(-44, -8),
        scale: rand(0.05, 0.34),
        tilt: rand(0, Math.PI * 2),
        spin: rand(-0.5, 0.5)
      });
    }
    scene.add(asteroidMesh);
  }

  /* ---------- distant spacecraft ---------- */
  function buildSpacecraft() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x9aa6c4,
      metalness: 0.88,
      roughness: 0.26,
      emissive: 0x0b1428
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x2e3d62,
      metalness: 0.7,
      roughness: 0.4,
      emissive: 0x0a1020
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.28, 1.25, 12), hullMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 12), trimMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = 0.82;
    group.add(nose);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.045, 0.34), trimMat);
    wing.position.z = -0.1;
    group.add(wing);
    const wing2 = wing.clone();
    wing2.scale.set(0.72, 1, 0.8);
    wing2.position.z = -0.42;
    group.add(wing2);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.34), hullMat);
    fin.position.set(0, 0.24, -0.38);
    group.add(fin);

    const engine = makeGlow(2.4, 0x6fb6ff, 0.85);
    engine.position.z = -0.72;
    group.add(engine);

    const beacon = makeGlow(0.7, 0xff6b6b, 1);
    beacon.position.set(0, 0.18, 0.35);
    group.add(beacon);

    group.scale.setScalar(0.55);
    scene.add(group);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-32, 8, -30),
      new THREE.Vector3(-16, 5.5, -38),
      new THREE.Vector3(0, 9, -46),
      new THREE.Vector3(18, 5, -38),
      new THREE.Vector3(34, 9.5, -46),
      new THREE.Vector3(20, 12.5, -58),
      new THREE.Vector3(-4, 8.5, -54),
      new THREE.Vector3(-24, 11, -44)
    ], true, "catmullrom", 0.4);

    spacecraft = {
      group: group,
      curve: curve,
      t: 0.08,
      engine: engine,
      beacon: beacon,
      update: function (dt, elapsed) {
        this.t = (this.t + dt * 0.0085) % 1;
        const pos = this.curve.getPointAt(this.t);
        const tan = this.curve.getTangentAt(this.t).normalize();
        this.group.position.copy(pos);
        const target = pos.clone().add(tan);
        this.group.lookAt(target);
        this.group.rotateZ(Math.sin(elapsed * 0.4) * 0.08);
        this.engine.material.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(elapsed * 9.0));
        this.beacon.material.opacity = Math.sin(elapsed * 3.2) > 0.2 ? 1 : 0.08;
      }
    };
  }

  /* ---------- shooting stars ---------- */
  function buildShooters() {
    shootingStars = [];
    for (let s = 0; s < 3; s++) {
      const segments = 18;
      const positions = new Float32Array(segments * 3);
      const colors = new Float32Array(segments * 3);
      for (let i = 0; i < segments; i++) {
        const f = 1 - i / (segments - 1);
        colors[i * 3] = f;
        colors[i * 3 + 1] = f;
        colors[i * 3 + 2] = f;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      shootingStars.push({
        line: line,
        life: 0,
        max: 1,
        head: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        speed: 0,
        active: false,
        length: 8
      });
    }
  }

  function spawnShooter(elapsed) {
    const shooter = shootingStars.find((s) => !s.active);
    if (!shooter) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    shooter.head.set(
      side * rand(12, 38),
      rand(2, 24),
      rand(-52, -26)
    );
    shooter.dir.set(-side * rand(0.7, 1.25), -rand(0.18, 0.55), rand(-0.14, 0.14)).normalize();
    shooter.speed = rand(28, 52);
    shooter.length = rand(5, 11);
    shooter.life = 0;
    shooter.max = rand(0.55, 1.05);
    shooter.active = true;
    shooter.line.visible = true;
    shooter.line.material.opacity = 0.9;
    shooter.line.userData.birth = elapsed;
  }

  function updateShooters(dt, elapsed) {
    if (reducedMotion.matches) return;
    shooterTimer -= dt;
    if (shooterTimer <= 0) {
      spawnShooter(elapsed);
      shooterTimer = rand(1.7, 4.6);
    }
    for (const s of shootingStars) {
      if (!s.active) continue;
      s.life += dt;
      const p = s.life / s.max;
      if (p >= 1) {
        s.active = false;
        s.line.visible = false;
        s.line.material.opacity = 0;
        continue;
      }
      s.head.addScaledVector(s.dir, s.speed * dt);
      const positions = s.line.geometry.attributes.position.array;
      const n = positions.length / 3;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        positions[i * 3] = s.head.x - s.dir.x * s.length * f;
        positions[i * 3 + 1] = s.head.y - s.dir.y * s.length * f;
        positions[i * 3 + 2] = s.head.z - s.dir.z * s.length * f;
      }
      s.line.geometry.attributes.position.needsUpdate = true;
      s.line.material.opacity = Math.sin(Math.PI * p) * 0.85;
    }
  }

  /* ======================================================================
     animation / composition
     ====================================================================== */
  function introProgress(now) {
    if (state.introDone) return 1;
    if (!state.introStart) return 0;
    return clamp((now - state.introStart) / 6200, 0, 1);
  }

  function applyIntro(p, elapsed) {
    const starFade = smoothstep(0, 0.32, p);
    const coreFade = smoothstep(0.06, 0.42, p);
    const heroFade = smoothstep(0.22, 0.68, p);
    const ringFade = smoothstep(0.36, 0.82, p);
    const nebFade = smoothstep(0.08, 0.58, p);
    const orbitFade = smoothstep(0.4, 0.9, p);
    const asteroidFade = smoothstep(0.5, 1.0, p);
    const craftFade = smoothstep(0.6, 1.0, p);

    if (starMaterial) starMaterial.uniforms.uOpacity.value = starFade;
    if (starMaterial) starMaterial.uniforms.uTime.value = elapsed;

    if (core) {
      core.material.uniforms.uFade.value = coreFade;
      core.material.uniforms.uTime.value = elapsed;
      const s = 0.001 + easeOut(coreFade) * 1.0;
      core.scale.setScalar(s);
    }
    if (coreGlow) {
      coreGlow.material.opacity = coreFade * 0.78;
      const s = lerp(18, 38, easeOut(coreFade));
      coreGlow.scale.set(s, s, 1);
      const corona = coreGlow.userData.corona;
      if (corona) {
        corona.material.opacity = coreFade * 0.18;
        corona.rotation.z = elapsed * 0.028;
      }
    }

    if (heroPlanet) {
      heroPlanet.material.uniforms.uFade.value = heroFade;
      heroPlanet.material.uniforms.uTime.value = elapsed;
      heroPlanet.atmosphereMaterial.uniforms.uFade.value = heroFade;
      const s = lerp(0.55, 1, easeOut(heroFade));
      heroPlanet.group.scale.setScalar(s);
    }

    if (ringedPlanet) {
      ringedPlanet.material.uniforms.uFade.value = ringFade;
      ringedPlanet.material.uniforms.uTime.value = elapsed;
      ringedPlanet.atmosphereMaterial.uniforms.uFade.value = ringFade;
      if (ringedPlanet.ring) {
        ringedPlanet.ring.material.uniforms.uFade.value = ringFade;
        ringedPlanet.ring.material.uniforms.uOpacity.value = 0.8;
      }
      if (ringedPlanet.ring2) {
        ringedPlanet.ring2.material.uniforms.uFade.value = ringFade;
        ringedPlanet.ring2.material.uniforms.uOpacity.value = 0.32;
      }
    }

    for (const m of nebulaMeshes) {
      m.material.uniforms.uFade.value = nebFade;
      m.material.uniforms.uTime.value = elapsed;
    }

    for (const o of orbiters) {
      o.material.uniforms.uFade.value = orbitFade;
      o.atmosphereMaterial.uniforms.uFade.value = orbitFade;
      o.material.uniforms.uTime.value = elapsed;
    }
    for (const line of orbitRings) {
      line.material.opacity = orbitFade * 0.12;
    }

    if (asteroidMesh) {
      asteroidMesh.material.opacity = asteroidFade;
      asteroidMesh.visible = asteroidFade > 0.01;
    }
    if (spacecraft) {
      spacecraft.group.visible = craftFade > 0.01;
      spacecraft.group.scale.setScalar(0.55 * lerp(0.35, 1, easeOut(craftFade)));
    }

    /* ---------- opening title reveal synced to intro progress ---------- */
    if (openTitle && openTitleContent) {
      if (p < 0.05) {
        openTitle.classList.remove("open-title--hide");
      }
      if (p >= 0.12 && !openTitleContent.classList.contains("open-title__content--reveal")) {
        openTitleContent.classList.add("open-title__content--reveal");
      }
      if (p >= 0.88) {
        openTitle.classList.add("open-title--hide");
      }
    }
  }

  function updateScene(dt, elapsed) {
    // star field very slow rotation adds real depth to the parallax
    if (starLayer) {
      starLayer.rotation.y = elapsed * 0.0025;
      starLayer.rotation.x = Math.sin(elapsed * 0.02) * 0.012;
    }

    if (heroPlanet) {
      heroPlanet.group.rotation.y = elapsed * 0.021;
    }
    if (ringedPlanet) {
      ringedPlanet.group.rotation.y = elapsed * 0.009;
      if (ringedPlanet.ring) ringedPlanet.ring.rotation.z = 0.18 + Math.sin(elapsed * 0.05) * 0.01;
    }

    // orbiting worlds around the central star
    for (const o of orbiters) {
      o.angle += dt * o.speed;
      const x = Math.cos(o.angle) * o.orbit;
      const z = Math.sin(o.angle) * o.orbit * 0.72;
      o.group.position.set(
        core.position.x + x,
        core.position.y + o.baseY + Math.sin(o.angle * 1.7) * 0.35,
        core.position.z + z
      );
      if (o.group) {
        o.group.rotation.y = elapsed * 0.18 + o.orbit;
        o.group.rotation.x = o.tilt;
      }
    }

    // asteroids travel through the scene
    if (asteroidMesh) {
      const dummy = updateScene._dummy || (updateScene._dummy = new THREE.Object3D());
      for (let i = 0; i < asteroidData.length; i++) {
        const a = asteroidData[i];
        a.angle += a.speed * dt;
        const x = Math.cos(a.angle) * a.radius;
        const z = a.z + Math.sin(a.angle * 0.74) * 4.5;
        dummy.position.set(x, a.y + Math.sin(a.angle * 1.3) * 1.2, z);
        dummy.rotation.set(a.tilt + elapsed * a.spin, a.angle * 1.7, a.angle);
        dummy.scale.setScalar(a.scale);
        dummy.updateMatrix();
        asteroidMesh.setMatrixAt(i, dummy.matrix);
      }
      asteroidMesh.instanceMatrix.needsUpdate = true;
    }

    if (spacecraft) spacecraft.update(dt, elapsed);
    updateShooters(dt, elapsed);

    // nebula billboards gently follow the camera so they read as volume
    if (camera) {
      for (const m of nebulaMeshes) {
        m.quaternion.copy(camera.quaternion);
      }
    }
  }

  function updateCamera(p, elapsed) {
    if (!camera) return;
    const scroll = clamp(window.scrollY / Math.max(1, window.innerHeight), 0, 3.2);
    const baseZ = 16.5;
    const startZ = 30;
    const dolly = lerp(startZ, baseZ, easeOut(smoothstep(0.0, 0.75, p)));
    const driftX = Math.sin(elapsed * 0.071) * 0.5;
    const driftY = Math.sin(elapsed * 0.052 + 1.3) * 0.28;

    camera.position.x = pointer.x * 1.05 + driftX;
    camera.position.y = 0.7 - pointer.y * 0.7 + driftY - scroll * 0.48;
    camera.position.z = dolly + scroll * 1.3;
    camera.lookAt(pointer.x * 0.3, 0.35 - pointer.y * 0.18, -20);
  }

  function renderFrame(now) {
    if (!renderer || !scene || !camera) return;
    const p = introProgress(now);
    if (p >= 1 && !state.introDone) {
      state.introDone = true;
    }
    updateCamera(p, state.elapsed);
    applyIntro(p, state.elapsed);
    updateScene(1 / 60, state.elapsed);
    renderer.render(scene, camera);
  }

  function loop(now) {
    if (state.raf === null) return;
    if (!state.last) state.last = now;
    const dt = Math.min(0.05, Math.max(0, (now - state.last) / 1000));
    state.last = now;
    state.elapsed += dt;
    const p = introProgress(now);
    if (p >= 1) state.introDone = true;
    updateCamera(p, state.elapsed);
    applyIntro(p, state.elapsed);
    updateScene(dt, state.elapsed);
    renderer.render(scene, camera);
    state.raf = requestAnimationFrame(loop);
  }

  function staticFrame() {
    stopLoop();
    if (!renderer || !scene || !camera) return;
    state.elapsed = 9.0;
    updateCamera(1, state.elapsed - 9.0);
    applyIntro(1, state.elapsed - 9.0);
    updateScene(0, state.elapsed - 9.0);
    renderer.render(scene, camera);
  }

  /* ======================================================================
     lifecycle
     ====================================================================== */
  function shouldRun() {
    return (
      state.ready &&
      !state.paused &&
      !state.worldOpen &&
      !document.hidden &&
      !reducedMotion.matches
    );
  }

  function startLoop() {
    if (state.raf !== null) return;
    if (!shouldRun()) return;
    state.last = 0;
    state.raf = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (state.raf !== null) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
  }

  function beginIntro() {
    if (state.introStart || state.introDone) return;
    if (reducedMotion.matches) {
      state.introStart = performance.now() - 12000;
      state.introDone = true;
      staticFrame();
      return;
    }
    state.introStart = performance.now();
    state.elapsed = 0;
    startLoop();
  }

  function gatewayWillPlay() {
    const gateway = document.getElementById("gateway");
    if (!gateway) return false;
    try {
      if (sessionStorage.getItem("nebula.gateway.seen") === "1") return false;
    } catch (e) {
      /* storage blocked: assume the gateway will play if it is still in the DOM */
    }
    return true;
  }

  function waitForGateway() {
    let done = false;
    const start = function () {
      if (done) return;
      done = true;
      window.removeEventListener("nebula:gateway-complete", start);
      beginIntro();
    };
    window.addEventListener("nebula:gateway-complete", start, { once: true });

    // If the gateway throws and is removed without dispatching, start anyway.
    const observer = new MutationObserver(function () {
      if (!document.getElementById("gateway")) {
        observer.disconnect();
        start();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(function () {
      observer.disconnect();
      start();
    }, 14000);
  }

  function onResize() {
    if (!renderer || !camera) return;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      coarsePointer.matches ? 1.35 : 1.7
    );
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    if (starMaterial) starMaterial.uniforms.uPixelRatio.value = dpr;
    if (reducedMotion.matches) staticFrame();
  }

  function applyMotionMode() {
    if (!state.ready) return;
    if (reducedMotion.matches) {
      state.introDone = true;
      staticFrame();
    } else {
      startLoop();
    }
  }

  function pause() {
    state.paused = true;
    stopLoop();
  }
  function resume() {
    state.paused = false;
    if (reducedMotion.matches) {
      staticFrame();
      return;
    }
    startLoop();
  }
  function setWorldOpen(open) {
    state.worldOpen = !!open;
    if (open) stopLoop();
    else if (shouldRun()) startLoop();
  }

  /* ======================================================================
     2D fallback (used when Three.js or WebGL is unavailable)
     ====================================================================== */
  function fallback2D() {
    stopLoop();
    try {
      if (renderer) {
        renderer.dispose();
      }
    } catch (e) { /* ignore */ }
    renderer = null;
    state.ready = false;
    glCanvas.style.display = "none";
    fbCanvas.style.display = "block";
    document.body.classList.remove("cosmos-3d");
    window.NEBULA_COSMOS_ACTIVE = false;
    try {
      window.dispatchEvent(new CustomEvent("nebula:cosmos-ready", { detail: { mode: "2d" } }));
    } catch (e) { /* ignore */ }

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
      const cw = rect.width;
      const ch = rect.height;
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
      try { ctx.filter = "blur(60px)"; } catch (e) { /* ignore */ }
      for (const b of blobs) {
        const bx = b.x * cw;
        const by = b.y * ch;
        const br = b.r * Math.min(cw, ch);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, b.c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      ctx.restore();

      const n = Math.min(460, (cw * ch) / 2800);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * cw;
        const y = Math.random() * ch;
        const r = 0.4 + Math.random() * 1.2;
        const a = 0.25 + Math.random() * 0.55;
        ctx.fillStyle = "rgba(233,236,246," + a.toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    draw();
    let rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(draw, 150);
    });
  }

  /* ======================================================================
     boot
     ====================================================================== */
  function boot() {
    THREE = window.THREE;
    if (!THREE) {
      fallback2D();
      return;
    }

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: glCanvas,
        antialias: !coarsePointer.matches,
        alpha: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false
      });
      renderer.setClearColor(0x04060d, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        coarsePointer.matches ? 1.35 : 1.7
      );
      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight, false);

      buildScene();
      state.ready = true;
      state.introStart = 0;
      window.NEBULA_COSMOS_ACTIVE = true;
      document.body.classList.add("cosmos-3d");
      try {
        window.dispatchEvent(new CustomEvent("nebula:cosmos-ready", { detail: { mode: "3d" } }));
      } catch (e) { /* ignore */ }

      window.NEBULA_COSMOS = {
        pause: pause,
        resume: resume,
        setWorldOpen: setWorldOpen,
        isPaused: function () { return !shouldRun(); },
        isReady: function () { return state.ready; }
      };

      window.NEBULA_COSMOS_DEBUG = {
        state: state,
        renderer: function () { return renderer; },
        scene: function () { return scene; },
        camera: function () { return camera; },
        counts: function () {
          let meshes = 0;
          let points = 0;
          let lines = 0;
          scene.traverse(function (o) {
            if (o.isMesh) meshes++;
            if (o.isPoints) points++;
            if (o.isLine) lines++;
          });
          return { meshes: meshes, points: points, lines: lines };
        }
      };

      window.addEventListener("resize", onResize);
      window.addEventListener("pointermove", function (e) {
        if (reducedMotion.matches || coarsePointer.matches) return;
        pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointerTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });

      document.addEventListener("visibilitychange", function () {
        if (document.hidden) stopLoop();
        else startLoop();
      });
      reducedMotion.addEventListener("change", applyMotionMode);

      /* opening title skip button — jump intro to completion */
      if (openTitleSkip) {
        openTitleSkip.addEventListener("click", function () {
          state.introStart = performance.now() - 7000;
          state.introDone = true;
          if (openTitle) openTitle.classList.add("open-title--hide");
          if (openTitleContent) openTitleContent.classList.add("open-title__content--reveal");
        });
      }

      window.addEventListener("beforeunload", function () {
        stopLoop();
        window.removeEventListener("resize", onResize);
        reducedMotion.removeEventListener("change", applyMotionMode);
        if (renderer) renderer.dispose();
      });

      glCanvas.addEventListener("webglcontextlost", function (e) {
        e.preventDefault();
        fallback2D();
      });

      // render a dark first frame until the gateway hands over
      renderer.render(scene, camera);
      if (gatewayWillPlay()) waitForGateway();
      else beginIntro();

      // smooth pointer easing (shared by the render loop)
      (function pointerLoop() {
        pointer.x += (pointerTarget.x - pointer.x) * 0.045;
        pointer.y += (pointerTarget.y - pointer.y) * 0.045;
        window.setTimeout(pointerLoop, 33);
      })();
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[nebula] 3D universe unavailable, using 2D fallback:", (err && err.message) || err);
      }
      fallback2D();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
