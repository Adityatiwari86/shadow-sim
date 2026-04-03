/**
 * main.js — Shadow-Sim Application Entry Point
 *
 * Orchestrates:
 *   - Three.js scene, renderer, camera
 *   - Vehicle physics + controls
 *   - Digital twin
 *   - Obstacles + collision
 *   - WebSocket telemetry
 *   - HUD updates
 *   - Minimap
 *   - Replay system
 */

import { PhysicsEngine } from './physics.js';
import { Controls }       from './controls.js';
import { Car }            from './car.js';
import { ObstacleManager } from './obstacles.js';
import { CollisionDetector } from './collision.js';
import { TelemetrySocket, LocalTwin } from './websocket.js';

// ── Three.js shorthand ────────────────────────────────────────────────────────
const T = THREE; // THREE is globally loaded via CDN

// ── Scene setup ───────────────────────────────────────────────────────────────
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = T.PCFSoftShadowMap;
renderer.setClearColor(0x060a12);
document.getElementById('canvas-container').appendChild(renderer.domElement);

const scene = new T.Scene();
scene.fog   = new T.FogExp2(0x060a12, 0.018);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new T.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 8, 20);

let cameraMode = 'follow'; // 'follow' | 'orbit' | 'top'
const cameraOffset = { follow: new T.Vector3(0, 7, 16), top: new T.Vector3(0, 40, 0) };
const camTarget    = new T.Vector3();
const camPos       = new T.Vector3();

// ── Lighting ──────────────────────────────────────────────────────────────────
const ambient = new T.AmbientLight(0x112233, 0.8);
scene.add(ambient);

const sun = new T.DirectionalLight(0xffffff, 1.2);
sun.position.set(40, 60, 30);
sun.castShadow            = true;
sun.shadow.mapSize.width  = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near    = 1;
sun.shadow.camera.far     = 200;
sun.shadow.camera.left    = -80;
sun.shadow.camera.right   =  80;
sun.shadow.camera.top     =  80;
sun.shadow.camera.bottom  = -80;
scene.add(sun);

// Rim light from opposite direction
const rim = new T.DirectionalLight(0x004488, 0.5);
rim.position.set(-30, 20, -30);
scene.add(rim);

// ── Sub-systems ───────────────────────────────────────────────────────────────
const physics    = new PhysicsEngine();
const controls   = new Controls();
const obstacles  = new ObstacleManager(T);
const collision  = new CollisionDetector(T);

obstacles.build(scene);
obstacles.refreshBBoxes();

// Real car (player)
const realCar  = new Car(T, { color: 0x00ffb4 });
scene.add(realCar.mesh);

// Digital twin
const twinCar  = new Car(T, { color: 0x4488ff, isGhost: true });
scene.add(twinCar.mesh);
twinCar.mesh.visible = true;

// Local twin fallback
const localTwin = new LocalTwin(physics);

// WebSocket
const socket = new TelemetrySocket({ url: 'ws://localhost:8000/ws', latencySim: true });

// ── State flags ───────────────────────────────────────────────────────────────
let showTwin    = true;
let showHeatmap = true;
let isRecording = false;
let isReplaying = false;
let twinState   = null;

// ── Replay system ─────────────────────────────────────────────────────────────
const replayBuffer  = [];
const MAX_REPLAY    = 3000; // ~50s at 60fps
let   replayIndex   = 0;

// ── Minimap canvas ────────────────────────────────────────────────────────────
const minimapCanvas  = document.getElementById('minimap-canvas');
const mmCtx          = minimapCanvas.getContext('2d');
const MM_SCALE       = 1.0;  // world units per pixel
const MM_SIZE        = 160;
const MM_WORLD_RANGE = 100;  // ±100 world units shown

// ── WebSocket callbacks ───────────────────────────────────────────────────────
socket.onTwinUpdate = (state) => {
  twinState = state;
};

