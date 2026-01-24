// veriff-real.js - Implementación REAL de Veriff
const VERIFF_REAL_CONFIG = {
  // 📍📍📍 PEGA TU API KEY AQUÍ
  API_KEY: '6a4c5b3d-8e9f-4a7b-9c8d-1e2f3a4b5c6d', // <-- TU API KEY
  
  // Sandbox para pruebas (cambia a producción después)
  BASE_URL: 'https://stationapi.veriff.com/v1',
  
  // Tu callback URL (ajusta según tu dominio)
  CALLBACK_URL: window.location.origin + '/veriff-callback.html',
  
  // Debug
  DEBUG: true,
  
  // Métodos disponibles
  METHODS: {
    CREATE_SESSION: 'sessions',
    GET_SESSION: 'sessions/{sessionId}'
  }
};

// Verificar configuración
console.log('🔧 Veriff REAL configurado:', {
  hasApiKey: !!VERIFF_REAL_CONFIG.API_KEY && VERIFF_REAL_CONFIG.API_KEY !== '6a4c5b3d-8e9f-4a7b-9c8d-1e2f3a4b5c6d',
  baseUrl: VERIFF_REAL_CONFIG.BASE_URL,
  callbackUrl: VERIFF_REAL_CONFIG.CALLBACK_URL
});

