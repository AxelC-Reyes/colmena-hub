// Sincroniza variables globales y control del panel
setInterval(() => {
  window.nivel      = nivel;
  window.banco      = banco;
  window.juegoCongelado = juegoCongelado;
  window.preguntaActiva = preguntaActiva;
  window.velocidad  = velocidad;
}, 100);

// Función que llama el botón del panel
window.verificar = function () {
  const q   = window.banco.find(p => p.nivel === window.nivel);
  const user= document.getElementById('respuesta').value.trim();
  if(user.toLowerCase() === q.respuesta.toLowerCase()){
    document.getElementById('retro').textContent = '¡Correcto!';
    setTimeout(()=>{
      document.getElementById('panel').classList.add('oculto');
      juegoCongelado = false;
      preguntaActiva = false;
      nivel++;
      velocidad += 0.5;
    },1000);
  }else{
    document.getElementById('retro').textContent = 'Inténtalo de nuevo';
  }
};

// Enviar con Enter
document.getElementById('respuesta').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') window.verificar();
});