/**
 * websocket.js — Fixed for Production Deployment
 * Target: https://shadow-sim.onrender.com/ws
 */
export class TelemetrySocket {
  constructor(opts = {}) {
    // 🚀 FORCE FIX: Direct Render URL (No more localhost)
    this.url = 'wss://shadow-sim.onrender.com/ws';

    // ⚡ Production Settings
    this.latencySim = false; // Turn off artificial delay for live web
    this.latencyMs = 100;
    this.sendInterval = 50;   // 20Hz updates

    this.ws = null;
    this.connected = false;
    this.onTwinUpdate = null;  // callback(twinState)
    this.onStatus = null;      // callback('connected' | 'disconnected' | 'error')

    this._sendTimer = null;
    this._pendingData = null;
    this._reconnectDelay = 2000;

    // Start connection immediately
    this.connect();
  }

  connect() {
    try {
      // Clear any existing connection
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      }

      console.log(`🚀 Connecting to Shadow Backend: ${this.url}`);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("✅ LIVE: Connected to Render Backend");
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
        } catch (e) {
          // Silently ignore malformed JSON
        }
      };

      this.ws.onclose = () => {
        console.log("❌ LIVE: Disconnected from Backend");
        this.connected = false;
        this._stopSendLoop();
        if (this.onStatus) this.onStatus('disconnected');
        
        // Auto-reconnect with exponential backoff
        setTimeout(() => {
          console.log("🔄 Attempting to reconnect to Render...");
          this.connect();
        }, this._reconnectDelay);
        
        this._reconnectDelay = Math.min(10000, this._reconnectDelay * 1.5);
      };

      this.ws.onerror = (err) => {
        console.error("⚠️ WebSocket Connection Error:", err);
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
    if (!state || !this.connected) return;
    this._pendingData = {
      type:      'telemetry',
      position:  { x: state.x, z: state.z },
      velocity:  state.v || 0,
      steering_angle: state.steeringAngle || 0,
      heading:   state.theta || 0,
      timestamp: Date.now(),
    };
  }

  _startSendLoop() {
    this._stopSendLoop(); 
    this._sendTimer = setInterval(() => {
      if (!this.connected || !this._pendingData) return;
      
      const payload = JSON.stringify(this._pendingData);
      this._pendingData = null; 

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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