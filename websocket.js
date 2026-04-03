/**
 * websocket.js — Production Optimized
 * Handshake with: wss://shadow-sim.onrender.com/ws
 */
export class TelemetrySocket {
  constructor(opts = {}) {
    // 🚀 PRODUCTION URL: Render automatically uses SSL (wss)
    // Note: Agar '/ws' kaam na kare, toh niche sirf 'wss://shadow-sim.onrender.com' try karna
    this.url = 'wss://shadow-sim.onrender.com/ws';

    this.latencySim = false; 
    this.sendInterval = 50;  // 20Hz update rate

    this.ws = null;
    this.connected = false;
    this.onTwinUpdate = null;
    this.onStatus = null;

    this._sendTimer = null;
    this._pendingData = null;
    this._reconnectDelay = 2000;

    this.connect();
  }

  connect() {
    try {
      // Pehle se khule connection ko saaf karein
      if (this.ws) {
        this.ws.close();
      }

      console.log(`📡 Attempting Connection: ${this.url}`);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("✅ SYSTEM ONLINE: Connected to Render Backend");
        this.connected = true;
        this._reconnectDelay = 2000; // Reset delay on success
        if (this.onStatus) this.onStatus('connected');
        this._startSendLoop();
      };

      this.ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          // Backend expects 'twin_update' type
          if (data.type === 'twin_update' && this.onTwinUpdate) {
            this.onTwinUpdate(data.state);
          }
        } catch (e) {
          console.warn("⚠️ Received non-JSON data");
        }
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        this._stopSendLoop();
        
        let reason = event.wasClean ? "Clean Exit" : "Network/Server Issue";
        console.log(`❌ DISCONNECTED: ${reason} (Code: ${event.code})`);
        
        if (this.onStatus) this.onStatus('disconnected');
        
        // Exponential Backoff Reconnect
        setTimeout(() => {
          console.log("🔄 Re-establishing uplink...");
          this.connect();
        }, this._reconnectDelay);
        
        this._reconnectDelay = Math.min(10000, this._reconnectDelay * 1.5);
      };

      this.ws.onerror = (err) => {
        console.error("⚠️ WEBSOCKET ERROR: Connection refused or timed out.");
        if (this.onStatus) this.onStatus('error');
      };

    } catch (e) {
      console.error("🔥 CRITICAL: Failed to initialize WebSocket:", e);
    }
  }

  sendState(state) {
    if (!state || !this.connected) return;
    
    // Standardizing the telemetry packet
    this._pendingData = {
      type: 'telemetry',
      position: { x: state.x, z: state.z },
      velocity: state.v || 0,
      steering_angle: state.steeringAngle || 0,
      heading: state.theta || 0,
      timestamp: Date.now(),
    };
  }

  _startSendLoop() {
    this._stopSendLoop(); 
    this._sendTimer = setInterval(() => {
      if (!this.connected || !this._pendingData) return;
      
      const payload = JSON.stringify(this._pendingData);
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(payload);
        this._pendingData = null; // Clear after successful send
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
 * LocalTwin — Physics-based fallback
 */
export class LocalTwin {
  constructor(physicsEngine) {
    this.physics = physicsEngine;
    this.state = null;
    this._lastTs = null;
  }

  feed(realState) {
    this.state = { ...realState };
    this._lastTs = performance.now();
  }

  predict() {
    if (!this.state) return null;
    const now = performance.now();
    const dt = (now - this._lastTs) / 1000;
    return this.physics.predict(this.state, dt);
  }
}