/* ==========================================================================
   NEBULA MUN 2026 — NEBULA AI front-end
   Floating AI assistant chat panel that calls the secure backend API
   (/api/ai/chat). API keys never reach the browser.
   ========================================================================== */
(function () {
  "use strict";

  // Backend API: same-origin relative path in production (Vercel serverless),
  // http://localhost:3001 during local development.
  const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3001"
    : "";
  const CHAT_ENDPOINT = API_BASE + "/api/ai/chat";
  const HEALTH_ENDPOINT = API_BASE + "/api/ai/health";

  const toggle = document.getElementById("ai-chat-toggle");
  const panel = document.getElementById("ai-chat-panel");
  const closeBtn = document.getElementById("ai-chat-close");
  const resetBtn = document.getElementById("ai-chat-reset");
  const form = document.getElementById("ai-chat-form");
  const input = document.getElementById("ai-chat-input");
  const sendBtn = document.getElementById("ai-chat-send");
  const messagesEl = document.getElementById("ai-chat-messages");
  const emptyEl = messagesEl ? messagesEl.querySelector(".ai-chat__empty") : null;
  const orbEl = toggle ? toggle.querySelector(".ai-chat__orb") : null;

  const SUGGESTED = [
    "Which committee should I choose?",
    "Explain all the committees.",
    "I'm new to MUN. Where should I start?",
    "What happens at NEBULA26?",
    "Help me understand the registration process.",
  ];

  let state = {
    open: false,
    thinking: false,
    hasWelcome: false,
  };

  /* ---------- init ---------- */
  function init() {
    if (!toggle || !panel) return;

    /* Hide the AI launcher while the intro plays; revealed on gateway complete */
    toggle.style.display = "none";
    toggle.setAttribute("hidden", "");

    toggle.addEventListener("click", togglePanel);
    closeBtn.addEventListener("click", closePanel);
    resetBtn.addEventListener("click", resetChat);
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      sendChatMessage(input.value.trim(), messagesEl, input, sendBtn);
    });

    // FIX: Send button click — explicit preventDefault + stopPropagation
    sendBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      sendChatMessage(input.value.trim(), messagesEl, input, sendBtn);
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && state.open) closePanel();
    });

    panel.addEventListener("animationend", () => {
      if (state.open && !state.thinking) input.focus({ preventScroll: true });
    });

    /* Reveal the AI launcher once the gateway intro completes or is skipped */
    function revealAiLauncher() {
      toggle.style.display = "";
      toggle.removeAttribute("hidden");
    }
    window.addEventListener("nebula:gateway-complete", revealAiLauncher, { once: true });

    /* If the gateway was already dismissed (returning visitor / reduced motion),
       reveal the AI launcher immediately instead of waiting for an event that
       will never fire. */
    if (!document.getElementById("gateway")) {
      revealAiLauncher();
    }

    renderWelcome();
  }

  /* ---------- panel open/close ---------- */
  function togglePanel() {
    if (state.open) closePanel();
    else openPanel();
  }

  function openPanel() {
    state.open = true;
    panel.classList.remove("hidden");
    panel.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    panel.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    renderWelcome();
  }

  function closePanel() {
    state.open = false;
    panel.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      if (!state.open) panel.classList.add("hidden");
    }, 350);
  }

  /* ---------- welcome / empty state ---------- */
  function renderWelcome() {
    if (state.hasWelcome) return;
    state.hasWelcome = true;
    if (emptyEl) emptyEl.style.display = "flex";
    addSuggestedChips();
  }

  function addSuggestedChips() {
    const chips = document.createElement("div");
    chips.className = "ai-chat__chips";
    chips.setAttribute("aria-hidden", "true");
    for (const q of SUGGESTED) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ai-chat__chip";
      chip.textContent = q;
      chip.addEventListener("click", () => {
        input.value = q;
        input.focus({ preventScroll: true });
        requestAnimationFrame(() => form.dispatchEvent(new Event("submit")));
      });
      chips.appendChild(chip);
    }
    messagesEl.appendChild(chips);
  }

  function clearChips() {
    const chips = messagesEl.querySelector(".ai-chat__chips");
    if (chips) chips.remove();
  }

  /* ---------- message rendering ---------- */
  function addMessage(text, role, options = {}) {
    clearChips();
    if (emptyEl) emptyEl.style.display = "none";

    const wrap = document.createElement("div");
    wrap.className = "ai-chat__msg ai-" + role;

    const avatar = document.createElement("div");
    avatar.className = "ai-chat__avatar";
    avatar.textContent = role === "assistant" ? "NAI" : "YOU";

    const bubble = document.createElement("div");
    bubble.className = "ai-chat__bubble";
    bubble.textContent = text;

    const meta = document.createElement("div");
    meta.className = "ai-chat__meta";
    meta.textContent = options.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    messagesEl.appendChild(wrap);
    scrollToBottom();

    return wrap;
  }

  function addTyping() {
    const typing = document.createElement("div");
    typing.className = "ai-chat__typing";
    typing.id = "ai-typing";
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.className = "dot";
      typing.appendChild(dot);
    }
    messagesEl.appendChild(typing);
    scrollToBottom();
    return typing;
  }

  function removeTyping() {
    const typing = document.getElementById("ai-typing");
    if (typing) typing.remove();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function setThinking(thinking) {
    state.thinking = thinking;
    if (orbEl) {
      if (thinking) toggle.classList.add("is-thinking");
      else toggle.classList.remove("is-thinking");
    }
    sendBtn.disabled = thinking;
    input.disabled = thinking;
    if (!thinking) input.focus({ preventScroll: true });
  }

  /* ---------- submit ---------- */
  async function sendChatMessage(text, container, inputEl, sendBtnEl) {
    if (!text || state.thinking) return;

    inputEl.value = "";
    inputEl.focus({ preventScroll: true });

    addMessage(text, "user");
    setThinking(true);
    const typingEl = addTyping();

    try {
      const resp = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
        }),
      });

      removeTyping();

      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => "");
        throw new Error(resp.status + " " + errTxt.slice(0, 200));
      }

      const data = await resp.json();
      const reply = data.reply || "I didn't get a response. Could you try again?";
      setThinking(false);
      addMessage(reply, "assistant", { provider: data.provider });

    } catch (err) {
      removeTyping();
      setThinking(false);
      console.error("[nebula-ai] chat error:", err);
      const msg = err.message || "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("fetch")) {
        addSystemMessage("Could not reach the NEBULA AI backend. Is the server running on port 3001? Please try again shortly.");
      } else if (msg.includes("401") || msg.includes("403")) {
        addSystemMessage("AI service authentication failed. Please contact the organisers.");
      } else if (msg.includes("502") || msg.includes("500")) {
        addSystemMessage("The AI service is temporarily unavailable. Please try again later.");
      } else {
        addSystemMessage("Error: " + msg + " — please check your connection and try again.");
      }
    }
  }

  function addSystemMessage(text) {
    clearChips();
    if (emptyEl) emptyEl.style.display = "none";
    const wrap = document.createElement("div");
    wrap.className = "ai-chat__system";
    wrap.textContent = text;
    messagesEl.appendChild(wrap);
    scrollToBottom();
  }

  /* ---------- reset ---------- */
  function resetChat() {
    messagesEl.innerHTML = "";
    state.hasWelcome = false;
    renderWelcome();
    setThinking(false);
    input.focus({ preventScroll: true });
  }

  /* ---------- boot ---------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // expose for debugging
  window.__NEBULA_AI_DEBUG__ = { togglePanel, openPanel, closePanel, resetChat };

})();
