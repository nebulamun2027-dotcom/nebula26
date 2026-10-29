---
name: venue-address-confirmed-config
description: Venue address now organiser-confirmed; VENUE config populated with address-based embed + directions
type: decision
created: 2026-10-29
agents: [adcode-chat]
---

The organiser confirmed the full MSM, Meerut address: "WPPJ+J5F, DS - 1, B Block, Pocket - D, Lohia Nagar, Meerut, Uttar Pradesh 250002". Configured in the VENUE object at the top of js/data.js: address (verbatim as supplied), mapsEmbed = address-based embed `https://www.google.com/maps?q=WPPJ%2BJ5F%2C%20DS-1%2C%20B%20Block%2C%20Pocket-D%2C%20Lohia%20Nagar%2C%20Meerut%2C%20Uttar%20Pradesh%20250002&output=embed`, mapsDirections = the organiser-supplied `https://www.google.com/maps/dir/?api=1&destination=...` URL. No coordinates or verified building pin are claimed — the map is address-based exactly as instructed. js/venue.js auto-swaps pending → interactive map state. (Supersedes venue-address-unverified-config-only.)
