// Main Entry — game loop, UI, chart, event system

import * as THREE from 'three';
import { Simulation } from './simulation';
import { Renderer3D } from './renderer';

const container = document.getElementById('three-container')!;
const sim = new Simulation();
const renderer = new Renderer3D(container);
renderer.buildCity(sim.state);

// ─── DOM ───
const statDay = document.getElementById('stat-day')!;
const statTime = document.getElementById('stat-time')!;
const statCiv = document.getElementById('stat-civilians')!;
const statZom = document.getElementById('stat-zombies')!;
const statMil = document.getElementById('stat-military')!;
const statDead = document.getElementById('stat-dead')!;
const statFood = document.getElementById('stat-food')!;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedDisplay = document.getElementById('speed-display')!;
const btnPause = document.getElementById('btn-pause')!;
const btnReset = document.getElementById('btn-reset')!;
const btnCamera = document.getElementById('btn-camera')!;
const eventList = document.getElementById('event-list')!;

let paused = false;
let speed = 1;
let cameraMode: 'orbit' | 'top' | 'close' = 'orbit';
let lastProcessedEvents = new Set<string>();

// ─── Add game over UI ───
const gameOverDiv = document.createElement('div');
gameOverDiv.id = 'gameover';
gameOverDiv.style.cssText = `
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  display: none; align-items: center; justify-content: center;
  pointer-events: none; z-index: 100;
`;
const gameOverText = document.createElement('div');
gameOverText.style.cssText = `
  background: rgba(0,0,0,0.85); padding: 30px 50px;
  border: 2px solid #ff4444; border-radius: 12px;
  font-size: 28px; font-weight: 800; color: #ff4444;
  text-align: center; text-shadow: 0 0 40px rgba(255,0,0,0.5);
  animation: pulse 1.5s ease-in-out infinite;
`;
gameOverDiv.appendChild(gameOverText);
document.getElementById('ui-overlay')!.appendChild(gameOverDiv);

// Add keyframe for pulse
const styleSheet = document.createElement('style');
styleSheet.textContent = `@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }`;
document.head.appendChild(styleSheet);

// ─── Chart ───
const chartCanvas = document.getElementById('pop-chart') as HTMLCanvasElement;
const chartCtx = chartCanvas.getContext('2d')!;
const CHART_W = chartCanvas.width;
const CHART_H = chartCanvas.height;

function drawChart(): void {
  const hist = sim.history;
  chartCtx.fillStyle = 'rgba(0,0,0,0.3)';
  chartCtx.fillRect(0, 0, CHART_W, CHART_H);

  if (hist.length < 2) {
    chartCtx.fillStyle = '#444';
    chartCtx.font = '10px sans-serif';
    chartCtx.textAlign = 'center';
    chartCtx.fillText('Population Over Time', CHART_W / 2, CHART_H / 2);
    return;
  }

  let maxPop = 1;
  for (const h of hist) {
    const total = Math.max(h.civilians, h.zombies) + h.military;
    if (total > maxPop) maxPop = total;
  }

  // Grid
  chartCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  chartCtx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = (CHART_H / 4) * i;
    chartCtx.beginPath(); chartCtx.moveTo(0, y); chartCtx.lineTo(CHART_W, y); chartCtx.stroke();
  }

  const drawLine = (data: number[], color: string, fill = false) => {
    if (data.length < 2) return;
    let lastX = -1;
    const margin = { top: 8, bottom: 12, left: 8, right: 8 };
    const w = CHART_W - margin.left - margin.right;
    const h = CHART_H - margin.top - margin.bottom;

    chartCtx.strokeStyle = color;
    chartCtx.lineWidth = 2;
    chartCtx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = margin.left + (i / (data.length - 1)) * w;
      const y = margin.top + h - (data[i] / maxPop) * h;
      if (i === 0) chartCtx.moveTo(x, y);
      else chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();

    if (fill && data.length > 1) {
      chartCtx.fillStyle = color + '25';
      chartCtx.beginPath();
      const fx = margin.left;
      const fy = margin.top + h;
      chartCtx.moveTo(fx, fy);
      for (let i = 0; i < data.length; i++) {
        const x = margin.left + (i / (data.length - 1)) * w;
        const y = margin.top + h - (data[i] / maxPop) * h;
        chartCtx.lineTo(x, y);
      }
      chartCtx.lineTo(margin.left + w, fy);
      chartCtx.closePath();
      chartCtx.fill();
    }
  };

  drawLine(hist.map(h => h.zombies), '#44ff44', true);
  drawLine(hist.map(h => h.civilians), '#4da6ff', true);
  drawLine(hist.map(h => h.military), '#ff4444', false);

  // Labels
  chartCtx.fillStyle = '#555';
  chartCtx.font = '8px monospace';
  chartCtx.textAlign = 'left';
  chartCtx.fillText('Civ', 10, 10);
  chartCtx.fillStyle = '#44ff44';
  chartCtx.fillText('Zom', 10, 20);
  chartCtx.fillStyle = '#ff4444';
  chartCtx.fillText('Mil', 10, 30);
  chartCtx.fillStyle = '#555';
  chartCtx.textAlign = 'right';
  chartCtx.fillText(`Day ${sim.state.day}`, CHART_W - 10, CHART_H - 4);
}

