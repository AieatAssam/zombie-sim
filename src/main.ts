// Main Entry — game loop, UI, chart, event system, notifications, milestones

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
const statAmmo = document.getElementById('stat-ammo')!;
const statChaos = document.getElementById('stat-chaos')!;
const statStarving = document.getElementById('stat-starving')!;
const statStarved = document.getElementById('stat-starved')!;
const statTurned = document.getElementById('stat-turned')!;
const statKilled = document.getElementById('stat-killed')!;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedDisplay = document.getElementById('speed-display')!;
const btnPause = document.getElementById('btn-pause')!;
const btnReset = document.getElementById('btn-reset')!;
const btnCamera = document.getElementById('btn-camera')!;
const eventList = document.getElementById('event-list')!;
let notificationContainer: HTMLElement;
let dangerOverlay: HTMLElement;
let firstInfectionFlash: HTMLElement;
let entityPopup: HTMLElement;
let gameOverDiv: HTMLElement;
let legendPanel: HTMLElement;

let paused = false;
let speed = 1;
let cameraMode: 'orbit' | 'top' | 'close' = 'orbit';
let lastProcessedEvents = new Set<string>();
let legendVisible = true;
let legendTimer = 0;

// ─── Event log append-only tracking ───
let lastEventCount = 0;

// ─── Slow-motion tracking ───
let slowMoActive = false;
let slowMoTimer = 0;
const SLOW_MO_DURATION = 3;
const SLOW_MO_FACTOR = 0.3;
let firstInfectionShown = false;
let slowMoRestoreSpeed = 1;

// ─── Auto-camera tracking ───
let autoCamTarget: { x: number; z: number } | null = null;
let autoCamTimer = 0;
let autoCamZoom = 0;
const autoCamDuration = 4;

// ─── Milestone tracking ───
let milestonesShown = new Set<string>();
let lastZombieCount = 0;
let lastCivilianCount = 400;
let lastSurvivalDay = 0;

// ─── Click-to-inspect ───
let selectedEntityId: number | null = null;

// ─── Add game over overlay ───
gameOverDiv = document.createElement('div');
gameOverDiv.id = 'gameover';
gameOverDiv.innerHTML = '<div class="gameover-box"></div>';
document.getElementById('ui-overlay')!.appendChild(gameOverDiv);

// ─── Add danger overlay ───
dangerOverlay = document.createElement('div');
dangerOverlay.id = 'danger-overlay';
document.getElementById('ui-overlay')!.appendChild(dangerOverlay);

// ─── Add notification container ───
notificationContainer = document.createElement('div');
notificationContainer.id = 'notification-container';
document.getElementById('ui-overlay')!.appendChild(notificationContainer);

// ─── Add first infection flash ───
firstInfectionFlash = document.createElement('div');
firstInfectionFlash.id = 'first-infection-flash';
firstInfectionFlash.innerHTML = '<div class="first-infection-text">⚠ FIRST INFECTION ⚠</div>';
document.getElementById('ui-overlay')!.appendChild(firstInfectionFlash);

// ─── Add entity info popup ───
entityPopup = document.createElement('div');
entityPopup.id = 'entity-popup';
document.getElementById('ui-overlay')!.appendChild(entityPopup);

// ─── Add legend panel ───
legendPanel = document.createElement('div');
legendPanel.id = 'legend-panel';
legendPanel.innerHTML = `
  <div class="legend-close" id="legend-close">✕</div>
  <div class="legend-item"><span class="legend-icon legend-civ"></span> Civilian (blue)</div>
  <div class="legend-item"><span class="legend-icon legend-zom"></span> Zombie (green)</div>
  <div class="legend-item"><span class="legend-icon legend-mil"></span> Military (red)</div>
  <div class="legend-item"><span class="legend-icon legend-starve"></span> Starving (orange ▲)</div>
  <div class="legend-item"><span class="legend-icon legend-noammo"></span> Out of Ammo (🚫)</div>
  <div class="legend-hint">Press L to hide</div>
  <div class="legend-buildings-title">🏢 BUILDING OCCUPANCY:</div>
  <div class="legend-item"><span class="legend-block legend-occ"></span> People inside (blue dots)</div>
  <div class="legend-buildings-title">🏢 BUILDING TYPES:</div>
  <div class="legend-item"><span class="legend-block block-shop"></span> Shop = Food</div>
  <div class="legend-item"><span class="legend-block block-office"></span> Office = Food (low)</div>
  <div class="legend-item"><span class="legend-block block-house"></span> House = Shelter</div>
  <div class="legend-item"><span class="legend-block block-warehouse"></span> Warehouse = Ammo + Food</div>
  <div class="legend-item"><span class="legend-block block-police"></span> Police = Ammo (high)</div>
  <div class="legend-hint"></div>
`;
document.getElementById('ui-overlay')!.appendChild(legendPanel);
legendPanel.classList.add('visible');

