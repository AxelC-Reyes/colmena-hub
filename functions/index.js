/**
 * Cloud Functions para COLMENA-HUB
 * 1. Evita duplicados por INE + teléfono
 * 2. Obliga verificación a clientes después del pago
 * 3. Detecta si ya está registrado sin que usuario lo note
 * 4. Índice para búsquedas rápidas (rubro + ciudad)
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Inicializa Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// CORS para que Veriff (o cualquier origen) pueda llamar el webhook
const cors = require("cors")({origin: true});

/**
 * 1. EVITA DUPLICADOS por INE + teléfono
 * Se activa cuando creas un usuario
 */
exports.checkDuplicates = onRequest({maxInstances: 10}, async (req, res) => {
  cors(req, res, async () => {
    try {
      const {ineNumber, phone, uid} = req.body;

      // Busca por INE o teléfono
      const existing = await db.collection('users')
                               .where('ineNumber', '==', ineNumber)
                               .where('phone', '==', phone)
                               .get();

      if (!existing.empty) {
        // Borra el usuario duplicado
        await db.doc(`users/${uid}`).delete();
        logger.warn(`Duplicado detectado: ${uid}`);
        return res.status(409).send("INE o teléfono ya registrado");
      }

      logger.log(`Sin duplicados: ${uid}`);
      return res.status(200).send("Sin duplicados");
    } catch (error) {
      logger.error("Error en checkDuplicates", error);
      return res.status(500).send("Internal error");
    }
  });
});

/**
 * 2. OBLIGA VERIFICACIÓN a CLIENTES después del pago
 * Se activa cuando el pago es "paid"
 */
exports.forceVerification = onRequest({maxInstances: 10}, async (req, res) => {
  cors(req, res, async () => {
    try {
      const {orderId, userId} = req.body;

      const orderSnap = await db.doc(`orders/${orderId}`).get();
      const order = orderSnap.data();

      // Solo si el pago fue exitoso y aún no verificado
      if (order.status === 'paid' && !order.verified) {
        // Busca si el usuario YA está verificado
        const userSnap = await db.doc(`users/${userId}`).get();
        if (userSnap.exists && userSnap.data().verified) {
          // Ya verificado → deja pasar
          return res.status(200).send("Ya verificado");
        }

        // Obliga verificación
        await db.doc(`orders/${orderId}`).update({
          status: 'pending_verification',
          requiresVerification: true,
          verificationDeadline: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 h
          )
        });

        // Notifica por WhatsApp (opcional)
        await sendWhatsApp(userId, 'Para completar tu compra, verifica tu identidad aquí: https://colmena-hub.com/verify');
      }

      logger.log(`Verificación obligada para orden ${orderId}`);
      return res.status(200).send("Verificación obligada");
    } catch (error) {
      logger.error("Error en forceVerification", error);
      return res.status(500).send("Internal error");
    }
  });
});

/**
 * 3. DETECTA SI YA ESTÁ REGISTRADO sin que usuario lo note
 * Devuelve {registered: true, verified: false}
 */
exports.detectRegistered = onRequest({maxInstances: 10}, async (req, res) => {
  cors(req, res, async () => {
    try {
      const uid = req.query.uid;
      if (!uid) return res.status(400).send('UID requerido');

      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) return res.json({registered: false});

      const data = userSnap.data();
      return res.json({
        registered: true,
        verified: data.verified || false,
        requiresVerification: !data.verified
      });
    } catch (error) {
      logger.error("Error en detectRegistered", error);
      return res.status(500).send("Internal error");
    }
  });
});

/**
 * 4. ÍNDICE PARA BÚSQUEDAS RÁPIDAS (rubro + ciudad)
 * Se activa cuando creas perfil de trabajador
 */
exports.createIndex = functions.firestore
  .ocument('workers/{uid}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data.publicProfile) return;

    const {rubro, city} = data.publicProfile;

    // Índice para búsquedas rápidas
    await db.collection("index").doc(context.params.uid).set({
      rubro: rubro.toLowerCase(),
      city: city.toLowerCase()
    });

    logger.log(`Índice creado para ${context.params.uid}`);
  });

// ---------- 5. NOTIFICACIÓN POR WHATSAPP (opcional) ----------
async function sendWhatsApp(userId, message) {
  // Ejemplo con Twilio (comenta si no lo usas)
  /*
  const accountSid = 'TU_TWILIO_SID';
  const authToken = 'TU_TWILIO_TOKEN';
  const client = require('twilio')(accountSid, authToken);
  
  const userSnap = await db.doc(`users/${userId}`).get();
  const phone = userSnap.data().phone;
  
  await client.messages.create({
    body: message,
    from: 'whatsapp:+14155238886',
    to: `whatsapp:${phone}`
  });
  */
  
  // Simulación
  logger.log(`[WhatsApp] Enviando a ${userId}: ${message}`);
}