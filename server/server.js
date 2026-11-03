/* ==========================================================================
   NEBULA MUN 2026 — NEBULA AI Backend (local dev entry point)
   Requires the shared Express app from server/app.js and starts it on
   PORT=3001 for local development.
   ========================================================================== */

const app = require("./app");

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("[nebula-ai] Server listening on http://localhost:" + PORT);
  console.log("[nebula-ai] AI provider: " + process.env.AI_PROVIDER + " | model: " + (process.env.AI_MODEL || "<not configured>") + " | key configured: " + (!!process.env.AI_API_KEY && process.env.AI_API_KEY !== "your_api_key_here" && process.env.AI_API_KEY.length > 10));
});
