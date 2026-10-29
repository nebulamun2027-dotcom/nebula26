/* ==========================================================================
   NEBULA MUN 2026 — Phase 3: The NEBULA GALAXY ARCHIVE
   An interactive star map of the eight committee destinations.
   Select a world to open its MISSION DOSSIER (desktop panel, mobile
   bottom sheet) with a searchable portfolio explorer built from
   data.js. The register button hands off to the existing wizard with
   the chosen committee preselected. No backend or payment data.
   ========================================================================== */

(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");

  /* ---------- 1. Per-world visual identity ---------- */
  /* Cinematic activation copy (Phase C reveal) per committee. The visual
     language (colors, motif, motion) lives in DOS_THEMES below; both are
     consumed by the activation sequence in section 2b. */
  const DOS_INTRO = {
    "unhrc": {
      reveal: "GLOBAL HUMAN RIGHTS COUNCIL",
      line: "Human dignity. International accountability. Collective action."
    },
    "uncsw": {
      reveal: "COMMISSION ON THE STATUS OF WOMEN",
      line: "Equality is not an aspiration. It is a commitment."
    },
    "lok-sabha": {
      reveal: "THE HOUSE IS IN SESSION",
      line: "Debate. Legislate. Lead."
    },
    "influencer": {
      reveal: "INFLUENCE IS POWER",
      line: "Shape the narrative. Challenge the algorithm."
    },
    "mythology": {
      reveal: "THE EPIC ENTERS A NEW ERA",
      line: "Dharma. Strategy. Destiny."
    },
    "harry-potter": {
      reveal: "THE WIZARDING WORLD AWAITS",
      line: "Every decision changes the story."
    },
    "ipl": {
      reveal: "THE AUCTION STARTS NOW",
      line: "Build your franchise. Win the room."
    },
    "international-press": {
      reveal: "THE WORLD IS WATCHING",
      line: "Observe. Verify. Report."
    }
  };

  const THEMES = {
    "unhrc": { a: "#5c9dff", b: "#2b6fb8", g: "92, 157, 255" },
    "uncsw": { a: "#b78fff", b: "#e07aa0", g: "183, 144, 255" },
    "lok-sabha": { a: "#f0c36e", b: "#a8803a", g: "240, 195, 110" },
    "influencer": { a: "#ff5fd2", b: "#5c9dff", g: "255, 95, 210" },
    "mythology": { a: "#e8b34b", b: "#4b3f9e", g: "232, 179, 75" },
    "harry-potter": { a: "#a98fff", b: "#3fd0c9", g: "169, 143, 255" },
    "ipl": { a: "#ff8a5c", b: "#ffe14d", g: "255, 138, 92" },
    "international-press": { a: "#9fc4e8", b: "#7d8fd0", g: "159, 196, 232" }
  };

  /* ---------- 2. Node placement + constellation links ---------- */
  const POS = {
    "unhrc": [50, 10],
    "uncsw": [17, 30],
    "lok-sabha": [83, 30],
    "influencer": [10, 60],
    "mythology": [90, 60],
    "harry-potter": [30, 86],
    "ipl": [70, 86],
    "international-press": [50, 68]
  };
  const LINKS = [
    ["unhrc", "uncsw"],
    ["unhrc", "lok-sabha"],
    ["uncsw", "influencer"],
    ["lok-sabha", "mythology"],
    ["influencer", "harry-potter"],
    ["mythology", "ipl"],
    ["harry-potter", "international-press"],
    ["ipl", "international-press"],
    ["unhrc", "international-press"]
  ];

  const state = { selected: null, q: "" };

  const galaxy = $("#galaxy");
  const field = $("#galaxy-field");
  const dossier = {
    root: $("#dossier"),
    inner: $(".dossier__inner"),
    num: $("#dossier-num"),
    short: $("#dossier-short"),
    full: $("#dossier-full"),
    type: $("#dossier-type"),
    desc: $("#dossier-desc"),
    fee: $("#dossier-fee"),
    agenda: $("#dossier-agenda"),
    search: $("#dossier-search"),
    matrix: $("#dossier-matrix"),
    count: $("#dossier-count"),
    register: $("#dossier-register")
  };

  const sheet = {
    root: $("#sheet"),
    title: $("#sheet-title"),
    body: $("#sheet-body")
  };

  /* ---------- 3. Build the map: constellation lines, orbit rings, nodes ---------- */
  function buildMap() {
    if (!field || !COMMITTEES) return;
    let svg = '<svg class="galaxy__links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
    for (const [a, b] of LINKS) {
      const pa = POS[a], pb = POS[b];
      svg += '<line data-a="' + a + '" data-b="' + b + '" x1="' + pa[0] + '" y1="' + pa[1] + '" x2="' + pb[0] + '" y2="' + pb[1] + '" />';
    }
    svg += '</svg>';
    let nodes = "";
    for (const c of COMMITTEES) {
      const t = THEMES[c.id] || { a: "#8f7bff", b: "#5c9dff", g: "143, 123, 255" };
      const p = POS[c.id] || [50, 50];
      nodes +=
        '<button type="button" class="galaxy__node" role="tab" aria-selected="false" data-committee="' + c.id + '"' +
        ' style="left:' + p[0] + '%;top:' + p[1] + '%;--node-a:' + t.a + ';--node-b:' + t.b + ';--node-glow:' + t.g + '">' +
        '<span class="galaxy__node-planet" aria-hidden="true"></span>' +
        '<span class="galaxy__node-ring" aria-hidden="true"></span>' +
        '<span class="galaxy__node-label">' + c.short + '</span>' +
        '</button>';
    }
    field.innerHTML = svg + nodes;
    $$(".galaxy__node", field).forEach((btn) => {
      btn.addEventListener("click", () => selectCommittee(btn.dataset.committee));
      btn.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectCommittee(btn.dataset.committee); }
      });
    });
  }

  function selectCommittee(id) {
    const c = COMMITTEES.find((x) => x.id === id);
    if (!c) return;
    const repeat = state.selected === id;
    state.selected = id;
    if (!repeat) state.q = "";
    if (dossier.search) dossier.search.value = "";
    $$(".galaxy__node", field).forEach((btn) => {
      const sel = btn.dataset.committee === id;
      btn.classList.toggle("is-selected", sel);
      btn.setAttribute("aria-selected", sel ? "true" : "false");
    });
    if (repeat) {
      renderDossier(c);
      return;
    }
    pulseLinks(id);
    activateDossier(c);
    if (window.innerWidth < 900) openSheet(c);
  }

  /* ---------- 2b. Cinematic activation sequence (Phases A–D) ----------
     The right-hand panel runs: selection response → brief initialization →
     committee reveal → staggered mission dossier. All committee data comes
     from data.js; themes/intro copy come from DOS_THEMES + DOS_INTRO. The
     sequence is ~1.4s, never blocks reading, and is disabled (static,
     complete states) under prefers-reduced-motion. */
  const BOOT_LINES = [
    "ESTABLISHING SECURE CONNECTION…",
    "INITIALIZING COMMITTEE DOSSIER…",
    "DECRYPTING PORTFOLIO MATRIX…",
    "SYNCING COMMITTEE REGISTRY…",
    "ALIGNING DELEGATION RECORDS…",
    "RETRIEVING CRISIS BRIEF…",
    "CALIBRATING AUCTION FEED…",
    "OPENING NEWSROOM UPLINK…"
  ];
  let dosTimer = null;
  let dosEpoch = 0;

  function dosSetVars(root, t) {
    root.style.setProperty("--th-a", t.a);
    root.style.setProperty("--th-b", t.b);
    root.style.setProperty("--th-glow", t.g);
    root.style.setProperty("--th-soft", "rgba(" + t.g + ", 0.14)");
    root.style.setProperty("--th-mist", "rgba(" + t.g + ", 0.07)");
  }

  function dosMotifSvg(id) {
    const s = 'class="dos-motif-glow"';
    const views = {
      "unhrc":
        '<svg viewBox="0 0 120 118" aria-hidden="true">' +
        '<circle class="dos-motif-dim" cx="60" cy="59" r="42" fill="none" stroke-width="1"/>' +
        '<g ' + s + '>' +
        '<circle cx="60" cy="59" r="30" fill="none" class="dos-motif-wire" stroke-width="1.4"/>' +
        '<ellipse cx="60" cy="59" rx="30" ry="11" fill="none" class="dos-motif-wire" stroke-width="1"/>' +
        '<ellipse cx="60" cy="59" rx="30" ry="21" fill="none" class="dos-motif-dim" stroke-width="0.8"/>' +
        '<line x1="30" y1="59" x2="90" y2="59" class="dos-motif-wire" stroke-width="0.9"/>' +
        '<line x1="60" y1="29" x2="60" y2="89" class="dos-motif-wire" stroke-width="0.9"/>' +
        '</g>' +
        '<circle class="dos-motif-fill dos-motif-spark" cx="88" cy="38" r="2"/>' +
        '<circle class="dos-motif-fill dos-motif-spark--b" cx="34" cy="74" r="1.6"/>' +
        '<circle class="dos-motif-fill dos-motif-spark--c" cx="94" cy="70" r="1.8"/>' +
        '<path class="dos-motif-wire dos-motif-anim-wire dos-motif-glow" d="M24 84 Q 60 96 96 78" fill="none" stroke-width="1.2"/>' +
        '<circle class="dos-motif-fill" cx="24" cy="84" r="2"/><circle class="dos-motif-fill" cx="96" cy="78" r="2"/>' +
        '</svg>',
      "uncsw":
        '<svg viewBox="0 0 120 118" aria-hidden="true">' +
        '<g ' + s + '>' +
        '<circle cx="60" cy="59" r="16" fill="none" class="dos-motif-wire" stroke-width="1.4"/>' +
        '<circle cx="60" cy="59" r="27" fill="none" class="dos-motif-dim" stroke-width="1"/>' +
        '<circle cx="60" cy="59" r="38" fill="none" class="dos-motif-dim" stroke-width="0.8"/>' +
        '</g>' +
        '<g class="dos-motif-anim-orbit" ' + s + '>' +
        '<circle class="dos-motif-fill" cx="98" cy="59" r="2.6"/>' +
        '<circle class="dos-motif-fill" cx="86" cy="42" r="2"/>' +
        '<circle class="dos-motif-fill" cx="72" cy="93" r="1.8"/>' +
        '</g>' +
        '<path class="dos-motif-wire dos-motif-anim-wire" d="M28 38 L60 59 L92 38 M28 80 L60 59 L92 80" fill="none" stroke-width="1"/>' +
        '<circle class="dos-motif-fill dos-motif-star" cx="28" cy="38" r="1.8"/>' +
        '<circle class="dos-motif-fill dos-motif-star--b" cx="92" cy="80" r="1.8"/>' +
        '</svg>',
      "lok-sabha":
        '<svg viewBox="0 0 120 118" aria-hidden="true">' +
        '<g opacity="0.5">' +
        '<polygon class="dos-motif-beam" points="38,0 52,0 66,118 24,118" fill="rgba(240, 195, 110, 0.10)"/>' +
        '<polygon class="dos-motif-beam dos-motif-beam--b" points="68,0 82,0 96,118 54,118" fill="rgba(240, 195, 110, 0.08)"/>' +
        '</g>' +
        '<path class="dos-motif-wire" d="M26 88 Q 60 72 94 88" fill="none" stroke-width="1.6"/>' +
        '<path class="dos-motif-dim" d="M32 97 Q 60 84 88 97" fill="none" stroke-width="1.1"/>' +
        '<circle class="dos-motif-fill dos-motif-rise" cx="38" cy="84" r="3"/>' +
        '<circle class="dos-motif-fill dos-motif-rise" cx="60" cy="80.5" r="3" style="animation-delay:0.5s"/>' +
        '<circle class="dos-motif-fill dos-motif-rise" cx="82" cy="84" r="3" style="animation-delay:1s"/>' +
        '<circle class="dos-motif-fill dos-motif-spark" cx="50" cy="70" r="1.8"/>' +
        '<circle class="dos-motif-fill dos-motif-spark--b" cx="70" cy="72" r="1.8"/>' +
        '<line x1="60" y1="14" x2="60" y2="58" class="dos-motif-wire dos-motif-glow" stroke-width="1"/>' +
        '</svg>',
      "influencer":
        '<svg viewBox="0 0 120 118" aria-hidden="true">' +
        '<g ' + s + '>' +
        '<rect class="dos-motif-wave" x="30" y="52" width="4" height="14" rx="2"/>' +
        '<rect class="dos-motif-wave dos-motif-wave--b" x="40" y="44" width="4" height="30" rx="2"/>' +
        '<rect class="dos-motif-wave dos-motif-wave--c" x="50" y="36" width="4" height="46" rx="2"/>' +
        '<rect class="dos-motif-wave dos-motif-wave--d" x="60" y="28" width="4" height="62" rx="2"/>' +
        '<rect class="dos-motif-wave dos-motif-wave--c" x="70" y="40" width="4" height="38" rx="2"/>' +
        '<rect class="dos-motif-wave dos-motif-wave--b" x="80" y="48" width="4" height="22" rx="2"/>' +
        '<rect class="dos-motif-wave" x="90" y="54" width="4" height="10" rx="2"/>' +
        '</g>' +
        '<circle class="dos-motif-fill dos-motif-spark" cx="24" cy="34" r="2"/>' +
        '<circle class="dos-motif-fill dos-motif-spark--b" cx="98" cy="28" r="2.2"/>' +
        '<circle class="dos-motif-fill dos-motif-spark--c" cx="94" cy="88" r="1.8"/>' +
        '<path class="dos-motif-dim dos-motif-anim-wire" d="M24 34 L60 59 L98 28 M94 88 L60 59" fill="none" stroke-width="0.9"/>' +
        '</svg>',
      "mythology":
        '<svg viewBox="0 0 120 118" aria-hidden="true">' +
        '<g ' + s + '>' +
        '<circle cx="60" cy="59" r="46" fill="none" class="dos-motif-wire" stroke-width="1"/>' +
        '<circle cx="60" cy="59" r="34" fill="none" class="dos-motif-dim" stroke-width="0.8"/>' +
        '<path class="dos-motif-wire" d="M60 13 L69 50 L106 59 L69 68 L60 105 L51 68 L14 59 L51 50 Z" fill="none" stroke-width="1.1"/>' +
        '<circle cx="60" cy="59" r="9" fill="none" class="dos-motif-wire" stroke-width="1.4"/>' +
        '</g>' +
        '<g class="dos-motif-anim-orbit">' +
        '<circle class="dos-motif-fill" cx="60" cy="13" r="2.2"/>' +
        '</g>' +
        '<circle class="dos-motif-fill dos-motif-mote" cx="22" cy="34" r="1.6"/>' +
        '<circle class="dos-motif-fill dos-motif-mote--b" cx="98" cy="40" r="1.4"/>' +
        '<circle class="dos-motif-fill dos-motif-mote--c" cx="30" cy="88" r="1.8"/>' +
        '<circle class="dos-motif-fill dos-motif-mote--d" cx="92" cy="82" r="1.4"/>' +
        '<path class="dos-motif-wire dos-motif-anim-pulse" d="M36 59 Q 60 40 84 59" fill="none" stroke-width="0.9"/>' +
        '<path class="dos-motif-wire dos-motif-anim-pulse2" d="M36 59 Q 60 78 84 59" fill="none" stroke-width="0.9"/>' +
        '</svg>',
      "harry-potter":
        '<svg viewBox="0 0 120 118" aria-hidden="true">' +
        '<path class="dos-motif-dim" d="M20 96 L20 74 L28 74 L28 62 L36 62 L36 74 L44 74 L44 58 L52 50 L60 58 L60 74 L76 74 L76 64 L84 64 L84 74 L92 74 L92 88 L100 88 L100 96 Z" fill="none" stroke-width="1.3"/>' +
        '<g ' + s + '>' +
        '<circle cx="60" cy="59" r="40" fill="none" class="dos-motif-wire" stroke-width="0.9" stroke-dasharray="3 7"/>' +
        '<path class="dos-motif-wire" d="M60 27 L66 53 L92 59 L66 65 L60 91 L54 65 L28 59 L54 53 Z" fill="none" stroke-width="1"/>' +
        '</g>' +
        '<circle class="dos-motif-fill dos-motif-mote" cx="26" cy="30" r="1.8"/>' +
        '<circle class="dos-motif-fill dos-motif-mote--b" cx="94" cy="34" r="1.5"/>' +
        '<circle class="dos-motif-fill dos-motif-mote--c" cx="36" cy="26" r="1.4"/>' +
        '<circle class="dos-motif-fill dos-motif-mote--d" cx="86" cy="24" r="1.6"/>' +
        '<circle class="dos-motif-fill dos-motif-star" cx="60" cy="14" r="1.6"/>' +
        '</svg>',
      "ipl":
        '<svg viewBox="0 0 120 118" aria-hidden="true">' +
        '<g opacity="0.6">' +
        '<polygon class="dos-motif-beam" points="30,0 42,0 58,118 16,118" fill="rgba(255, 225, 77, 0.10)"/>' +
        '<polygon class="dos-motif-beam dos-motif-beam--b" points="78,0 90,0 106,118 62,118" fill="rgba(255, 138, 92, 0.10)"/>' +
        '</g>' +
        '<g ' + s + '>' +
        '<rect x="34" y="30" width="52" height="30" rx="4" fill="none" class="dos-motif-wire" stroke-width="1.4"/>' +
        '<line x1="34" y1="42" x2="86" y2="42" class="dos-motif-dim" stroke-width="1"/>' +
        '<text x="60" y="39" text-anchor="middle" class="dos-motif-score">₹ CR</text>' +
        '<text x="60" y="56" text-anchor="middle" class="dos-motif-score dos-motif-score--big">PADDLE UP</text>' +
        '</g>' +
        '<rect class="dos-motif-fill dos-motif-bid" x="40" y="76" width="40" height="6" rx="3"/>' +
        '<rect class="dos-motif-fill dos-motif-bid--b" x="46" y="88" width="28" height="5" rx="2.5"/>' +
        '<rect class="dos-motif-fill dos-motif-bid--c" x="52" y="98" width="16" height="4" rx="2"/>' +
        '</svg>',
      "international-press":
        '<svg viewBox="0 0 120 118" aria-hidden="true">' +
        '<g ' + s + '>' +
        '<line x1="14" y1="30" x2="106" y2="30" class="dos-motif-wire" stroke-width="2"/>' +
        '<line x1="14" y1="40" x2="88" y2="40" class="dos-motif-wire dos-motif-anim-pulse" stroke-width="1.2"/>' +
        '<line x1="14" y1="48" x2="96" y2="48" class="dos-motif-dim" stroke-width="1"/>' +
        '<rect x="14" y="58" width="34" height="26" rx="3" fill="none" class="dos-motif-wire" stroke-width="1.1"/>' +
        '<circle class="dos-motif-fill dos-motif-flash" cx="31" cy="71" r="3"/>' +
        '<rect x="56" y="58" width="50" height="4" rx="2" class="dos-motif-fill"/>' +
        '<rect x="56" y="66" width="42" height="3" rx="1.5" class="dos-motif-dim" fill="currentColor"/>' +
        '<rect x="56" y="73" width="46" height="3" rx="1.5" class="dos-motif-dim" fill="currentColor"/>' +
        '<rect x="56" y="80" width="30" height="3" rx="1.5" class="dos-motif-dim" fill="currentColor"/>' +
        '</g>' +
        '<line class="dos-motif-wire dos-motif-glow" x1="0" y1="92" x2="120" y2="92" stroke-width="1" stroke-dasharray="8 6"/>' +
        '</svg>'
    };
    return views[id] || views["unhrc"];
  }

  function dosEnsureLayer() {
    let layer = $(".dossier-fx", dossier.root);
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "dossier-fx";
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML =
        '<div class="dossier__sweep"></div>' +
        '<div class="dossier__motif"></div>' +
        '<div class="dossier__intro">' +
        '<p class="dossier__intro-title"></p>' +
        '<p class="dossier__intro-sub"></p>' +
        '</div>' +
        '<hr class="dossier__rule" />' +
        '<div class="dossier__boot">' +
        '<p class="dossier__boot-label"></p>' +
        '<div class="dossier__boot-track"></div>' +
        '<p class="dossier__boot-meta"></p>' +
        '</div>';
      dossier.root.insertBefore(layer, dossier.inner);
    }
    return layer;
  }

  function activateDossier(c) {
    const root = dossier.root;
    if (!root || !dossier.inner) return;
    const t = THEMES[c.id] || { a: "#8f7bff", b: "#5c9dff", g: "143, 123, 255" };
    const intro = DOS_INTRO[c.id] || { reveal: c.short, line: c.type };
    const reduced = reducedMotion.matches;
    const layer = dosEnsureLayer();
    const boot = layer.querySelector(".dossier__boot");
    const motif = layer.querySelector(".dossier__motif");
    const introBox = layer.querySelector(".dossier__intro");
    const epoch = ++dosEpoch;

    if (dosTimer) { clearTimeout(dosTimer); dosTimer = null; }

    root.classList.add("is-themed", "is-initializing", "is-animating-out");
    root.classList.remove("is-staged");
    dosSetVars(root, t);
    if (sheet.root) {
      dosSetVars(sheet.root, t);
      sheet.root.classList.add("is-themed");
    }
    /* pin the current height so the content collapse animates smoothly */
    if (dossier.inner) dossier.inner.style.maxHeight = dossier.inner.offsetHeight + "px";

    /* Phase B — brief initialization (never a fake wait) */
    boot.querySelector(".dossier__boot-label").textContent =
      BOOT_LINES[(c.num - 1) % BOOT_LINES.length];
    boot.querySelector(".dossier__boot-meta").textContent =
      "COMMITTEE " + c.num + " · " + c.short + " · CHANNEL SECURE";
    motif.innerHTML = dosMotifSvg(c.id);
    motif.insertAdjacentHTML(
      "beforeend",
      '<p class="dossier__motif-tag">' + intro.reveal + "</p>"
    );
    introBox.querySelector(".dossier__intro-title").textContent = intro.reveal;
    introBox.querySelector(".dossier__intro-sub").textContent = intro.line;

    if (reduced) {
      root.classList.remove("is-initializing");
      root.classList.add("is-staged");
      if (dossier.inner) dossier.inner.style.maxHeight = "";
      renderDossier(c);
      return;
    }

    const sweep = layer.querySelector(".dossier__sweep");
    sweep.classList.remove("is-sweeping");
    void sweep.offsetWidth;
    sweep.classList.add("is-sweeping");
    root.classList.add("is-activating");
    const holdMs = 430;
    dosTimer = window.setTimeout(() => {
      if (epoch !== dosEpoch) return;
      root.classList.remove("is-initializing");
      root.classList.remove("is-animating-out");
      /* reveal the real committee data at the same moment the boot ends */
      renderDossier(c);
      /* grow the panel to the freshly rendered committee's natural height */
      if (dossier.inner) dossier.inner.style.maxHeight = dossier.inner.scrollHeight + "px";
      dosTimer = window.setTimeout(() => {
        if (epoch !== dosEpoch) return;
        root.classList.remove("is-activating");
        root.classList.add("is-staged");
        if (dossier.inner) dossier.inner.style.maxHeight = "";
      }, 900);
    }, holdMs);
  }

  function pulseLinks(id) {
    if (!field) return;
    const t = THEMES[id] || { g: "143, 123, 255" };
    const sel = '.galaxy__links line[data-a="' + id + '"], .galaxy__links line[data-b="' + id + '"]';
    $$(sel, field).forEach((line) => {
      line.style.setProperty("--node-glow", t.g);
      line.classList.remove("is-pulsing");
      void line.getBoundingClientRect();
      line.classList.add("is-pulsing");
    });
  }

  /* ---------- 4. Dossier: header fields + searchable portfolio matrix ---------- */
  function renderDossier(c) {
    if (dossier.num) dossier.num.textContent = "Committee " + c.num;
    if (dossier.short) dossier.short.textContent = c.short;
    if (dossier.full) dossier.full.textContent = c.name;
    if (dossier.type) {
      dossier.type.textContent = c.type;
      dossier.type.classList.add("is-accent");
    }
    if (dossier.desc) dossier.desc.textContent = c.description;
    if (dossier.fee) {
      dossier.fee.textContent = formatFee(c.fee) + " / delegate";
      dossier.fee.classList.add("is-accent");
    }
    if (dossier.agenda) dossier.agenda.textContent = c.agenda;
    renderMatrix(c);
  }

  function renderMatrix(c) {
    if (!dossier.matrix) return;
    const groups = getPortfolioGroups(c);
    const q = state.q.trim().toLowerCase();
    const matches = (s) => !q || s.toLowerCase().includes(q);
    const descOf = (name) =>
      (c.factions || []).flatMap((f) => f.roles).find((r) => r.name === name);
    let html = "";
    let shown = 0;
    for (const g of groups) {
      const items = g.items.filter(matches);
      if (!items.length) continue;
      shown += items.length;
      html += '<div class="cm-group">';
      html += '<p class="cm-group-title">' + g.label + "</p>";
      for (const name of items) {
        const d = descOf(name);
        html += '<div class="cm-chip"><span>' + name + "</span>";
        if (d && d.desc) html += '<span class="cm-chip-desc">' + d.desc + "</span>";
        html += "</div>";
      }
      html += "</div>";
    }
    if (!html) html = '<p class="reg__port-empty">No portfolios match your search.</p>';
    dossier.matrix.innerHTML = html;
    if (dossier.count) {
      dossier.count.textContent = q
        ? shown + " of " + getPortfolioNames(c).length + " portfolios match your search"
        : getPortfolioNames(c).length + " portfolios — search above to filter";
    }
  }

  /* ---------- 5. Mobile sheet: bottom-sheet version of the dossier ---------- */
  function openSheet(c) {
    if (!sheet.root) return;
    sheet.title.textContent = c.short;
    let html = '<p class="dossier__type is-accent">' + c.type + '</p>' +
      '<p class="dossier__desc">' + c.description + '</p>' +
      '<div class="dossier__meta">' +
      '<div class="dossier__meta-item"><span class="dossier__meta-label">Registration fee</span><span class="dossier__fee is-accent">' + formatFee(c.fee) + ' / delegate</span></div>' +
      '<div class="dossier__meta-item"><span class="dossier__meta-label">Agenda</span><span class="dossier__agenda">' + c.agenda + '</span></div>' +
      '</div>' +
      '<div class="dossier__portfolios">' +
      '<div class="dossier__port-head"><h4>Portfolio availability</h4>' +
      '<input class="dossier-search" type="search" id="sheet-search" placeholder="Search portfolios…" aria-label="Search portfolios" /></div>' +
      '<div class="dossier__matrix" id="sheet-matrix"></div>' +
      '<p class="dossier__count" id="sheet-count"></p>' +
      '</div>' +
      '<button class="btn btn--primary" type="button" id="sheet-register">Register for this committee</button>';
    sheet.body.innerHTML = html;
    const sSearch = document.getElementById("sheet-search");
    const sMatrix = document.getElementById("sheet-matrix");
    const sCount = document.getElementById("sheet-count");
    const sRegister = document.getElementById("sheet-register");
    let sheetQ = "";
    function renderSheetMatrix() {
      const groups = getPortfolioGroups(c);
      const q = sheetQ.trim().toLowerCase();
      const matches = (s) => !q || s.toLowerCase().includes(q);
      const descOf = (name) =>
        (c.factions || []).flatMap((f) => f.roles).find((r) => r.name === name);
      let html = "";
      let shown = 0;
      for (const g of groups) {
        const items = g.items.filter(matches);
        if (!items.length) continue;
        shown += items.length;
        html += '<div class="cm-group">';
        html += '<p class="cm-group-title">' + g.label + "</p>";
        for (const name of items) {
          const d = descOf(name);
          html += '<div class="cm-chip"><span>' + name + "</span>";
          if (d && d.desc) html += '<span class="cm-chip-desc">' + d.desc + "</span>";
          html += "</div>";
        }
        html += "</div>";
      }
      if (!html) html = '<p class="reg__port-empty">No portfolios match your search.</p>';
      sMatrix.innerHTML = html;
      sCount.textContent = q
        ? shown + " of " + getPortfolioNames(c).length + " portfolios match your search"
        : getPortfolioNames(c).length + " portfolios — search above to filter";
    }
    sSearch.addEventListener("input", () => { sheetQ = sSearch.value; renderSheetMatrix(); });
    sRegister.addEventListener("click", () => { closeSheet(); window.nebulaReg && window.nebulaReg.openRegister(c.id); });
    renderSheetMatrix();
    sheet.root.hidden = false;
    sheet.root.setAttribute("aria-hidden", "false");
    sSearch.focus();
  }

  function closeSheet() {
    if (!sheet.root || sheet.root.hidden) return;
    sheet.root.hidden = true;
    sheet.root.setAttribute("aria-hidden", "true");
  }

  /* ---------- 6. Wiring: search, register buttons, parallax, reduced motion ---------- */
  function init() {
    buildMap();
    if (dossier.search) {
      dossier.search.addEventListener("input", () => {
        state.q = dossier.search.value;
        if (state.selected) {
          const c = COMMITTEES.find((x) => x.id === state.selected);
          if (c) renderMatrix(c);
        }
      });
      dossier.search.addEventListener("focus", () => {
        const root = dossier.root;
        if (root) root.classList.add("is-staged");
      });
    }
    if (dossier.register) {
      dossier.register.addEventListener("click", () => {
        if (!state.selected) return;
        window.nebulaReg && window.nebulaReg.openRegister(state.selected);
      });
    }
    $$("[data-sheet-close]").forEach((el) => el.addEventListener("click", closeSheet));
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !sheet.root.hidden) closeSheet();
    });

    // restrained pointer parallax on the stage (desktop, fine pointers, motion allowed)
    const stage = $(".galaxy-stage");
    function applyParallax() {
      if (reducedMotion.matches || !finePointer.matches) return;
      stage.addEventListener("pointermove", (e) => {
        const r = stage.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const fieldEl = $("#galaxy");
        fieldEl.style.transform = "translate3d(" + (-px * 10).toFixed(1) + "px, " + (-py * 10).toFixed(1) + "px, 0)";
      });
      stage.addEventListener("pointerleave", () => {
        $("#galaxy").style.transform = "";
      });
    }
    applyParallax();
    reducedMotion.addEventListener("change", () => {
      $("#galaxy").style.transform = "";
      applyParallax();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
