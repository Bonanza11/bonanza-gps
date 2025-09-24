/*
stripe.js — Bonanza Transportation (Stripe Checkout)
────────────────────────────────────────────────────
Rol:
- Conecta el botón “PAY NOW” con Stripe Checkout.
- Usa el total calculado en booking.js (window.__lastQuotedTotal).
- Envía al backend los datos clave de la reserva para crear la sesión.

Requisitos:
- Stripe.js incluido en el HTML: <script src="https://js.stripe.com/v3"></script>
- booking.js debe haber dejado:
    window.__lastQuotedTotal   (Number, en USD)
    window.__lastDistanceMiles (Number)
    window.__vehicleType       ("suv" | "van")
- Términos aceptados (el botón estará habilitado si aceptan).
- Backend disponible en /api/create-checkout-session

Cómo obtiene la Publishable Key:
- Busca en este orden:
    1) window.STRIPE_PK
    2) window.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- Si no existe, muestra un error claro. (No hardcodeamos llaves aquí.)
*/

window.BNZ = window.BNZ || {};

(function attachStripeCheckout() {
  const payBtn = document.getElementById("pay");
  if (!payBtn) return;

  // Detectar la PK pública que debe estar disponible en el cliente
  const STRIPE_PK =
    (typeof window.STRIPE_PK === "string" && window.STRIPE_PK) ||
    (typeof window.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === "string" && window.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) ||
    "";

  if (!STRIPE_PK) {
    console.error("❌ Stripe publishable key not found. Set window.STRIPE_PK or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.");
  }

  payBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    // Validaciones mínimas antes de pagar
    const pill = document.getElementById("acceptPill");
    const accepted = pill && pill.classList.contains("on");
    if (!accepted) {
      alert("Please accept Terms & Conditions first.");
      return;
    }

    const totalUSD = Number(window.__lastQuotedTotal || 0);
    if (!totalUSD) { alert("Please calculate a price first."); return; }

    // Campos básicos del formulario (si existen)
    const get = (id) => (document.getElementById(id)?.value || "").trim();
    const payload = {
      amount: Math.round(totalUSD * 100),              // en centavos
      fullname: get("fullname"),
      phone: get("phone"),
      email: get("email"),
      pickup: get("pickup"),
      dropoff: get("dropoff"),
      specialInstructions: document.getElementById("specialInstructions")?.value || null,

      // Fecha/hora
      date: get("date"),
      time: get("time"),

      // Vuelo (comercial)
      flightNumber: document.getElementById("flightNumber")?.value || null,
      flightOriginCity: document.getElementById("flightOrigin")?.value || null,

      // Private jet (FBO)
      tailNumber: document.getElementById("tailNumber")?.value || null,
      privateFlightOriginCity: document.getElementById("pvtOrigin")?.value || null,

      // Cálculo
      vehicleType: window.__vehicleType || "suv",
      distanceMiles: window.__lastDistanceMiles || null,
      quotedTotal: totalUSD || null
    };

    // Validación mínima de campos requeridos
    const requiredIds = ["fullname","phone","email","pickup","dropoff","date","time"];
    const missing = requiredIds.filter(id => !payload[id] || String(payload[id]).trim() === "");
    if (missing.length) {
      // Marcar visualmente si están en el DOM
      missing.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add("invalid");
      });
      alert("Please complete all required fields.");
      return;
    }

    try {
      // Crear sesión en tu backend
      const resp = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.id) {
        throw new Error(data?.error || `Bad response (${resp.status})`);
      }

      if (!STRIPE_PK) {
        alert("Stripe publishable key missing on the client. Set window.STRIPE_PK or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.");
        return;
      }

      // Redirigir a Stripe Checkout
      const stripe = Stripe(STRIPE_PK);
      const { error } = await stripe.redirectToCheckout({ sessionId: data.id });
      if (error) alert(error.message);
    } catch (e) {
      console.error(e);
      alert("Payment error: " + (e?.message || e));
    }
  });
})();
