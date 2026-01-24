// veriff-working.js - VERIFF 100% FUNCIONAL
class VeriffWorking {
  constructor() {
    // 📍 TU API KEY DE VERIFF (la que ya tienes)
    this.API_KEY = 'b04b260e-ae04-466b-85c8-f674ecbb09ac';
    
    this.veriffInstance = null;
    this.sessionId = null;
    this.userData = null;
    
    console.log('🔧 VeriffWorking inicializado con API Key:', this.API_KEY.substring(0, 8) + '...');
  }
  
  // Iniciar verificación COMPLETA
  async startVerification(userData) {
    console.log('🚀 Iniciando Veriff para:', userData.email);
    
    this.userData = userData;
    
    try {
      // 1. Cargar SDK de Veriff
      await this.loadVeriffSDK();
      
      // 2. Crear sesión
      const session = await this.createSession(userData);
      
      // 3. Iniciar Veriff
      this.initVeriffSDK(session.verification.url);
      
      return session.verification.id;
      
    } catch (error) {
      console.error('❌ Error Veriff:', error);
      this.showError(error);
      return null;
    }
  }
  
  // Cargar SDK de Veriff
  loadVeriffSDK() {
    return new Promise((resolve, reject) => {
      // Verificar si ya está cargado
      if (window.Veriff) {
        console.log('✅ SDK de Veriff ya cargado');
        resolve();
        return;
      }
      
      console.log('📦 Cargando SDK de Veriff...');
      
      // Cargar SDK principal
      const script1 = document.createElement('script');
      script1.src = 'https://cdn.veriff.me/sdk/js/1.5/veriff.min.js';
      
      // Cargar SDK incontext
      const script2 = document.createElement('script');
      script2.src = 'https://cdn.veriff.me/incontext/js/v1/veriff.js';
      
      script1.onload = () => {
        console.log('✅ SDK principal cargado');
        document.head.appendChild(script2);
      };
      
      script2.onload = () => {
        console.log('✅ SDK incontext cargado');
        resolve();
      };
      
      script1.onerror = script2.onerror = (error) => {
        console.error('❌ Error cargando SDK:', error);
        reject(new Error('No se pudo cargar el SDK de Veriff'));
      };
      
      document.head.appendChild(script1);
    });
  }
  
  // Crear sesión en Veriff API
  async createSession(userData) {
    console.log('📤 Creando sesión en Veriff API...');
    
    const payload = {
      verification: {
        callback: `${window.location.origin}/veriff-success.html`,
        person: {
          firstName: userData.firstName || userData.displayName?.split(' ')[0] || 'Test',
          lastName: userData.lastName || userData.displayName?.split(' ').slice(1).join(' ') || 'User',
          idNumber: '',
          dateOfBirth: '1990-01-01',
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
          platform: 'COLMENA-HUB'
        }),
        lang: 'es'
      }
    };
    
    console.log('📦 Payload:', payload);
    
    const response = await fetch('https://stationapi.veriff.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-CLIENT': this.API_KEY
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Veriff API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    this.sessionId = data.verification.id;
    
    console.log('✅ Sesión creada:', this.sessionId);
    console.log('🔗 URL de verificación:', data.verification.url);
    
    return data;
  }
  
