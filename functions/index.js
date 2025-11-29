/**
 * Cloud Functions para COLMENA-HUB
 * 1. Webhook de Veriff → crea perfil público de trabajador
 * 2. Índice para búsquedas rápidas (rubro + ciudad)
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
 * Webhook que Veriff llama cuando termina una verificación
 * POST -> https://us-central1-<tu-proyecto>.cloudfunctions.net/veriffWebhook
 * Body: { verificationStatus: "approved", vendorData: "uid-del-usuario" }
 */
exports.veriffWebhook = onRequest({maxInstances: 10}, async (req, res) => {
  // Aplica CORS
  cors(req, res, async () => {
    try {
      const {verificationStatus, vendorData: uid} = req.body;

      // Si no está aprobado, no hacemos nada
      if (verificationStatus !== "approved") {
        logger.log(`Verificación NO aprobada para ${uid}`);
        return res.status(200).send("OK");
      }

      // Lee los datos básicos que ya guardaste en apply.html
      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) {
        logger.error(`No existe users/${uid}`);
        return res.status(404).send("Usuario no encontrado");
      }

      const {displayName, avatarURL, rubro, city} = userSnap.data();

      // Crea (o actualiza) el perfil público en workers/{uid}/publicProfile
      await db.doc(`workers/${uid}`).set({
        publicProfile: {
          name: displayName,
          avatarURL,
          rubro,
          city,
          rating: 0,
          jobsDone: 0,
          verified: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, {merge: true});

      // Índice rápido para búsquedas (rubro + ciudad)
      await db.collection("index").doc(uid).set({
        rubro: rubro.toLowerCase(),
        city: city.toLowerCase()
      });

      logger.log(`Perfil público creado para ${uid}`);
      return res.status(200).send("Perfil creado");
    } catch (error) {
      logger.error("Error en veriffWebhook", error);
      return res.status(500).send("Internal error");
    }
  });
});

/**
 * Ejemplo de función adicional: notificar al trabajador cuando llega una orden
 * Se activa al crear un documento en orders/{orderId}
 */
exports.notifyPro = onRequest({maxInstances: 10}, async (req, res) => {
  // Aquí puedes poner luego un trigger real onDocumentCreated
  res.send("Notificación pendiente");
});
