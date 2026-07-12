// ============================================================
//  COLMENA HUB — Configuración central de Firebase
//  Incluye este archivo en TODOS los HTML antes de usarlo:
//  <script src="firebase-config.js"></script>
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAeLIJ8ee9xUBduMKkijW4GdnY45W32Eew",
  authDomain:        "colmena-hub.firebaseapp.com",
  projectId:         "colmena-hub",
  storageBucket:     "colmena-hub.firebasestorage.app",
  messagingSenderId: "806697924814",
  appId:             "1:806697924814:web:b11c9b057bc6d1dd71789f",
  measurementId:     "G-LQ9GLGJCX8"
};

// Inicializar una sola vez
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

// Exportar referencias globales
const Auth    = firebase.auth();
const DB      = firebase.firestore();
const Storage = firebase.storage();

// ── Utilidades globales compartidas ──────────────────────────

/** Muestra una barra de estado temporal en la parte superior */
function showStatus(message, type = 'info') {
  let bar = document.getElementById('statusBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'statusBar';
    bar.style.cssText = [
      'position:fixed','top:0','left:0','right:0','z-index:9999',
      'padding:10px 20px','text-align:center','font-size:14px',
      'font-weight:600','transition:opacity .3s','display:none'
    ].join(';');
    document.body.prepend(bar);
  }

  const themes = {
    success: { bg: '#10B981', color: '#fff' },
    error:   { bg: '#EF4444', color: '#fff' },
    warning: { bg: '#F59E0B', color: '#78350f' },
    info:    { bg: '#3B82F6', color: '#fff' }
  };
  const t = themes[type] || themes.info;
  bar.style.background = t.bg;
  bar.style.color       = t.color;
  bar.textContent       = message;
  bar.style.display     = 'block';
  bar.style.opacity     = '1';

  if (type !== 'error') {
    setTimeout(() => {
      bar.style.opacity = '0';
      setTimeout(() => { bar.style.display = 'none'; }, 300);
    }, 3000);
  }
}

/** Devuelve el usuario actual o null */
function currentUser() {
  return Auth.currentUser;
}

/** Redirecciona a index.html si no hay sesión activa */
function requireAuth(redirectTo = 'index.html') {
  return new Promise(resolve => {
    Auth.onAuthStateChanged(user => {
      if (!user) {
        window.location.href = redirectTo;
      } else {
        resolve(user);
      }
    });
  });
}

/** Guarda o actualiza un documento en Firestore con merge */
async function saveDoc(collection, docId, data) {
  return DB.collection(collection).doc(docId).set(
    { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/** Lee un documento de Firestore. Devuelve null si no existe. */
async function getDoc(collection, docId) {
  const snap = await DB.collection(collection).doc(docId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

console.log('✅ COLMENA HUB — Firebase config cargado correctamente');