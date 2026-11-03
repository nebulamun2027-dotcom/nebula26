/* ==========================================================================
   NEBULA MUN 2026 — Vercel Serverless API entry point
   Wraps the shared Express app (server/app.js) for Vercel serverless.
   Routes: GET /api/ai/health, POST /api/ai/chat, POST /api/payment/submit
   ========================================================================== */

const app = require("../server/app");

// Vercel expects a default export: (req, res) => void
module.exports = app;
