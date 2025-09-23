/* =========================================================
   Archivo: stripe.js
   Rol:
     - Stripe Checkout
     - Botón PAY NOW
   ========================================================= */
window.BNZ = window.BNZ || {};

(function(){
  const payBtn=document.getElementById("pay");
  if(!payBtn) return;

  payBtn.addEventListener("click",async()=>{
    if(!BNZ.__lastQuotedTotal){ alert("Calculate price first."); return; }
    const stripe=Stripe(BNZ.STRIPE_PK);
    const resp=await fetch("/api/create-checkout-session",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ amount: BNZ.__lastQuotedTotal })
    });
    const data=await resp.json();
    if(data.id) stripe.redirectToCheckout({sessionId:data.id});
    else alert("Error creating checkout session.");
  });
})();
