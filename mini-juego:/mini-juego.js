// mini-juego.js (sin bloqueos)
const banco = [
  { nivel: 1, pregunta: "¿Cuánto es 6 × 7?", respuesta: "42" },
  { nivel: 2, pregunta: "¿Ángulo entre 90° y 180°?", respuesta: "obtuso" },
  { nivel: 3, pregunta: "Imprime 'hola mundo' en Python", respuesta: "print('hola mundo')" },
  { nivel: 4, pregunta: "¿Cuántos lados tiene un heptágono?", respuesta: "7" },
  { nivel: 5, pregunta: "¿Derivada de x²?", respuesta: "2x" }
];

let abeja, tubos, velocidad, nivel, puntos, juegoCongelado, preguntaActiva;

function setup() {
  let canvas = createCanvas(800, 600);
  canvas.parent('lienzo-juego');
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
  abeja.vy += 0.5;
  abeja.y += abeja.vy;
  for (let i = tubos.length - 1; i >= 0; i--) {
    tubos[i].x -= velocidad;
    if (colision(tubos[i])) { resetJuego(); return; }
    if (tubos[i].x + 80 < 0) tubos.splice(i, 1);
    if (tubos.length === 0 || tubos[tubos.length - 1].x < width - 300) tubos.push(nuevoTubo());
    if (abeja.y > height - abeja.r || abeja.y < abeja.r) resetJuego();
  }
  if (tubos.length === 0 || tubos[tubos.length - 1].x < width - 300) tubos.push(nuevoTubo());
  if (abeja.y > height - abeja.r || abeja.y < abeja.r) resetJuego();
}

function nuevoTubo() {
  let huecoY = random(120, height - 120 - 180);
  return { x: width, huecoY: huecoY, pasada: false };
}

function colision(t) {
  if (abeja.x + abeja.r < t.x || abeja.x - abeja.r > t.x + 80) return false;
  if (abeja.y - abeja.r < t.huecoY || abeja.y + abeja.r > t.huecoY + 180) return true;
  return false;
}

function dibujarTubos() {
  fill(34, 139, 34); noStroke();
  for (let t of tubos) {
    rect(t.x, 0, 80, t.huecoY);
    rect(t.x, t.huecoY + 180, 80, height);
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
    if (!t.pasada && t.x + 80 < abeja.x) {
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
  if (key === ' ') abeja.vy = -8;
}

function mostrarPregunta() {
  const q = banco.find(p => p.nivel === nivel);
  if (!q) {
    juegoCongelado = false;
    preguntaActiva = false;
    nivel++;
    velocidad += 0.5;
    return;
  }
  document.getElementById('enunciado-juego').textContent = q.pregunta;
  document.getElementById('panel-juego').classList.remove('hidden');
  document.getElementById('respuesta-juego').value = '';
  document.getElementById('retro-juego').textContent = '';
}

function resetJuego() {
  abeja.y = height / 2; abeja.vy = 0;
  tubos = []; tubos.push(nuevoTubo());
  puntos = 0;
  juegoCongelado = false;
  preguntaActiva = false;
}