// ─── Events ───
function updateEvents(): void {
  const events = sim.getRecentEvents(30);
  eventList.innerHTML = '';
  for (const ev of events) {
    const div = document.createElement('div');
    div.className = `event-entry ${ev.type}`;
    div.textContent = `[D${ev.day}] ${ev.text}`;
    eventList.appendChild(div);
  }
  eventList.scrollTop = 0;
}

// ─── Game Loop ───
let lastTime = 0;

function gameLoop(time: number): void {
  const rawDt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (!paused) {
    const simDt = rawDt * speed;
    sim.tick(simDt);
  }

  // Game over screen
  if (sim.state.gameOver) {
    gameOverDiv.style.display = 'flex';
    gameOverText.textContent = sim.state.gameOverReason;
  } else {
    gameOverDiv.style.display = 'none';
  }

  // Update HUD
  const stats = sim.state.stats;
  statDay.textContent = String(sim.state.day);
  const hour = Math.floor(sim.state.timeOfDay * 24);
  const min = Math.floor((sim.state.timeOfDay * 24 - hour) * 60);
  statTime.textContent = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  statCiv.textContent = String(stats.civilians);
  statZom.textContent = String(stats.zombies);
  statMil.textContent = String(stats.military);
  statDead.textContent = String(sim.state.stats.dead + Math.floor(sim.state.stats.totalInfected * 0.5));
  statFood.textContent = `${stats.foodSupply}%`;

  updateEvents();
  drawChart();

  // Render 3D
  renderer.update(sim.state, rawDt);

  requestAnimationFrame(gameLoop);
}

// ─── Controls ───

speedSlider.addEventListener('input', () => {
  speed = parseFloat(speedSlider.value);
  speedDisplay.textContent = `${speed}x`;
});

btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.textContent = paused ? '▶ Play' : '⏸ Pause';
  btnPause.classList.toggle('active', paused);
});

btnReset.addEventListener('click', () => {
  sim.reset();
  renderer.reset();
  renderer.buildCity(sim.state);
  gameOverDiv.style.display = 'none';
  paused = false;
  btnPause.textContent = '⏸ Pause';
  btnPause.classList.remove('active');
  speed = 1;
  speedSlider.value = '1';
  speedDisplay.textContent = '1x';
});

btnCamera.addEventListener('click', () => {
  const modes = ['orbit', 'top', 'close'] as const;
  cameraMode = modes[(modes.indexOf(cameraMode) + 1) % modes.length];
  btnCamera.textContent = `🎥 ${cameraMode.charAt(0).toUpperCase() + cameraMode.slice(1)}`;

  const target = new THREE.Vector3(0, 0, 0);
  if (cameraMode === 'top') {
    renderer.camera.position.set(0, 55, 0.1);
  } else if (cameraMode === 'close') {
    renderer.camera.position.set(15, 8, 15);
  } else {
    renderer.camera.position.set(40, 35, 40);
  }
  renderer.controls.target.copy(target);
});

// Keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Space') {
    e.preventDefault();
    btnPause.click();
  }
  if (e.key === 'r' || e.key === 'R') btnReset.click();
  if (e.key === 'c' || e.key === 'C') btnCamera.click();
  const num = parseInt(e.key);
  if (num >= 1 && num <= 9) {
    speed = num; speedSlider.value = String(num); speedDisplay.textContent = `${num}x`;
  }
  if (e.key === '0') { speed = 10; speedSlider.value = '10'; speedDisplay.textContent = '10x'; }
});

// Hover hint
const hintDiv = document.createElement('div');
hintDiv.style.cssText = `
  position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%);
  color: rgba(255,255,255,0.3); font-size: 11px; pointer-events: none;
  text-align: center; font-family: monospace;
`;
hintDiv.textContent = '🖱 Drag to orbit · Scroll to zoom · Space=pause · R=reset · 1-9=speed · C=camera';
document.getElementById('ui-overlay')!.appendChild(hintDiv);

// ─── Start ───
requestAnimationFrame(gameLoop);
console.log('🧟 Zombie Outbreak Simulator v2 started!');
console.log('  Space=Pause  R=Reset  C=Camera  1-9=Speed');
