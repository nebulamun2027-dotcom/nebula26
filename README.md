# NEBULA MUN 2026 — Website

A static multi-page (single-file) website for NEBULA MUN 2026, built in five phases:

| Phase | What it covers |
|---|---|
| 1 | Hero, about, timeline/venue, countdown, footer (homepage) |
| 2 | Registration: 5-step wizard modal, local draft in `localStorage` |
| 3 | **The NEBULA GALAXY ARCHIVE**: interactive star map of the eight committee destinations, MISSION DOSSIER panel, searchable portfolio explorer, register handoff that preselects the chosen committee |
| 4 | **The NEBULA GATEWAY**: full-viewport cinematic entrance (stages A–D), skip + replay, session-based one-time playback, reduced-motion path, and the continuously living cosmic background |
| 5 | **THE LIVING COSMOS + EIGHT COMMITTEE WORLDS**: real-time Three.js homepage universe and a distinct cinematic startup world for every committee, with in-world dossiers, responsive handoff, reduced-motion and WebGL-fallback paths |

## Run it

No build step, no server required — it is plain HTML/CSS/JS.

```bash
# Option 1: just open the file
open index.html            # macOS
# Option 2: any static server (optional, for local dev)
python3 -m http.server 8080
```

Then browse to `http://localhost:8080`.

## Files

```
index.html        single-page site: nav, hero, committees-as-galaxy, modals, footer
css/styles.css     design system: tokens, star field, nebula, modals, galaxy archive
css/dossier-activation.css  cinematic per-committee activation motifs + Phase A–D motion for the mission dossier
css/cosmos.css     Phase 5 homepage cosmos polish, world overlay/HUD/startup, in-world dossier, responsive + reduced-motion rules
js/data.js         single source of truth: COMMITTEES + portfolio/group data + helpers
js/main.js         legacy star-field canvas (parallax, shooting stars), countdown, reveal-on-scroll, tilt — suspended once the 3D cosmos is ready, used as a background fallback
js/nebula.js       Phase 5 living cosmos: the shared Three.js homepage universe (planet, star, orbiters, ringed world, nebula shaders, asteroids, spacecraft, shooting stars) + 2D fallback
js/committee-themes.js  art direction, palette, camera and startup copy for the eight committee worlds (keyed by official data.js IDs)
js/committee-worlds.js  shared full-screen Three.js world engine: startup sequence, cinematic dossier reveal, responsive placement, disposal and CSS fallback
js/galaxy.js       galaxy map, mission dossier (desktop), mobile bottom sheet, register handoff, world enter/exit integration
js/register.js     5-step registration wizard (client-side only)
js/gateway.js       Phase 4 gateway renderer: canvas rings, inward particles, energy pulses, filaments, parallax
js/gateway-sequence.js  Phase 4 sequence controller: stages A (signal) → B (activation) → C (access panel) → D (exit/warp)
js/about-chamber.js  About-section celestial diplomacy chamber: WebGL 3D scene (central planet, rings, three orbiting planets, particles) + 2D canvas fallback
js/venue.js  "Find Your Way to NEBULA" renderer: reads VENUE (js/data.js) and swaps the pending panel for the interactive map, address line and Get Directions link
vendor/three.min.js  vendored Three.js r160 (UMD) so the cosmos loads without a network dependency
```

## The NEBULA GALAXY ARCHIVE (Phase 3)

An interactive star map of the eight committee destinations, built from a single
source of truth in `js/data.js`.

- **The map** (`#galaxy`): 8 planetary nodes on a fixed layout (`POS` in `js/galaxy.js`),
  each with its own visual identity (Earth-blue, violet/rose, gold-lit, neon digital,
  ancient celestial, enchanted, stadium, silver observatory). Constellation lines
  (inline SVG, `LINKS`), a central NEBULA beacon core, and orbit rings.
  - Selecting a node pulses its constellation lines and triggers the dossier
    activation sequence.
  - Below 900px the map is single-column and the dossier is hidden; selecting a
    world opens a bottom sheet (`#sheet`) instead.
- **The mission dossier** (desktop panel, `#dossier`): full committee name, type,
  description, fee, agenda status, and a searchable portfolio explorer.
  - Per-committee theme (colors + SVG motif) is configured in `THEMES` and
    `DOS_INTRO` in `js/galaxy.js`; the activation motion lives in
    `css/dossier-activation.css` and is keyed off `--th-a` / `--th-b` / `--th-glow`
    CSS variables set at selection time.
  - The activation runs Phases A–D: selection response → brief initialization
    (status line + sweep) → committee reveal (motif + headline) → staggered
    dossier data. It is ~1.4s, never blocks reading, and is disabled (static,
    complete states) under `prefers-reduced-motion`.
  - Portfolio data is **never duplicated**: the matrix reuses `getPortfolioNames`
    and `getPortfolioGroups` from `js/data.js`. Crisis committees render grouped
    faction roles; conventional committees render flat portfolio lists.
