/* ==========================================================================
   NEBULA MUN 2026 — NEBULA AI Backend (shared app)
   Exported Express app used by:
   - server/server.js  (local dev: calls app.listen())
   - api/ai.js         (Vercel serverless: exports app handler)
   ========================================================================== */

require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();

/* ---------- configuration ---------- */
const AI_PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "";
const AI_BASE_URL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const hasApiKey = AI_API_KEY && AI_API_KEY !== "your_api_key_here" && AI_API_KEY.length > 10;
const hasModel = AI_MODEL && AI_MODEL.length > 0;

/* ---------- payment upload config ---------- */
const uploadsDir = path.resolve(__dirname, "..", "uploads", "payments");

// On Vercel the filesystem is read-only (/var/task). Do not create the
// uploads directory or instantiate disk-based multer at startup: fs.mkdirSync
// here (and inside multer's DiskStorage constructor) would crash the
// serverless function before any route can respond.
// Local development still writes payment proofs to disk (multer creates the
// directory on first use). On Vercel, cloud storage is not configured, so
// payment uploads return a clear error only when an upload is attempted; AI
// and all other routes keep working.
const isVercel = process.env.VERCEL === "1";
const hasCloudStorage = Boolean(
  process.env.S3_BUCKET &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
);

const paymentUpload = !isVercel
  ? multer({
      dest: uploadsDir,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!validTypes.includes(file.mimetype)) {
          return cb(new Error("Only JPG, JPEG, PNG, and WEBP images are allowed"), false);
        }
        cb(null, true);
      },
    })
  : null;

const storageUnavailable = isVercel && !hasCloudStorage;

/* ---------- middleware ---------- */
app.use(cors({ origin: CORS_ORIGIN === "*" ? "*" : CORS_ORIGIN.split(",") }));
app.use(express.json({ limit: "64kb" }));

/* ---------- load conference knowledge from js/data.js ---------- */
const vm = require("vm");
const dataJsPath = path.resolve(__dirname, "..", "js", "data.js");
let conferenceKnowledge = null;

function loadConferenceKnowledge() {
  try {
    const code = fs.readFileSync(dataJsPath, "utf8");
    const wrapped =
      "const __result = {};\n" +
      code.replace(/\bconst\b/g, "__result.") +
      "\n__result;";
    const sandbox = vm.runInNewContext(wrapped, {}, { filename: dataJsPath });
    conferenceKnowledge = {
      committees: sandbox.COMMITTEES || [],
      venue: sandbox.VENUE || {},
      currency: sandbox.CURRENCY || "₹",
      payableFee: sandbox.PAYABLE_FEE || "TBD",
    };
  } catch (err) {
    conferenceKnowledge = { committees: [], venue: {}, currency: "₹", payableFee: "TBD" };
  }
}
loadConferenceKnowledge();

/* ---------- build system prompt from conference data ---------- */
function buildSystemPrompt() {
  const { committees, venue, currency, payableFee } = conferenceKnowledge;
  const lines = [];
  lines.push("You are NEBULA AI, the official conference assistant for NEBULA MUN 2026.");
  lines.push("");
  lines.push("CONFERENCE FACTS (always use these — never invent):");
  lines.push("- Name: NEBULA MUN 2026 (Nurture. Empower. Lead.)");
  lines.push("- Dates: " + (venue.dates || "26–27 December 2026"));
  lines.push("- Venue: " + (venue.fullTitle || "MSM, Meerut") + ", " + (venue.city || "Meerut, India"));
  lines.push("- Currency: " + currency);
  lines.push("- Registration payable rule: " + payableFee);
  lines.push("- Registration is client-side/demo only; final payment is confirmed by organisers.");
  lines.push("");
  lines.push("COMMITTEES:");
  for (const c of committees) {
    lines.push("- " + c.short + " (" + c.name + ")");
    lines.push("  Type: " + c.type + " | Track: " + c.track + " | Tier: " + c.tier + " | Fee: " + currency + c.fee.toLocaleString("en-IN"));
    lines.push("  Blurb: " + c.blurb);
    lines.push("  Description: " + c.description);
    lines.push("  Agenda: " + c.agenda);
    lines.push("  Portfolios: " + (c.portfolioNote || "N/A") + " — " + (c.portfolios || c.factions ? "see roles" : "N/A").toString().slice(0, 120) + "...");
    lines.push("");
  }
  lines.push("GUIDELINES:");
  lines.push("- Be helpful, professional, and encouraging.");
  lines.push("- Recommend committees based on the visitor's interests and MUN experience.");
  lines.push("- If information is not in the conference data above, say you don't have it and suggest contacting the organisers.");
  lines.push("- Never invent fees, dates, committee names, or rules.");
  lines.push("- Keep responses concise but informative.");
  lines.push("- When asked about registration, explain the 5-step wizard and that fees are confirmed by organisers.");
  return lines.join("\n");
}

const SYSTEM_PROMPT = buildSystemPrompt();

/* ---------- chat endpoint ---------- */
app.post("/api/ai/chat", async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const lastUser = messages[messages.length - 1];
  const userText = (lastUser && lastUser.content || "").slice(0, 120);

  if (!hasApiKey) {
    return res.json({
      reply: generateFallbackResponse(userText),
      provider: "fallback",
      model: "local",
      note: "No AI API key configured. Set AI_API_KEY in server/.env to enable real AI responses.",
    });
  }

  if (!hasModel) {
    return res.status(500).json({
      error: "AI model not configured",
      message: "AI_API_KEY is set but AI_MODEL is not configured.",
    });
  }

  try {
    const upstreamMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const provider = AI_PROVIDER === "anthropic" ? callAnthropic : callOpenAICompatible;
    const result = await provider(upstreamMessages);

    res.json({
      reply: result.text,
      provider: AI_PROVIDER,
      model: AI_MODEL,
    });
  } catch (err) {
    const errMsg = err.message || "Unknown error";
    res.status(502).json({
      error: "AI service unavailable",
      message: errMsg.slice(0, 300),
    });
  }
});