// Legend close button
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.id === 'legend-close') {
    legendPanel.classList.remove('visible');
    legendVisible = false;
  }
});

// ─── Add keyframe styles ───
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
  @keyframes flashText { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(1.05); } }
  @keyframes statPulse { 0% { transform: scale(1.2); } 100% { transform: scale(1); } }
  @keyframes dangerPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
  @keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes gameOverAppear { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes eventFadeIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes chaosPulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.8; } }
  @keyframes scrollText {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
`;
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

  chartCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  chartCtx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = (CHART_H / 4) * i;
    chartCtx.beginPath(); chartCtx.moveTo(0, y); chartCtx.lineTo(CHART_W, y); chartCtx.stroke();
  }

  const drawLine = (data: number[], color: string, fill = false) => {
    if (data.length < 2) return;
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

  drawLine(hist.map(h => h.zombies), '#33ff33', true);
  drawLine(hist.map(h => h.civilians), '#4499ff', true);
  drawLine(hist.map(h => h.military), '#ff3333', false);

  chartCtx.fillStyle = '#4499ff';
  chartCtx.font = '8px monospace';
  chartCtx.textAlign = 'left';
  chartCtx.fillText('Civ', 10, 10);
  chartCtx.fillStyle = '#33ff33';
  chartCtx.fillText('Zom', 10, 20);
  chartCtx.fillStyle = '#ff3333';
  chartCtx.fillText('Mil', 10, 30);
  chartCtx.fillStyle = '#555';
  chartCtx.textAlign = 'right';
  chartCtx.fillText(`Day ${sim.state.day}`, CHART_W - 10, CHART_H - 4);
}

// ─── Events ───
function updateEvents(): void {
  const events = sim.getRecentEvents(100);
  // Only append NEW events
  for (let i = lastEventCount; i < events.length; i++) {
    const ev = events[i];
    const div = document.createElement('div');
    div.className = `event-entry ${ev.type}`;
    div.textContent = `[D${ev.day}] ${ev.text}`;
    eventList.appendChild(div);
  }
  lastEventCount = events.length;
  // Auto-scroll to bottom for new events
  eventList.scrollTop = eventList.scrollHeight;
}

// ─── Notifications ───
function showNotification(text: string, type: string): void {
  const div = document.createElement('div');
  div.className = `notification ${type}`;
  div.textContent = text;
  notificationContainer.appendChild(div);
  setTimeout(() => {
    if (div.parentNode) notificationContainer.removeChild(div);
  }, 3500);
}

// ─── Milestone checking ───
function checkMilestones(stats: { civilians: number; zombies: number; military: number; dead: number }): void {
  if (stats.zombies > 0 && !milestonesShown.has('first-zombie')) {
    milestonesShown.add('first-zombie');
    showNotification('🧟 First zombie spotted!', 'zombie');
  }
  if (stats.zombies >= 50 && !milestonesShown.has('zombie-50')) {
    milestonesShown.add('zombie-50');
    showNotification('🧟 50 zombies! The infection spreads!', 'zombie');
  }
  if (stats.zombies >= 100 && !milestonesShown.has('zombie-100')) {
    milestonesShown.add('zombie-100');
    showNotification('🧟⚠️ 100+ ZOMBIES! City in chaos!', 'death');
  }
  if (stats.zombies >= 200 && !milestonesShown.has('zombie-200')) {
    milestonesShown.add('zombie-200');
    showNotification('☠️ 200+ zombies! Extinction imminent!', 'death');
  }
  if (stats.civilians <= 50 && stats.civilians > 0 && !milestonesShown.has('civ-50')) {
    milestonesShown.add('civ-50');
    showNotification('⚠️ Only 50 civilians remain!', 'death');
  }
  if (stats.civilians <= 10 && stats.civilians > 0 && !milestonesShown.has('civ-10')) {
    milestonesShown.add('civ-10');
    showNotification('🆘 Only 10 civilians left!', 'death');
  }
  const day = sim.state.day;
  if (day >= 5 && !milestonesShown.has('day-5')) {
    milestonesShown.add('day-5');
    showNotification('🎯 Day 5! Survivors holding on!', 'info');
  }
  if (day >= 10 && !milestonesShown.has('day-10')) {
    milestonesShown.add('day-10');
    showNotification('🏆 Day 10! Incredible survival!', 'info');
  }
}

// ─── Game Loop ───
let lastTime = 0;
let prevZombieCount = 0;
let prevCivilianCount = 400;
let deathShakeCooldown = 0;

function gameLoop(time: number): void {
  const rawDt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  let effectiveSpeed = speed;
  if (slowMoActive) {
    slowMoTimer -= rawDt;
    effectiveSpeed = speed * SLOW_MO_FACTOR;
    if (slowMoTimer <= 0) {
      slowMoActive = false;
      effectiveSpeed = speed;
      firstInfectionFlash.classList.remove('active');
    }
  }

  if (!paused) {
    const simDt = rawDt * effectiveSpeed;
    sim.tick(simDt);
  }

  // ─── First infection detection & slow-mo + auto-camera ───
  const currentInfected = sim.state.stats.totalInfected;
  if (currentInfected > 0 && !firstInfectionShown) {
    firstInfectionShown = true;
    // Auto-camera: find the bitten civilian and pan to them
    const bitten = sim.state.entities.find(e => e.type === 'civilian' && e.turnTimer > 0);
    if (bitten) {
      autoCamTarget = { x: bitten.x, z: bitten.z };
      autoCamTimer = autoCamDuration;
      autoCamZoom = 1;
    }
    if (!slowMoActive && !paused) {
      slowMoActive = true;
      slowMoTimer = SLOW_MO_DURATION;
      firstInfectionFlash.classList.add('active');
      showNotification('⚠ FIRST INFECTION! Zombie outbreak!', 'death');
    }
  }

  const stats = sim.state.stats;
  const zombieDelta = stats.zombies - prevZombieCount;
  if (zombieDelta > 3 && !slowMoActive) {
    const zombies = sim.state.entities.filter(e => e.type === 'zombie' && e.state !== 'dead');
  }

  const civDelta = prevCivilianCount - stats.civilians;
  deathShakeCooldown -= rawDt;

  prevZombieCount = stats.zombies;
  prevCivilianCount = stats.civilians;
  checkMilestones(stats);

  // ─── Danger overlay ───
  if (stats.zombies > stats.civilians + stats.military && stats.zombies > 5) {
    dangerOverlay.classList.add('active');
  } else {
    dangerOverlay.classList.remove('active');
  }

  // ─── Game over screen ───
  if (sim.state.gameOver) {
    gameOverDiv.style.display = 'flex';
    const box = gameOverDiv.querySelector('.gameover-box') as HTMLElement;
    if (box) {
      const s = sim.state.stats;
      const won = sim.state.gameOverReason.includes('SAVED') || sim.state.gameOverReason.includes('eliminated');
      const turnedPct = s.civilians > 0 ? Math.round((s.civiliansTurned / (s.civiliansTurned + s.civilians)) * 100) : 100;
      box.className = 'gameover-box';
      if (won) box.classList.add('win');
      box.innerHTML = `
        <div class="go-title">${sim.state.gameOverReason}</div>
        <div class="go-stats">
          <span class="go-line">📅 Day ${sim.state.day} &middot; ${sim.state.totalTime.toFixed(0)}s elapsed</span>
          <span class="go-line">👥 Population: 400 &rarr; <span class="${s.civilians > 0 ? 'go-civ' : 'go-loss'}">${s.civilians} civil${s.civilians > 0 ? 'ians' : 'ian'}</span> &middot; ${s.zombies} zombie${s.zombies !== 1 ? 's' : ''} &middot; ${s.military} soldier${s.military !== 1 ? 's' : ''}</span>
          <span class="go-line">🧟 Total infected: <span class="go-loss">${s.totalInfected}</span> &middot; ${s.civiliansTurned} turned &middot; ${s.civiliansStarved} starved &middot; ${s.zombiesKilledByMilitary} killed by military</span>
          <span class="go-line">💀 Total dead: ${s.dead} (${turnedPct}% of population)</span>
        </div>
      `;
    }
  } else {
    gameOverDiv.style.display = 'none';
  }

  // ─── Update HUD ───
  statDay.textContent = String(sim.state.day);
  const hour = Math.floor(sim.state.timeOfDay * 24);
  const min = Math.floor((sim.state.timeOfDay * 24 - hour) * 60);
  statTime.textContent = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  statCiv.textContent = String(stats.civilians);
  statZom.textContent = String(stats.zombies);
  statMil.textContent = String(stats.military);
  statDead.textContent = String(stats.dead);

  // Chaos meter
  if (statChaos) {
    const chaos = sim.state.chaosLevel;
    statChaos.textContent = `${chaos}%`;
    (statChaos.parentElement as HTMLElement)?.style.setProperty('--chaos-color',
      chaos > 70 ? '#ff4444' : chaos > 40 ? '#ffaa00' : '#44ff44');
  }

  // Starving count
  if (statStarving) statStarving.textContent = String(sim.state.starvingCount);

  // Death breakdown
  if (statStarved) statStarved.textContent = String(sim.state.stats.civiliansStarved || 0);
  if (statTurned) statTurned.textContent = String(sim.state.stats.civiliansTurned || 0);
  if (statKilled) statKilled.textContent = String(sim.state.stats.zombiesKilledByMilitary || 0);

  // ─── Stat box alerts ───
  const zombieBox = document.querySelector('.zombie-stat') as HTMLElement;
  if (zombieBox) {
    if (stats.zombies > stats.civilians && stats.zombies > 5) {
      zombieBox.classList.add('zombie-alert');
    } else {
      zombieBox.classList.remove('zombie-alert');
    }
  }

  // ─── Auto-camera: smooth pan to events ───
  if (autoCamTimer > 0) {
    autoCamTimer -= rawDt;
    if (autoCamTarget) {
      const target = renderer.controls.target;
      target.x += (autoCamTarget.x - target.x) * 0.04;
      target.z += (autoCamTarget.z - target.z) * 0.04;
      target.y = Math.max(target.y + (1.5 - target.y) * 0.02, 1);
      const cam = renderer.camera.position;
      const idealDist = 20 + autoCamZoom * 15;
      const dx = cam.x - target.x;
      const dz = cam.z - target.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > idealDist) {
        cam.x -= dx * 0.02;
        cam.z -= dz * 0.02;
      }
    }
  }

  updateEvents();
  drawChart();
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
  const goDiv = document.getElementById('gameover')!;
  goDiv.style.display = 'none';
  paused = false;
  btnPause.textContent = '⏸ Pause';
  btnPause.classList.remove('active');
  speed = 1;
  speedSlider.value = '1';
  speedDisplay.textContent = '1x';
  slowMoActive = false;
  slowMoTimer = 0;
  firstInfectionShown = false;
  milestonesShown.clear();
  prevZombieCount = 0;
  prevCivilianCount = 400;
  lastEventCount = 0;
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

  // Legend toggle
  if (e.key === 'l' || e.key === 'L') {
    legendVisible = !legendVisible;
    legendPanel.classList.toggle('visible', legendVisible);
    legendTimer = 0; // Reset timer when manually toggled
  }

  const num = parseInt(e.key);
  if (num >= 1 && num <= 9) {
    speed = num; speedSlider.value = String(num); speedDisplay.textContent = `${num}x`;
  }
  if (e.key === '0') { speed = 10; speedSlider.value = '10'; speedDisplay.textContent = '10x'; }

  // Arrow key panning
  const panAmount = 2;
  if (e.key === 'ArrowUp') {
    renderer.controls.target.y += panAmount;
  }
  if (e.key === 'ArrowDown') {
    renderer.controls.target.y -= panAmount;
  }
  if (e.key === 'ArrowLeft') {
    renderer.controls.target.x -= panAmount;
    renderer.camera.position.x -= panAmount;
  }
  if (e.key === 'ArrowRight') {
    renderer.controls.target.x += panAmount;
    renderer.camera.position.x += panAmount;
  }
});

// ─── Click-to-inspect ───
const raycasterLocal = new THREE.Raycaster();
const mouseLocal = new THREE.Vector2();

renderer.renderer.domElement.addEventListener('click', (event: MouseEvent) => {
  const rect = renderer.renderer.domElement.getBoundingClientRect();
  mouseLocal.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseLocal.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycasterLocal.setFromCamera(mouseLocal, renderer.camera);

  const objects: THREE.Object3D[] = [];
  for (const group of renderer['entityMeshes'].values()) {
    objects.push(group);
  }

  const intersects = raycasterLocal.intersectObjects(objects, true);

  if (intersects.length > 0) {
    const hitObject = intersects[0].object;
    let group: THREE.Object3D = hitObject;
    while (group.parent && group.parent.type !== 'Scene') {
      group = group.parent;
    }

    let foundId: number | null = null;
    for (const [id, g] of renderer['entityMeshes'].entries()) {
      if (g === group || g === group.parent) {
        foundId = id;
        break;
      }
    }

    if (foundId !== null) {
      const entity = sim.state.entities.find(e => e.id === foundId);
      if (entity) {
        showEntityPopup(entity, event.clientX, event.clientY);
        return;
      }
    }
  }

  entityPopup.classList.remove('active');
});

function showEntityPopup(entity: { id: number; type: string; state: string; kills?: number; ammo?: number; ammoInMag?: number; isReloading?: boolean; hunger?: number; turnTimer?: number }, x: number, y: number): void {
  const typeLabel = entity.type.charAt(0).toUpperCase() + entity.type.slice(1);
  let html = `<div class="popup-title" style="color: ${entity.type === 'zombie' ? '#33ff33' : entity.type === 'military' ? '#ff3333' : '#4499ff'}">${typeLabel} #${entity.id}</div>`;
  html += `<div class="popup-row"><span class="label">State</span><span class="value">${entity.state}</span></div>`;
  if (entity.type === 'military') {
    const kills = (entity as any).kills || 0;
    html += `<div class="popup-row"><span class="label">Kills</span><span class="value">${kills}</span></div>`;
    const ammoInMag = (entity as any).ammoInMag ?? 0;
    const ammo = (entity as any).ammo ?? 0;
    const reloading = (entity as any).isReloading ? 'RELOADING' : `${ammoInMag}/${ammo}`;
    html += `<div class="popup-row"><span class="label">Ammo</span><span class="value">${reloading}</span></div>`;
  }
  if (entity.type === 'civilian') {
    const hunger = (entity as any).hunger ?? 0;
    html += `<div class="popup-row"><span class="label">Hunger</span><span class="value">${Math.round(hunger)}</span></div>`;
  }

  entityPopup.innerHTML = html;
  entityPopup.style.left = `${Math.min(x + 10, window.innerWidth - 140)}px`;
  entityPopup.style.top = `${Math.min(y + 10, window.innerHeight - 100)}px`;
  entityPopup.classList.add('active');
}

// Hover hint
const hintDiv = document.createElement('div');
hintDiv.style.cssText = `
  position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%);
  color: rgba(255,255,255,0.3); font-size: 11px; pointer-events: none;
  text-align: center; font-family: monospace;
`;
hintDiv.textContent = '🖱 Drag=orbit · Scroll=zoom · Click=inspect · ←→↑↓=pan · Space=pause · R=reset · L=legend · 1-9=speed · C=camera';
document.getElementById('ui-overlay')!.appendChild(hintDiv);

// Auto-fade hint after 8 seconds
setTimeout(() => {
  hintDiv.style.transition = 'opacity 1s ease';
  hintDiv.style.opacity = '0';
}, 8000);

// ─── Start ───
requestAnimationFrame(gameLoop);
console.log('🧟 Zombie Outbreak Simulator v7 loaded!');
console.log('  Space=Pause  R=Reset  C=Camera  L=Legend  Arrows=Pan  1-9=Speed  Click=Inspect');
