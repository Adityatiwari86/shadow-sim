"""
prediction.py — Dead-Reckoning Predictive Latency Compensation

Predicts future vehicle state using the Kinematic Bicycle Model
to smooth out network jitter and packet delay.
"""

import math
import time
from dataclasses import dataclass, field
from typing import Optional


# Vehicle constants (must match frontend physics.js)
WHEELBASE   = 2.5   # metres
MAX_SPEED   = 20.0  # m/s
MAX_STEER   = 0.45  # radians


@dataclass
class VehicleState:
    x:              float = 0.0
    z:              float = 0.0
    v:              float = 0.0          # speed m/s
    theta:          float = 0.0          # heading radians
    steering_angle: float = 0.0          # radians
    timestamp:      float = field(default_factory=time.time)
    stress:         float = 0.0


class PredictionEngine:
    """
    Given the last known telemetry packet, predict the current state
    using dead reckoning (kinematic bicycle model integration).
    """

    def __init__(self):
        self.last_state: Optional[VehicleState] = None

    def update(self, state: VehicleState) -> None:
        """Ingest a new telemetry measurement."""
        self.last_state = state

    def predict(self, target_time: Optional[float] = None) -> Optional[VehicleState]:
        """
        Predict vehicle state at `target_time` (default: now).
        Returns None if no state has been ingested yet.
        """
        if self.last_state is None:
            return None

        if target_time is None:
            target_time = time.time()

        dt = target_time - self.last_state.timestamp
        dt = max(0.0, min(dt, 0.5))  # clamp: don't predict more than 500ms ahead

        return self._integrate(self.last_state, dt)

    def _integrate(self, s: VehicleState, dt: float) -> VehicleState:
        """Kinematic bicycle model integration step."""
        if abs(s.v) < 0.001 or dt < 1e-6:
            return VehicleState(
                x=s.x, z=s.z, v=s.v,
                theta=s.theta, steering_angle=s.steering_angle,
                timestamp=s.timestamp + dt,
                stress=s.stress,
            )

        # Heading update
        d_theta = (s.v / WHEELBASE) * math.tan(s.steering_angle) * dt
        new_theta = s.theta + d_theta

        # Position update  (Three.js convention: x=right, z=forward)
        new_x = s.x + s.v * math.sin(new_theta) * dt
        new_z = s.z + s.v * math.cos(new_theta) * dt

        # Apply simple drag
        new_v = s.v * (0.94 ** (dt * 60))

        # Recompute stress
        speed_norm = abs(new_v) / MAX_SPEED
        steer_norm = abs(s.steering_angle) / MAX_STEER
        stress = min(1.0, speed_norm * 0.5 + steer_norm * speed_norm * 0.8)

        return VehicleState(
            x=new_x,
            z=new_z,
            v=new_v,
            theta=new_theta,
            steering_angle=s.steering_angle,
            timestamp=s.timestamp + dt,
            stress=stress,
        )

    def get_last(self) -> Optional[VehicleState]:
        return self.last_state
