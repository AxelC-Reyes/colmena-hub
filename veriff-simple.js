// veriff-simple.js - VERIFF FUNCIONANDO AL 100%
class VeriffSimple {
  constructor() {
    // 📍📍📍 PON TU API KEY DE VERIFF AQUÍ
    this.API_KEY = '88259bad-33fd-4863-97f0-48a896dc3f08'; // <-- REEMPLAZA ESTO
    
    // URLs de Veriff
    this.BASE_URL = 'https://stationapi.veriff.com';
    this.WEB_SDK_URL = 'https://cdn.veriff.me/v2/veriff.js';
    
    // Estados
    this.sessionId = null;
    this.userData = null;
    
    console.log('🔧 VeriffSimple inicializado');
  }
  
  // Verificar si tenemos API Key válida
  hasValidApiKey() {
    return this.API_KEY && 
           this.API_KEY !== '6a4c5b3d-8e9f-4a7b-9c8d-1e2f3a4b5c6d' &&
           this.API_KEY.length > 30;
  }
  
  // Iniciar verificación COMPLETA
  async startVerification(userData) {
    console.log('🚀 Iniciando verificación Veriff para:', userData.email);
    
    if (!this.hasValidApiKey()) {
      return this.showApiKeyError();
    }
    
    try {
      // 1. Crear sesión en Veriff
      const session = await this.createSession(userData);
      
      // 2. Mostrar modal con SDK de Veriff
      this.showVeriffModal(session.verification.url, userData);
      
      return session.verification.id;
      
    } catch (error) {
      console.error('❌ Error Veriff:', error);
      this.showErrorModal(error);
      return null;
    }
  }
  
