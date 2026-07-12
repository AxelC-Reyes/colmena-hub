// ============================================================
//  COLMENA HUB — Cloud Function: Proxy seguro para Veriff
//
//  INSTRUCCIONES DE DESPLIEGUE:
//  1. npm install -g firebase-tools
//  2. firebase login
//  3. firebase init functions  (en la raíz de tu proyecto)
//  4. Copia este archivo a functions/index.js
//  5. npm install --prefix functions node-fetch
//  6. firebase functions:secrets:set VERIFF_API_KEY
//     (cuando te pida el valor, pega: b04b260e-ae04-466b-85c8-f674ecbb09ac)
//  7. firebase deploy --only functions
//
//  Una vez desplegada, la URL será algo como:
//  https://us-central1-colmena-hub.cloudfunctions.net/createVeriffSession
// ============================================================

const functions = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const fetch = require("node-fetch");

// La API key vive en Secret Manager — nunca en el código fuente
const VERIFF_API_KEY = defineSecret("VERIFF_API_KEY");

exports.createVeriffSession = functions.onRequest(
    {secrets: [VERIFF_API_KEY], cors: ["https://colmena-hub.firebaseapp.com", "http://localhost:8000"]},
    async (req, res) => {
    // Solo POST
      if (req.method !== "POST") {
        return res.status(405).json({error: "Method not allowed"});
      }

      const {firstName, lastName, email, userId} = req.body;

      if (!firstName || !email || !userId) {
        return res.status(400).json({error: "Faltan campos requeridos"});
      }

      try {
        const payload = {
          verification: {
            callback: "https://colmena-hub.firebaseapp.com/veriff-success.html",
            person: {
              firstName,
              lastName: lastName || firstName,
              email,
            },
            document: {type: "ID_CARD", country: "MX"},
            vendorData: JSON.stringify({userId, platform: "COLMENA-HUB"}),
            lang: "es",
          },
        };

        const response = await fetch("https://stationapi.veriff.com/v1/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-AUTH-CLIENT": VERIFF_API_KEY.value(), // ← nunca llega al navegador
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const err = await response.text();
          console.error("Veriff API error:", err);
          return res.status(response.status).json({error: "Error en Veriff API"});
        }

        const data = await response.json();
        // Solo devolvemos lo que el frontend necesita
        return res.json({
          sessionId: data.verification.id,
          sessionUrl: data.verification.url,
        });
      } catch (error) {
        console.error("Error en proxy Veriff:", error);
        return res.status(500).json({error: "Error interno del servidor"});
      }
    },
);
