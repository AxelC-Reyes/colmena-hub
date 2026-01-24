// veriff-config.js
// 📍 PON TU API KEY REAL AQUÍ
const VERIFF_CONFIG = {
  // ⚠️ CAMBIA ESTO POR TU API KEY REAL
  API_KEY: 'b04b260e-ae04-466b-85c8-f674ecbb09ac', // 📍 TU API KEY AQUÍ
  
  // Configuración
  HOST: 'https://stationapi.veriff.com', // Sandbox
  // HOST: 'https://api.veriff.com', // Producción
  
  // Tu URL de retorno (debe estar en lista blanca en dashboard)
  REDIRECT_URL: window.location.origin + '/veriff-callback.html',
  
  // Para desarrollo local
  IS_LOCALHOST: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1',
  
  // Para GitHub Pages
  IS_GITHUB_PAGES: window.location.hostname.includes('github.io'),
  
  // Logs
  DEBUG: true
};

// No exponer la API key en logs si está en producción
if (VERIFF_CONFIG.DEBUG) {
  console.log('🔧 Veriff Config:', { 
    ...VERIFF_CONFIG, 
    API_KEY: VERIFF_CONFIG.API_KEY ? '✅ Configurada' : '❌ Falta API Key' 
  });
}

// Función para iniciar Veriff
async function startVeriffVerification(userData, onSuccess, onError) {
  console.log('🚀 Iniciando Veriff con:', { 
    user: userData.email, 
    apiKey: VERIFF_CONFIG.API_KEY ? 'Presente' : 'Falta' 
  });
  
  // Validar API Key
  if (!VERIFF_CONFIG.API_KEY || VERIFF_CONFIG.API_KEY.includes('b04b260e-ae04-466b-85c8-f674ecbb09ac')) {
    const error = '❌ API Key de Veriff no configurada. Ve a dashboard.veriff.com';
    console.error(error);
    if (onError) onError(new Error(error));
    return null;
  }
  
  try {
    // 📍 PASO 1: Crear sesión en Veriff
    const sessionResponse = await createVeriffSession(userData);
    
    if (!sessionResponse || !sessionResponse.verification) {
      throw new Error('No se pudo crear sesión Veriff');
    }
    
    const { verification } = sessionResponse;
    
    // 📍 PASO 2: Redirigir al usuario a Veriff
    redirectToVeriff(verification.url);
    
    // Guardar ID de sesión en localStorage para recuperar después
    localStorage.setItem('veriff_session_id', verification.id);
    localStorage.setItem('veriff_user_id', userData.uid);
    
    return verification.id;
    
  } catch (error) {
    console.error('❌ Error Veriff:', error);
    if (onError) onError(error);
    
    // Fallback a simulación si hay error
    if (VERIFF_CONFIG.IS_LOCALHOST) {
      console.warn('⚠️ Modo localhost: usando simulación');
      simulateVeriffVerification(userData, onSuccess);
    }
    
    return null;
  }
}

// Crear sesión en Veriff API
async function createVeriffSession(userData) {
  const payload = {
    verification: {
      callback: VERIFF_CONFIG.REDIRECT_URL,
      person: {
        firstName: userData.firstName || userData.displayName?.split(' ')[0] || 'Usuario',
        lastName: userData.lastName || userData.displayName?.split(' ').slice(1).join(' ') || 'Test',
        idNumber: userData.idNumber || '',
        dateOfBirth: userData.dateOfBirth || '1990-01-01',
        email: userData.email
      },
      document: {
        type: 'ID_CARD',
        country: 'MX'
      },
      vendorData: JSON.stringify({
        userId: userData.uid,
        email: userData.email,
        timestamp: new Date().toISOString()
      }),
      lang: 'es'
    }
  };
  
  console.log('📤 Enviando a Veriff:', payload);
  
  const response = await fetch(`${VERIFF_CONFIG.HOST}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AUTH-CLIENT': VERIFF_CONFIG.API_KEY
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Veriff API error ${response.status}: ${errorText}`);
  }
  
  return await response.json();
}

// Redirigir a Veriff
function redirectToVeriff(veriffUrl) {
  console.log('🔗 Redirigiendo a:', veriffUrl);
  
  // Abrir en nueva ventana
  const veriffWindow = window.open(
    veriffUrl,
    'VeriffVerification',
    'width=800,height=600,scrollbars=yes,resizable=yes'
  );
  
  // Verificar si se bloqueó el popup
  if (!veriffWindow || veriffWindow.closed || typeof veriffWindow.closed === 'undefined') {
    alert('⚠️ Por favor permite ventanas emergentes para continuar con Veriff');
    // Fallback: redirigir en misma ventana
    window.location.href = veriffUrl;
  }
}

// Simulación para desarrollo
function simulateVeriffVerification(userData, onSuccess) {
  console.log('🎭 SIMULANDO Veriff para:', userData.email);
  
  // Mostrar modal de simulación
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
    align-items: center; justify-content: center;
  `;
  
  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 15px; max-width: 500px; text-align: center;">
      <h2 style="color: #4CAF50;">🎭 SIMULACIÓN VERIFF</h2>
      <p>En producción, esto abriría Veriff real.</p>
      <p>Usuario: <strong>${userData.email}</strong></p>
      <div style="margin: 20px 0;">
        <button id="simulate-success" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; margin: 5px; border-radius: 5px; cursor: pointer;">
          ✅ Simular éxito
        </button>
        <button id="simulate-failure" style="background: #f44336; color: white; border: none; padding: 10px 20px; margin: 5px; border-radius: 5px; cursor: pointer;">
          ❌ Simular fallo
        </button>
      </div>
      <p><small>Para Veriff real: obtén API Key en dashboard.veriff.com</small></p>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('simulate-success').addEventListener('click', () => {
    modal.remove();
    const verificationData = {
      id: 'simulated_' + Date.now(),
      status: 'approved',
      code: '9001',
      person: userData,
      document: { type: 'ID_CARD', country: 'MX' },
      timestamp: new Date().toISOString()
    };
    
    if (onSuccess) onSuccess(verificationData);
  });
  
  document.getElementById('simulate-failure').addEventListener('click', () => {
    modal.remove();
    alert('❌ Verificación fallida (simulación)');
  });
}

// Verificar estado de sesión
async function checkVeriffStatus(sessionId) {
  if (!sessionId) return null;
  
  try {
    const response = await fetch(`${VERIFF_CONFIG.HOST}/v1/sessions/${sessionId}`, {
      headers: {
        'X-AUTH-CLIENT': VERIFF_CONFIG.API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('❌ Error checking status:', error);
    return null;
  }
}

// Exportar funciones
window.VeriffSDK = {
  startVeriffVerification,
  checkVeriffStatus,
  simulateVeriffVerification,
  config: VERIFF_CONFIG
};