  // Crear sesión en Veriff API
  async createSession(userData) {
    this.userData = userData;
    
    const payload = {
      verification: {
        callback: `${window.location.origin}/veriff-callback.html`,
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
          timestamp: new Date().toISOString()
        }),
        lang: 'es',
        features: ['selfid', 'document', 'face']
      }
    };
    
    console.log('📤 Creando sesión Veriff...');
    
    const response = await fetch(`${this.BASE_URL}/sessions`, {
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
    return data;
  }
  
  // Mostrar modal con Veriff
  showVeriffModal(veriffUrl, userData) {
    // Remover modal existente
    const existingModal = document.getElementById('veriff-simple-modal');
    if (existingModal) existingModal.remove();
    
    // Crear modal
    const modal = document.createElement('div');
    modal.id = 'veriff-simple-modal';
    modal.innerHTML = this.getModalHTML(veriffUrl, userData);
    document.body.appendChild(modal);
    
    // Configurar eventos
    this.setupModalEvents(veriffUrl);
    
    // Cargar SDK de Veriff
    this.loadVeriffSDK(veriffUrl);
  }
  
  getModalHTML(veriffUrl, userData) {
    return `
      <div class="veriff-modal-overlay">
        <div class="veriff-modal">
          <!-- Header -->
          <div class="veriff-header">
            <div class="veriff-logo">
              <i class="fas fa-shield-alt"></i>
              <span>VERIFF</span>
            </div>
            <button class="veriff-close">&times;</button>
          </div>
          
          <!-- Contenido principal -->
          <div class="veriff-content">
            <h2>Verificación de Identidad</h2>
            <p class="veriff-subtitle">Para continuar, necesitamos verificar tu identidad</p>
            
            <!-- Pasos -->
            <div class="veriff-steps">
              <div class="step active">
                <div class="step-number">1</div>
                <div class="step-text">Sube foto de tu INE/IFE</div>
              </div>
              <div class="step">
                <div class="step-number">2</div>
                <div class="step-text">Toma una selfie</div>
              </div>
              <div class="step">
                <div class="step-number">3</div>
                <div class="step-text">Verificación automática</div>
              </div>
            </div>
            
            <!-- Info usuario -->
            <div class="user-info">
              <div class="user-avatar">
                <i class="fas fa-user"></i>
              </div>
              <div class="user-details">
                <div class="user-name">${userData.displayName || 'Usuario'}</div>
                <div class="user-email">${userData.email}</div>
              </div>
            </div>
            
            <!-- Contenedor Veriff -->
            <div id="veriff-container"></div>
            
            <!-- Botones -->
            <div class="veriff-buttons">
              <button id="start-veriff" class="btn-primary">
                <i class="fas fa-play"></i> Comenzar Verificación
              </button>
              <button id="simulate-veriff" class="btn-secondary">
                <i class="fas fa-magic"></i> Simular (Pruebas)
              </button>
            </div>
            
            <!-- Nota -->
            <div class="veriff-note">
              <i class="fas fa-info-circle"></i>
              <span>En Sandbox puedes subir cualquier imagen para pruebas</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  setupModalEvents(veriffUrl) {
    // Cerrar modal
    document.querySelector('.veriff-close').addEventListener('click', () => {
      document.getElementById('veriff-simple-modal').remove();
    });
    
    // Comenzar verificación real
    document.getElementById('start-veriff').addEventListener('click', () => {
      this.openVeriffWindow(veriffUrl);
    });
    
    // Simular verificación
    document.getElementById('simulate-veriff').addEventListener('click', () => {
      this.simulateVerification();
    });
  }
  
  loadVeriffSDK(veriffUrl) {
    if (document.getElementById('veriff-sdk')) return;
    
    const script = document.createElement('script');
    script.id = 'veriff-sdk';
    script.src = this.WEB_SDK_URL;
    script.onload = () => {
      console.log('✅ SDK de Veriff cargado');
      this.initializeVeriffSDK(veriffUrl);
    };
    script.onerror = () => {
      console.warn('⚠️ No se pudo cargar SDK de Veriff');
      document.getElementById('start-veriff').textContent = 'Abrir Verificación';
    };
    
    document.head.appendChild(script);
  }
  
  initializeVeriffSDK(veriffUrl) {
    try {
      const veriff = window.Veriff({
        host: 'https://stationapi.veriff.com',
        apiKey: this.API_KEY,
        parentId: 'veriff-container',
        onSession: (err, response) => {
          if (err) {
            console.error('Error SDK Veriff:', err);
            return;
          }
          console.log('✅ Sesión SDK iniciada:', response);
        }
      });
      
      veriff.mount();
      
    } catch (error) {
      console.warn('⚠️ Error inicializando SDK:', error);
    }
  }
  
  openVeriffWindow(veriffUrl) {
    const width = 800;
    const height = 600;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    
    const veriffWindow = window.open(
      veriffUrl,
      'VeriffVerification',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );
    
    if (!veriffWindow) {
      alert('⚠️ Por favor permite ventanas emergentes para continuar con Veriff');
      // Fallback: redirigir en misma ventana
      window.location.href = veriffUrl;
    } else {
      // Cerrar modal
      document.getElementById('veriff-simple-modal').remove();
      
      // Monitorear ventana
      this.monitorVeriffWindow(veriffWindow);
    }
  }
  
  monitorVeriffWindow(veriffWindow) {
    const checkInterval = setInterval(() => {
      if (veriffWindow.closed) {
        clearInterval(checkInterval);
        console.log('✅ Ventana de Veriff cerrada');
        
        // Verificar estado después de cerrar
        setTimeout(() => {
          this.checkVerificationStatus();
        }, 2000);
      }
    }, 1000);
  }
  
  async checkVerificationStatus() {
    if (!this.sessionId) return;
    
    try {
      const response = await fetch(`${this.BASE_URL}/sessions/${this.sessionId}`, {
        headers: {
          'X-AUTH-CLIENT': this.API_KEY
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Estado Veriff:', data.verification?.status);
        
        if (data.verification?.status === 'approved') {
          this.showSuccessModal();
        }
      }
    } catch (error) {
      console.warn('⚠️ Error verificando estado:', error);
    }
  }
  
  simulateVerification() {
    console.log('🎭 Simulando verificación...');
    
    // Mostrar simulador
    const modal = document.getElementById('veriff-simple-modal');
    modal.querySelector('.veriff-content').innerHTML = `
      <h2>Simulador de Verificación</h2>
      <p class="veriff-subtitle">Para pruebas de desarrollo</p>
      
      <div class="simulator">
        <div class="sim-step">
          <div class="sim-icon">
            <i class="fas fa-id-card"></i>
          </div>
          <h3>Paso 1: Subir INE/IFE</h3>
          <p>Sube cualquier imagen como prueba</p>
          <input type="file" id="doc-upload" accept="image/*" class="sim-file">
        </div>
        
        <div class="sim-step">
          <div class="sim-icon">
            <i class="fas fa-camera"></i>
          </div>
          <h3>Paso 2: Tomar Selfie</h3>
          <p>Usa tu cámara o sube una foto</p>
          <input type="file" id="selfie-upload" accept="image/*" class="sim-file">
          <button id="use-webcam" class="sim-btn">
            <i class="fas fa-video"></i> Usar Cámara
          </button>
        </div>
        
        <div class="sim-step">
          <div class="sim-icon">
            <i class="fas fa-check-circle"></i>
          </div>
          <h3>Paso 3: Verificar</h3>
          <p>Simularemos la verificación automática</p>
          <button id="simulate-verify" class="sim-btn-primary">
            <i class="fas fa-check"></i> Simular Verificación Exitosa
          </button>
        </div>
      </div>
      
      <div class="simulator-buttons">
        <button id="back-to-real" class="btn-secondary">
          <i class="fas fa-arrow-left"></i> Volver a Veriff Real
        </button>
      </div>
    `;
    
    // Configurar eventos del simulador
    document.getElementById('simulate-verify').addEventListener('click', () => {
      this.completeSimulation();
    });
    
    document.getElementById('back-to-real').addEventListener('click', () => {
      this.showVeriffModal('', this.userData);
    });
    
    // Configurar cámara web
    document.getElementById('use-webcam').addEventListener('click', () => {
      this.startWebcam();
    });
  }
  
  startWebcam() {
    const video = document.createElement('video');
    video.autoplay = true;
    
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        video.srcObject = stream;
        
        const cameraModal = document.createElement('div');
        cameraModal.innerHTML = `
          <div class="camera-modal">
            <div class="camera-header">
              <h3>Toma tu selfie</h3>
              <button class="close-camera">&times;</button>
            </div>
            <div class="camera-preview">
              <video id="webcam-preview" autoplay></video>
            </div>
            <div class="camera-controls">
              <button id="capture-photo" class="btn-primary">
                <i class="fas fa-camera"></i> Capturar Foto
              </button>
              <button id="cancel-camera" class="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        `;
        
        document.body.appendChild(cameraModal);
        
        // Configurar eventos
        document.getElementById('capture-photo').addEventListener('click', () => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0);
          
          // Detener cámara
          stream.getTracks().forEach(track => track.stop());
          
          cameraModal.remove();
          alert('✅ Foto capturada (simulación)');
        });
        
        document.querySelector('.close-camera').addEventListener('click', () => {
          stream.getTracks().forEach(track => track.stop());
          cameraModal.remove();
        });
        
        document.getElementById('cancel-camera').addEventListener('click', () => {
          stream.getTracks().forEach(track => track.stop());
          cameraModal.remove();
        });
      })
      .catch(error => {
        console.error('Error cámara:', error);
        alert('⚠️ No se pudo acceder a la cámara');
      });
  }
  
  completeSimulation() {
    console.log('✅ Simulación completada');
    
    // Mostrar éxito
    const modal = document.getElementById('veriff-simple-modal');
    modal.querySelector('.veriff-content').innerHTML = `
      <div class="success-screen">
        <div class="success-icon">
          <i class="fas fa-check-circle"></i>
        </div>
        <h2>¡Verificación Exitosa!</h2>
        <p class="success-message">Tu identidad ha sido verificada correctamente.</p>
        
        <div class="success-details">
          <div class="detail">
            <i class="fas fa-user-check"></i>
            <span>Identidad confirmada</span>
          </div>
          <div class="detail">
            <i class="fas fa-shield-alt"></i>
            <span>Verificación: Sandbox</span>
          </div>
          <div class="detail">
            <i class="fas fa-clock"></i>
            <span>${new Date().toLocaleTimeString()}</span>
          </div>
        </div>
        
        <button id="close-success" class="btn-primary">
          <i class="fas fa-check"></i> Continuar en COLMENA HUB
        </button>
      </div>
    `;
    
    document.getElementById('close-success').addEventListener('click', () => {
      modal.remove();
      
      // Notificar éxito a la página principal
      if (window.opener) {
        window.opener.postMessage({ type: 'veriff_success', simulation: true }, '*');
      }
      
      // Actualizar Firebase si está disponible
      if (window.firebase && this.userData) {
        this.updateFirebaseVerification();
      }
    });
  }
  
  updateFirebaseVerification() {
    if (!window.firebase || !this.userData) return;
    
    try {
      const db = firebase.firestore();
      db.collection('users').doc(this.userData.uid).update({
        verified: true,
        verificationDate: firebase.firestore.FieldValue.serverTimestamp(),
        verificationMethod: 'veriff_sandbox_simulated',
        veriffSessionId: this.sessionId || 'simulated'
      });
      
      console.log('✅ Firebase actualizado');
    } catch (error) {
      console.warn('⚠️ Error actualizando Firebase:', error);
    }
  }
  
  showSuccessModal() {
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div class="veriff-success-overlay">
        <div class="veriff-success-modal">
          <div class="success-content">
            <i class="fas fa-check-circle"></i>
            <h2>¡Verificación Completa!</h2>
            <p>Veriff ha verificado tu identidad exitosamente.</p>
            <button class="btn-primary">Continuar</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('button').addEventListener('click', () => {
      modal.remove();
      location.reload();
    });
  }
  
  showApiKeyError() {
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div class="veriff-error-overlay">
        <div class="veriff-error-modal">
          <div class="error-content">
            <i class="fas fa-key"></i>
            <h2>API Key Requerida</h2>
            <p>Para usar Veriff, necesitas una API Key.</p>
            
            <div class="error-steps">
              <p><strong>Pasos:</strong></p>
              <ol>
                <li>Regístrate en <a href="https://dashboard.veriff.com" target="_blank">dashboard.veriff.com</a></li>
                <li>Crea una API Key en Sandbox</li>
                <li>Copia la API Key</li>
                <li>Pégala en <code>veriff-simple.js</code> línea 4</li>
              </ol>
            </div>
            
            <div class="error-buttons">
              <button id="use-simulator" class="btn-primary">
                <i class="fas fa-magic"></i> Usar Simulador
              </button>
              <button id="close-error" class="btn-secondary">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('use-simulator').addEventListener('click', () => {
      modal.remove();
      this.simulateVerification();
    });
    
    document.getElementById('close-error').addEventListener('click', () => {
      modal.remove();
    });
    
    return null;
  }
  
  showErrorModal(error) {
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div class="veriff-error-overlay">
        <div class="veriff-error-modal">
          <div class="error-content">
            <i class="fas fa-exclamation-triangle"></i>
            <h2>Error de Veriff</h2>
            <p>${error.message || 'Error desconocido'}</p>
            <button class="btn-secondary">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('button').addEventListener('click', () => {
      modal.remove();
    });
  }
}