- **Register handoff**: "Register for this committee" calls
  `window.nebulaReg.openRegister(id)`, which preselects the chosen committee as
  **Preference 1** in the 5-step wizard. The world you view is preselected as your
  first choice.
- Motion: gentle core breathing, orbit rings, and a restrained pointer parallax;
  all of it respects `prefers-reduced-motion`.

## The NEBULA GATEWAY (Phase 4)

A full-viewport cinematic entrance layered **above** the page (z-index 400),
played once per browser session, replayable from the footer — the homepage and all
Phase 1–3 behaviour are preserved untouched behind it.

- **Stages**: A — “SIGNAL DETECTED” transmission; B — “NEBULA MUN 2026” title
  reveal with letterboxed, film-grain framing; C — glass “THE GATEWAY IS READY”
  access panel with **INITIATE ENTRY** / **ENTER THE UNIVERSE** actions; D —
  warp exit that lifts the veil and reveals the homepage with staggered
  `data-reveal` arrival (`body.gw-arriving`).
- **SKIP INTRO** button is available throughout stages A–C; the footer
  **REVISIT THE GATEWAY** control replays the full sequence.
- **One-time playback**: `sessionStorage` flag `nebula.gateway.seen` — the intro
  does not repeat across internal (hash) navigation within a session.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, the sequence takes a
  short, calm path: no grain animation, no letterbox transition, instant stage
  swaps (verified: gateway reaches the access panel quickly and entry completes
  without the warp).
- **Keyboard**: every gateway control is focusable with visible focus rings;
  Enter on ENTER THE UNIVERSE completes entry (verified).
- **Fail-safe**: if the sequence throws, the veil lifts and the homepage is
  revealed.
- **Living background**: after entry, the 3D cosmos keeps living on the
  homepage through `js/nebula.js` (WebGL planet, star, orbiters, ringed world,
  shaders, asteroids, spacecraft). The legacy 2D star-field canvas in
  `js/main.js` is suspended and hidden once `nebula:cosmos-ready` fires, and is
  used only when the 3D path cannot start. WebGL is primary; a 2D canvas
  fallback renders when Three.js/WebGL is unavailable (verified: `#nebula-gl`
  hidden, `#nebula-2d` visible, starfield inactive).

## The living cosmos (Phase 5)

`js/nebula.js` is a single shared real-time Three.js universe rendered on
`#nebula-gl`; Three.js r160 is vendored in `vendor/three.min.js` so there is no
runtime CDN dependency.

- **3D star field** in three depth layers with pointer parallax and subtle drift.
- **A huge procedural terrestrial planet** in the hero: continents, oceans,
  cloud bands, polar ice, night-side city lights and an atmospheric rim.
- **A central star with orbiting worlds** and tilted orbit rings, plus a **giant
  ringed gas planet** partially visible in the foreground.
- **Shader nebula clouds**, shooting stars with luminous trails, instanced
  asteroids and a distant spacecraft.
- **Cinematic opening**: stars illuminate → core ignites → worlds emerge. The
  sequence is coordinated with the existing gateway and begins only after
  `nebula:gateway-complete`, so the intro is not played behind the veil.
- **Camera + pointer**: a slow cinematic drift and restrained mouse parallax on
  fine pointers; no interaction can block the page.
- **Performance**: one WebGL context, capped device pixel ratio, render loop
  paused when the tab is hidden or a committee world is open, and full cleanup
  on unload.
- **Reduced motion** renders a single high-quality frame (no animation loop).
- **Fallback**: if Three.js or WebGL is unavailable, the previous 2D procedural
  sky (`#nebula-2d`) takes over and the cosmos still signals `nebula:cosmos-ready`.

## The eight committee worlds (Phase 5)

Selecting a destination in the Galaxy Archive now opens a full-screen,
theme-specific world:

| Committee | World builder | Startup title |
|---|---|---|
| UNHRC | Orbital council chamber | THE HUMAN RIGHTS CHAMBER |
| UNCSW | Celestial commission | THE LUMINOUS COMMISSION |
| Lok Sabha | Parliamentary hall | THE HOUSE IS IN SESSION |
| Influencer Summit | Neon digital stage | INFLUENCE IS A UNIVERSE |
| Mythology Crisis | Celestial court | THE CELESTIAL COURT |
| Wizarding Crisis | Enchanted castle | THE ENCHANTED CASTLE |
| IPL Auction | Orbital stadium / auction floor | THE ORBITAL STADIUM |
| International Press | Observatory newsroom | THE WORLD IS WATCHING |

