"""
data_filter.py — Z-score based outlier detection & data integrity layer

Filters noisy / invalid telemetry packets before they reach the
prediction engine or are broadcast to connected clients.
"""

from collections import deque
from typing import Optional
import math


class TelemetryFilter:
    """
    Sliding-window Z-score outlier detector.

    For each field (x, z, v, steering_angle) it maintains a rolling
    mean and standard deviation.  If a new sample deviates by more
    than `z_threshold` sigmas it is flagged as an outlier.
    """

    def __init__(self, window: int = 30, z_threshold: float = 3.5):
        self.window      = window
        self.z_threshold = z_threshold

        # One deque per tracked field
        self._fields = ['x', 'z', 'v', 'steering_angle']
        self._history: dict[str, deque] = {
            f: deque(maxlen=window) for f in self._fields
        }

    # ── Public API ────────────────────────────────────────────────────────

    def validate(self, packet: dict) -> tuple[bool, str]:
        """
        Returns (is_valid, reason).
        Checks hard limits AND Z-score outlier detection.
        """
        # ── Hard limit checks ──────────────────────────────────────────
        v = packet.get('velocity', 0)
        if abs(v) > 25:
            return False, f"velocity out of range: {v}"

        sa = packet.get('steering_angle', 0)
        if abs(sa) > 0.6:
            return False, f"steering_angle out of range: {sa}"

        pos = packet.get('position', {})
        if abs(pos.get('x', 0)) > 500 or abs(pos.get('z', 0)) > 500:
            return False, "position out of bounds"

        # ── Z-score check ──────────────────────────────────────────────
        sample = {
            'x':             pos.get('x', 0),
            'z':             pos.get('z', 0),
            'v':             v,
            'steering_angle': sa,
        }

        for field, value in sample.items():
            hist = self._history[field]
            if len(hist) >= 5:  # need at least 5 samples for meaningful stats
                z = self._zscore(value, hist)
                if z > self.z_threshold:
                    return False, f"Z-score outlier on {field}: z={z:.2f}"

        # ── Accepted — update history ──────────────────────────────────
        for field, value in sample.items():
            self._history[field].append(value)

        return True, "ok"

    # ── Internal helpers ──────────────────────────────────────────────────

    @staticmethod
    def _mean(data: deque) -> float:
        return sum(data) / len(data) if data else 0.0

    @staticmethod
    def _std(data: deque, mean: float) -> float:
        if len(data) < 2:
            return 1.0  # default to 1 to avoid divide-by-zero
        variance = sum((x - mean) ** 2 for x in data) / (len(data) - 1)
        return math.sqrt(variance) or 1.0

    def _zscore(self, value: float, hist: deque) -> float:
        mean = self._mean(hist)
        std  = self._std(hist, mean)
        return abs(value - mean) / std
