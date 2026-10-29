/* ==========================================================================
   NEBULA MUN 2026 — "Find Your Way to NEBULA" (The Venue) renderer
   Reads the single source of truth: VENUE in js/data.js.

   ONLY "MSM, Meerut" is confirmed. Until VENUE.address, VENUE.mapsEmbed and
   VENUE.mapsDirections are filled in there with VERIFIED details, this
   script keeps the polished "address pending" panel and the cinematic map
   empty-state — no address, pin, coordinates or generic Meerut map is ever
   guessed. The moment the real details are added to data.js, the same three
   fields automatically activate:
     - the interactive Google Map (standard zoom + navigation controls)
     - the exact-address line in the information panel
     - the "Get Directions" button pointing at the real directions URL
   The "Get Directions" button is always visible; before verification it
   simply opens Google Maps.
   ========================================================================== */
(function () {
  "use strict";

  function boot() {
    let venueCfg = null;
    try {
      venueCfg = typeof VENUE !== "undefined" ? VENUE : window.VENUE || null;
    } catch (err) {
      venueCfg = null;
    }
    const cfg = venueCfg || {};

    const layout = document.querySelector(".venue__layout");
    const mapCol = document.querySelector(".venue__mapcol");
    const mapFrame = document.querySelector("[data-venue-map]");
    const mapIframe = document.querySelector("[data-venue-map] .venue__map");
    const empty = document.querySelector("[data-venue-empty]");
    const pending = document.querySelector("[data-venue-pending]");
    const pendingText = pending ? pending.querySelector("strong") : null;
    const dirLink = document.querySelector("[data-venue-dir]");
    if (!layout || !mapFrame || !pending || !dirLink) return;

    // Copy comes from the config (data.js); markup text is the fallback.
    const name = document.querySelector("[data-venue-name]");
    if (name && cfg.fullTitle) name.textContent = cfg.fullTitle;
    const dates = document.querySelector("[data-venue-dates]");
    if (dates && cfg.dates) dates.textContent = cfg.dates;
    const desc = document.querySelector("[data-venue-desc]");
    if (desc && cfg.description) desc.textContent = cfg.description;
    if (pendingText && cfg.addressNote) pendingText.textContent = cfg.addressNote;

    const embed = cfg.mapsEmbed ? String(cfg.mapsEmbed) : "";
    const directions = cfg.mapsDirections ? String(cfg.mapsDirections) : "";
    const verified = Boolean(embed && directions);

    if (verified) {
      if (mapIframe) mapIframe.src = embed;
      dirLink.href = directions;
      mapFrame.hidden = false;
      if (empty) empty.hidden = true;
      pending.hidden = true;
      if (mapCol) mapCol.hidden = false;
      layout.classList.remove("venue__layout--pending");
      const addrLine = document.querySelector("[data-venue-address]");
      if (addrLine && cfg.address) {
        addrLine.textContent = cfg.address;
        addrLine.hidden = false;
      }
    } else {
      // Address not verified yet: the map column stays visible and shows the
      // cinematic empty-state (breathing marker accent + badge) instead of a
      // guessed map. Nothing is invented.
      if (empty) empty.hidden = false;
      mapFrame.hidden = true;
      pending.hidden = false;
      if (mapCol) mapCol.hidden = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
