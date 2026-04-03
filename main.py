"""
main.py — Shadow-Sim FastAPI Backend

Endpoints:
  GET  /          — health check
  GET  /state     — latest vehicle state (REST)
  WS   /ws        — real-time telemetry + twin broadcast
  GET  /stats     — connection statistics
"""

import asyncio
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from websocket_handler import ConnectionManager, TelemetryHandler

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("shadow-sim")

# ── App-level singletons ──────────────────────────────────────────────────────
manager = ConnectionManager()
handler = TelemetryHandler(manager)
start_time = time.time()


# ── App factory ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚗 Shadow-Sim backend starting...")
    yield
    logger.info("Shadow-Sim backend shutting down.")


app = FastAPI(
    title="Shadow-Sim Backend",
    description="Real-Time Vehicle Digital Twin Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS (allow frontend dev server) ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── HTTP Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "Shadow-Sim",
        "status":  "ok",
        "uptime_s": round(time.time() - start_time, 1),
        "clients": len(manager.active),
    }


@app.get("/state")
async def get_state():
    """Return the latest raw + predicted vehicle state via REST."""
    predictor = handler.predictor
    raw       = predictor.get_last()
    predicted = predictor.predict()

    if raw is None:
        return JSONResponse({"error": "No telemetry received yet"}, status_code=503)

    return {
        "raw": {
            "x":             raw.x,
            "z":             raw.z,
            "v":             raw.v,
            "theta":         raw.theta,
            "steering_angle": raw.steering_angle,
            "stress":        raw.stress,
            "timestamp":     raw.timestamp,
        },
        "predicted": {
            "x":             predicted.x,
            "z":             predicted.z,
            "v":             predicted.v,
            "theta":         predicted.theta,
            "steering_angle": predicted.steering_angle,
            "stress":        predicted.stress,
        } if predicted else None,
    }


@app.get("/stats")
async def stats():
    return {
        "connected_clients": len(manager.active),
        "uptime_s":          round(time.time() - start_time, 1),
        "has_telemetry":     handler.predictor.get_last() is not None,
    }


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await handler.handle(ws)


# ── Entry point (for direct `python main.py` usage) ──────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