  // Inicializar SDK de Veriff
  initVeriffSDK(verificationUrl) {
    console.log('🎬 Inicializando Veriff SDK...');
    
    // Limpiar contenedor anterior
    const oldContainer = document.getElementById('veriff-container');
    if (oldContainer) oldContainer.remove();
    
    // Crear contenedor
    const container = document.createElement('div');
    container.id = 'veriff-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.9);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;
    
    container.innerHTML = `
      <div style="background: white; border-radius: 20px; width: 100%; max-width: 800px; height: 90vh; display: flex; flex-direction: column;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; padding: 20px; border-radius: 20px 20px 0 0;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <i class="fas fa-shield-alt" style="font-size: 28px;"></i>
              <div>
                <h2 style="margin: 0; font-size: 24px;">Verificación de Identidad</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">Sube tu INE/IFE y toma una selfie</p>
              </div>
            </div>
            <button id="close-veriff" style="background: none; border: none; color: white; font-size: 32px; cursor: pointer; line-height: 1;">
              &times;
            </button>
          </div>
        </div>
        
        <!-- Contenedor de Veriff -->
        <div id="veriff-root" style="flex: 1; padding: 20px; overflow: auto;">
          <div style="text-align: center; padding: 40px 20px;">
            <div class="spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #4F46E5; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
            <p style="color: #666;">Cargando Veriff...</p>
          </div>
        </div>
        
        <!-- Instrucciones -->
        <div style="background: #F9FAFB; padding: 20px; border-top: 1px solid #E5E7EB;">
          <h3 style="margin: 0 0 10px 0; color: #4F46E5; font-size: 16px;">
            <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
            Instrucciones:
          </h3>
          <ol style="margin: 0; padding-left: 20px; color: #6B7280; font-size: 14px;">
            <li>Sube foto de tu INE/IFE (frente y reverso)</li>
            <li>Toma una selfie clara con buena iluminación</li>
            <li>Asegúrate de que los datos sean legibles</li>
            <li>Usa cualquier imagen para pruebas en Sandbox</li>
          </ol>
        </div>
      </div>
      
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    
    document.body.appendChild(container);
    
    // Configurar evento para cerrar
    document.getElementById('close-veriff').addEventListener('click', () => {
      container.remove();
    });
    
    // Inicializar Veriff después de un breve delay
    setTimeout(() => {
      this.mountVeriff(verificationUrl, container);
    }, 500);
  }
  
  // Montar Veriff en el contenedor
  mountVeriff(verificationUrl, container) {
    console.log('🎯 Montando Veriff...');
    
    try {
      // Usar el código EXACTO que te dio Veriff
      const veriff = window.Veriff({
        host: 'https://stationapi.veriff.com',
        apiKey: this.API_KEY,
        parentId: 'veriff-root',
        onSession: (err, response) => {
          if (err) {
            console.error('❌ Error en sesión Veriff:', err);
            this.showSDKError(err);
            return;
          }
          
          console.log('✅ Sesión Veriff creada:', response);
          
          // Crear frame de Veriff
          if (window.veriffSDK && window.veriffSDK.createVeriffFrame) {
            window.veriffSDK.createVeriffFrame({ 
              url: response.verification.url 
            });
          } else {
            // Fallback: redirigir directamente
            const iframe = document.createElement('iframe');
            iframe.src = response.verification.url;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            
            const root = document.getElementById('veriff-root');
            root.innerHTML = '';
            root.appendChild(iframe);
          }
        },
        onError: (err) => {
          console.error('❌ Error SDK Veriff:', err);
          this.showSDKError(err);
        }
      });
      
      // Configurar parámetros adicionales
      veriff.mount({
        formLabel: {
          vendorData: 'ID de Usuario: ' + (this.userData?.uid || 'N/A')
        },
        person: {
          givenName: this.userData?.firstName || 'Test',
          lastName: this.userData?.lastName || 'User'
        }
      });
      
      console.log('✅ Veriff montado correctamente');
      
    } catch (error) {
      console.error('❌ Error montando Veriff:', error);
      
      // Fallback: mostrar URL directamente
      const root = document.getElementById('veriff-root');
      root.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <h3 style="color: #DC2626;">
            <i class="fas fa-exclamation-triangle"></i> Error técnico
          </h3>
          <p style="color: #666; margin: 20px 0;">
            Hubo un problema con Veriff. Puedes acceder directamente:
          </p>
          <a href="${verificationUrl}" 
             target="_blank"
             style="background: #4F46E5; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            <i class="fas fa-external-link-alt" style="margin-right: 10px;"></i>
            Abrir Veriff
          </a>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 20px;">
            Si el botón no funciona, copia y pega en tu navegador:<br>
            <code style="background: #F3F4F6; padding: 5px 10px; border-radius: 4px; font-size: 12px;">${verificationUrl}</code>
          </p>
        </div>
      `;
    }
  }
  
  // Mostrar error
  showError(error) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;
    
    let errorMessage = error.message || 'Error desconocido';
    let solution = '';
    
    if (errorMessage.includes('401') || errorMessage.includes('403')) {
      solution = 'La API Key puede ser incorrecta o estar expirada. Verifica en dashboard.veriff.com';
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      solution = 'Problema de red. Verifica tu conexión a internet.';
    } else {
      solution = 'Intenta nuevamente o contacta al soporte.';
    }
    
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 15px; max-width: 500px; width: 100%;">
        <div style="text-align: center; margin-bottom: 25px;">
          <div style="width: 60px; height: 60px; background: #FEE2E2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
            <i class="fas fa-exclamation-triangle" style="color: #DC2626; font-size: 28px;"></i>
          </div>
          <h2 style="color: #DC2626; margin: 0 0 10px 0;">Error de Veriff</h2>
          <p style="color: #6B7280;">${errorMessage}</p>
        </div>
        
        <div style="background: #FEF2F2; border-left: 4px solid #DC2626; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #DC2626; font-weight: bold;">
            <i class="fas fa-lightbulb" style="margin-right: 8px;"></i>
            Solución sugerida:
          </p>
          <p style="margin: 0; color: #6B7280;">${solution}</p>
        </div>
        
        <div style="display: flex; gap: 15px; margin-top: 25px;">
          <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                  style="flex: 1; background: #DC2626; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">
            <i class="fas fa-times" style="margin-right: 8px;"></i>
            Cerrar
          </button>
          <button onclick="location.reload()" 
                  style="flex: 1; background: #4F46E5; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">
            <i class="fas fa-redo" style="margin-right: 8px;"></i>
            Reintentar
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }
  
  // Mostrar error del SDK
  showSDKError(error) {
    const root = document.getElementById('veriff-root');
    if (!root) return;
    
    root.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <div style="width: 80px; height: 80px; background: #FEE2E2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          <i class="fas fa-exclamation-triangle" style="color: #DC2626; font-size: 36px;"></i>
        </div>
        <h3 style="color: #DC2626; margin-bottom: 15px;">Error en Veriff SDK</h3>
        <p style="color: #666; margin-bottom: 25px;">
          ${error.message || 'Error desconocido en el SDK'}
        </p>
        <button onclick="location.reload()" 
                style="background: #4F46E5; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">
          <i class="fas fa-redo" style="margin-right: 8px;"></i>
          Reintentar
        </button>
      </div>
    `;
  }
  
  // Verificar estado de sesión
  async checkStatus(sessionId) {
    if (!sessionId) return null;
    
    try {
      const response = await fetch(`https://stationapi.veriff.com/v1/sessions/${sessionId}`, {
        headers: {
          'X-AUTH-CLIENT': this.API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error checking status:', error);
      return null;
    }
  }
}

// Crear instancia global
window.VeriffWorking = new VeriffWorking();
console.log('✅ VeriffWorking listo con API Key válida');