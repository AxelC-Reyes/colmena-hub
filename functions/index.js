/**
 * Cloud Functions para COLMENA-HUB
 * 1. Evita duplicados por INE + teléfono
 * 2. Obliga verificación a clientes después del pago
 * 3. Detecta si ya está registrado sin que usuario lo note
 * 4. Índice para búsquedas rápidas (rubro + ciudad)
 * 5. Veriff: crea sesiones, verifica estado y webhook
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });

// Inicializa Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Configuración de Veriff
const VERIFF_CONFIG = {
  API_KEY: process.env.VERIFF_API_KEY || 95d2dbf2-2592-4089-860c-10243c087fa0,
  BASE_URL: https://stationapi.veriff.com,
};

// --------------------------------------------------------------
// 1. VERIFF: Crear sesión de verificación
// --------------------------------------------------------------
exports.createVeriffSession = onRequest({ maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const { fullName, email, phone, userId } = req.body;

      if (!fullName || !email || !phone) {
        return res.status(400).json({ error: "Datos incompletos" });
      }

      // Separar nombre y apellido
      const nameParts = fullName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || firstName;

      // Crear sesión en Veriff
      const response = await axios.post(
        `${VERIFF_CONFIG.BASE_URL}/sessions`,
        {
          verification: {
            callback: `${req.headers.origin || "https://tu-dominio.com"}/veriff-callback.html`,
            person: {
              givenName: firstName,
              lastName: lastName,
              idNumber: "", // Opcional
            },
            document: {
              type: "ID_CARD", // INE/IFE para México
              country: "MX",
            },
            vendorData: JSON.stringify({
              userId: userId,
              email: email,
              phone: phone,
              timestamp: new Date().toISOString(),
            }),
            lang: "es",
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${VERIFF_CONFIG.API_KEY}`,
          },
        }
      );

      // Guardar referencia en Firestore
      if (userId) {
        await db.collection("veriff_sessions").doc(response.data.verification.id).set({
          userId: userId,
          email: email,
          phone: phone,
          fullName: fullName,
          sessionId: response.data.verification.id,
          status: "created",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sessionUrl: response.data.verification.url,
        });
      }

      logger.log(`Sesión Veriff creada para ${email}: ${response.data.verification.id}`);
      res.json({
        success: true,
        verification: response.data.verification,
      });

    } catch (error) {
      logger.error("Error creando sesión Veriff:", error.response?.data || error.message);
      res.status(500).json({
        error: "Error creando sesión de verificación",
        details: error.response?.data || error.message,
      });
    }
  });
});

// --------------------------------------------------------------
// 2. VERIFF: Verificar estado de una sesión
// --------------------------------------------------------------
exports.getVeriffStatus = onRequest({ maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const { sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID requerido" });
      }

      const response = await axios.get(
        `${VERIFF_CONFIG.BASE_URL}/sessions/${sessionId}/decision`,
        {
          headers: {
            "Authorization": `Bearer ${VERIFF_CONFIG.API_KEY}`,
          },
        }
      );

      // Si la verificación fue exitosa, actualizar usuario
      if (response.data.verification?.status === "approved") {
        const sessionDoc = await db.collection("veriff_sessions").doc(sessionId).get();
        if (sessionDoc.exists) {
          const sessionData = sessionDoc.data();
          
          // Actualizar usuario como verificado
          await db.collection("users").doc(sessionData.userId).update({
            verified: true,
            veriffId: sessionId,
            verificationDate: admin.firestore.FieldValue.serverTimestamp(),
            verificationStatus: "approved",
          });

          logger.log(`Usuario ${sessionData.userId} verificado exitosamente`);
        }
      }

      res.json(response.data);

    } catch (error) {
      logger.error("Error obteniendo estado Veriff:", error.response?.data || error.message);
      res.status(500).json({
        error: "Error obteniendo estado de verificación",
        details: error.response?.data || error.message,
      });
    }
  });
});

// --------------------------------------------------------------
// 3. VERIFF: Webhook para recibir resultados
// --------------------------------------------------------------
exports.veriffWebhook = onRequest({ maxInstances: 10 }, async (req, res) => {
  try {
    const signature = req.headers["x-veriff-signature"];
    const payload = req.body;

    // IMPORTANTE: Verificar la firma en producción
    // const isValid = verifySignature(signature, JSON.stringify(payload));
    // if (!isValid) return res.status(401).send("Firma inválida");

    const { verification, status } = payload;

    logger.log(`📨 Webhook Veriff: ${verification.id} - ${status}`);

    // Buscar sesión por vendorData
    let userId = null;
    if (payload.verification?.vendorData) {
      try {
        const vendorData = JSON.parse(payload.verification.vendorData);
        userId = vendorData.userId;
      } catch (e) {
        logger.error("Error parseando vendorData:", e);
      }
    }

    // Si no encontramos userId en vendorData, buscar en nuestra BD
    if (!userId) {
      const sessionDoc = await db.collection("veriff_sessions").doc(verification.id).get();
      if (sessionDoc.exists) {
        const sessionData = sessionDoc.data();
        userId = sessionData.userId;
      }
    }

    // Actualizar sesión
    await db.collection("veriff_sessions").doc(verification.id).update({
      status: status,
      decision: payload.decision || {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Si está aprobado, actualizar usuario
    if (status === "approved" && userId) {
      await db.collection("users").doc(userId).update({
        verified: true,
        veriffId: verification.id,
        verificationDate: admin.firestore.FieldValue.serverTimestamp(),
        verificationStatus: "approved",
        identityVerified: true,
      });

      logger.log(`✅ Usuario ${userId} verificado via webhook`);
    } else if (userId) {
      // Si fue rechazado o hubo error
      await db.collection("users").doc(userId).update({
        verificationStatus: status,
        lastVerificationAttempt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.status(200).json({ received: true });

  } catch (error) {
    logger.error("Error en webhook Veriff:", error);
    res.status(500).json({ error: "Error procesando webhook" });
  }
});

// --------------------------------------------------------------
// 4. EVITA DUPLICADOS por INE + teléfono
// --------------------------------------------------------------
exports.checkDuplicates = onRequest({ maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const { ineNumber, phone, uid } = req.body;

      if (!ineNumber || !phone) {
        return res.status(400).send("INE y teléfono requeridos");
      }

      // Buscar por INE
      const ineQuery = await db.collection("users")
        .where("ineNumber", "==", ineNumber)
        .limit(1)
        .get();

      // Buscar por teléfono
      const phoneQuery = await db.collection("users")
        .where("phone", "==", phone)
        .limit(1)
        .get();

      const duplicates = [];

      if (!ineQuery.empty) {
        duplicates.push("INE ya registrada");
      }

      if (!phoneQuery.empty) {
        duplicates.push("Teléfono ya registrado");
      }

      if (duplicates.length > 0) {
        logger.warn(`Duplicado detectado para ${uid}: ${duplicates.join(", ")}`);
        return res.status(409).json({
          error: "Usuario ya registrado",
          duplicates: duplicates,
          message: "Este INE o teléfono ya están registrados en el sistema",
        });
      }

      logger.log(`Sin duplicados: ${uid}`);
      return res.status(200).json({
        success: true,
        message: "Sin duplicados detectados",
      });

    } catch (error) {
      logger.error("Error en checkDuplicates", error);
      return res.status(500).json({
        error: "Error interno del servidor",
        details: error.message,
      });
    }
  });
});

// --------------------------------------------------------------
// 5. OBLIGA VERIFICACIÓN a CLIENTES después del pago
// --------------------------------------------------------------
exports.forceVerification = onRequest({ maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const { orderId, userId } = req.body;

      if (!orderId || !userId) {
        return res.status(400).send("Order ID y User ID requeridos");
      }

      const orderRef = db.doc(`orders/${orderId}`);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return res.status(404).send("Orden no encontrada");
      }

      const order = orderSnap.data();

      // Solo si el pago fue exitoso y aún no verificado
      if (order.status === "paid" && !order.verified) {
        // Verificar si el usuario YA está verificado
        const userSnap = await db.doc(`users/${userId}`).get();
        const userData = userSnap.exists ? userSnap.data() : null;

        if (userData?.verified) {
          // Ya verificado → actualizar orden
          await orderRef.update({
            verified: true,
            verificationStatus: "already_verified",
          });
          return res.status(200).json({
            message: "Usuario ya verificado",
            verified: true,
          });
        }

        // Obligar verificación
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 24); // 24 horas

        await orderRef.update({
          status: "pending_verification",
          requiresVerification: true,
          verificationDeadline: admin.firestore.Timestamp.fromDate(deadline),
          verificationRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Notificar al usuario (opcional)
        if (userData?.phone) {
          await sendWhatsAppNotification(
            userData.phone,
            `Hola ${userData.displayName || ""}, para completar tu orden #${orderId}, necesitas verificar tu identidad. Visita: https://colmena-hub.com/verify/${orderId}`
          );
        }

        logger.log(`Verificación obligada para orden ${orderId}, usuario ${userId}`);
        return res.status(200).json({
          message: "Verificación obligada",
          requiresVerification: true,
          deadline: deadline.toISOString(),
          verificationUrl: `https://colmena-hub.com/verify/${orderId}`,
        });
      }

      return res.status(200).json({
        message: "No se requiere verificación",
        requiresVerification: false,
      });

    } catch (error) {
      logger.error("Error en forceVerification", error);
      return res.status(500).json({
        error: "Error interno del servidor",
        details: error.message,
      });
    }
  });
});

// --------------------------------------------------------------
// 6. DETECTA SI YA ESTÁ REGISTRADO sin que usuario lo note
// --------------------------------------------------------------
exports.detectRegistered = onRequest({ maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const { email, phone, ineNumber } = req.query;

      if (!email && !phone && !ineNumber) {
        return res.status(400).json({ error: "Al menos un parámetro requerido (email, phone o ineNumber)" });
      }

      const conditions = [];

      if (email) {
        conditions.push(db.collection("users").where("email", "==", email).limit(1));
      }

      if (phone) {
        conditions.push(db.collection("users").where("phone", "==", phone).limit(1));
      }

      if (ineNumber) {
        conditions.push(db.collection("users").where("ineNumber", "==", ineNumber).limit(1));
      }

      const results = await Promise.all(conditions.map(query => query.get()));

      let userFound = null;
      let foundBy = null;

      for (let i = 0; i < results.length; i++) {
        if (!results[i].empty) {
          const doc = results[i].docs[0];
          userFound = { id: doc.id, ...doc.data() };
          
          if (i === 0 && email) foundBy = "email";
          if (i === 1 && phone) foundBy = "teléfono";
          if (i === 2 && ineNumber) foundBy = "INE";
          break;
        }
      }

      if (userFound) {
        return res.json({
          registered: true,
          foundBy: foundBy,
          userId: userFound.id,
          verified: userFound.verified || false,
          requiresVerification: !userFound.verified,
          userData: {
            displayName: userFound.displayName,
            email: userFound.email,
            phone: userFound.phone,
          },
        });
      }

      return res.json({
        registered: false,
        message: "Usuario no registrado",
      });

    } catch (error) {
      logger.error("Error en detectRegistered", error);
      return res.status(500).json({
        error: "Error interno del servidor",
        details: error.message,
      });
    }
  });
});

// --------------------------------------------------------------
// 7. ÍNDICE PARA BÚSQUEDAS RÁPIDAS (rubro + ciudad)
// --------------------------------------------------------------
exports.createWorkerIndex = onDocumentCreated("workers/{uid}", async (event) => {
  try {
    const snapshot = event.data;
    if (!snapshot.exists) {
      return;
    }

    const data = snapshot.data();
    
    // Solo crear índice si tiene perfil público
    if (!data.publicProfile || !data.publicProfile.rubro || !data.publicProfile.city) {
      return;
    }

    const { rubro, city } = data.publicProfile;

    await db.collection("search_index").doc(event.params.uid).set({
      rubro: rubro.toLowerCase().trim(),
      city: city.toLowerCase().trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      active: true,
      // Campos adicionales para búsqueda
      rubroKeywords: generateKeywords(rubro),
      cityKeywords: generateKeywords(city),
    });

    logger.log(`Índice creado para trabajador ${event.params.uid}: ${rubro} en ${city}`);

  } catch (error) {
    logger.error("Error creando índice:", error);
  }
});

// --------------------------------------------------------------
// 8. BUSCAR TRABAJADORES por rubro y ciudad
// --------------------------------------------------------------
exports.searchWorkers = onRequest({ maxInstances: 10 }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const { rubro, city, limit = 20, page = 1 } = req.query;

      if (!rubro || !city) {
        return res.status(400).json({ error: "Rubro y ciudad requeridos" });
      }

      const searchRubro = rubro.toLowerCase().trim();
      const searchCity = city.toLowerCase().trim();

      // Buscar en el índice
      let query = db.collection("search_index")
        .where("rubro", "==", searchRubro)
        .where("city", "==", searchCity)
        .where("active", "==", true);

      // Paginación
      const offset = (page - 1) * limit;
      query = query.limit(parseInt(limit)).offset(offset);

      const snapshot = await query.get();

      const results = [];
      const workerIds = [];

      snapshot.forEach(doc => {
        workerIds.push(doc.id);
        results.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      // Obtener datos completos de los trabajadores
      const workersData = [];
      if (workerIds.length > 0) {
        const workersSnapshot = await db.collection("workers")
          .where(admin.firestore.FieldPath.documentId(), "in", workerIds.slice(0, 30)) // Firestore límite: 30 in clauses
          .get();

        workersSnapshot.forEach(doc => {
          workersData.push({
            id: doc.id,
            ...doc.data(),
          });
        });
      }

      // Contar total para paginación
      const countQuery = await db.collection("search_index")
        .where("rubro", "==", searchRubro)
        .where("city", "==", searchCity)
        .where("active", "==", true)
        .count()
        .get();

      const total = countQuery.data().count;

      res.json({
        success: true,
        total: total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        results: workersData,
        search: {
          rubro: searchRubro,
          city: searchCity,
        },
      });

    } catch (error) {
      logger.error("Error buscando trabajadores:", error);
      res.status(500).json({
        error: "Error en la búsqueda",
        details: error.message,
      });
    }
  });
});

// --------------------------------------------------------------
// FUNCIONES AUXILIARES
// --------------------------------------------------------------

// Generar keywords para búsqueda
function generateKeywords(text) {
  const words = text.toLowerCase().split(/\s+/);
  const keywords = new Set();
  
  words.forEach(word => {
    if (word.length > 2) {
      // Agregar variaciones
      keywords.add(word);
      if (word.endsWith('s')) {
        keywords.add(word.slice(0, -1)); // singular
      }
      if (word.endsWith('es')) {
        keywords.add(word.slice(0, -2)); // singular
      }
    }
  });
  
  return Array.from(keywords);
}

// Enviar notificación por WhatsApp (Twilio)
async function sendWhatsAppNotification(phone, message) {
  try {
    // Configuración de Twilio (opcional)
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      logger.log(`[WhatsApp Simulado] Para: ${phone} - Mensaje: ${message}`);
      return;
    }

    const twilio = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    await twilio.messages.create({
      body: message,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${phone}`,
    });

    logger.log(`WhatsApp enviado a ${phone}`);

  } catch (error) {
    logger.error("Error enviando WhatsApp:", error);
    // No fallar la función principal por error en WhatsApp
  }
}

// Verificar firma de webhook (para producción)
function verifySignature(signature, payload) {
  // Implementar verificación de firma HMAC
  // Consulta documentación de Veriff: https://developers.veriff.com/#verifying-signatures
  return true; // Temporal para desarrollo
}

// --------------------------------------------------------------
// 9. ENDPOINT DE PRUEBA
// --------------------------------------------------------------
exports.testAPI = onRequest({ maxInstances: 10 }, (req, res) => {
  cors(req, res, () => {
    res.json({
      message: "✅ COLMENA HUB API funcionando",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      endpoints: {
        veriff: {
          createSession: "/createVeriffSession (POST)",
          checkStatus: "/getVeriffStatus?sessionId=XXX (GET)",
          webhook: "/veriffWebhook (POST)",
        },
        users: {
          checkDuplicates: "/checkDuplicates (POST)",
          detectRegistered: "/detectRegistered (GET)",
        },
        orders: {
          forceVerification: "/forceVerification (POST)",
        },
        workers: {
          search: "/searchWorkers (GET)",
        },
      },
    });
  });
});