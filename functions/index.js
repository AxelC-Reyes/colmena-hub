/**
 * Cloud Functions para COLMENA-HUB - VERSIÓN COMPLETA
 * Despliegue: firebase deploy --only functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
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
  BASE_URL: "https://stationapi.veriff.com",  // URL de SANDBOX
  IS_DEVELOPMENT: true  // ← Cambia a false para producción
};

// =============================================================
// FUNCIÓN 1: Crear sesión de verificación con Veriff
// =============================================================
exports.createVeriffSession = onCall({ maxInstances: 10 }, async (request) => {
  try {
    // Verificar autenticación
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Usuario no autenticado");
    }

    const userId = request.auth.uid;
    const userData = request.data;

    // Validar datos requeridos
    if (!userData.firstName || !userData.lastName || !userData.email) {
      throw new HttpsError("invalid-argument", "Nombre, apellido y email son requeridos");
    }

    // URL de callback - ¡IMPORTANTE! Cambia esto por tu URL real
    const callbackUrl = VERIFF_CONFIG.IS_DEVELOPMENT 
      ? "http://localhost:5000/veriff-callback.html"  // Para desarrollo local
      : "https://tu-dominio.com/veriff-callback.html"; // Para producción

    // Crear sesión en Veriff
    const response = await axios.post(
      `${VERIFF_CONFIG.BASE_URL}/v1/sessions`,
      {
        verification: {
          callback: callbackUrl,
          vendorData: userId,
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
      vendorData: userId,
      callbackUrl: callbackUrl
    });

    logger.info(`Sesión Veriff creada para ${userData.email}: ${verification.id}`);

    return {
      success: true,
      sessionId: verification.id,
      sessionUrl: verification.url,
      status: verification.status,
      callbackUrl: callbackUrl
    };

  } catch (error) {
    console.error("Error detallado Veriff:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    logger.error("Error creando sesión Veriff:", error.response?.data || error.message);
    
    throw new HttpsError(
      "internal", 
      "Error al crear sesión de verificación", 
      error.response?.data || error.message
    );
  }
});

// =============================================================
// FUNCIÓN 2: Webhook para recibir resultados de Veriff
// =============================================================
exports.veriffWebhook = onRequest({ maxInstances: 10 }, async (req, res) => {
  try {
    console.log("🔔 Webhook recibido de Veriff");

    // 1. Verificar firma del webhook
    const signature = req.headers["x-veriff-signature"];
    const payload = JSON.stringify(req.body);

    if (!signature) {
      console.error("❌ No signature in webhook");
      return res.status(400).json({ error: "No signature" });
    }

    // Verificar firma (solo en producción)
    if (!VERIFF_CONFIG.IS_DEVELOPMENT) {
      const expectedSignature = crypto
        .createHmac("sha256", VERIFF_CONFIG.WEBHOOK_SECRET)
        .update(payload)
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("❌ Firma inválida");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // 2. Procesar evento
    const event = req.body;
    console.log("📦 Evento recibido:", {
      id: event.verification?.id,
      status: event.verification?.status,
      timestamp: event.timestamp
    });

    const verificationId = event.verification?.id;
    const status = event.verification?.status; // 'approved', 'declined', 'expired'
    const vendorData = event.verification?.vendorData; // userId

    if (!verificationId || !status) {
      return res.status(400).json({ error: "Datos incompletos" });
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
    } else if (vendorData) {
      // Si fue rechazado o expiró
      await db.collection("users").doc(vendorData).update({
        verificationStatus: status,
        lastVerificationAttempt: admin.firestore.FieldValue.serverTimestamp()
      });
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
      throw new HttpsError("invalid-argument", "Session ID requerido");
    }

    // Primero buscar en Firestore
    const sessionDoc = await db.collection("veriff_sessions").doc(sessionId).get();
    
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data();
      
      // Si ya tenemos estado final, devolverlo
      if (sessionData.status && ["approved", "declined", "expired", "abandoned"].includes(sessionData.status)) {
        return {
          status: sessionData.status,
          sessionId: sessionId,
          fromCache: true,
          timestamp: sessionData.updatedAt?.toDate() || new Date(),
          userVerified: sessionData.status === "approved"
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
      timestamp: new Date(),
      userVerified: verification.status === "approved"
    };

  } catch (error) {
    console.error("Error obteniendo estado:", error.response?.data || error.message);
    
    // Si Veriff devuelve 404, la sesión puede no existir aún
    if (error.response?.status === 404) {
      return {
        status: "not_found",
        sessionId: request.data.sessionId,
        message: "Sesión no encontrada o aún no procesada"
      };
    }
    
    throw new HttpsError(
      "internal",
      "Error obteniendo estado de verificación",
      error.response?.data || error.message
    );
  }
});

// =============================================================
// FUNCIÓN 4: Detectar duplicados
// =============================================================
exports.checkDuplicates = onCall({ maxInstances: 10 }, async (request) => {
  try {
    const { ineNumber, phone, email } = request.data;
    
    if (!ineNumber && !phone && !email) {
      throw new HttpsError("invalid-argument", "Al menos un campo es requerido (INE, teléfono o email)");
    }

    const duplicates = [];

    // Buscar por INE
    if (ineNumber) {
      const ineQuery = await db.collection("users")
        .where("ineNumber", "==", ineNumber)
        .limit(1)
        .get();
      
      if (!ineQuery.empty) {
        const doc = ineQuery.docs[0];
        duplicates.push({ 
          type: "INE", 
          userId: doc.id,
          userData: doc.data()
        });
      }
    }

    // Buscar por teléfono
    if (phone) {
      const phoneQuery = await db.collection("users")
        .where("phone", "==", phone)
        .limit(1)
        .get();
      
      if (!phoneQuery.empty) {
        const doc = phoneQuery.docs[0];
        duplicates.push({ 
          type: "teléfono", 
          userId: doc.id,
          userData: doc.data()
        });
      }
    }

    // Buscar por email
    if (email) {
      const emailQuery = await db.collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();
      
      if (!emailQuery.empty) {
        const doc = emailQuery.docs[0];
        duplicates.push({ 
          type: "email", 
          userId: doc.id,
          userData: doc.data()
        });
      }
    }

    return {
      hasDuplicates: duplicates.length > 0,
      duplicates: duplicates,
      message: duplicates.length > 0 ? 
        "Usuario ya registrado" : 
        "No se encontraron duplicados",
      count: duplicates.length
    };

  } catch (error) {
    console.error("Error en checkDuplicates:", error);
    throw new HttpsError("internal", "Error verificando duplicados", error.message);
  }
});

// =============================================================
// FUNCIÓN 5: Buscar trabajadores/profesionales
// =============================================================
exports.searchWorkers = onCall({ maxInstances: 10 }, async (request) => {
  try {
    const { category, city, limit = 20, page = 1, minRating = 0, verifiedOnly = false } = request.data;
    
    if (!category || !city) {
      throw new HttpsError("invalid-argument", "Categoría y ciudad son requeridos");
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Buscar en colección 'professionals' o 'workers'
    let query = db.collection("professionals")
      .where("category", "==", category)
      .where("city", "==", city)
      .where("status", "==", "active");

    // Filtrar por rating mínimo
    if (minRating > 0) {
      query = query.where("rating", ">=", parseFloat(minRating));
    }

    // Filtrar solo verificados
    if (verifiedOnly) {
      query = query.where("verified", "==", true);
    }

    // Obtener total para paginación
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
      hasMore: (pageNum * limitNum) < total,
      results: results,
      search: {
        category: category,
        city: city,
        filters: {
          minRating: minRating,
          verifiedOnly: verifiedOnly
        }
      }
    };

  } catch (error) {
    console.error("Error buscando trabajadores:", error);
    throw new HttpsError("internal", "Error en la búsqueda", error.message);
  }
});

// =============================================================
// FUNCIÓN 6: Forzar verificación después de pago
// =============================================================
exports.forceVerification = onCall({ maxInstances: 10 }, async (request) => {
  try {
    const { userId, orderId } = request.data;
    
    if (!userId || !orderId) {
      throw new HttpsError("invalid-argument", "User ID y Order ID requeridos");
    }

    // Verificar si usuario ya está verificado
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "Usuario no encontrado");
    }

    const userData = userDoc.data();

    if (userData?.verified) {
      return {
        requiresVerification: false,
        message: "Usuario ya verificado",
        alreadyVerified: true,
        verificationDate: userData.verificationDate
      };
    }

    // Verificar si ya existe una verificación pendiente
    const existingVerification = await db.collection("pending_verifications")
      .where("userId", "==", userId)
      .where("orderId", "==", orderId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingVerification.empty) {
      const pending = existingVerification.docs[0].data();
      return {
        requiresVerification: true,
        message: "Ya existe una verificación pendiente",
        deadline: pending.deadline?.toDate().toISOString(),
        verificationUrl: pending.verificationUrl
      };
    }

    // Crear nuevo registro de verificación pendiente
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + 24); // 24 horas

    const verificationUrl = VERIFF_CONFIG.IS_DEVELOPMENT
      ? `http://localhost:5000/apply.html?order=${orderId}`
      : `https://colmena-hub.com/apply.html?order=${orderId}`;

    await db.collection("pending_verifications").doc(orderId).set({
      userId: userId,
      orderId: orderId,
      deadline: admin.firestore.Timestamp.fromDate(deadline),
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      verificationUrl: verificationUrl
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
      verificationUrl: verificationUrl,
      message: "Verificación requerida para completar la orden"
    };

  } catch (error) {
    console.error("Error en forceVerification:", error);
    throw new HttpsError("internal", "Error forzando verificación", error.message);
  }
});

// =============================================================
// FUNCIÓN 7: Detectar si ya está registrado
// =============================================================
exports.detectRegistered = onCall({ maxInstances: 10 }, async (request) => {
  try {
    const { email, phone } = request.data;
    
    if (!email && !phone) {
      throw new HttpsError("invalid-argument", "Email o teléfono requerido");
    }

    let userFound = null;
    let foundBy = null;

    if (email) {
      const emailQuery = await db.collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();
      
      if (!emailQuery.empty) {
        const doc = emailQuery.docs[0];
        userFound = {
          id: doc.id,
          ...doc.data()
        };
        foundBy = "email";
      }
    }

    if (!userFound && phone) {
      const phoneQuery = await db.collection("users")
        .where("phone", "==", phone)
        .limit(1)
        .get();
      
      if (!phoneQuery.empty) {
        const doc = phoneQuery.docs[0];
        userFound = {
          id: doc.id,
          ...doc.data()
        };
        foundBy = "phone";
      }
    }

    if (userFound) {
      return {
        registered: true,
        user: userFound,
        foundBy: foundBy,
        verified: userFound.verified || false,
        message: `Usuario encontrado por ${foundBy}`,
        nextStep: userFound.verified ? "login" : "verify"
      };
    }

    return {
      registered: false,
      message: "Usuario no registrado",
      canRegister: true
    };

  } catch (error) {
    console.error("Error en detectRegistered:", error);
    throw new HttpsError("internal", "Error detectando registro", error.message);
  }
});

// =============================================================
// FUNCIÓN 8: Test API - Salud del sistema
// =============================================================
exports.testAPI = onRequest({ maxInstances: 5 }, async (req, res) => {
  try {
    // Verificar conexión a Firestore
    const firestoreTest = await db.collection("health_checks").doc("test").set({
      test: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Verificar conexión a Veriff (si está configurado)
    let veriffStatus = "not_configured";
    if (VERIFF_CONFIG.API_KEY && VERIFF_CONFIG.API_KEY !== "95d2dbf2-2592-4089-860c-10243c087fa0") {
      try {
        const testResponse = await axios.get(`${VERIFF_CONFIG.BASE_URL}/v1/sessions/test`, {
          headers: {
            "X-AUTH-CLIENT": VERIFF_CONFIG.API_KEY
          },
          timeout: 5000
        });
        veriffStatus = testResponse.status === 200 ? "connected" : "error";
      } catch (veriffError) {
        veriffStatus = "connection_error";
      }
    }

    res.json({
      status: "operational",
      service: "COLMENA HUB API",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      services: {
        firestore: "connected",
        veriff: veriffStatus,
        environment: VERIFF_CONFIG.IS_DEVELOPMENT ? "sandbox" : "production"
      },
      endpoints: {
        createVeriffSession: "POST - Crea sesión de verificación",
        veriffWebhook: "POST - Recibe resultados de Veriff",
        getVeriffStatus: "GET - Consulta estado de verificación",
        checkDuplicates: "POST - Detecta duplicados",
        searchWorkers: "POST - Busca profesionales",
        forceVerification: "POST - Forza verificación post-pago",
        detectRegistered: "POST - Detecta usuario registrado",
        testAPI: "GET - Salud del sistema"
      },
      config: {
        veriff_configured: !!VERIFF_CONFIG.API_KEY && VERIFF_CONFIG.API_KEY !== "95d2dbf2-2592-4089-860c-10243c087fa0",
        node_version: process.version,
        firebase_sdk: "admin"
      }
    });

  } catch (error) {
    console.error("Error en testAPI:", error);
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

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
    
    // Solo crear índice si el perfil está activo
    if (data.status !== "active") {
      return;
    }

    // Crear documento en índice de búsqueda
    await db.collection("search_index").doc(event.params.userId).set({
      category: data.category,
      city: data.city,
      skills: data.skills || [],
      rating: data.rating || 0,
      verified: data.verified || false,
      experience: data.experience || 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      searchable: true,
      keywords: generateSearchKeywords(data)
    });

    console.log(`✅ Índice creado para profesional: ${event.params.userId}`);

  } catch (error) {
    console.error("❌ Error creando índice:", error);
  }
});

// =============================================================
// FUNCIÓN 10: Health Check para monitoreo
// =============================================================
exports.healthCheck = onRequest({ maxInstances: 5 }, async (req, res) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {},
    checks: []
  };

  try {
    // Check 1: Firestore
    const firestoreStart = Date.now();
    await db.collection("health_checks").doc("ping").set({
      ping: "pong",
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    const firestoreTime = Date.now() - firestoreStart;
    
    health.services.firestore = "connected";
    health.checks.push({
      service: "firestore",
      status: "healthy",
      responseTime: `${firestoreTime}ms`
    });

    // Check 2: Veriff API
    if (VERIFF_CONFIG.API_KEY && VERIFF_CONFIG.API_KEY !== "95d2dbf2-2592-4089-860c-10243c087fa0") {
      const veriffStart = Date.now();
      try {
        await axios.get(`${VERIFF_CONFIG.BASE_URL}/v1/sessions/health`, {
          headers: {
            "X-AUTH-CLIENT": VERIFF_CONFIG.API_KEY
          },
          timeout: 5000
        });
        const veriffTime = Date.now() - veriffStart;
        
        health.services.veriff = "connected";
        health.checks.push({
          service: "veriff",
          status: "healthy",
          responseTime: `${veriffTime}ms`
        });
      } catch (veriffError) {
        health.services.veriff = "unreachable";
        health.checks.push({
          service: "veriff",
          status: "unhealthy",
          error: veriffError.message
        });
        health.status = "degraded";
      }
    } else {
      health.services.veriff = "not_configured";
      health.checks.push({
        service: "veriff",
        status: "not_configured"
      });
    }

    res.json(health);

  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// =============================================================
// FUNCIONES AUXILIARES
// =============================================================

// Función para enviar email de verificación
async function sendVerificationEmail(email, name) {
  try {
    // En producción, implementar con nodemailer o SendGrid
    console.log(`📧 [Email Simulado] Verificación exitosa para ${name} (${email})`);
    
    // Guardar en Firestore para tracking
    await db.collection("email_logs").add({
      to: email,
      type: "verification_success",
      name: name,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "simulated"
    });
    
    return true;
  } catch (error) {
    console.error("Error enviando email:", error);
    return false;
  }
}

// Generar palabras clave para búsqueda
function generateSearchKeywords(data) {
  const keywords = new Set();
  
  // Agregar categoría y ciudad
  if (data.category) {
    keywords.add(data.category.toLowerCase());
    // Agregar variaciones
    const categoryWords = data.category.toLowerCase().split(/\s+/);
    categoryWords.forEach(word => {
      if (word.length > 2) keywords.add(word);
    });
  }
  
  if (data.city) {
    keywords.add(data.city.toLowerCase());
  }
  
  // Agregar habilidades
  if (data.skills && Array.isArray(data.skills)) {
    data.skills.forEach(skill => {
      if (skill && typeof skill === 'string') {
        keywords.add(skill.toLowerCase());
        const skillWords = skill.toLowerCase().split(/\s+/);
        skillWords.forEach(word => {
          if (word.length > 2) keywords.add(word);
        });
      }
    });
  }
  
  // Agregar título o descripción si existe
  if (data.title) {
    const titleWords = data.title.toLowerCase().split(/\s+/);
    titleWords.forEach(word => {
      if (word.length > 3) keywords.add(word);
    });
  }
  
  if (data.description) {
    const descWords = data.description.toLowerCase().split(/\s+/);
    descWords.forEach(word => {
      if (word.length > 4) keywords.add(word);
    });
  }
  
  return Array.from(keywords);
}

// Función para verificar firma de webhook
function verifyVeriffSignature(signature, payload, secret) {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');
    
    // Comparación segura contra timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("Error verificando firma:", error);
    return false;
  }
}