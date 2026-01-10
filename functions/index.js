/**
 * Cloud Functions para COLMENA-HUB - VERSIÓN COMPLETA
 * Despliegue: firebase deploy --only functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

// 1. INICIALIZAR FIREBASE
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// 2. CONFIGURACIÓN VERIFF (¡REEMPLAZA CON TUS DATOS REALES!)
const VERIFF_CONFIG = {
  API_KEY: "95d2dbf2-2592-4089-860c-10243c087fa0",  // ← Tu API Key pública de Veriff
  API_SECRET: "d714ef07-1674-4c0e-9363-aa0d522cd779",  // ← Tu API Secret
  WEBHOOK_SECRET: "whsec_xxxxxxxx",  // ← Webhook Signing Secret
  BASE_URL: "https://stationapi.veriff.com",  // URL de PRODUCCIÓN
  IS_DEVELOPMENT: false  // ← Cambia a false para producción
};

// =============================================================
// FUNCIÓN 1: Crear sesión de verificación con Veriff
// =============================================================
exports.createVeriffSession = onCall({ maxInstances: 10 }, async (request) => {
  try {
    // Verificar autenticación
    if (!request.auth) {
      throw new Error("No autenticado");
    }

    const userId = request.auth.uid;
    const userData = request.data;

    // Validar datos requeridos
    if (!userData.firstName || !userData.lastName || !userData.email) {
      throw new Error("Nombre, apellido y email son requeridos");
    }

    // Crear sesión en Veriff
    const response = await axios.post(
      `${VERIFF_CONFIG.BASE_URL}/v1/sessions`,
      {
        verification: {
          callback: "https://colmena-hub.com/veriff-callback",  // ← Tu dominio real
          vendorData: userId,  // IMPORTANTE: Vincular con usuario
          person: {
            firstName: userData.firstName,
            lastName: userData.lastName,
            idNumber: userData.idNumber || "",
            email: userData.email,
            phone: userData.phone || ""
          },
          document: {
            type: userData.documentType || "ID_CARD",
            country: userData.country || "MX"
          },
          lang: "es"
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-CLIENT": VERIFF_CONFIG.API_KEY
        },
        auth: {
          username: VERIFF_CONFIG.API_KEY,
          password: VERIFF_CONFIG.API_SECRET
        }
      }
    );

    const verification = response.data.verification;

    // Guardar en Firestore
    await db.collection("veriff_sessions").doc(verification.id).set({
      userId: userId,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      phone: userData.phone || "",
      sessionId: verification.id,
      status: "created",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionUrl: verification.url,
      vendorData: userId
    });

    logger.info(`Sesión Veriff creada para ${userData.email}: ${verification.id}`);

    return {
      success: true,
      sessionId: verification.id,
      sessionUrl: verification.url,
      status: verification.status
    };

  } catch (error) {
    logger.error("Error creando sesión Veriff:", error.response?.data || error.message);
    throw new Error(error.response?.data?.message || "Error al crear sesión de verificación");
  }
});

// =============================================================
// FUNCIÓN 2: Webhook para recibir resultados de Veriff (CRÍTICA)
// =============================================================
exports.veriffWebhook = onRequest({ maxInstances: 10 }, async (req, res) => {
  try {
    console.log("🔔 Webhook recibido de Veriff");

    // 1. Verificar firma del webhook
    const signature = req.headers["x-veriff-signature"];
    const payload = JSON.stringify(req.body);

    if (!signature) {
      console.error("❌ No signature in webhook");
      return res.status(400).send("No signature");
    }

    // Verificar firma (solo en producción)
    if (!VERIFF_CONFIG.IS_DEVELOPMENT) {
      const expectedSignature = crypto
        .createHmac("sha256", VERIFF_CONFIG.WEBHOOK_SECRET)
        .update(payload)
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("❌ Firma inválida");
        return res.status(401).send("Invalid signature");
      }
    }

    // 2. Procesar evento
    const event = req.body;
    console.log("📦 Evento:", {
      id: event.verification?.id,
      status: event.verification?.status,
      timestamp: event.timestamp
    });

    const verificationId = event.verification?.id;
    const status = event.verification?.status; // 'approved', 'declined', 'expired'
    const vendorData = event.verification?.vendorData; // userId

    if (!verificationId || !status) {
      return res.status(400).send("Datos incompletos");
    }

    // 3. Actualizar sesión en Firestore
    await db.collection("veriff_sessions").doc(verificationId).update({
      status: status,
      decision: event.decision || {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      webhookReceived: true,
      lastEvent: event
    });

    // 4. Si está aprobado, actualizar usuario
    if (status === "approved" && vendorData) {
      await db.collection("users").doc(vendorData).update({
        verified: true,
        veriffId: verificationId,
        verificationDate: admin.firestore.FieldValue.serverTimestamp(),
        verificationStatus: "approved",
        identityVerified: true,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Usuario ${vendorData} verificado exitosamente`);

      // Opcional: Enviar notificación por email
      const userDoc = await db.collection("users").doc(vendorData).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        await sendVerificationEmail(userData.email, userData.displayName || userData.firstName);
      }
    }

    // 5. Responder a Veriff
    res.status(200).json({ 
      success: true, 
      message: "Webhook procesado correctamente" 
    });

  } catch (error) {
    console.error("🔥 Error en webhook:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// =============================================================
// FUNCIÓN 3: Verificar estado de sesión
// =============================================================
exports.getVeriffStatus = onCall({ maxInstances: 10 }, async (request) => {
  try {
    const sessionId = request.data.sessionId;
    
    if (!sessionId) {
      throw new Error("Session ID requerido");
    }

    // Primero buscar en Firestore
    const sessionDoc = await db.collection("veriff_sessions").doc(sessionId).get();
    
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data();
      
      // Si ya tenemos estado final, devolverlo
      if (sessionData.status && ["approved", "declined", "expired"].includes(sessionData.status)) {
        return {
          status: sessionData.status,
          sessionId: sessionId,
          fromCache: true,
          timestamp: sessionData.updatedAt?.toDate() || new Date()
        };
      }
    }

    // Consultar a Veriff
    const response = await axios.get(
      `${VERIFF_CONFIG.BASE_URL}/v1/sessions/${sessionId}`,
      {
        auth: {
          username: VERIFF_CONFIG.API_KEY,
          password: VERIFF_CONFIG.API_SECRET
        }
      }
    );

    const verification = response.data.verification;

    // Actualizar Firestore
    await db.collection("veriff_sessions").doc(sessionId).update({
      status: verification.status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Si está aprobado, actualizar usuario
    if (verification.status === "approved" && verification.vendorData) {
      await db.collection("users").doc(verification.vendorData).update({
        verified: true,
        veriffId: sessionId,
        verificationDate: admin.firestore.FieldValue.serverTimestamp(),
        verificationStatus: "approved"
      });
    }

    return {
      status: verification.status,
      sessionId: sessionId,
      fromCache: false,
      timestamp: new Date()
    };

  } catch (error) {
    logger.error("Error obteniendo estado:", error.response?.data || error.message);
    throw new Error(error.response?.data?.message || "Error obteniendo estado");
  }
});

// =============================================================
// FUNCIÓN 4: Detectar duplicados
// =============================================================
exports.checkDuplicates = onCall({ maxInstances: 10 }, async (request) => {
  const { ineNumber, phone, email } = request.data;
  
  if (!ineNumber && !phone && !email) {
    throw new Error("Al menos un campo es requerido");
  }

  const duplicates = [];

  // Buscar por INE
  if (ineNumber) {
    const ineQuery = await db.collection("users")
      .where("ineNumber", "==", ineNumber)
      .limit(1)
      .get();
    
    if (!ineQuery.empty) {
      duplicates.push({ type: "INE", userId: ineQuery.docs[0].id });
    }
  }

  // Buscar por teléfono
  if (phone) {
    const phoneQuery = await db.collection("users")
      .where("phone", "==", phone)
      .limit(1)
      .get();
    
    if (!phoneQuery.empty) {
      duplicates.push({ type: "teléfono", userId: phoneQuery.docs[0].id });
    }
  }

  // Buscar por email
  if (email) {
    const emailQuery = await db.collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (!emailQuery.empty) {
      duplicates.push({ type: "email", userId: emailQuery.docs[0].id });
    }
  }

  return {
    hasDuplicates: duplicates.length > 0,
    duplicates: duplicates,
    message: duplicates.length > 0 ? 
      "Usuario ya registrado" : 
      "No se encontraron duplicados"
  };
});

// =============================================================
// FUNCIÓN 5: Buscar trabajadores
// =============================================================
exports.searchWorkers = onCall({ maxInstances: 10 }, async (request) => {
  const { category, city, limit = 20, page = 1 } = request.data;
  
  if (!category || !city) {
    throw new Error("Categoría y ciudad son requeridos");
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  // Buscar en colección 'professionals' o 'workers'
  let query = db.collection("professionals")
    .where("category", "==", category)
    .where("city", "==", city)
    .where("status", "==", "active");

  // Obtener total
  const countSnapshot = await query.get();
  const total = countSnapshot.size;

  // Aplicar paginación
  const snapshot = await query
    .orderBy("rating", "desc")
    .orderBy("createdAt", "desc")
    .offset(offset)
    .limit(limitNum)
    .get();

  const results = [];
  snapshot.forEach(doc => {
    results.push({
      id: doc.id,
      ...doc.data()
    });
  });

  return {
    success: true,
    total: total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    results: results,
    search: {
      category: category,
      city: city
    }
  };
});

// =============================================================
// FUNCIÓN 6: Forzar verificación después de pago
// =============================================================
exports.forceVerification = onCall({ maxInstances: 10 }, async (request) => {
  const { userId, orderId } = request.data;
  
  if (!userId || !orderId) {
    throw new Error("User ID y Order ID requeridos");
  }

  // Verificar si usuario ya está verificado
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  if (userData?.verified) {
    return {
      requiresVerification: false,
      message: "Usuario ya verificado",
      alreadyVerified: true
    };
  }

  // Crear record de verificación pendiente
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + 24); // 24 horas

  await db.collection("pending_verifications").doc(orderId).set({
    userId: userId,
    orderId: orderId,
    deadline: admin.firestore.Timestamp.fromDate(deadline),
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    verificationUrl: `https://colmena-hub.com/apply?order=${orderId}`
  });

  // Actualizar orden
  await db.collection("orders").doc(orderId).update({
    requiresVerification: true,
    verificationDeadline: admin.firestore.Timestamp.fromDate(deadline),
    verificationStatus: "pending"
  });

  return {
    requiresVerification: true,
    deadline: deadline.toISOString(),
    verificationUrl: `https://colmena-hub.com/apply?order=${orderId}`,
    message: "Verificación requerida para completar la orden"
  };
});

// =============================================================
// FUNCIÓN 7: Detectar si ya está registrado
// =============================================================
exports.detectRegistered = onCall({ maxInstances: 10 }, async (request) => {
  const { email, phone } = request.data;
  
  if (!email && !phone) {
    throw new Error("Email o teléfono requerido");
  }

  let userFound = null;

  if (email) {
    const emailQuery = await db.collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (!emailQuery.empty) {
      userFound = {
        id: emailQuery.docs[0].id,
        ...emailQuery.docs[0].data(),
        foundBy: "email"
      };
    }
  }

  if (!userFound && phone) {
    const phoneQuery = await db.collection("users")
      .where("phone", "==", phone)
      .limit(1)
      .get();
    
    if (!phoneQuery.empty) {
      userFound = {
        id: phoneQuery.docs[0].id,
        ...phoneQuery.docs[0].data(),
        foundBy: "phone"
      };
    }
  }

  return {
    registered: !!userFound,
    user: userFound,
    message: userFound ? 
      `Usuario encontrado por ${userFound.foundBy}` : 
      "Usuario no registrado"
  };
});

// =============================================================
// FUNCIÓN 8: Test API - Salud del sistema
// =============================================================
exports.testAPI = onRequest({ maxInstances: 5 }, async (req, res) => {
  res.json({
    status: "operational",
    service: "COLMENA HUB API",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      createVeriffSession: "Crea sesión de verificación",
      veriffWebhook: "Recibe resultados de Veriff",
      getVeriffStatus: "Consulta estado de verificación",
      checkDuplicates: "Detecta duplicados",
      searchWorkers: "Busca profesionales",
      forceVerification: "Forza verificación post-pago",
      detectRegistered: "Detecta usuario registrado"
    },
    veriff: {
      configured: !!VERIFF_CONFIG.API_KEY && VERIFF_CONFIG.API_KEY !== "95d-xxxxxxxxxxxx",
      mode: VERIFF_CONFIG.IS_DEVELOPMENT ? "development" : "production"
    }
  });
});

// =============================================================
// FUNCIÓN AUXILIAR: Enviar email de verificación
// =============================================================
async function sendVerificationEmail(email, name) {
  try {
    // En producción, implementar con nodemailer o SendGrid
    console.log(`📧 [Email Simulado] Verificación exitosa para ${name} (${email})`);
    return true;
  } catch (error) {
    console.error("Error enviando email:", error);
    return false;
  }
}

// =============================================================
// FUNCIÓN 9: Crear índice para trabajador (trigger)
// =============================================================
exports.createWorkerIndex = onDocumentCreated("professionals/{userId}", async (event) => {
  try {
    const snapshot = event.data;
    if (!snapshot.exists) {
      return;
    }

    const data = snapshot.data();
    
    // Crear documento en índice de búsqueda
    await db.collection("search_index").doc(event.params.userId).set({
      category: data.category,
      city: data.city,
      skills: data.skills || [],
      rating: data.rating || 0,
      verified: data.verified || false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      searchable: true
    });

    console.log(`Índice creado para profesional: ${event.params.userId}`);

  } catch (error) {
    console.error("Error creando índice:", error);
  }
});