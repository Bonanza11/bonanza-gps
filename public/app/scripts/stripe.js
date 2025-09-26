/* =========================================================================
   /public/app/scripts/stripe.js — Bonanza Transportation (Stripe Checkout)
   -------------------------------------------------------------------------
   Conecta el botón “PAY NOW” con Stripe Checkout usando el total calculado
   en booking.js. Soporta backends que devuelvan { id } o { url }.

   Requisitos previos que deja booking.js en window:
     - window.__lastQuotedTotal   (Number, en USD)
     - window.__lastDistanceMiles (Number)
     - window.__vehicleType       ("suv" | "van")

   Publishable Key (en el cliente):
     1) window.STRIPE_PK
     2) window.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

   Backend esperado:
     POST /api/create-checkout-session
     -> { id: "cs_test_...", ok?:true }  // o
     -> { url: "https://checkout.stripe.com/...", ok?:true }
   ========================================================================== */

(function attachStripeCheckout() {
  const payBtn = document.getElementById("pay");
  if (!payBtn) return;

  // ===== Helpers =====
  const $ = (id) => document.getElementById(id);
  const STRIPE_PK =
    (typeof window.STRIPE_PK === "string" && window.STRIPE_PK) ||
    (typeof window.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === "string" &&
      window.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) ||
    "";

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usPhoneRx = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

  function setInvalid(el, bad) {
    if (!el) return;
    el.classList.toggle("invalid", !!bad);
    el.classList.toggle(
      "valid",
      !bad && String(el.value || "").trim().length > 0
    );
  }

  function getValue(id) {
    const v = $(id)?.value ?? "";
    return String(v).trim();
  }

  function getMeetGreetChoice() {
    // Si usas los botones .mg-btn con data-choice y clase .active:
    const active = document.querySelector(".mg-btn.active");
    return active?.dataset?.choice || "none";
  }

  // ===== Botón PAY NOW =====
  let loading = false;

  payBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (loading) return;

    // Validar aceptación de términos
    const pill = $("acceptPill");
    const accepted = pill && pill.classList.contains("on");
    if (!accepted) {
      alert("Please accept Terms & Conditions first.");
      return;
    }

    // Total calculado
    const totalUSD = Number(window.__lastQuotedTotal || 0);
    if (!totalUSD) {
      alert("Please calculate a price first.");
      return;
    }

    // Recoger campos requeridos
    const fullname = getValue("fullname");
    const phone = getValue("phone");
    const email = getValue("email");
    const pickup = getValue("pickup");
    const dropoff = getValue("dropoff");
    const date = getValue("date");
    const time = getValue("time");

    // Marcar validaciones visuales
    setInvalid($("fullname"), !fullname);
    setInvalid($("phone"), !phone || !usPhoneRx.test(phone));
    setInvalid($("email"), !email || !emailRx.test(email));
    setInvalid($("pickup"), !pickup);
    setInvalid($("dropoff"), !dropoff);
    setInvalid($("date"), !date);
    setInvalid($("time"), !time);

    const missing =
      !fullname ||
      !phone ||
      !email ||
      !pickup ||
      !dropoff ||
      !date ||
      !time ||
      !emailRx.test(email) ||
      !usPhoneRx.test(phone);

    if (missing) {
      alert("Please complete all required fields correctly.");
      return;
    }

    // Opcionales
    const specialInstructions = $("specialInstructions")?.value || null;
    const flightNumber = $("flightNumber")?.value || null;
    const flightOriginCity = $("flightOrigin")?.value || null;
    const tailNumber = $("tailNumber")?.value || null;
    const privateFlightOriginCity = $("pvtOrigin")?.value || null;

    // Datos de cálculo
    const payload = {
      amount: Math.round(totalUSD * 100), // cents
      fullname,
      phone,
      email,
      pickup,
      dropoff,
      specialInstructions,
      date,
      time,
      flightNumber,
      flightOriginCity,
      tailNumber,
      privateFlightOriginCity,
      vehicleType: window.__vehicleType || "suv",
      distanceMiles: window.__lastDistanceMiles || null,
      quotedTotal: totalUSD || null,
      meetGreet: getMeetGreetChoice(), // "tsa_exit" | "baggage_claim" | "none"
    };

    try {
      // Bloquear UI
      loading = true;
      payBtn.disabled = true;
      payBtn.textContent = "Processing…";

      // Crear sesión en backend
      const resp = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(data?.error || `Bad response (${resp.status})`);
      }

      // Si el backend devuelve URL directa → redirigimos
      if (data?.url && typeof data.url === "string") {
        window.location.href = data.url;
        return;
      }

      // Si devuelve id de sesión → Stripe.js
      if (data?.id && typeof data.id === "string") {
        if (!STRIPE_PK) {
          alert(
            "Stripe publishable key missing on the client. Set window.STRIPE_PK or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY."
          );
          return;
        }
        const stripe = Stripe(STRIPE_PK);
        const { error } = await stripe.redirectToCheckout({
          sessionId: data.id,
        });
        if (error) throw error;
        return;
      }

      // Formato inesperado
      throw new Error("Invalid response from server. Expected { url } or { id }.");
    } catch (err) {
      console.error("[stripe] checkout error:", err);
      alert("Payment error: " + (err?.message || err));
    } finally {
      // Restaurar UI (si no hubo redirección)
      loading = false;
      payBtn.disabled = false;
      payBtn.textContent = "PAY NOW";
    }
  });
})();