socket.onStatus = (status) => {
  const dot  = document.getElementById('ws-dot');
  const text = document.getElementById('ws-status');
  dot.className  = status === 'connected' ? 'connected' : (status === 'error' ? 'error' : '');
  text.textContent = status.toUpperCase();
};

// Collision visual feedback
collision.onCollision = (_obs) => {
  const flash = document.getElementById('collision-flash');
  flash.style.opacity = '1';
  setTimeout(() => flash.style.opacity = '0', 120);
};

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') resetVehicle();
  if (e.code === 'KeyC') cycleCamera();
});

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Game loop ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;

  if (!isReplaying) {
    // ── Physics update ──────────────────────────────────────────────────
    const input = controls.getInput();
    const state = physics.update(input, dt);

    // ── Collision check ──────────────────────────────────────────────────
    const colResult = collision.check(state, obstacles.objects);
    if (colResult.hit) {
      collision.applyResponse(physics, colResult);
    }

    // ── Sync real car mesh ───────────────────────────────────────────────
    realCar.update(physics.getState());

    if (showHeatmap) realCar.setStress(state.stress);
    else             realCar.setStress(0);

    // ── Send telemetry ───────────────────────────────────────────────────
    socket.sendState(state);
    localTwin.feed(state);

    // ── Replay recording ─────────────────────────────────────────────────
    if (isRecording) {
      replayBuffer.push({ ...physics.getState(), ts: now });
      if (replayBuffer.length > MAX_REPLAY) replayBuffer.shift();
    }

    // ── HUD update ───────────────────────────────────────────────────────
    updateHUD(state);
  } else {
    // ── Replay playback ──────────────────────────────────────────────────
    playbackStep();
  }

  // ── Digital twin update ──────────────────────────────────────────────────
  if (showTwin) {
    twinCar.mesh.visible = true;
    let predicted = twinState;

    if (!predicted) {
      // Fallback: local dead reckoning
      predicted = localTwin.predict();
    }

    if (predicted) {
      // Smooth lerp toward prediction (alpha accounts for latency smoothing)
      twinCar.lerpTo(predicted, Math.min(1, dt * 8));
      updateTwinHUD(predicted);
    }
  } else {
    twinCar.mesh.visible = false;
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  updateCamera(dt);

  // ── Minimap ───────────────────────────────────────────────────────────────
  updateMinimap();

  renderer.render(scene, camera);
}

// ── Camera logic ──────────────────────────────────────────────────────────────
function updateCamera(dt) {
  const carPos = realCar.mesh.position;
  const carRot = realCar.mesh.rotation.y;

  if (cameraMode === 'follow') {
    // Offset behind and above car in car-local space
    const offset = new T.Vector3(0, 7, 14);
    offset.applyEuler(new T.Euler(0, carRot, 0));
    const desired = carPos.clone().add(offset);
    camPos.lerp(desired, 1 - Math.pow(0.01, dt));
    camera.position.copy(camPos);

    camTarget.lerp(carPos, 1 - Math.pow(0.001, dt));
    camera.lookAt(camTarget);
  } else if (cameraMode === 'top') {
    const desired = carPos.clone().add(new T.Vector3(0, 50, 0));
    camPos.lerp(desired, 1 - Math.pow(0.001, dt));
    camera.position.copy(camPos);
    camera.lookAt(carPos);
  }
}

function cycleCamera() {
  cameraMode = cameraMode === 'follow' ? 'top' : 'follow';
}