/* ---------- payment submission endpoint ---------- */
const paymentSubmitHandlers = [
  (req, res, next) => {
    if (storageUnavailable || !paymentUpload) {
      return res.status(503).json({
        error: "Payment proof uploads are not available",
        message:
          "Cloud storage is not configured on this server. Payment screenshots cannot be stored. Please contact the organisers to complete your payment.",
      });
    }
    next();
  },
];

if (paymentUpload) {
  paymentSubmitHandlers.push(paymentUpload.single("payment-proof"));
}

paymentSubmitHandlers.push(async (req, res) => {
  try {
    const { upiId, feeAmount, delegateName, delegateEmail, delegatePhone } = req.body;

    if (!upiId || !req.file) {
      return res.status(400).json({ error: "Missing required fields: UPI transaction ID or payment screenshot" });
    }

    const paymentRecord = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      delegateName,
      delegateEmail,
      delegatePhone,
      upiId,
      feeAmount,
      screenshotFile: req.file.filename,
      status: "pending_verification",
    };

    const paymentsDir = path.resolve(__dirname, "..", "uploads", "payments");
    const recordsFile = path.resolve(paymentsDir, "payments.json");
    let records = [];
    try {
      const existing = fs.readFileSync(recordsFile, "utf8");
      records = JSON.parse(existing);
    } catch (e) {
      records = [];
    }
    records.push(paymentRecord);
    fs.writeFileSync(recordsFile, JSON.stringify(records, null, 2));

    res.json({
      success: true,
      paymentId: paymentRecord.id,
      status: "pending_verification",
      message: "Payment submitted successfully. Awaiting verification.",
    });
  } catch (err) {
    res.status(500).json({ error: "Payment submission failed", message: err.message });
  }
});

app.post("/api/payment/submit", ...paymentSubmitHandlers);

/* ---------- OpenAI / OpenAI-compatible provider ---------- */
async function callOpenAICompatible(messages) {
  const url = AI_BASE_URL + "/chat/completions";
  const body = {
    model: AI_MODEL,
    messages: messages,
    temperature: 0.7,
    max_tokens: 800,
    stream: false,
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + AI_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error("Upstream " + resp.status + ": " + text.slice(0, 300));
  }
  const data = await resp.json();
  const message = data.choices && data.choices[0] && data.choices[0].message;
  const text = (message && message.content) || (message && message.reasoning_content) || "";
  return { text };
}

/* ---------- Anthropic provider ---------- */
async function callAnthropic(messages) {
  const url = AI_BASE_URL + "/v1/messages";
  const systemMsg = messages.find(m => m.role === "system");
  const chatMessages = messages.filter(m => m.role !== "system");
  const body = {
    model: AI_MODEL,
    max_tokens: 800,
    temperature: 0.7,
    system: systemMsg ? systemMsg.content : "",
    messages: chatMessages,
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AI_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error("Upstream " + resp.status + ": " + text.slice(0, 300));
  }
  const data = await resp.json();
  return { text: (data.content && data.content[0] && data.content[0].text) || "" };
}

/* ---------- fallback response (no API key) ---------- */
function generateFallbackResponse(userText) {
  const { committees, venue, currency, payableFee } = conferenceKnowledge;
  if (userText.includes("committee") && (userText.includes("choose") || userText.includes("recommend") || userText.includes("which"))) {
    const names = committees.map(c => c.short + " — " + c.blurb).join("; ");
    return "I can't connect to the AI service right now, but here's what I know from the conference data: " + names + ". Tell me about your interests (e.g. human rights, sports, diplomacy, crisis) and I can suggest a good fit based on the descriptions above.";
  }
  if (userText.includes("fee") || userText.includes("cost") || userText.includes("price")) {
    return "Conference fees are set per committee: " + committees.map(c => c.short + ": " + currency + c.fee.toLocaleString("en-IN")).join(", ") + ". The payable rule is: " + payableFee + ". Final amounts are confirmed by organisers.";
  }
  if (userText.includes("date") || userText.includes("when")) {
    return "NEBULA MUN 2026 is on " + venue.dates + " at " + venue.fullTitle + ", " + venue.city + ".";
  }
  if (userText.includes("register") || userText.includes("registration")) {
    return "Registration is a 5-step wizard: Details → Committees → Portfolios → Experience → Review. It's saved locally on your device; final payment is confirmed by organisers.";
  }
  return "I'm the NEBULA AI assistant. I can help with committee info, fees, dates, venue, and registration — but no AI API key is configured right now. Set AI_API_KEY in server/.env to enable real AI responses. In the meantime, ask me about committees, fees, dates, or registration!";
}

/* ---------- health endpoint ---------- */
app.get("/api/ai/health", (req, res) => {
  res.json({
    ok: true,
    provider: AI_PROVIDER,
    model: AI_MODEL || null,
    hasApiKey: hasApiKey,
    hasModel: hasModel,
    committeesLoaded: conferenceKnowledge.committees.length,
  });
});

module.exports = app;
