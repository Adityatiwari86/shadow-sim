"""
websocket_handler.py — WebSocket connection manager

Handles:
  - Multiple simultaneous client connections
  - Per-client message routing
  - Broadcasting twin-state updates to all clients
"""

import asyncio
import json
import time
import logging
from typing import Set
from fastapi import WebSocket, WebSocketDisconnect

from prediction import PredictionEngine, VehicleState
from data_filter import TelemetryFilter

logger = logging.getLogger("shadow-sim.ws")


class ConnectionManager:
    """Manages all active WebSocket connections."""

    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.add(ws)
        logger.info(f"Client connected. Total: {len(self.active)}")

    def disconnect(self, ws: WebSocket) -> None:
        self.active.discard(ws)
        logger.info(f"Client disconnected. Total: {len(self.active)}")

    async def broadcast(self, message: dict) -> None:
        """Send a message to every connected client."""
        payload = json.dumps(message)
        dead = set()
        for ws in list(self.active):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self.active -= dead

    async def send_to(self, ws: WebSocket, message: dict) -> None:
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            self.disconnect(ws)


class TelemetryHandler:
    """
    Processes incoming telemetry from a single vehicle client,
    runs prediction, and broadcasts twin-state to ALL clients.
    """

    def __init__(self, manager: ConnectionManager):
        self.manager  = manager
        self.predictor = PredictionEngine()
        self.filter    = TelemetryFilter()
        self._broadcast_task: asyncio.Task | None = None

    async def handle(self, ws: WebSocket) -> None:
        await self.manager.connect(ws)

        # Start periodic broadcast if not already running
        if self._broadcast_task is None or self._broadcast_task.done():
            self._broadcast_task = asyncio.create_task(self._broadcast_loop())

        try:
            while True:
                raw = await ws.receive_text()
                await self._process(ws, raw)
        except WebSocketDisconnect:
            self.manager.disconnect(ws)
        except Exception as e:
            logger.error(f"Handler error: {e}")
            self.manager.disconnect(ws)

    async def _process(self, ws: WebSocket, raw: str) -> None:
        try:
            packet = json.loads(raw)
        except json.JSONDecodeError:
            await self.manager.send_to(ws, {"type": "error", "msg": "invalid JSON"})
            return

        if packet.get("type") != "telemetry":
            return

        # ── Data validation ──────────────────────────────────────────────
        valid, reason = self.filter.validate(packet)
        if not valid:
            logger.debug(f"Filtered packet: {reason}")
            await self.manager.send_to(ws, {
                "type": "filtered",
                "reason": reason,
            })
            return

        # ── Update prediction engine ─────────────────────────────────────
        pos = packet.get("position", {})
        state = VehicleState(
            x              = float(pos.get("x", 0)),
            z              = float(pos.get("z", 0)),
            v              = float(packet.get("velocity", 0)),
            theta          = float(packet.get("heading", 0)),
            steering_angle = float(packet.get("steering_angle", 0)),
            timestamp      = float(packet.get("timestamp", time.time() * 1000)) / 1000,
        )
        self.predictor.update(state)

    async def _broadcast_loop(self) -> None:
        """
        Broadcasts predicted twin state to ALL clients at 20 Hz.
        The prediction compensates for network latency by forecasting
        100ms into the future from the last known state.
        """
        INTERVAL = 0.05  # 20 Hz
        PREDICT_AHEAD = 0.10  # 100ms dead-reckoning

        while True:
            await asyncio.sleep(INTERVAL)

            predicted = self.predictor.predict(
                target_time=time.time() + PREDICT_AHEAD
            )
            if predicted is None:
                continue

            msg = {
                "type": "twin_update",
                "state": {
                    "x":              predicted.x,
                    "z":              predicted.z,
                    "v":              predicted.v,
                    "theta":          predicted.theta,
                    "steeringAngle":  predicted.steering_angle,
                    "stress":         predicted.stress,
                },
                "predicted_ahead_ms": PREDICT_AHEAD * 1000,
                "server_time":        time.time(),
            }

            await self.manager.broadcast(msg)