// Función para crear sesión en Veriff
async function createVeriffSession(userData) {
  console.log('🚀 Creando sesión Veriff para:', userData.email);
  
  // Validar API Key
  if (!VERIFF_REAL_CONFIG.API_KEY || VERIFF_REAL_CONFIG.API_KEY === '6a4c5b3d-8e9f-4a7b-9c8d-1e2f3a4b5c6d') {
    throw new Error('❌ API Key de Veriff no configurada. Obtén una en dashboard.veriff.com');
  }
  
  // Preparar payload
  const payload = {
    verification: {
      callback: VERIFF_REAL_CONFIG.CALLBACK_URL,
      person: {
        firstName: userData.firstName || userData.displayName?.split(' ')[0] || 'Test',
        lastName: userData.lastName || userData.displayName?.split(' ').slice(1).join(' ') || 'User',
        idNumber: '',
        dateOfBirth: '1990-01-01', // Fecha por defecto para pruebas
        email: userData.email
      },
      document: {
        type: 'ID_CARD',
        country: 'MX'
      },
      vendorData: JSON.stringify({
        userId: userData.uid,
        email: userData.email,
        timestamp: new Date().toISOString(),
        source: 'COLMENA-HUB'
      }),
      lang: 'es'
    }
  };
  
  if (VERIFF_REAL_CONFIG.DEBUG) {
    console.log('📤 Payload Veriff:', JSON.stringify(payload, null, 2));
  }
  
  try {
    // Llamar API de Veriff
    const response = await fetch(`${VERIFF_REAL_CONFIG.BASE_URL}/${VERIFF_REAL_CONFIG.METHODS.CREATE_SESSION}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-CLIENT': VERIFF_REAL_CONFIG.API_KEY
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Veriff API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (VERIFF_REAL_CONFIG.DEBUG) {
      console.log('✅ Respuesta Veriff:', data);
    }
    
    return data;
    
  } catch (error) {
    console.error('❌ Error creando sesión Veriff:', error);
    throw error;
  }
}

// Función para iniciar verificación
async function startRealVeriffVerification(userData, onSuccess, onError) {
  try {
    // 1. Crear sesión en Veriff
    const sessionData = await createVeriffSession(userData);
    
    if (!sessionData || !sessionData.verification) {
      throw new Error('No se pudo crear sesión en Veriff');
    }
    
    const { verification } = sessionData;
    
    // 2. Guardar datos en localStorage
    localStorage.setItem('veriff_session_id', verification.id);
    localStorage.setItem('veriff_user_id', userData.uid);
    localStorage.setItem('veriff_user_email', userData.email);
    
    // 3. Mostrar modal de confirmación
    showVeriffRedirectModal(verification.url, verification.id, userData);
    
    // 4. Retornar ID de sesión
    return verification.id;
    
  } catch (error) {
    console.error('❌ Error en Veriff:', error);
    
    // Fallback a simulación
    if (onError) {
      onError(error);
    }
    
    // Mostrar error amigable
    showVeriffError(error);
    
    return null;
  }
}

// Mostrar modal para redirigir a Veriff
function showVeriffRedirectModal(veriffUrl, sessionId, userData) {
  const modal = document.createElement('div');
  modal.id = 'veriff-redirect-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.9); z-index: 10000; display: flex;
    align-items: center; justify-content: center; padding: 20px;
  `;
  
  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 15px; max-width: 500px; width: 100%; text-align: center;">
      <div style="background: #4F46E5; color: white; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
        <i class="fas fa-shield-alt" style="font-size: 40px; margin-bottom: 10px;"></i>
        <h2 style="margin: 0; font-size: 24px;">Verificación de Identidad</h2>
      </div>
      
      <div style="text-align: left; margin: 20px 0;">
        <p><strong>📋 Proceso:</strong></p>
        <ol style="margin-left: 20px;">
          <li>Subirás foto de tu INE/IFE</li>
          <li>Tomarás una selfie</li>
          <li>Veriff validará que coincidan</li>
          <li>¡Listo! Tu identidad estará verificada</li>
        </ol>
      </div>
      
      <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #666;">
          <i class="fas fa-user" style="margin-right: 8px;"></i>
          <strong>Usuario:</strong> ${userData.email}
        </p>
        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
          <i class="fas fa-key" style="margin-right: 8px;"></i>
          <strong>Sesión:</strong> ${sessionId.substring(0, 12)}...
        </p>
      </div>
      
      <div style="margin: 25px 0;">
        <a href="${veriffUrl}" target="_blank" 
           style="background: #4F46E5; color: white; padding: 15px 30px; 
                  border-radius: 8px; text-decoration: none; font-weight: bold;
                  display: inline-block; margin-bottom: 10px;">
          <i class="fas fa-external-link-alt" style="margin-right: 10px;"></i>
          Abrir Veriff en nueva ventana
        </a>
        <p style="font-size: 12px; color: #666; margin-top: 10px;">
          Si no se abre automáticamente, haz clic en el enlace
        </p>
      </div>
      
      <div style="border-top: 1px solid #E5E7EB; padding-top: 20px;">
        <button id="close-veriff-modal" 
                style="background: #6B7280; color: white; border: none; 
                       padding: 10px 20px; border-radius: 5px; cursor: pointer;">
          <i class="fas fa-times" style="margin-right: 8px;"></i>
          Cerrar
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Abrir Veriff automáticamente
  setTimeout(() => {
    const veriffWindow = window.open(
      veriffUrl,
      'VeriffVerification',
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );
    
    // Verificar si se abrió
    if (!veriffWindow) {
      alert('⚠️ Por favor permite ventanas emergentes para continuar con Veriff');
    }
  }, 1000);
  
  // Cerrar modal
  document.getElementById('close-veriff-modal').addEventListener('click', () => {
    modal.remove();
  });
}

// Mostrar error de Veriff
function showVeriffError(error) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); z-index: 10000; display: flex;
    align-items: center; justify-content: center; padding: 20px;
  `;
  
  let errorMessage = error.message || 'Error desconocido';
  let errorType = 'Error técnico';
  
  if (errorMessage.includes('API Key')) {
    errorType = 'Configuración requerida';
    errorMessage = 'Necesitas obtener una API Key de Veriff en dashboard.veriff.com';
  } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
    errorType = 'Acceso denegado';
    errorMessage = 'API Key incorrecta o expirada. Verifica en dashboard.veriff.com';
  }
  
  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 15px; max-width: 500px; width: 100%; text-align: center;">
      <div style="color: #DC2626; margin-bottom: 20px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 50px;"></i>
        <h2 style="margin: 10px 0; color: #DC2626;">${errorType}</h2>
      </div>
      
      <p style="margin: 20px 0; color: #4B5563;">${errorMessage}</p>
      
      <div style="background: #FEF2F2; border-left: 4px solid #DC2626; padding: 15px; margin: 20px 0; text-align: left;">
        <p style="margin: 0 0 10px 0; color: #DC2626; font-weight: bold;">
          <i class="fas fa-wrench" style="margin-right: 8px;"></i>
          Solución:
        </p>
        <ol style="margin: 0; padding-left: 20px; color: #6B7280;">
          <li>Regístrate en <a href="https://dashboard.veriff.com" target="_blank" style="color: #4F46E5;">dashboard.veriff.com</a></li>
          <li>Crea una API Key en Sandbox</li>
          <li>Copia la API Key en veriff-real.js</li>
          <li>Añade <code>${window.location.origin}</code> a dominios permitidos</li>
        </ol>
      </div>
      
      <div style="margin-top: 25px;">
        <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                style="background: #DC2626; color: white; border: none; 
                       padding: 12px 24px; border-radius: 5px; cursor: pointer; font-weight: bold;">
          <i class="fas fa-times" style="margin-right: 8px;"></i>
          Entendido
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// Función para verificar estado de sesión
async function checkVeriffStatus(sessionId) {
  if (!sessionId) return null;
  
  try {
    const response = await fetch(
      `${VERIFF_REAL_CONFIG.BASE_URL}/${VERIFF_REAL_CONFIG.METHODS.GET_SESSION.replace('{sessionId}', sessionId)}`,
      {
        headers: {
          'X-AUTH-CLIENT': VERIFF_REAL_CONFIG.API_KEY
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('❌ Error verificando estado:', error);
    return null;
  }
}

// Función para procesar callback
async function processVeriffCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session') || localStorage.getItem('veriff_session_id');
  
  if (!sessionId) {
    console.warn('No session ID found in callback');
    return null;
  }
  
  try {
    const status = await checkVeriffStatus(sessionId);
    return status;
  } catch (error) {
    console.error('Error processing callback:', error);
    return null;
  }
}

// Exportar API
window.VeriffReal = {
  startVeriffVerification: startRealVeriffVerification,
  checkVeriffStatus,
  processVeriffCallback,
  config: VERIFF_REAL_CONFIG
};

console.log('✅ Veriff REAL SDK cargado');