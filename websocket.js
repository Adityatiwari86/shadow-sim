/**
 * websocket.js — Real-time telemetry WebSocket client
 *
 * - Sends vehicle telemetry to the backend
 * - Receives predicted/twin state from backend
 * - Simulates 100ms network latency for realism
 */
export class TelemetrySocket {
  constructor(opts = {}) {
    // 🚀 Update: Render ka URL default set kar diya hai
    // Agar local chalaoge toh opts.url mein localhost pass kar sakte ho
    const defaultUrl = 'wss://shadow-sim.onrender.com/ws';
    this.url = opts.url || defaultUrl;

    // ⚡ Update: Production par latency simulation off rakhenge
    this.latencySim = opts.latencySim || false; 
    this.latencyMs = opts.latencyMs || 100;
    this.sendInterval = opts.sendInterval || 50;   // 20Hz

    this.ws = null;
    this.connected = false;
    this.onTwinUpdate = null;  // callback(twinState)
    this.onStatus = null;      // callback('connected' | 'disconnected' | 'error')

    this._sendTimer = null;
    this._pendingData = null;
    this._reconnectDelay = 2000;

    this.connect();
  }

  connect() {
    try {
      console.log(`Connecting to: ${this.url}`);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("✅ Connected to Shadow Backend");
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
        console.log("❌ Disconnected from Shadow Backend");
        this.connected = false;
        this._stopSendLoop();
        if (this.onStatus) this.onStatus('disconnected');
        
        // Auto-reconnect logic
        setTimeout(() => {
          console.log("🔄 Attempting to reconnect...");
          this.connect();
        }, this._reconnectDelay);
        
        this._reconnectDelay = Math.min(10000, this._reconnectDelay * 1.5);
      };

      this.ws.onerror = (err) => {
        console.error("⚠️ WebSocket Error:", err);
        if (this.onStatus) this.onStatus('error');
      };

    } catch (e) {
      console.error("Critical Connection Error:", e);
      setTimeout(() => this.connect(), this._reconnectDelay);
    }
  }

  /**
   * Queue vehicle state for transmission
   */
  sendState(state) {
    if (!state) return;
    this._pendingData = {
      type:      'telemetry',
      position:  { x: state.x, z: state.z },
      velocity:  state.v,
      steering_angle: state.steeringAngle || 0,
      heading:   state.theta,
      timestamp: Date.now(),
    };
  }

  _startSendLoop() {
    this._stopSendLoop(); // Ensure no double loops
    this._sendTimer = setInterval(() => {
      if (!this.connected || !this._pendingData) return;
      
      const payload = JSON.stringify(this._pendingData);
      this._pendingData = null; // Clear after preparing payload

      if (this.latencySim) {
        const jitter = (Math.random() - 0.5) * 20;
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(payload);
          }
        }, this.latencyMs + jitter);
      } else {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(payload);
        }
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
 * LocalTwin — fallback for offline/local prediction
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