- **One shared engine** (`js/committee-worlds.js`) powers every world: a single
  canvas/overlay, one WebGL context, a scene rebuilt per entry and fully
  disposed on exit (geometries, materials, textures, render targets).
- **Selection choreography**: the chosen node glows, the map camera moves in,
  the other worlds recede, and the selected world takes over the viewport.
- **Theme separation**: palettes, lighting, camera rigs and startup copy live in
  `js/committee-themes.js`, keyed by the official committee IDs. Names, agendas,
  fees, descriptions and portfolios always come from `js/data.js`; nothing is
  duplicated or renamed.
- **Startup → dossier**: a ~2.45s theme startup plays, then the existing mission
  dossier moves into the world as a cinematic card with agenda, fee and the full
  searchable portfolio matrix. The dossier DOM is reused, not cloned; on exit it
  returns to its original place in the galaxy layout.
- **Registration unchanged**: the in-world register button calls the same
  `window.nebulaReg.openRegister(id)` handoff and preselects the committee as
  Preference 1. The world remains behind the registration modal.
- **Exit**: the world close button, `Escape`, or closing the mobile sheet returns
  to the Galaxy Archive, clears the node selection and re-enables the homepage
  cosmos.
- **Responsive**: below 900px the world uses the existing bottom sheet as its
  dossier. Crossing the breakpoint while a world is open moves the dossier
  between the world slot and the sheet without losing the selection, and closing
  the sheet exits the world.
- **Reduced motion**: a single static frame replaces the world animation; the
  startup and dossier reveal use short, calm timings.
- **Fallback**: if Three.js/WebGL fails, the overlay keeps a CSS-only themed
  backdrop, HUD and startup, then reveals the same dossier with no 3D scene.
- **Debug surfaces** (non-production): `window.NEBULA_COSMOS_DEBUG` and
  `window.NEBULA_WORLDS.debug()` expose state for verification.

## The Celestial Diplomacy Chamber (About section)

`js/about-chamber.js` renders a self-contained WebGL 3D scene behind the About
text: a slowly rotating Earth, metallic orbital rings with shaded planets
riding the orbits, a distant moon, and drifting particles, with
gentle pointer parallax (fine pointers only) and a deterministic static frame
when `prefers-reduced-motion: reduce`. The layer is `pointer-events: none`
so clicks and text selection pass through; the exact About copy, layout,
navigation, registration, committees, and the Phase 4 gateway are untouched.
When WebGL is unavailable or fails to initialise, an attractive 2D canvas
fallback (`#about-chamber-2d`) takes over automatically — radial nebula wash,
twinkling stars, orbital rings with light trails and planets, and a stylised
Earth with drifting continents/clouds. Both
paths clean up their animation loops and event listeners on `beforeunload`.

## Header / navigation fix

- The duplicate **Register** button in the announcement strip was removed — the
  announcement bar now carries announcement text only.
- The main navigation is a clean flex row: brand, links, and a single Register button.
  Verified at 1440 / 1280 / 1024px: no overlap between the links and the button.
  Below 900px the links collapse into a polished mobile dropdown with a full-width
  Register button, and the toggle opens/closes it.

## Remaining work (not yet built)

- **Backend**: registration is client-side only (draft stored in `localStorage`
  under `nebula-reg-draft`). No database, no payment, no admin dashboard,
  no UPI/QR/transaction data — by design, nothing is fabricated.
- **Agenda**: listed as "To Be Announced Shortly" until the organisers publish it.
- **Payment amount**: final payable amount is "To Be Confirmed by Organisers";
  the site shows per-committee fees but does not collect money.
- Optional polish candidates: an optional VR walkthrough of the committee
  worlds, live venue photos, sponsor logos, and a real payment flow once the
  backend exists.

## Registration

`js/register.js` runs the 5-step delegation registration wizard inside a modal
(`#register-modal`, opened by every `data-open-register` button on the page —
nav, hero, CTA, footer, and the dossier/sheet register buttons).

- **Steps**: (1) Details — name, email, phone/WhatsApp, institution;
  (2) Committees — three ranked preferences with duplicate-prevention selects
  and per-choice fee chips; (3) Portfolios — up to three ranked picks from the
  first-choice committee's matrix, plus a free-text fallback; (4) Experience —
  MUNs attended and awards; (5) Review — full summary plus a fee box.
- **Validation**: each step is validated on `Continue`; the first invalid field is
  focused. Submit re-validates all steps before showing the confirmation state.
- **Draft**: every field is persisted to `localStorage` under `nebula-reg-draft`
  on input/change and restored when the modal reopens, so a half-finished
  registration survives a reload.
