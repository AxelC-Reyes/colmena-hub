// ============================================================
//  COLMENA HUB — veriff-working.js  (versión segura)
//  La API key ya NO está aquí. Vive en Cloud Functions.
// ============================================================

class VeriffWorking {
  constructor() {
    this.PROXY_URL = 'https://us-central1-colmena-hub.cloudfunctions.net/createVeriffSession';
    // Desarrollo local: 'http://localhost:5001/colmena-hub/us-central1/createVeriffSession'
    this.sessionId = null;
    this.userData  = null;
    console.log('✅ VeriffWorking inicializado (proxy seguro)');
  }

  async startVerification(userData) {
    this.userData = userData;
    try {
      const session = await this.createSessionViaProxy(userData);
      this.sessionId = session.sessionId;
      await this.loadVeriffSDK();
      this.showVeriffModal(session.sessionUrl);
      return this.sessionId;
    } catch (error) {
      console.error('❌ Error Veriff:', error);
      this.showError(error);
      return null;
    }
  }

  async createSessionViaProxy(userData) {
    const nameParts = (userData.displayName || '').trim().split(' ');
    const response = await fetch(this.PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: userData.firstName || nameParts[0] || 'Usuario',
        lastName:  userData.lastName  || nameParts.slice(1).join(' ') || 'Colmena',
        email:     userData.email,
        userId:    userData.uid
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Error ${response.status}`);
    }
    return response.json();
  }

  loadVeriffSDK() {
    return new Promise((resolve, reject) => {
      if (window.createVeriffFrame) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.veriff.me/incontext/js/v1/veriff.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el SDK de Veriff'));
      document.head.appendChild(s);
    });
  }

  showVeriffModal(url) {
    document.getElementById('veriff-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'veriff-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;width:100%;max-width:820px;height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div>
            <div style="font-size:18px;font-weight:700">Verificación de Identidad</div>
            <div style="font-size:13px;opacity:.85;margin-top:2px">Sube tu INE y toma una selfie</div>
          </div>
          <button id="veriff-close" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:24px;cursor:pointer;border-radius:8px;width:36px;height:36px">&times;</button>
        </div>
        <iframe src="${url}" style="flex:1;border:none;width:100%" allow="camera"></iframe>
        <div style="background:#F9FAFB;padding:12px 24px;font-size:13px;color:#6B7280;border-top:1px solid #E5E7EB">
          <strong style="color:#4F46E5">Instrucciones:</strong> Ten tu INE/IFE a la mano · Buena iluminación · Permite acceso a la cámara
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('veriff-close').onclick = () => overlay.remove();
    window.addEventListener('message', (e) => {
      if (e.data?.status === 'finished' || e.data?.action === 'FINISHED') {
        overlay.remove();
        window.dispatchEvent(new CustomEvent('veriff:success', { detail: { sessionId: this.sessionId } }));
      }
    });
  }

  showError(error) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px;max-width:440px;width:100%;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <h3 style="color:#DC2626;margin:0 0 12px">Error en verificación</h3>
        <p style="color:#6B7280;margin:0 0 24px;font-size:14px">${error.message || 'Error desconocido'}</p>
        <div style="display:flex;gap:12px;justify-content:center">
          <button onclick="this.closest('div[style]').remove()" style="padding:10px 20px;border:1px solid #D1D5DB;border-radius:8px;background:#fff;cursor:pointer">Cerrar</button>
          <button onclick="location.reload()" style="padding:10px 20px;background:#4F46E5;color:#fff;border:none;border-radius:8px;cursor:pointer">Reintentar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
}

window.VeriffWorking = new VeriffWorking();