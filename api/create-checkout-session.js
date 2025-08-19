<!-- Stripe.js (OBLIGATORIO) -->
<script src="https://js.stripe.com/v3"></script>
<script>
  // Tu Publishable Key (pk_live_...)
  const STRIPE_PK = 'pk_live_51Rr9g0LxdVPME4zrYzx4WKgoT3NUZBSkWbwMnSmGPQCyE4MzzIufo6gM8EvLeTHOjQ5Vcn2V1GY0D9RrcJrOjRCd002MQFljOF';

  // NO redeclaramos 'payBtn' ni 'isAccepted' para evitar el error
  // "Identifier 'payBtn' has already been declared". Usamos un alias local.
  (function attachStripe(){
    const btn = document.getElementById('pay');
    if (!btn) return;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();

      // isAccepted() ya existe en tu JS de términos
      if (typeof isAccepted === 'function' && !isAccepted()) {
        alert('Please accept Terms & Conditions first.');
        return;
      }

      const total = Number(window.__lastQuotedTotal);
      if (!total || Number.isNaN(total)) {
        alert('Please calculate a price first.');
        return;
      }

      // Validación mínima de campos
      const requiredIds = ['fullname','phone','email','pickup','dropoff'];
      let missing = [];
      requiredIds.forEach(id => {
        const el = document.getElementById(id);
        const empty = !el || !el.value || el.value.trim() === '';
        if (el) el.classList.toggle('invalid', empty);
        if (empty) missing.push(id);
      });
      if (missing.length) { alert('Please complete all required fields.'); return; }

      const amount = Math.round(total * 100);

      // generateConfirmationNumber() ya existe en tu JS; si no, quita esta llamada o define la función
      const payload = {
        amount,
        fullname: document.getElementById('fullname').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        pickup: document.getElementById('pickup').value,
        dropoff: document.getElementById('dropoff').value,
        specialInstructions: document.getElementById('specialInstructions')?.value || null,
        date: document.getElementById('date').value,
        time: document.getElementById('time').value,
        flightNumber: document.getElementById('flightNumber')?.value || null,
        flightOriginCity: document.getElementById('flightOrigin')?.value || null,
        tailNumber: document.getElementById('tailNumber')?.value || null,
        privateFlightOriginCity: document.getElementById('pvtOrigin')?.value || null,
        vehicleType: window.__vehicleType || 'suv',
        distanceMiles: window.__lastDistanceMiles || null,
        quotedTotal: window.__lastQuotedTotal || null,
        confirmationNumber: (typeof generateConfirmationNumber === 'function')
          ? generateConfirmationNumber()
          : ''
      };

      try {
        const resp = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.id) {
          throw new Error(data?.error || `Bad response (${resp.status})`);
        }

        const stripe = Stripe(STRIPE_PK);
        const { error } = await stripe.redirectToCheckout({ sessionId: data.id });
        if (error) alert(error.message);
      } catch (e) {
        alert('Payment error: ' + (e?.message || e));
        console.error(e);
      }
    });
  })();
</script>
