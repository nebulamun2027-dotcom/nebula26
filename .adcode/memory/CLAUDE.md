<!--
  GENERATED FILE - do not edit.

  Rewritten from .adcode/memory/**/*.md on every memory write. Any edit here is lost
  on the next one. Edit the markdown files instead; they are the source of truth.
-->

# Project memory

Shared memory for every AI working in this project. Read this first; it is the
cheapest way to find out what has already been decided and why.

## Decisions

### venue-address-confirmed-config

Venue address now organiser-confirmed; VENUE config populated with address-based embed + directions

The organiser confirmed the full MSM, Meerut address: "WPPJ+J5F, DS - 1, B Block, Pocket - D, Lohia Nagar, Meerut, Uttar Pradesh 250002". Configured in the VENUE object at the top of js/data.js: address (verbatim as supplied), mapsEmbed = address-based embed `https://www.google.com/maps?q=WPPJ%2BJ5F%2C%20DS-1%2C%20B%20Block%2C%20Pocket-D%2C%20Lohia%20Nagar%2C%20Meerut%2C%20Uttar%20Pradesh%20250002&output=embed`, mapsDirections = the organiser-supplied `https://www.google.com/maps/dir/?api=1&destination=...` URL. No coordinates or verified building pin are claimed — the map is address-based exactly as instructed. js/venue.js auto-swaps pending → interactive map state. (Supersedes venue-address-unverified-config-only.)

### venue-address-unverified-config-only

Venue accuracy rule: no verified MSM address exists; never guess pins/coords; single VENUE config

Only "MSM, Meerut" is a verified venue fact for NEBULA MUN 2026 (26–27 December 2026). No official street address, coordinates or Google Maps place link exists anywhere in the project. The site therefore shows "Full venue address will be announced by the organising team." plus a cinematic map empty-state — never a guessed pin or a generic Meerut map presented as the venue. The single integration point is the VENUE object at the top of js/data.js (address / mapsEmbed / mapsDirections); js/venue.js swaps the empty-state for the interactive map + real Get Directions link automatically once those are filled with verified values.
