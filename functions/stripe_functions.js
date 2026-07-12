// ============================================================
//  COLMENA HUB — Cloud Functions: Stripe (pagos seguros)
//  Archivo: functions/index.js  (agrégalo al que ya tienes)
//
//  SETUP (una sola vez en terminal):
//  1. npm install --prefix functions stripe
//  2. firebase functions:secrets:set STRIPE_SECRET_KEY
//     → pega tu clave sk_test_... o sk_live_...
//  3. firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//     → pega el whsec_... del dashboard de Stripe
//  4. firebase deploy --only functions
// ============================================================

const { onRequest, onCall } = require('firebase-functions/v2/https');
const { defineSecret }      = require('firebase-functions/params');
const admin                 = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET_KEY     = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// ── 1. Crear PaymentIntent ─────────────────────────────────────
// El frontend llama esto para iniciar un pago.
exports.createPaymentIntent = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) throw new Error('No autenticado');

    const { appointmentId, professionalId, amount } = request.data;
    if (!appointmentId || !professionalId || !amount) throw new Error('Faltan parámetros');
    if (amount < 50) throw new Error('El monto mínimo es $50 MXN');

    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());

    // Crear/recuperar customer de Stripe
    const userRef  = db.collection('users').doc(request.auth.uid);
    const userSnap = await userRef.get();
    let stripeCustomerId = userSnap.data()?.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email:    request.auth.token.email,
        name:     request.auth.token.name || '',
        metadata: { firebaseUid: request.auth.uid }
      });
      stripeCustomerId = customer.id;
      await userRef.set({ stripeCustomerId }, { merge: true });
    }

    // Crear PaymentIntent en MXN (Stripe trabaja en centavos)
    const paymentIntent = await stripe.paymentIntents.create({
      amount:      Math.round(amount * 100),
      currency:    'mxn',
      customer:    stripeCustomerId,
      description: `Pago COLMENA HUB - Cita ${appointmentId}`,
      metadata:    { appointmentId, professionalId, clientId: request.auth.uid }
    });

    // Guardar referencia en Firestore
    await db.collection('payments').doc(paymentIntent.id).set({
      paymentIntentId: paymentIntent.id,
      appointmentId,
      professionalId,
      clientId:  request.auth.uid,
      amount,
      currency:  'mxn',
      status:    'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { clientSecret: paymentIntent.client_secret };
  }
);

// ── 2. Webhook de Stripe ───────────────────────────────────────
// Stripe llama esto automáticamente cuando cambia el estado de un pago.
// Registra esta URL en tu dashboard de Stripe:
// https://us-central1-colmena-hub.cloudfunctions.net/stripeWebhook
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const stripe    = require('stripe')(STRIPE_SECRET_KEY.value());
    const signature = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      console.error('Webhook signature inválida:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const obj = event.data.object;

    if (event.type === 'payment_intent.succeeded') {
      const { appointmentId, professionalId } = obj.metadata;
      const totalMXN = obj.amount / 100;

      // Marcar pago como exitoso
      await db.collection('payments').doc(obj.id).update({
        status: 'succeeded',
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Confirmar la cita
      if (appointmentId) {
        await db.collection('appointments').doc(appointmentId).update({
          status:          'confirmed',
          paymentStatus:   'paid',
          paymentIntentId: obj.id,
          paidAt:          admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Acumular ingresos del profesional (90%, COLMENA retiene 10%)
      if (professionalId) {
        await db.collection('professionals').doc(professionalId).update({
          totalEarnings: admin.firestore.FieldValue.increment(totalMXN * 0.90),
          completedJobs: admin.firestore.FieldValue.increment(1)
        });
      }
      console.log(`✅ Pago exitoso $${totalMXN} MXN`);
    }

    if (event.type === 'payment_intent.payment_failed') {
      await db.collection('payments').doc(obj.id).update({
        status:        'failed',
        failureReason: obj.last_payment_error?.message || 'Error desconocido'
      });
      const { appointmentId } = obj.metadata;
      if (appointmentId) {
        await db.collection('appointments').doc(appointmentId).update({ paymentStatus: 'failed' });
      }
    }

    res.json({ received: true });
  }
);

// ── 3. Stripe Connect para profesionales ──────────────────────
// Permite a los profesionales recibir pagos directamente.
exports.createStripeConnectLink = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) throw new Error('No autenticado');

    const stripe  = require('stripe')(STRIPE_SECRET_KEY.value());
    const profRef = db.collection('professionals').doc(request.auth.uid);
    const profDoc = await profRef.get();
    if (!profDoc.exists) throw new Error('Perfil no encontrado');

    let stripeAccountId = profDoc.data().stripeAccountId;

    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express', country: 'MX',
        email: request.auth.token.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { firebaseUid: request.auth.uid }
      });
      stripeAccountId = account.id;
      await profRef.update({ stripeAccountId, stripeConnected: false });
    }

    const link = await stripe.accountLinks.create({
      account:     stripeAccountId,
      refresh_url: `${request.data.baseUrl}/dashboard.html?stripe=refresh`,
      return_url:  `${request.data.baseUrl}/dashboard.html?stripe=success`,
      type:        'account_onboarding'
    });

    return { url: link.url };
  }
);