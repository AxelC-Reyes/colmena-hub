// veriff-config.js - Configuración simple
const VERIFF_CONFIG = {
  // ⚠️ CAMBIA ESTO POR TU API KEY REAL DE VERIFF
  API_KEY: 'b04b260e-ae04-466b-85c8-f674ecbb09ac', // 📍 Obtén en: https://dashboard.veriff.com/
  
  // Modo simulación si no hay API key
  SIMULATION_MODE: true
};

// Función principal de Veriff
async function startVeriffVerification(userData, onSuccess, onError) {
  console.log('🔧 Veriff iniciando para:', userData.email);
  
  // Si no hay API key o está en modo simulación
  if (!VERIFF_CONFIG.API_KEY || VERIFF_CONFIG.API_KEY === 'b04b260e-ae04-466b-85c8-f674ecbb09ac' || VERIFF_CONFIG.SIMULATION_MODE) {
    console.log('🎭 Usando simulación de Veriff');
    showVeriffSimulation(userData, onSuccess, onError);
    return 'simulated_' + Date.now();
  }
  
  // Aquí iría el código real de Veriff con tu API Key
  console.log('🚀 Iniciando Veriff real (API Key:', VERIFF_CONFIG.API_KEY.substring(0, 10) + '...)');
  
  // Por ahora mostramos error
  if (onError) {
    onError(new Error('Veriff configurado pero no implementado completamente'));
  }
  
  return null;
}

// Mostrar simulación
function showVeriffSimulation(userData, onSuccess, onError) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); z-index: 9999; display: flex;
    align-items: center; justify-content: center;
  `;
  
  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 15px; max-width: 500px; text-align: center;">
      <h2 style="color: #4CAF50; margin-bottom: 20px;">🎭 SIMULACIÓN VERIFF</h2>
      <p>Para usar Veriff real:</p>
      <ol style="text-align: left; margin: 20px 0;">
        <li>Regístrate en <a href="https://dashboard.veriff.com" target="_blank">dashboard.veriff.com</a></li>
        <li>Obtén tu API Key</li>
        <li>Reemplaza <code>TU_API_KEY_AQUI</code> en veriff-config.js</li>
      </ol>
      <div style="margin: 25px 0;">
        <button id="simulate-success" style="background: #4CAF50; color: white; border: none; padding: 12px 24px; margin: 5px; border-radius: 5px; cursor: pointer; font-weight: bold;">
          ✅ Simular verificación exitosa
        </button>
      </div>
      <p><small>Usuario: <strong>${userData.email}</strong></small></p>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('simulate-success').addEventListener('click', () => {
    modal.remove();
    const verificationData = {
      id: 'simulated_' + Date.now(),
      status: 'approved',
      person: userData,
      timestamp: new Date().toISOString()
    };
    
    if (onSuccess) onSuccess(verificationData);
  });
  
  // Cerrar al hacer clic fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      if (onError) onError(new Error('Simulación cancelada'));
    }
  });
}

// Exportar
window.VeriffSDK = {
  startVeriffVerification,
  config: VERIFF_CONFIG
};

console.log('🔧 Veriff SDK cargado (Modo:', VERIFF_CONFIG.SIMULATION_MODE ? 'Simulación' : 'Real', ')');