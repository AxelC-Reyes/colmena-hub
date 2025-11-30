// ========== CONFIG ==========
const GRAVEDAD = 0.5;
const SALTO = -8;
const ANCHO_TUBO = 80;
const ESPACIO_TUBO = 180;
const MIN_HUECO = 120;
let abeja, tubos, velocidad, nivel, puntos, juegoCongelado, preguntaActiva;

function setup() {
  let ancho = min(windowWidth, 480);
  let canvas = createCanvas(ancho, ancho * 0.75);
  canvas.parent('lienzo');
  canvas.parent('lienzo');
  abeja = { x: 150, y: height / 2, r: 16, vy: 0 };
  tubos = [];
  velocidad = 3;
  nivel = 1;
  puntos = 0;
  juegoCongelado = false;
  preguntaActiva = false;
  textAlign(CENTER, CENTER);
  tubos.push(nuevoTubo());
}

function draw() {
  drawFondo8bits();
  if (!juegoCongelado) {
    fisica();
    dibujarTubos();
    chequearPuntos();
  }
  dibujarAbeja8bits();
  mostrarHUD();
}

function drawFondo8bits() {
  background(135, 206, 235);
  noStroke();
  fill(255, 255, 255, 180);
  for (let i = 0; i < 3; i++) {
    let x = (frameCount * 0.3 + i * 250) % (width + 100) - 50;
    rect(x, 60 + i * 70, 40, 20);
    rect(x - 10, 70 + i * 70, 60, 20);
    rect(x + 30, 70 + i * 70, 40, 20);
  }
}

function fisica() {
  abeja.vy += GRAVEDAD;
  abeja.y += abeja.vy;
  for (let i = tubos.length - 1; i >= 0; i--) {
    tubos[i].x -= velocidad;
    if (colision(tubos[i])) { resetJuego(); return; }
    if (tubos[i].x + ANCHO_TUBO < 0) tubos.splice(i, 1);
  }
  if (tubos.length === 0 || tubos[tubos.length - 1].x < width - 300) tubos.push(nuevoTubo());
  if (abeja.y > height - abeja.r || abeja.y < abeja.r) resetJuego();
}

function nuevoTubo() {
  let huecoY = random(MIN_HUECO, height - MIN_HUECO - ESPACIO_TUBO);
  return { x: width, huecoY: huecoY, pasada: false };
}

function colision(t) {
  if (abeja.x + abeja.r < t.x || abeja.x - abeja.r > t.x + ANCHO_TUBO) return false;
  if (abeja.y - abeja.r < t.huecoY || abeja.y + abeja.r > t.huecoY + ESPACIO_TUBO) return true;
  return false;
}

function dibujarTubos() {
  fill(34, 139, 34); noStroke();
  for (let t of tubos) {
    rect(t.x, 0, ANCHO_TUBO, t.huecoY);
    rect(t.x, t.huecoY + ESPACIO_TUBO, ANCHO_TUBO, height);
  }
}

function dibujarAbeja8bits() {
  noStroke();
  fill(255, 255, 0);
  rect(abeja.x - abeja.r, abeja.y - abeja.r, abeja.r * 2, abeja.r * 2);
  fill(200, 200, 255);
  let flap = sin(frameCount * 0.4) * 4;
  rect(abeja.x - abeja.r - 4, abeja.y - 4 + flap, 8, 12);
  rect(abeja.x + abeja.r - 4, abeja.y - 4 - flap, 8, 12);
  fill(0);
  rect(abeja.x - 6, abeja.y - 6, 4, 4);
  rect(abeja.x + 2, abeja.y - 6, 4, 4);
}

function chequearPuntos() {
  for (let t of tubos) {
    if (!t.pasada && t.x + ANCHO_TUBO < abeja.x) {
      t.pasada = true;
      puntos++;
      if (puntos % 3 === 0) {
        juegoCongelado = true;
        preguntaActiva = true;
        mostrarPregunta();
      }
    }
  }
}

function mostrarHUD() {
  fill(0); textSize(24);
  text(`Tubos: ${puntos}`, width / 2, 40);
  text(`Nivel: ${nivel}`, width / 2, 70);
}

function keyPressed() {
  if (preguntaActiva) return;
  if (key === ' ') abeja.vy = SALTO;
}

  // Toques en móvil
function touchStarted() {
  if (preguntaActiva) return;          // no saltar si hay pregunta
  abeja.vy = SALTO;
  return false;                        // evita scroll/zoom
}

// Doble toque = enviar respuesta (si hay pregunta)
function touchEnded() {
  if (preguntaActiva) {
    window.verificar();
  }
}

function mostrarPregunta() {
  const q = banco.find(p => p.nivel === nivel);
  if (!q) {
    juegoCongelado = false;
    preguntaActiva = false;
    nivel++; velocidad += 0.5;
    return;
  }
  document.getElementById('enunciado').textContent = q.pregunta;
  document.getElementById('panel').classList.remove('oculto');
  document.getElementById('respuesta').value = '';
  document.getElementById('retro').textContent = '';
}

function resetJuego() {
  abeja.y = height / 2; abeja.vy = 0;
  tubos = []; tubos.push(nuevoTubo());
  puntos = 0;
  juegoCongelado = false;
  preguntaActiva = false;
}