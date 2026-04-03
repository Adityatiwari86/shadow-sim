# 🚗 Shadow-Sim — Real-Time Vehicle Digital Twin & Interactive Simulation Platform

A complete, production-grade simulation platform featuring a controllable 3D vehicle, real-time telemetry streaming, predictive dead-reckoning, and a synchronized digital twin.

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Three.js)                  │
│                                                             │
│  Keyboard  →  Controls  →  PhysicsEngine                   │
│                              (Kinematic Bicycle Model)      │
│                                    │                        │
│                              CollisionDetector              │
│                                    │                        │
│                              Car Mesh (real)                │
│                              Car Mesh (twin) ◄───────────┐  │
│                                    │                      │  │
│                          TelemetrySocket ─── WS ──────►  │  │
└────────────────────────────────────│─────────────────────│──┘
                                     │                     │
                              WebSocket (20Hz)             │
                                     │                     │
┌────────────────────────────────────▼─────────────────────│──┐
│                        BACKEND (FastAPI)                  │  │
│                                                           │  │
│  WS /ws  →  TelemetryHandler                             │  │
│                │                                          │  │
│          TelemetryFilter (Z-score outlier detection)     │  │
│                │                                          │  │
│          PredictionEngine (dead reckoning +100ms)        │  │
│                │                                          │  │
│          ConnectionManager ─── broadcast ─── WS ─────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
shadow-sim/
├── frontend/
│   ├── index.html      — HUD, canvas, UI elements
│   ├── main.js         — App entry, scene, game loop, minimap
│   ├── car.js          — Three.js vehicle mesh + stress heatmap
│   ├── physics.js      — Kinematic Bicycle Model engine
│   ├── controls.js     — Keyboard input handler
│   ├── obstacles.js    — Buildings, cones, barriers, trees
│   ├── collision.js    — AABB collision detection
│   ├── websocket.js    — WS client, local dead-reckoning fallback
│   └── Dockerfile      — nginx static server
│
├── backend/
│   ├── main.py              — FastAPI app, REST + WS endpoints
│   ├── websocket_handler.py — Connection manager, telemetry handler
│   ├── prediction.py        — Dead-reckoning prediction engine
│   ├── data_filter.py       — Z-score outlier detection
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml
└── README.md
```

---

## 🚀 Quick Start

### Option A — Docker (recommended)

```bash
# Clone / unzip the project
cd shadow-sim

# Build and start everything
docker-compose up --build

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# Backend docs: http://localhost:8000/docs
```

### Option B — Local Development

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend**
```bash
cd frontend
# Any static server works:
python -m http.server 3000
# OR
npx serve . -p 3000
```

Open `http://localhost:3000`

---

## 🎮 Controls

| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / Reverse |
| A / ← | Steer Left |
| D / → | Steer Right |
| R | Reset vehicle position |
| C | Toggle camera (follow / top-down) |

### HUD Buttons

| Button | Function |
|--------|----------|
| ⏺ RECORD | Start recording a replay buffer |
| ⏹ STOP REC | Stop recording, switch to replay |
| 👥 TWIN ON/OFF | Show/hide the digital twin vehicle |
| 🔥 HEATMAP | Toggle stress colour heatmap |
| ↺ RESET | Teleport vehicle back to origin |

---

## ⚙️ Physics Engine

The vehicle uses the **Kinematic Bicycle Model**:

```
x     = x + v·cos(θ)·dt
z     = z + v·sin(θ)·dt
θ     = θ + (v/L)·tan(δ)·dt
```

Parameters:
- `L = 2.5 m`  — wheelbase
- max speed `20 m/s` (~72 km/h)
- friction / rolling resistance: per-frame velocity damping
- steering: smooth interpolation with auto-centre

---

## 📡 Telemetry Protocol

### Client → Server (telemetry)
```json
{
  "type":           "telemetry",
  "position":       { "x": 12.3, "z": -5.4 },
  "velocity":       8.2,
  "steering_angle": 0.15,
  "heading":        1.07,
  "timestamp":      1700000000000
}
```

### Server → Client (twin update, 20 Hz)
```json
{
  "type": "twin_update",
  "state": {
    "x": 12.5, "z": -5.6,
    "v": 8.1,
    "theta": 1.08,
    "steeringAngle": 0.15,
    "stress": 0.32
  },
  "predicted_ahead_ms": 100,
  "server_time": 1700000000.123
}
```

---

## 🧠 Dead-Reckoning Prediction

The backend **predicts 100ms into the future** from the last received packet to compensate for network latency:

```python
predicted_x = x + v·sin(θ)·dt
predicted_z = z + v·cos(θ)·dt
predicted_θ = θ + (v/L)·tan(δ)·dt
dt = 0.10  # 100ms
```

The frontend twin mesh then **lerps smoothly** toward the predicted position (`alpha = dt × 8`) eliminating visual jitter.

If the WebSocket is unavailable, the frontend falls back to **local dead-reckoning** (same algorithm, runs client-side).

---

## 🛡️ Data Integrity

Packets are rejected if:
1. **Hard limits** violated: `|v| > 25`, `|steering| > 0.6`, position outside ±500
2. **Z-score outlier**: value deviates > 3.5σ from 30-sample rolling window

---

## 🔥 Stress Heatmap

```
stress = speed_norm × 0.5 + steer_norm × speed_norm × 0.8
```

Colour mapping:
- `0.0` → 🟢 Green (safe)
- `0.5` → 🟡 Yellow (moderate)
- `1.0` → 🔴 Red (high stress)

---

## 📊 REST API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check + uptime |
| `GET /state` | Latest raw + predicted state |
| `GET /stats` | Client count, telemetry status |
| `WS  /ws` | Real-time telemetry channel |
| `GET /docs` | Swagger UI |

---

## 🗺️ Features Summary

- ✅ Controllable 3D vehicle (keyboard)
- ✅ Kinematic Bicycle Model physics
- ✅ Friction, drag, max-speed, smooth steering
- ✅ Third-person + top-down camera with smooth lerp
- ✅ 3D environment: road, grid, buildings, cones, barriers, trees
- ✅ AABB collision detection with visual feedback
- ✅ Stress heatmap (green→red) on vehicle body
- ✅ Real-time WebSocket telemetry (20 Hz)
- ✅ FastAPI backend with dead-reckoning prediction (+100ms)
- ✅ Z-score outlier filtering
- ✅ Multi-client broadcast
- ✅ Digital twin with smooth interpolation
- ✅ Local dead-reckoning fallback (offline mode)
- ✅ Replay recording + scrub playback
- ✅ Minimap with car heading arrow
- ✅ Live HUD: speed, steering, heading, stress, collision status
- ✅ WS connection indicator
- ✅ Docker multi-container deployment

---

## 🧪 Testing Scenarios

### Latency test
The frontend simulates 100ms ± 10ms jitter. Watch the twin lag behind on sharp turns, then catch up — demonstrating dead-reckoning compensation.

### Collision test
Drive into any barrier or building. Speed is reversed and damped; the screen flashes red; the status badge shows COLLISION.

### Extreme steering test
Hold A or D at full speed. Stress heatmap turns red; the status shows HIGH STRESS.

### Replay test
1. Click ⏺ RECORD and drive around
2. Click ⏹ STOP REC to enter replay mode
3. Drag the scrubber to jump to any frame
