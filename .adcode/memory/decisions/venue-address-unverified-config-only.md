---
name: venue-address-unverified-config-only
description: "Venue accuracy rule: no verified MSM address exists; never guess pins/coords; single VENUE config"
type: decision
created: 2026-10-29
agents: [adcode-chat]
---

Only "MSM, Meerut" is a verified venue fact for NEBULA MUN 2026 (26–27 December 2026). No official street address, coordinates or Google Maps place link exists anywhere in the project. The site therefore shows "Full venue address will be announced by the organising team." plus a cinematic map empty-state — never a guessed pin or a generic Meerut map presented as the venue. The single integration point is the VENUE object at the top of js/data.js (address / mapsEmbed / mapsDirections); js/venue.js swaps the empty-state for the interactive map + real Get Directions link automatically once those are filled with verified values.
