/* ==========================================================================
   NEBULA MUN 2026 — Phase 2 interaction layer
   Committee detail modal + 5-step registration wizard.
   Client-side only: data is kept in a local draft store; Phase 3 will
   sync this draft to a backend. No payment data is collected or invented.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- shared helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const regModal = $("#register-modal");

  const state = {
    step: 1,
    committeeId: null, // committee opened from a card / register button
    portPicks: ["", "", ""],
    portSearch: ""
  };

  const DRAFT_KEY = "nebula-reg-draft";

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveDraft() {
    const d = loadDraft();
    d.name = $("#reg-name").value;
    d.email = $("#reg-email").value;
    d.phone = $("#reg-phone").value;
    d.institution = $("#reg-institution").value;
    d.pref1 = $("#reg-pref1").value;
    d.pref2 = $("#reg-pref2").value;
    d.pref3 = $("#reg-pref3").value;
    d.muns = $("#reg-muns").value;
    d.awards = $("#reg-awards").value;
    d.portPicks = state.portPicks.slice();
    d.portCustom = $("#reg-port-custom").value;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (e) {
      /* storage unavailable — draft simply not persisted */
    }
  }

  function restoreDraft() {
    const d = loadDraft();
    if (!d) return;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el && v != null) el.value = v;
    };
    set("reg-name", d.name);
    set("reg-email", d.email);
    set("reg-phone", d.phone);
    set("reg-institution", d.institution);
    set("reg-pref1", d.pref1);
    set("reg-pref2", d.pref2);
    set("reg-pref3", d.pref3);
    set("reg-muns", d.muns);
    set("reg-awards", d.awards);
    if (Array.isArray(d.portPicks)) {
      state.portPicks = d.portPicks.slice(0, 3);
      while (state.portPicks.length < 3) state.portPicks.push("");
    }
    set("reg-port-custom", d.portCustom);
  }

  /* ---------- registration wizard: selects, fees, validation ---------- */
  let lastFocused = null;

  function focusables(root) {
    return $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root);
  }

  function openRegisterOnly(modal) {
    if (!modal || modal.hidden === false) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    const p = $('.modal__panel', modal);
    if (p) {
      p.style.animation = 'none';
      requestAnimationFrame(() => { p.style.animation = ''; });
    }
    const first = focusables(modal);
    if (first.length) first[0].focus();
  }

  function closeRegister() {
    if (regModal && !regModal.hidden) {
      regModal.hidden = true;
      regModal.setAttribute("aria-hidden", "true");
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }
  }

  function trapFocus(modal, ev) {
    if (ev.key !== "Tab") return;
    const f = focusables(modal);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  /* ---------- registration wizard: selects, fees, validation ---------- */
  const prefSelects = ["reg-pref1", "reg-pref2", "reg-pref3"];

  function buildPrefSelects() {
    for (const id of prefSelects) {
      const sel = document.getElementById(id);
      const keep = sel.value;
      sel.innerHTML = '<option value="" selected>Choose a committee…</option>' +
        COMMITTEES.map(c => '<option value="' + c.id + '">' + c.short + ' — ' + c.name + '</option>').join("");
      if (keep && COMMITTEES.some(c => c.id === keep)) sel.value = keep;
    }
  }

  function updatePrefUI() {
    const ids = ["reg-pref1", "reg-pref2", "reg-pref3"];
    const values = ids.map((id) => document.getElementById(id).value);
    for (const id of ids) {
      const sel = document.getElementById(id);
      const own = sel.value;
      for (const opt of sel.options) {
        const v = opt.value;
        if (!v) continue;
        const takenByOther = values.includes(v) && v !== own;
        opt.disabled = takenByOther;
      }
      const c = COMMITTEES.find((x) => x.id === sel.value);
      const chip = $("#fee-" + id.replace("reg-", ""));
      if (chip) {
        chip.textContent = c ? formatFee(c.fee) : "";
        chip.style.display = c ? "" : "none";
      }
    }
  }

  function setErr(fieldId, msg) {
    const el = $("#" + fieldId);
    const errEl = $("#err-" + fieldId.replace("reg-", ""));
    if (msg) {
      el.setAttribute("aria-invalid", "true");
      if (errEl) errEl.textContent = msg;
      el.focus();
    } else {
      el.setAttribute("aria-invalid", "false");
      if (errEl) errEl.textContent = "";
    }
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function validPhone(v) {
    const digits = v.replace(/[^0-9]/g, "");
    return v.trim() !== "" && digits.length >= 8 && digits.length <= 15;
  }

  function validateStep(step) {
    let ok = true;
    let firstBad = null;
    if (step === 1) {
      const name = $("#reg-name").value.trim();
      const email = $("#reg-email").value.trim();
      const phone = $("#reg-phone").value.trim();
      const inst = $("#reg-institution").value.trim();
      if (name.length < 2) { setErr("reg-name", "Enter your full name (at least 2 characters)."); ok = false; firstBad = firstBad || "reg-name"; }
      else setErr("reg-name", "");
      if (!validEmail(email)) { setErr("reg-email", "Enter a valid email address."); ok = false; firstBad = firstBad || "reg-email"; }
      else setErr("reg-email", "");
      if (!validPhone(phone)) { setErr("reg-phone", "Enter a valid phone / WhatsApp number (8–15 digits)."); ok = false; firstBad = firstBad || "reg-phone"; }
      else setErr("reg-phone", "");
      if (inst.length < 2) { setErr("reg-institution", "Enter your school / college / institution."); ok = false; firstBad = firstBad || "reg-institution"; }
      else setErr("reg-institution", "");
    }
    if (step === 2) {
      for (const id of prefSelects) {
        const v = document.getElementById(id).value;
        if (!v) {
          setErr(id, "Choose a committee");
          ok = false;
          firstBad = firstBad || id;
        } else {
          setErr(id, "");
        }
      }
      const ids2 = ["reg-pref1", "reg-pref2", "reg-pref3"];
      const vals = ids2.map((id) => document.getElementById(id).value).filter(Boolean);
      const unique = new Set(vals);
      if (vals.length === 3 && unique.size < 3) {
        setErr("reg-pref3", "Each committee can be chosen once — pick three different committees.");
        ok = false;
      }
    }
    if (step === 3) {
      // at least one portfolio preference required
      const picked = state.portPicks.filter(Boolean).length;
      const custom = $("#reg-port-custom").value.trim();
      if (picked === 0 && custom === "") {
        $("#reg-port-custom").setAttribute("aria-invalid", "true");
        ok = false;
        $("#reg-port-custom").focus();
      } else {
        $("#reg-port-custom").setAttribute("aria-invalid", "false");
      }
    }
    if (step === 4) {
      const muns = $("#reg-muns").value;
      if (muns === "" || Number.isNaN(Number(muns)) || Number(muns) < 0) {
        setErr("reg-muns", "Enter how many MUNs you have attended (0 is fine).");
        ok = false;
        firstBad = firstBad || "reg-muns";
      } else {
        setErr("reg-muns", "");
      }
    }
    if (step === 6) {
      const upi = $("#reg-upi-id").value.trim();
      const proof = $("#reg-payment-proof").value;
      const agree = $("#reg-payment-confirm").checked;
      if (!upi) {
        setErr("reg-upi-id", "Enter UPI Transaction ID / UTR Number");
        ok = false;
        firstBad = firstBad || "reg-upi-id";
      } else {
        setErr("reg-upi-id", "");
      }
      if (!proof) {
        setErr("reg-payment-proof", "Please upload payment screenshot");
        ok = false;
        firstBad = firstBad || "reg-payment-proof";
      } else {
        setErr("reg-payment-proof", "");
      }
      if (!agree) {
        setErr("reg-payment-confirm", "Please confirm the payment checkbox");
        ok = false;
        firstBad = firstBad || "reg-payment-confirm";
      } else {
        setErr("reg-payment-confirm", "");
      }
    }
    if (firstBad) $("#" + firstBad).focus();
    return ok;
  }

  function showStep(n) {
    state.step = n;
    $$('.reg__pane').forEach((p) => {
      p.hidden = Number(p.dataset.pane) !== n;
    });
    $$('.reg__rail-step').forEach((li) => {
      const stepNum = Number(li.dataset.rail);
      li.classList.toggle("is-current", stepNum === n);
      li.classList.toggle("is-done", stepNum < n);
    });
    const prev = $("#reg-prev");
    const next = $("#reg-next");
    const submit = $("#reg-submit");
    prev.disabled = n === 1;
    if (n === 5) {
      next.hidden = false;
      submit.hidden = false;
      submit.textContent = "CONTINUE TO PAYMENT";
      renderReview();
    const pane = $('.reg__pane[data-pane="' + n + '"]');
    if (pane) pane.focus && pane.setAttribute("tabindex", "-1") && pane.focus();
  }

  /* ---------- registration wizard: portfolio picker ---------- */
  function pickCommittee() {
    const id = $("#reg-pref1").value || state.committeeId;
    return COMMITTEES.find((c) => c.id === id) || COMMITTEES[0];
  }

  function renderPicks() {
    const grid = $("#reg-port-grid");
    const c = pickCommittee();
    const groups = getPortfolioGroups(c);
    const q = ($("#reg-port-search").value || "").trim().toLowerCase();
    const matches = (s) => !q || s.toLowerCase().includes(q);
    const descOf = (name) =>
      (c.factions || []).flatMap((f) => f.roles).find((r) => r.name === name);

    let html = '<div class="reg__picks">';
    for (let i = 0; i < 3; i++) {
      const v = state.portPicks[i];
      if (v) {
        html += '<div class="reg__pick" data-pick="' + i + '">'
          + '<span class="reg__pick-rank">' + (i + 1) + '</span>'
          + v + '</div>';
      } else {
        html += '<div class="reg__pick empty">' +
          '<span class="reg__pick-rank">' + (i + 1) + '</span>'
          + 'Preference ' + (i + 1) + ' — not selected</div>';
      }
    }
    html += '</div>';

    for (const g of groups) {
      const items = g.items.filter(matches);
      if (!items.length) continue;
      html += '<div class="reg__port-matrix" data-group>';       html += '<p class="cm-group-title">' + g.label + '</p>';
      const chips = items.map((name) => {
        const d = descOf(name);
        const picked = state.portPicks.indexOf(name);
        return '<button type="button" class="reg__pick-item' + (picked >= 0 ? " is-picked" : "") + '" data-name="' + name.replace(/"/g, "&quot;") + '">'
          + '<span>' + name + '</span>'
          + (d && d.desc ? '<span class="cm-chip-desc">' + d.desc + '</span>' : '')
          + '</button>';
      }).join("");
      html += chips;
      html += '</div>';
    }
    if (!html.includes('data-group')) {
      html += '<p class="reg__port-empty">No portfolios match your search — use the text field below to enter your own preference.</p>';
    }
    grid.innerHTML = html;
  }

  /* ---------- review + fee box ---------- */
  function fmt(n) {
    return "₹" + Number(n).toLocaleString("en-IN");
  }

  function payableText() {
    if (PAYABLE_FEE === "TBD") return "To Be Confirmed by Organisers";
    const fees = prefSelects
      .map((id) => COMMITTEES.find((x) => x.id === document.getElementById(id).value))
      .filter(Boolean)
      .map((c) => c.fee);
    if (PAYABLE_FEE === "sum") return fmt(fees.reduce((a, b) => a + b, 0));
    if (PAYABLE_FEE === "max") return fmt(Math.max(0, ...fees));
    return fmt(PAYABLE_FEE); // fixed amount set by organisers
  }

  function calculateAndDisplayFee() {
    const pref1 = document.getElementById("reg-pref1").value;
    const c = COMMITTEES.find((x) => x.id === pref1);
    const feeAmount = document.getElementById("payment-fee");
    if (c && feeAmount) {
      feeAmount.textContent = fmt(c.fee);
    }
    const confirmAmt = document.getElementById("reg-payment-confirm-amount");
    if (confirmAmt && c) {
      confirmAmt.textContent = fmt(c.fee);
    }
    return c ? c.fee : 0;
  }

  function commitName(id) {
    const c = COMMITTEES.find((x) => x.id === id);
    return c ? c.short : id;
  }

  function renderReview() {
    const rows = [];
    const add = (label, value) => {
      if (value !== undefined && value !== null && String(value).trim() !== "")
        rows.push('<div class="reg__review-row"><dt>' + label + '</dt><dd>' + value + '</dd></div>');
    };
    add("Full name", $("#reg-name").value);
    add("Email", $("#reg-email").value);
    add("Phone / WhatsApp", $("#reg-phone").value);
    add("Institution", $("#reg-institution").value);
    for (const id of prefSelects) {
      const v = document.getElementById(id).value;
      add(id === "reg-pref1" ? "First choice" : id === "reg-pref2" ? "Second choice" : "Third choice", v ? commitName(v) : "");
    }
    const picks = state.portPicks.filter(Boolean).map((p, i) => "" + (i + 1) + ". " + p);
    const custom = $("#reg-port-custom").value.trim();
    const portLines = picks.slice();
    if (custom) portLines.push("Custom: " + custom);
    add("Portfolio preferences", portLines.join(" • "));
    add("MUNs attended", $("#reg-muns").value);
    add("Awards / experience", $("#reg-awards").value);
    $("#reg-review").innerHTML = rows.join("");

    const feeRows = prefSelects
      .map((id) => {
        const c = COMMITTEES.find((x) => x.id === document.getElementById(id).value);
        return c ? '<div class="reg__fee-row"><span>' + (id.replace("reg-", "") + " — " + c.short) + "</span><span>" + fmt(c.fee) + "</span></div>" : "";
      })
      .join("");
    $("#reg-feebox").innerHTML =
      '<h4>Fee summary</h4>' + feeRows +
      '<div class="reg__fee-row reg__fee-payable"><span>Payable amount</span><strong>' + payableText() + '</strong></div>';
  }

  /* ---------- modal open helpers ---------- */
  function openRegisterModal(prefId) {
    // reset confirmation, restore draft
    $("#reg-form").hidden = false;
    $(".reg__confirm").hidden = true;
    restoreDraft();
    if (prefId && COMMITTEES.some((c) => c.id === prefId)) {
      const sel = $("#reg-pref1");
      if (sel.value !== prefId) {
        sel.value = prefId;
      }
      updatePrefUI();
    }
    openRegisterOnly(regModal);
  }

  /* Handoff API for the galaxy dossier + mobile sheet. */
  window.nebulaReg = {
    openRegister: openRegisterModal
  };

  /* ---------- init ---------- */
  function init() {
    buildPrefSelects();
    restoreDraft();
    updatePrefUI();
    renderPicks();
    showStep(1);

    // Generic register buttons on the homepage
    $$("[data-open-register]").forEach((btn) => {
      btn.addEventListener("click", () => openRegisterModal(btn.dataset.pref));
    });
    // Close buttons + backdrop
    $$("[data-close-register]").forEach((el) => el.addEventListener("click", closeRegister));

    // Preference selects: duplicate prevention + fee chips
    prefSelects.forEach((id) => {
      document.getElementById(id).addEventListener("change", () => {
        updatePrefUI();
        renderPicks();
        saveDraft();
      });
    });
    // Portfolio search + pick grid
    const portSearch = $("#reg-port-search");
    if (portSearch) portSearch.addEventListener("input", renderPicks);
    const portGrid = $("#reg-port-grid");
    if (portGrid) {
      portGrid.addEventListener("click", (ev) => {
        const item = ev.target.closest("[data-name]");
        if (!item || !portGrid.contains(item)) return;
        const name = item.dataset.name;
        const idx = state.portPicks.indexOf(name);
        if (idx >= 0) {
          state.portPicks[idx] = "";
        } else {
          const empty = state.portPicks.indexOf("");
          if (empty === -1) {
            state.portPicks[2] = name; // 3 slots full: replace the 3rd (lowest rank)
          } else {
            state.portPicks[empty] = name;
          }
          if (idx === -1 && empty === -1) { /* replaced */ }
        }
        renderPicks();
        saveDraft();
      });
    }
    // Keep draft fresh while typing
    $$(".reg__input").forEach((el) => {
      el.addEventListener("input", saveDraft);
      el.addEventListener("change", saveDraft);
    });
    // Payment screenshot preview
    const paymentInput = $("#reg-payment-proof");
    if (paymentInput) {
      paymentInput.addEventListener("change", (ev) => {
        const file = ev.target.files[0];
        if (file) {
          const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
          if (!validTypes.includes(file.type)) {
            setErr("reg-payment-proof", "Please upload a JPG, JPEG, PNG, or WEBP image.");
            paymentInput.value = "";
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            setErr("reg-payment-proof", "File size must be 5 MB or less.");
            paymentInput.value = "";
            return;
          }
          setErr("reg-payment-proof", "");
          const preview = $("#reg-payment-preview-img");
          const previewContainer = $("#reg-payment-preview");
          if (preview) {
            preview.src = URL.createObjectURL(file);
            previewContainer.hidden = false;
          }
        }
      });
      const removeBtn = $("#reg-payment-remove");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          paymentInput.value = "";
          const previewContainer = $("#reg-payment-preview");
          const preview = $("#reg-payment-preview-img");
          if (previewContainer) previewContainer.hidden = true;
          if (preview) preview.src = "";
          setErr("reg-payment-proof", "");
        });
      }
    }
    // Wizard navigation
    $("#reg-prev").addEventListener("click", () => {
      if (state.step > 1) showStep(state.step - 1);
    });
    $("#reg-next").addEventListener("click", () => {
      if (state.step < 5 && validateStep(state.step)) showStep(state.step + 1);
    });
    // Submit: re-validate everything, then show honest local-only confirmation
    $("#reg-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      for (const step of [1, 2, 3, 4]) {
        if (!validateStep(step)) {
          showStep(step);
          return;
        }
      }
    if (state.step === 5) {
      if (!validateStep(5)) {
        showStep(5);
        return;
      }
      showStep(6);
      return;
    }

    if (state.step === 6) {
        if (!validateStep(6)) {
          showStep(6);
          return;
        }
        // Submit payment to backend
        const upiId = $("#reg-upi-id").value.trim();
        const paymentFile = $("#reg-payment-proof").files[0];
        const feeAmount = calculateAndDisplayFee();

        const formData = new FormData();
        formData.append("upiId", upiId);
        formData.append("feeAmount", feeAmount);
        formData.append("delegateName", $("#reg-name").value.trim());
        formData.append("delegateEmail", $("#reg-email").value.trim());
        formData.append("delegatePhone", $("#reg-phone").value.trim());
        if (paymentFile) {
          formData.append("payment-proof", paymentFile);
        }

        $("#reg-form").disabled = true;
        $("#reg-submit").disabled = true;

        fetch("http://localhost:3001/api/payment/submit", {
          method: "POST",
          body: formData,
        })
          .then((res) => res.json())
          .then((data) => {
            $("#reg-form").disabled = false;
            $("#reg-submit").disabled = false;
            if (data.success) {
              $("#reg-form").hidden = true;
              $(".reg__confirm").hidden = false;
              const name = $("#reg-name").value.trim() || "Delegate";
              $("#reg-confirm-text").textContent =
                "Your registration and payment proof have been received. The NEBULA26 organising team will verify your payment.";
              $("#reg-confirm-hint").textContent = "Payment Status: PENDING VERIFICATION";
              saveDraft();
            } else {
              alert("Payment submission failed: " + (data.message || "Unknown error"));
            }
          })
          .catch((err) => {
            $("#reg-form").disabled = false;
            $("#reg-submit").disabled = false;
            alert("Failed to connect to payment server. Please try again later.");
            console.error(err);
          });
        return;
      }
      $("#reg-form").hidden = true;
      $(".reg__confirm").hidden = false;
      const name = $("#reg-name").value.trim() || "Delegate";
      $("#reg-confirm-text").textContent =
        "Thanks, " + name + ". Your registration is saved locally on this device only. Once the organisers' backend is connected in Phase 3, it will be synced.";
      saveDraft();
    });
    // Keyboard: Escape closes, Tab is trapped inside the open modal
    document.addEventListener("keydown", (ev) => {
      const open = regModal && !regModal.hidden ? regModal : null;
      if (!open) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeRegister();
        return;
      }
      trapFocus(open, ev);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

