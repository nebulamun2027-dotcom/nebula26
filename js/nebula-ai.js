/* ==========================================================================
   NEBULA MUN 2026 — NEBULA AI front-end
   Floating AI assistant chat panel that calls the secure backend API
   (/api/ai/chat). API keys never reach the browser.
   ========================================================================== */
(function () {
  "use strict";

  // Backend API runs on port 3001 (see server/.env PORT), not the frontend port (8765).
  const API_BASE = "http://localhost:3001";
  const CHAT_ENDPOINT = API_BASE + "/api/ai/chat";

  const toggle = document.getElementById("ai-chat-toggle");
  const panel = document.getElementById("ai-chat-panel");
  const closeBtn = document.getElementById("ai-chat-close");
  const resetBtn = document.getElementById("ai-chat-reset");
  const form = document.getElementById("ai-chat-form");
  const input = document.getElementById("ai-chat-input");
  const sendBtn = document.getElementById("ai-chat-send");
  const messagesEl = document.getElementById("ai-chat-messages");
  const emptyEl = messagesEl.querySelector(".ai-chat__empty");
  const orbEl = toggle.querySelector(".ai-chat__orb");

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

    toggle.addEventListener("click", togglePanel);
    closeBtn.addEventListener("click", closePanel);
    resetBtn.addEventListener("click", resetChat);
    form.addEventListener("submit", handleSubmit);

    // Close panel when clicking the toggle again while open
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && state.open) closePanel();
    });

    // Auto-focus input when panel opens
    panel.addEventListener("animationend", () => {
      if (state.open && !state.thinking) input.focus({ preventScroll: true });
    });

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
    // small delay so transition can run
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    renderWelcome();
  }

  function closePanel() {
    state.open = false;
    panel.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");
    // let transition finish before hiding
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
        // submit on next frame so focus registers
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
  async function handleSubmit(ev) {
    ev.preventDefault();
    const value = input.value.trim();
    if (!value || state.thinking) return;

    input.value = "";
    input.focus({ preventScroll: true });

    addMessage(value, "user");
    setThinking(true);
    const typingEl = addTyping();

    try {
      const resp = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: value }],
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
      // Surface the real error so users/developers can diagnose connection or API issues
      const msg = err.message || "Unknown error";
      addSystemMessage("Error: " + msg + " — please check your connection and try again.");
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