// Estilos CSS para Veriff
const veriffStyles = `
  .veriff-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  
  .veriff-modal {
    background: white;
    border-radius: 20px;
    width: 100%;
    max-width: 600px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  
  .veriff-header {
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    color: white;
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .veriff-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 24px;
    font-weight: bold;
  }
  
  .veriff-logo i {
    font-size: 28px;
  }
  
  .veriff-close {
    background: none;
    border: none;
    color: white;
    font-size: 32px;
    cursor: pointer;
    line-height: 1;
  }
  
  .veriff-content {
    padding: 30px;
  }
  
  .veriff-content h2 {
    margin: 0 0 10px 0;
    color: #1F2937;
    font-size: 28px;
  }
  
  .veriff-subtitle {
    color: #6B7280;
    margin-bottom: 30px;
  }
  
  .veriff-steps {
    display: flex;
    justify-content: space-between;
    margin: 30px 0;
  }
  
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    position: relative;
  }
  
  .step:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 24px;
    right: -50%;
    width: 100%;
    height: 2px;
    background: #E5E7EB;
  }
  
  .step.active:not(:last-child)::after {
    background: #4F46E5;
  }
  
  .step-number {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #E5E7EB;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: #6B7280;
    margin-bottom: 10px;
    font-size: 18px;
  }
  
  .step.active .step-number {
    background: #4F46E5;
    color: white;
  }
  
  .step-text {
    font-size: 14px;
    color: #6B7280;
    text-align: center;
  }
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 15px;
    background: #F9FAFB;
    padding: 20px;
    border-radius: 12px;
    margin: 30px 0;
  }
  
  .user-avatar {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: #4F46E5;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 24px;
  }
  
  .user-details {
    flex: 1;
  }
  
  .user-name {
    font-weight: bold;
    color: #1F2937;
    margin-bottom: 5px;
  }
  
  .user-email {
    color: #6B7280;
    font-size: 14px;
  }
  
  #veriff-container {
    min-height: 200px;
    border: 2px dashed #E5E7EB;
    border-radius: 12px;
    margin: 20px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9CA3AF;
  }
  
  .veriff-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin: 30px 0;
  }
  
  .btn-primary {
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    color: white;
    border: none;
    padding: 16px;
    border-radius: 10px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: transform 0.2s;
  }
  
  .btn-primary:hover {
    transform: translateY(-2px);
  }
  
  .btn-secondary {
    background: #F3F4F6;
    color: #4B5563;
    border: none;
    padding: 16px;
    border-radius: 10px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  
  .veriff-note {
    background: #F0F9FF;
    border: 1px solid #BAE6FD;
    padding: 15px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #0369A1;
    font-size: 14px;
  }
  
  .veriff-note i {
    font-size: 18px;
  }
  
  /* Simulador */
  .simulator {
    margin: 30px 0;
  }
  
  .sim-step {
    background: #F9FAFB;
    padding: 25px;
    border-radius: 12px;
    margin-bottom: 20px;
  }
  
  .sim-icon {
    font-size: 40px;
    color: #4F46E5;
    margin-bottom: 15px;
  }
  
  .sim-step h3 {
    margin: 0 0 10px 0;
    color: #1F2937;
  }
  
  .sim-step p {
    color: #6B7280;
    margin-bottom: 15px;
  }
  
  .sim-file {
    width: 100%;
    padding: 12px;
    border: 2px dashed #D1D5DB;
    border-radius: 8px;
    margin-bottom: 10px;
  }
  
  .sim-btn {
    background: #E5E7EB;
    color: #374151;
    border: none;
    padding: 12px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    width: 100%;
    margin-top: 10px;
  }
  
  .sim-btn-primary {
    background: #4F46E5;
    color: white;
    border: none;
    padding: 16px;
    border-radius: 10px;
    font-weight: bold;
    cursor: pointer;
    width: 100%;
    margin-top: 10px;
  }
  
  .simulator-buttons {
    margin-top: 30px;
  }
  
  /* Cámara */
  .camera-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 20px;
    padding: 20px;
    z-index: 10001;
    width: 90%;
    max-width: 500px;
  }
  
  .camera-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .camera-preview video {
    width: 100%;
    border-radius: 10px;
  }
  
  .camera-controls {
    display: flex;
    gap: 15px;
    margin-top: 20px;
  }
  
  /* Success */
  .success-screen {
    text-align: center;
    padding: 20px 0;
  }
  
  .success-icon {
    font-size: 80px;
    color: #10B981;
    margin-bottom: 20px;
  }
  
  .success-screen h2 {
    color: #065F46;
    margin-bottom: 10px;
  }
  
  .success-message {
    color: #6B7280;
    margin-bottom: 30px;
  }
  
  .success-details {
    background: #F0FDF4;
    border-radius: 12px;
    padding: 20px;
    margin: 30px 0;
  }
  
  .detail {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
  }
  
  .detail i {
    color: #10B981;
    font-size: 20px;
  }
  
  .detail:last-child {
    margin-bottom: 0;
  }
`;

// Añadir estilos al documento
const styleSheet = document.createElement("style");
styleSheet.textContent = veriffStyles;
document.head.appendChild(styleSheet);

// Crear instancia global
window.VeriffSimple = new VeriffSimple();
console.log('✅ VeriffSimple listo para usar');