- **Handoff from the galaxy**: `window.nebulaReg.openRegister(id)` preselects the
  given committee as **Preference 1**. The dossier and mobile sheet register
  buttons call the same function with the currently selected committee.
- **Honest scope**: this is a demo / local-only submission. Nothing is sent to the
  organisers until a backend is connected (database, payment-proof upload and
  admin dashboard). No payment QR, UPI ID or transaction data is collected or
  fabricated.

## Verification notes

- Automated audit reports the announcement marquee track is wider than the
  viewport — this is expected: the track is `max-content` wide and is clipped by
  its `overflow: hidden` parent, so users cannot scroll sideways in a real browser
  (scrollWidth == clientWidth).
- Accessibility: 0 axe-core rule violations at desktop and mobile; 3 rules
  (aria-hidden-focus, aria-required-children, color-contrast) remain
  for manual review.
- Reduced motion: all environment/galaxy/nebula animations freeze; 0 active
  animations when `prefers-reduced-motion` is emulated.
- Cinematic environment: WebGL nebula path confirmed active in a capable browser;
   the 2D fallback (`#nebula-2d`) is verified to render at full desktop resolution
   (1425×900) in GPU-less environments.
- **Phase 4 gateway (verified in-browser)**:
  - Desktop 1440×900: stage A “SIGNAL DETECTED” rendered; INITIATE ENTRY click →
    stage D, gateway removed from DOM, `sessionStorage` seen flag set — no console
    errors or failed requests.
  - Skip path: footer REVISIT THE GATEWAY re-arms the sequence; SKIP INTRO removes
    the gateway and sets the session flag.
  - Mobile 390×844: footer replay re-arms the gateway; SKIP INTRO and ENTER THE
    UNIVERSE (keyboard Enter) both complete the exit, gateway removed, flag set.
  - Reduced-motion: short calm path verified — instant stage swaps, no grain
    animation, letterboxes static; gateway removed after entry.
  - All JS files pass `node --check`; `css/styles.css` braces balanced (472 open
    / 472 close) after the Phase 4 block repair.
- **Phase 5 living cosmos + committee worlds (verified in-browser, Chrome
  headless with SwiftShader)**:
  - Homepage: 3D cosmos active (`body.cosmos-3d`); `NEBULA_COSMOS_DEBUG.counts()`
    reported 28 meshes / 1 point cloud / 6 line groups; 8 themes loaded and all
    8 `COMMITTEES` records resolved.
  - All eight worlds opened from real node clicks: no fallback, 15–40 meshes and
    ~3.5k–35k triangles per world, matching startup titles, matching dossier
    committee/fee/agenda, and portfolio chip counts taken from `data.js`
    (35 for most committees, 10 for IPL, 3 for International Press).
  - Dossier moves into the world on desktop (35 chips) and returns to the
    galaxy after Exit, `Escape`, or sheet close; `body` returns to `cosmos-3d`
    and 0 nodes remain selected.
  - Registration handoff from International Press opened the wizard with
    `reg-pref1 = international-press`; closing the modal kept the world and its
    in-world dossier intact.
  - Repeat-selecting the same open world does not rebuild or duplicate it; the
    homepage render loop paused while a world was open (`raf` null,
    `isPaused()` true) and resumed on exit.
  - Live resize 1440×900 → 390×844 while a world is open opens the mobile sheet
    with the same committee and chips; resizing back closes the sheet and
    remounts the desktop dossier inside the world.
  - Reduced motion: `prefers-reduced-motion` matched, the cosmos used no
    animation frame, and the world rendered a static frame with the correct
    dossier.
  - Forced no-Three fallback: `#nebula-2d` visible, legacy starfield hidden, the
    CSS world opened and revealed the dossier; zero console/runtime errors.
  - All 11 JS files pass `node --check`.
- Header: verified at 1440/1280/1024 — exactly one Register button in the nav,
  none in the announcement strip, no link/button overlap; mobile dropdown
  verified at 390px.

## The Venue section

- "Find Your Way to NEBULA" — positioned immediately before the final
  "YOUR VOICE. YOUR STANCE. YOUR NEBULA." CTA. Elegant information panel
  (venue, dates, description, animated location-marker accent) beside a large
  interactive Google Map, plus a prominent Get Directions button.
- Venue details are organiser-confirmed and configured in ONE place: the VENUE
  object at the top of js/data.js — address
  ("WPPJ+J5F, DS - 1, B Block, Pocket - D, Lohia Nagar, Meerut, Uttar Pradesh 250002"),
  the address-based Google Maps embed URL and the directions URL. No coordinates
  or building pin beyond this address are claimed; the map is address-based.
- js/venue.js swaps the pending panel for the interactive map (standard zoom +
  navigation controls), shows the exact address line and points Get Directions
  at the real directions URL.