// ── Minimap renderer ──────────────────────────────────────────────────────────
function updateMinimap() {
  const cx   = MM_SIZE / 2;
  const cy   = MM_SIZE / 2;
  const scale = MM_SIZE / (MM_WORLD_RANGE * 2);

  mmCtx.clearRect(0, 0, MM_SIZE, MM_SIZE);

  // Background
  mmCtx.fillStyle = 'rgba(6,10,18,0.9)';
  mmCtx.fillRect(0, 0, MM_SIZE, MM_SIZE);

  // Grid
  mmCtx.strokeStyle = 'rgba(0,255,180,0.08)';
  mmCtx.lineWidth   = 0.5;
  for (let i = 0; i < MM_SIZE; i += 16) {
    mmCtx.beginPath(); mmCtx.moveTo(i, 0); mmCtx.lineTo(i, MM_SIZE); mmCtx.stroke();
    mmCtx.beginPath(); mmCtx.moveTo(0, i); mmCtx.lineTo(MM_SIZE, i); mmCtx.stroke();
  }

  // Draw obstacles (simplified)
  obstacles.objects.forEach(obs => {
    const p = obs.mesh.position;
    const px = cx + p.x * scale;
    const py = cy - p.z * scale;
    mmCtx.fillStyle = obs.type === 'building' ? '#223344' : '#332211';
    mmCtx.fillRect(px - 3, py - 3, 6, 6);
  });

  // Road
  mmCtx.strokeStyle = '#1a1a1a';
  mmCtx.lineWidth   = 8 * scale;
  mmCtx.beginPath();
  mmCtx.moveTo(cx, 0); mmCtx.lineTo(cx, MM_SIZE);
  mmCtx.stroke();
  mmCtx.beginPath();
  mmCtx.moveTo(0, cy); mmCtx.lineTo(MM_SIZE, cy);
  mmCtx.stroke();

  // Twin
  if (showTwin) {
    const tp = twinCar.mesh.position;
    const tx = cx + tp.x * scale;
    const ty = cy - tp.z * scale;
    mmCtx.fillStyle = '#4488ff';
    mmCtx.beginPath();
    mmCtx.arc(tx, ty, 4, 0, Math.PI * 2);
    mmCtx.fill();
  }

  // Real car
  const rp = realCar.mesh.position;
  const rx  = cx + rp.x * scale;
  const ry  = cy - rp.z * scale;

  // Direction indicator
  const dir = -realCar.mesh.rotation.y;
  mmCtx.save();
  mmCtx.translate(rx, ry);
  mmCtx.rotate(dir);
  mmCtx.fillStyle   = '#00ffb4';
  mmCtx.shadowColor = '#00ffb4';
  mmCtx.shadowBlur  = 6;
  mmCtx.beginPath();
  mmCtx.moveTo(0, -7);
  mmCtx.lineTo(-4, 5);
  mmCtx.lineTo(4, 5);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();

  // Range ring
  mmCtx.strokeStyle = 'rgba(0,255,180,0.12)';
  mmCtx.lineWidth   = 1;
  mmCtx.beginPath();
  mmCtx.arc(cx, cy, MM_SIZE / 2 - 1, 0, Math.PI * 2);
  mmCtx.stroke();
}

// ── HUD updates ───────────────────────────────────────────────────────────────
function updateHUD(state) {
  const speedKph = Math.abs(state.v) * 3.6;

  document.getElementById('tel-speed').textContent   = speedKph.toFixed(1) + ' km/h';
  document.getElementById('tel-steer').textContent   = (state.steeringAngle * 180 / Math.PI).toFixed(1) + '°';
  document.getElementById('tel-heading').textContent  = ((state.theta * 180 / Math.PI) % 360).toFixed(0) + '°';
  document.getElementById('tel-x').textContent        = state.x.toFixed(1);
  document.getElementById('tel-z').textContent        = state.z.toFixed(1);
  document.getElementById('tel-stress').textContent   = (state.stress * 100).toFixed(0) + '%';

  // Gauges
  const maxKph = physics.maxSpeed * 3.6;
  const spdPct = Math.min(100, (speedKph / maxKph) * 100);
  const spdEl  = document.getElementById('gauge-speed');
  spdEl.style.width      = spdPct + '%';
  spdEl.style.background = spdPct > 75 ? '#ff4400' : spdPct > 45 ? '#ffaa00' : '#00ffb4';

  document.getElementById('tel-speed').className = 'tel-value' +
    (spdPct > 80 ? ' critical' : spdPct > 55 ? ' warn' : '');

  const steerPct = 50 + (state.steeringAngle / physics.maxSteer) * 50;
  document.getElementById('gauge-steer').style.width = steerPct + '%';

  const stressPct = state.stress * 100;
  const stEl = document.getElementById('gauge-stress');
  stEl.style.width      = stressPct + '%';
  stEl.style.background = stressPct > 70 ? '#ff2244' : stressPct > 40 ? '#ffaa00' : '#00ff88';

  // Status badge
  const badge = document.getElementById('status-badge');
  const stext = document.getElementById('status-text');
  if (collision.isColliding) {
    badge.className = 'status-crit';
    stext.textContent = 'COLLISION';
  } else if (stressPct > 60) {
    badge.className = 'status-warn';
    stext.textContent = 'HIGH STRESS';
  } else {
    badge.className = 'status-ok';
    stext.textContent = 'NOMINAL';
  }
}

