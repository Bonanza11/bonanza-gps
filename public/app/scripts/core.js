/* =======================================================
   Bonanza — UI helpers (integrado en core.js)
   Control de: vehículo, T&C pill, luggage accordion,
   Meet&Greet y modal de términos.
   ======================================================= */
(function () {
  // -------- Vehicle toggle --------
  const vehBtns = document.querySelectorAll(".veh-btn");
  const carImg = document.querySelector(".turntable .car");
  const caption = document.querySelector(".vehicle-caption");

  // variable global usada por otros módulos (maps/booking)
  window.__vehicleType = window.__vehicleType || "suv";

  function setVehicle(type) {
    window.__vehicleType = type; // 'suv' | 'van'
    if (type === "suv") {
      if (carImg) carImg.src = "/images/suburban.png";
      if (caption) caption.textContent = "SUV — Max 5 passengers, 5 suitcases";
    } else {
      if (carImg) carImg.src = "/images/van-sprinter.png";
      if (caption) caption.textContent = "Van — Up to 12 passengers, 12–14 suitcases";
    }
    // si existe función de re-cálculo (booking/maps), la invocamos
    if (typeof window.recalcFromCache === "function") window.recalcFromCache();
    if (typeof window.updateMeetGreetVisibility === "function") window.updateMeetGreetVisibility();
  }

  vehBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      vehBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setVehicle(btn.dataset.type || "suv");
    });
  });

  // -------- Terms pill --------
  const acceptPill = document.getElementById("acceptPill");
  const calcBtn = document.getElementById("calculate");
  const payBtn = document.getElementById("pay");

  function syncButtons() {
    const on = !!(acceptPill && acceptPill.classList.contains("on"));
    if (calcBtn) calcBtn.disabled = !on;
    if (payBtn) {
      const readyPay = !!window.__lastQuotedTotal && on;
      payBtn.disabled = !readyPay;
      payBtn.style.display = "block";
      payBtn.style.opacity = readyPay ? 1 : 0.5;
      payBtn.style.cursor = readyPay ? "pointer" : "not-allowed";
    }
  }
  window.syncButtons = syncButtons; // expone para booking.js

  function setAcceptedState(on) {
    if (!acceptPill) return;
    acceptPill.classList.toggle("on", on);
    acceptPill.setAttribute("aria-checked", on ? "true" : "false");
    syncButtons();
  }
  window.isAccepted = () => !!(acceptPill && acceptPill.classList.contains("on")); // usado por stripe.js

  acceptPill?.addEventListener("click", () => setAcceptedState(!window.isAccepted()));
  acceptPill?.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setAcceptedState(!window.isAccepted());
    }
  });

  // -------- Luggage accordion --------
  const luggageAccordion = document.getElementById("luggageAccordion");
  const luggageSummary = luggageAccordion?.querySelector(".luggage-summary");
  luggageSummary?.addEventListener("click", () => {
    luggageAccordion.classList.toggle("open");
  });

  // -------- Meet & Greet card --------
  // Visibilidad: solo SUV + pickup SLC (lógica de SLC la resuelve maps.js y expone window.isSLCInternational/pickupPlace)
  window.__mgChoice = window.__mgChoice || "none"; // 'none' | 'tsa_exit' | 'baggage_claim'
  window.getMGFee = () => (window.__mgChoice === "none" ? 0 : 50);

  window.updateMeetGreetVisibility = function () {
    const card = document.getElementById("meetGreetCard");
    if (!card) return;
    const suv = window.__vehicleType === "suv";
    const show = suv && typeof window.isSLCInternational === "function" && window.isSLCInternational(window.pickupPlace || null);
    if (show) {
      card.style.display = "block";
      card.style.animation = "mgFadeIn .25s ease";
    } else {
      card.style.display = "none";
      window.__mgChoice = "none";
      const btns = card.querySelectorAll(".mg-btn");
      btns.forEach((b) => {
        const on = b.dataset.choice === "none";
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      if (typeof window.recalcFromCache === "function") window.recalcFromCache();
    }
  };

  (function wireMeetGreetButtons() {
    const card = document.getElementById("meetGreetCard");
    if (!card) return;
    const btns = Array.from(card.querySelectorAll(".mg-btn"));
    function activate(choice) {
      window.__mgChoice = choice;
      btns.forEach((b) => {
        const on = b.dataset.choice === choice;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      if (typeof window.recalcFromCache === "function") window.recalcFromCache();
    }
    btns.forEach((b) => b.addEventListener("click", () => activate(b.dataset.choice)));
    activate("none");
  })();

  // -------- Terms modal --------
  const termsModal = document.getElementById("termsModal");
  const openTerms = document.getElementById("openTermsModal");
  const closeTerms = document.getElementById("closeTerms");
  function openModal() {
    if (!termsModal) return;
    termsModal.classList.add("open");
    termsModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    closeTerms?.focus();
  }
  function closeModal() {
    if (!termsModal) return;
    termsModal.classList.remove("open");
    termsModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    openTerms?.focus();
  }
  openTerms?.addEventListener("click", openModal);
  closeTerms?.addEventListener("click", closeModal);
  termsModal?.addEventListener("click", (e) => { if (e.target === termsModal) closeModal(); });

  // Inicial sync
  syncButtons();
})();
