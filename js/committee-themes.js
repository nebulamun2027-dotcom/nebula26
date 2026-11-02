/* ==========================================================================
   NEBULA MUN 2026 — committee world themes
   Visual identity + cinematic startup configuration for the eight worlds.
   This file is deliberately SEPARATE from js/data.js: committee names,
   descriptions, fees, agendas and portfolios stay owned by data.js. These
   objects are keyed by the official committee id and only describe art
   direction, lighting, camera and startup copy.

   Official committee names are mirrored here for validation/display, but
   js/committee-worlds.js always reads the authoritative record from
   COMMITTEES (js/data.js) before rendering a dossier.
   ========================================================================== */
(function () {
  "use strict";

  const THEMES = {
    unhrc: {
      id: "unhrc",
      short: "UNHRC",
      official: "United Nations Human Rights Council",
      world: "council",
      palette: {
        primary: "#5c9dff",
        secondary: "#2b6fb8",
        accent: "#9ee8ff",
        deep: "#04142b",
        glow: "92, 157, 255",
        nebula: ["#071a3a", "#1553a8", "#7fd0ff"]
      },
      startup: {
        eyebrow: "COMMITTEE 01 · ORBITAL COUNCIL",
        title: "THE HUMAN RIGHTS CHAMBER",
        line: "Dignity has a floor. Take it.",
        hud: "COUNCIL WORLD · BLUE ORBIT"
      },
      camera: { distance: 16, height: 3.2, target: [0, 1.5, 0] }
    },

    uncsw: {
      id: "uncsw",
      short: "UNCSW",
      official: "United Nations Commission on the Status of Women",
      world: "celestial",
      palette: {
        primary: "#5c1d2e",   // deep burgundy
        secondary: "#4a1d5c", // royal purple
        accent: "#c9a227",    // elegant gold
        deep: "#1a0a1d",      // near-black burgundy
        glow: "169, 126, 199", // purple glow
        ivory: "#f5efe4",     // warm ivory
        nebula: ["#1a0a1d", "#5c1d2e", "#c9a227"]
      },
      startup: {
        eyebrow: "COMMITTEE 02 · UNCSW",
        title: "UNCSW — THE VOICES THAT CHANGED HISTORY",
        line: "Celebrating women who fought for equality, education and justice.",
        hud: "ICONIC WOMEN · GLOBAL UNITY"
      },
      camera: { distance: 24, height: 4.6, target: [0, 1.6, 0] }
    },

    "lok-sabha": {
      id: "lok-sabha",
      short: "Lok Sabha",
      official: "Parliament of India (Lok Sabha)",
      world: "parliament",
      palette: {
        primary: "#f0c36e",
        secondary: "#a8803a",
        accent: "#ffdda0",
        deep: "#1a1003",
        glow: "240, 195, 110",
        nebula: ["#241303", "#6e4710", "#f0c36e"]
      },
      startup: {
        eyebrow: "COMMITTEE 03 · NATIONAL CHAMBER",
        title: "THE HOUSE IS IN SESSION",
        line: "Debate. Legislate. Lead.",
        hud: "PARLIAMENT WORLD · GOLDEN LIGHT"
      },
      camera: { distance: 17, height: 3.8, target: [0, 2.1, 0] }
    },

    influencer: {
      id: "influencer",
      short: "Influencer Summit",
      official: "Influencer Summit",
      world: "digital",
      palette: {
        primary: "#ff5fd2",
        secondary: "#5c9dff",
        accent: "#7dfcff",
        deep: "#12041f",
        glow: "255, 95, 210",
        nebula: ["#180322", "#6a147d", "#ff5fd2"]
      },
      startup: {
        eyebrow: "COMMITTEE 04 · NETWORK UPLINK",
        title: "INFLUENCE IS A UNIVERSE",
        line: "Shape the narrative. Challenge the algorithm.",
        hud: "DIGITAL WORLD · NEON NETWORK"
      },
      camera: { distance: 15, height: 3.4, target: [0, 2.0, 0] }
    },

    mythology: {
      id: "mythology",
      short: "Mythology Crisis",
      official: "Indian Mythology Crisis Committee",
      world: "mythic",
      palette: {
        primary: "#e8b34b",
        secondary: "#c2382f",
        accent: "#ffd98a",
        deep: "#1e0804",
        glow: "232, 179, 75",
        nebula: ["#260704", "#6f1a10", "#e8b34b"]
      },
      startup: {
        eyebrow: "COMMITTEE 05 · EPIC CRISIS",
        title: "THE CELESTIAL COURT",
        line: "Dharma. Strategy. Destiny.",
        hud: "MYTHIC WORLD · GOLD & CRIMSON"
      },
      camera: { distance: 18, height: 3.2, target: [0, 2.6, 0] }
    },

    "harry-potter": {
      id: "harry-potter",
      short: "Wizarding Crisis",
      official: "Wizarding Crisis Committee",
      world: "castle",
      palette: {
        primary: "#5c1d2f",   // deep burgundy
        secondary: "#0b0f2a", // royal purple
        accent: "#d4af37",    // antique gold
        deep: "#040308",      // near-black
        glow: "122, 31, 47",  // burgundy glow
        nebula: ["#040308", "#0b0f2a", "#5c1d2f"]
      },
      startup: {
        eyebrow: "COMMITTEE 06 · WIZARDING CRISIS",
        title: "WIZARDING CRISIS",
        line: "Ancient magic stirs. The runes awaken.",
        hud: "WIZARDING WORLD · MOONLIT TOWERS"
      },
      camera: { distance: 24, height: 5.2, target: [0, 1.6, 0] }
    },

    ipl: {
      id: "ipl",
      short: "IPL Auction",
      official: "IPL Auction / Crisis Committee",
      world: "arena",
      palette: {
        primary: "#d4af37",   // gold
        secondary: "#1a1a1a", // black
        accent: "#00f3ff",    // electric blue
        deep: "#040404",      // near-black
        glow: "212, 175, 55", // gold glow
        nebula: ["#040404", "#1a1a1a", "#d4af37"]
      },
      startup: {
        eyebrow: "COMMITTEE 07 · IPL AUCTION",
        title: "THE AUCTION BLOCK",
        line: "Every rupee is a statement. Every pick is a strategy.",
        hud: "STADIUM PRIME · NIGHT SESSION"
      },
      camera: { distance: 24, height: 5.5, target: [0, 1.2, 0] }
    },

    "international-press": {
      id: "international-press",
      short: "International Press",
      official: "International Press (IP)",
      world: "press",
      palette: {
        primary: "#9fc4e8",
        secondary: "#7d8fd0",
        accent: "#d9f1ff",
        deep: "#07131f",
        glow: "159, 196, 232",
        nebula: ["#06121f", "#1e4468", "#9fc4e8"]
      },
      startup: {
        eyebrow: "COMMITTEE 08 · GLOBAL NEWSROOM",
        title: "THE WORLD IS WATCHING",
        line: "Observe. Verify. Report.",
        hud: "MEDIA WORLD · HOLOGRAPHIC EARTH"
      },
      camera: { distance: 16, height: 3.0, target: [0, 2.0, 0] }
    }
  };

  /* Fail loudly during development if a committee id from data.js has no
     world theme. The site itself still degrades to the UNHRC visual. */
  function validateThemes() {
    if (typeof COMMITTEES === "undefined") return;
    const ids = COMMITTEES.map((c) => c.id);
    const missing = ids.filter((id) => !THEMES[id]);
    const extra = Object.keys(THEMES).filter((id) => ids.indexOf(id) === -1);
    if (missing.length || extra.length) {
      console.warn(
        "[committee-themes] theme/data mismatch",
        { missing: missing, extra: extra }
      );
    }
  }
  validateThemes();

  window.NEBULA_COMMITTEE_THEMES = THEMES;
})();
