// ============================================================
//  COLMENA HUB — stripe-payment.js
//  Maneja todo el flujo de pago en el frontend.
//
//  PASOS PARA INTEGRARLO:
//  1. Copia este archivo a tu carpeta del proyecto
//  2. En profile-view.html agrega ANTES del </body>:
//       <script src="https://js.stripe.com/v3/"></script>
//       <script src="stripe-payment.js"></script>
//  3. Copia el modal HTML (stripe-modal-reference.html) dentro del <body>
//  4. Reemplaza 'pk_test_REEMPLAZA_ESTO' con tu Publishable Key de Stripe
// ============================================================

const ColmenaStripe = (() => {

  // ── Configuración ────────────────────────────────────────────
  // Tu clave pública de Stripe (pk_test_... o pk_live_...)
  // Esta SÍ puede estar en el frontend (es pública por diseño)
  const PUBLISHABLE_KEY = 'pk_test_REEMPLAZA_ESTO';

  // URL base de tus Cloud Functions
  const FUNCTIONS_BASE = 'https://us-central1-colmena-hub.cloudfunctions.net';

  // ── Estado interno ───────────────────────────────────────────
  let stripe        = null;
  let cardElement   = null;
  let currentData   = null;  // { appointmentId, professionalId, professionalName, amount }

  // ── Inicializar Stripe ───────────────────────────────────────
  function init() {
    if (typeof Stripe === 'undefined') {
      console.error('❌ Stripe.js no cargado. Agrega: <script src="https://js.stripe.com/v3/"></script>');
      return;
    }
    stripe = Stripe(PUBLISHABLE_KEY);
    console.log('✅ Stripe inicializado');
  }

  // ── Abrir modal de pago ──────────────────────────────────────
  function openModal({ appointmentId, professionalId, professionalName, amount }) {
    if (!stripe) init();

    currentData = { appointmentId, professionalId, professionalName, amount };

    // Poblar datos en el modal
    const nameEl   = document.getElementById('pay-professional-name');
    const amountEl = document.getElementById('pay-amount-display');
    const feeEl    = document.getElementById('pay-fee-display');

    if (nameEl)   nameEl.textContent   = professionalName || 'Profesional COLMENA';
    if (amountEl) amountEl.textContent = `$${amount.toFixed(2)}`;
    if (feeEl)    feeEl.textContent    = `Incluye $${(amount * 0.10).toFixed(2)} de comisión`;

    // Mostrar modal
    const modal = document.getElementById('colmena-payment-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Resetear estado
    document.getElementById('pay-success-state').style.display    = 'none';
    document.getElementById('stripe-card-element').style.display  = 'block';
    document.getElementById('pay-submit-btn').style.display       = 'block';
    document.getElementById('stripe-card-error').textContent      = '';
    resetButton();

    // Montar Stripe Card Element
    setTimeout(() => mountCardElement(), 100);
  }

  // ── Cerrar modal ─────────────────────────────────────────────
  function closeModal() {
    const modal = document.getElementById('colmena-payment-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    currentData = null;
    if (cardElement) {
      cardElement.destroy();
      cardElement = null;
    }
  }

  // ── Montar el elemento de tarjeta de Stripe ──────────────────
  function mountCardElement() {
    const elements = stripe.elements({
      locale: 'es',
      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap' }]
    });

    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize:       '16px',
          color:          '#374151',
          fontFamily:     'Inter, system-ui, sans-serif',
          fontSmoothing:  'antialiased',
          '::placeholder': { color: '#9CA3AF' }
        },
        invalid: { color: '#EF4444' }
      },
      hidePostalCode: true  // En México el código postal no siempre aplica
    });

    const container = document.getElementById('stripe-card-element');
    if (container) {
      container.innerHTML = '';
      cardElement.mount('#stripe-card-element');

      cardElement.on('change', (event) => {
        const errorEl = document.getElementById('stripe-card-error');
        if (errorEl) errorEl.textContent = event.error ? event.error.message : '';
      });
    }
  }

  // ── Enviar pago ──────────────────────────────────────────────
  async function submitPayment() {
    if (!currentData || !cardElement || !stripe) return;

    const user = typeof Auth !== 'undefined' ? Auth.currentUser : null;
    if (!user) {
      showError('Necesitas iniciar sesión para realizar un pago.');
      return;
    }

    setButtonLoading(true);

    try {
      // 1. Pedir el clientSecret a nuestra Cloud Function
      const idToken  = await user.getIdToken();
      const response = await fetch(`${FUNCTIONS_BASE}/createPaymentIntent`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({
          data: {
            appointmentId:  currentData.appointmentId,
            professionalId: currentData.professionalId,
            amount:         currentData.amount
          }
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Error al iniciar el pago');
      }

      const { result } = await response.json();
      const { clientSecret } = result;

      // 2. Confirmar el pago con Stripe.js
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name:  user.displayName || 'Cliente COLMENA',
            email: user.email
          }
        }
      });

      if (error) {
        showError(translateStripeError(error));
        setButtonLoading(false);
        return;
      }

      if (paymentIntent.status === 'succeeded') {
        showSuccess();
      }

    } catch (err) {
      console.error('Error en pago:', err);
      showError(err.message || 'Error inesperado. Intenta de nuevo.');
      setButtonLoading(false);
    }
  }

  // ── Mostrar estado de éxito ──────────────────────────────────
  function showSuccess() {
    document.getElementById('stripe-card-element').style.display = 'none';
    document.getElementById('pay-submit-btn').style.display      = 'none';
    document.getElementById('pay-success-state').style.display   = 'block';

    if (typeof showStatus === 'function') {
      showStatus('¡Pago exitoso! Tu cita ha sido confirmada.', 'success');
    }
  }

  // ── Mostrar error ────────────────────────────────────────────
  function showError(message) {
    const el = document.getElementById('stripe-card-error');
    if (el) el.textContent = message;
  }

  // ── Estado del botón ─────────────────────────────────────────
  function setButtonLoading(loading) {
    const btn     = document.getElementById('pay-submit-btn');
    const btnText = document.getElementById('pay-btn-text');
    if (!btn || !btnText) return;

    btn.disabled     = loading;
    btn.style.opacity = loading ? '0.7' : '1';
    btnText.textContent = loading ? 'Procesando...' : 'Pagar ahora';
  }

  function resetButton() {
    setButtonLoading(false);
  }

  // ── Traducir errores de Stripe al español ───────────────────
  function translateStripeError(error) {
    const translations = {
      'Your card was declined.':               'Tu tarjeta fue rechazada. Verifica los datos o usa otra.',
      'Your card has insufficient funds.':      'Fondos insuficientes en tu tarjeta.',
      'Your card has expired.':                 'Tu tarjeta está vencida.',
      'Your card\'s security code is incorrect.': 'El código de seguridad (CVV) es incorrecto.',
      'Your card number is incorrect.':         'El número de tarjeta es incorrecto.',
      'An error occurred while processing your card.': 'Error al procesar tu tarjeta. Intenta de nuevo.'
    };
    return translations[error.message] || error.message || 'Error al procesar el pago.';
  }

  // API pública
  return { init, openModal, closeModal, submitPayment };

})();

// Inicializar cuando cargue la página
document.addEventListener('DOMContentLoaded', () => ColmenaStripe.init());