function updateTwinHUD(state) {
  const lag = twinState ? '~100ms' : 'LOCAL';
  document.getElementById('twin-x').textContent   = state.x.toFixed(1);
  document.getElementById('twin-z').textContent   = state.z.toFixed(1);
  document.getElementById('twin-lag').textContent = lag;
  document.getElementById('twin-pred').textContent = twinState ? 'BACKEND' : 'DEAD RECK.';
}

// ── Replay system ─────────────────────────────────────────────────────────────
function playbackStep() {
  if (replayIndex >= replayBuffer.length) {
    replayIndex = 0;
  }
  const frame = replayBuffer[replayIndex];
  realCar.update(frame);
  if (showHeatmap) realCar.setStress(frame.stress || 0);
  replayIndex++;

  document.getElementById('replay-frame').textContent = replayIndex;
  document.getElementById('replay-total').textContent = replayBuffer.length;

  const slider = document.getElementById('replay-slider');
  slider.max   = replayBuffer.length - 1;
  slider.value = replayIndex;
}

// ── Global button callbacks (referenced in HTML) ──────────────────────────────
window.toggleReplay = function() {
  if (!isReplaying) {
    if (isRecording) {
      // Stop recording, start replay
      isRecording  = false;
      isReplaying  = true;
      replayIndex  = 0;
      document.getElementById('btn-replay').textContent = '⏹ STOP REPLAY';
      document.getElementById('replay-panel').style.display = 'block';
      document.getElementById('replay-slider').max = replayBuffer.length - 1;
    } else {
      // Start recording
      replayBuffer.length = 0;
      isRecording = true;
      document.getElementById('btn-replay').textContent = '⏹ STOP REC';
      document.getElementById('btn-replay').classList.add('active');
    }
  } else {
    // Stop replay
    isReplaying = false;
    document.getElementById('btn-replay').textContent = '⏺ RECORD';
    document.getElementById('btn-replay').classList.remove('active');
    document.getElementById('replay-panel').style.display = 'none';
  }
};

window.toggleTwin = function() {
  showTwin = !showTwin;
  const btn = document.getElementById('btn-twin');
  btn.textContent = showTwin ? '👥 TWIN ON' : '👤 TWIN OFF';
  btn.classList.toggle('active', showTwin);
};

window.toggleHeatmap = function() {
  showHeatmap = !showHeatmap;
  const btn = document.getElementById('btn-heatmap');
  btn.textContent = showHeatmap ? '🔥 HEATMAP' : '❄ HEATMAP';
  btn.classList.toggle('active', showHeatmap);
  if (!showHeatmap) realCar.setStress(0);
};

window.resetVehicle = function() {
  physics.reset();
  realCar.update(physics.getState());
  camPos.set(0, 8, 20);
};

// Replay scrubber
document.getElementById('replay-slider').addEventListener('input', (e) => {
  replayIndex = parseInt(e.target.value);
});

// ── Kick off ──────────────────────────────────────────────────────────────────
animate();
