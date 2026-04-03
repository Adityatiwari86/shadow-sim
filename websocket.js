/**
 * websocket.js — Real-time telemetry WebSocket client
 *
 * - Sends vehicle telemetry to the backend
 * - Receives predicted/twin state from backend
 * - Simulates 100ms network latency for realism
 */

export class TelemetrySocket {
  constructor(opts = {}) {
    this.url          = opts.url || 'ws://localhost:8000/ws';
    this.latencySim   = opts.latencySim !== false; // simulate 100ms delay
    this.latencyMs    = opts.latencyMs || 100;
    this.sendInterval = opts.sendInterval || 50;   // ms between sends (20Hz)

    this.ws           = null;
    this.connected    = false;
    this.onTwinUpdate = null;  // callback(twinState)
    this.onStatus     = null;  // callback('connected' | 'disconnected' | 'error')

    this._sendTimer   = null;
    this._pendingData = null;
    this._reconnectDelay = 2000;

    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        this._reconnectDelay = 2000;
        if (this.onStatus) this.onStatus('connected');
        this._startSendLoop();
      };

      this.ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'twin_update' && this.onTwinUpdate) {
            this.onTwinUpdate(data.state);
          }
        } catch (_) {}
      };

      this.ws.onclose = () => {
        this.connected = false;
        this._stopSendLoop();
        if (this.onStatus) this.onStatus('disconnected');
        // Auto-reconnect
        setTimeout(() => this.connect(), this._reconnectDelay);
        this._reconnectDelay = Math.min(10000, this._reconnectDelay * 1.5);
      };

      this.ws.onerror = () => {
        if (this.onStatus) this.onStatus('error');
      };

    } catch (e) {
      setTimeout(() => this.connect(), this._reconnectDelay);
    }
  }

  /**
   * Queue vehicle state for transmission
   */
  sendState(state) {
    this._pendingData = {
      type:      'telemetry',
      position:  { x: state.x, z: state.z },
      velocity:  state.v,
      steering_angle: state.steeringAngle,
      heading:   state.theta,
      timestamp: Date.now(),
    };
  }

  _startSendLoop() {
    this._sendTimer = setInterval(() => {
      if (!this.connected || !this._pendingData) return;
      const payload = JSON.stringify(this._pendingData);
      this._pendingData = null;

      if (this.latencySim) {
        // Simulate network latency
        const jitter = (Math.random() - 0.5) * 20; // ±10ms jitter
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(payload);
          }
        }, this.latencyMs + jitter);
      } else {
        this.ws.send(payload);
      }
    }, this.sendInterval);
  }

  _stopSendLoop() {
    if (this._sendTimer) {
      clearInterval(this._sendTimer);
      this._sendTimer = null;
    }
  }

  disconnect() {
    this._stopSendLoop();
    if (this.ws) this.ws.close();
  }
}

/**
 * LocalTwin — fallback when backend is unavailable.
 * Applies dead-reckoning locally using the same algorithm
 * so the twin still works offline.
 */
export class LocalTwin {
  constructor(physicsEngine) {
    this.physics = physicsEngine;
    this.state   = null;
    this._lastTs = null;
  }

  feed(realState) {
    this.state   = { ...realState };
    this._lastTs = performance.now();
  }

  predict() {
    if (!this.state) return null;
    const now = performance.now();
    const dt  = (now - this._lastTs) / 1000;
    return this.physics.predict(this.state, dt);
  }
}
