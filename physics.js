/**
 * physics.js — Kinematic Bicycle Model
 *
 * Equations:
 *   x     = x + v * cos(θ) * dt
 *   y     = y + v * sin(θ) * dt
 *   θ     = θ + (v / L) * tan(δ) * dt
 *
 * Extended with: friction, drag, max-speed, smooth steering
 */

export class PhysicsEngine {
  constructor() {
    // Vehicle parameters
    this.L            = 2.5;   // wheelbase (m)
    this.maxSpeed     = 20;    // m/s  (~72 km/h)
    this.maxReverse   = 8;     // m/s
    this.maxSteer     = 0.45;  // radians (~26°)
    this.accel        = 10;    // m/s² acceleration
    this.brakeForce   = 18;    // m/s² braking
    this.friction     = 0.94;  // velocity damping per frame (applied each tick)
    this.steerSpeed   = 2.8;   // steering angle rate (rad/s)
    this.steerReturn  = 5.0;   // auto-centering rate when not steering

    // Derived state
    this.v            = 0;     // current speed (m/s), negative = reverse
    this.theta        = 0;     // heading (radians)
    this.steeringAngle= 0;     // current steering angle (radians)

    // World position
    this.x            = 0;
    this.z            = 0;     // we use Z as the 2-D forward axis in Three.js

    // Stress
    this.stress       = 0;
  }

  /**
   * @param {Object} input  - { forward, brake, steerLeft, steerRight }
   * @param {number} dt     - delta time in seconds
   */
  update(input, dt) {
    dt = Math.min(dt, 0.05); // clamp to avoid explosion on tab-switch

    // ── Steering ──────────────────────────────────────────────────────────
    const steerDir = (input.steerLeft ? -1 : 0) + (input.steerRight ? 1 : 0);

    if (steerDir !== 0) {
      this.steeringAngle += steerDir * this.steerSpeed * dt;
    } else {
      // Return-to-center
      const sign = Math.sign(this.steeringAngle);
      const reduction = this.steerReturn * dt;
      if (Math.abs(this.steeringAngle) <= reduction) {
        this.steeringAngle = 0;
      } else {
        this.steeringAngle -= sign * reduction;
      }
    }
    this.steeringAngle = Math.max(-this.maxSteer, Math.min(this.maxSteer, this.steeringAngle));

    // ── Acceleration / Braking ─────────────────────────────────────────────
    if (input.forward) {
      this.v += this.accel * dt;
    } else if (input.brake) {
      this.v -= this.brakeForce * dt;
    } else {
      // Friction / rolling resistance
      this.v *= Math.pow(this.friction, dt * 60); // framerate-independent
    }

    // Clamp speed
    this.v = Math.max(-this.maxReverse, Math.min(this.maxSpeed, this.v));

    // Stop near zero to avoid creep
    if (Math.abs(this.v) < 0.05) this.v = 0;

    // ── Kinematic Bicycle Model ────────────────────────────────────────────
    if (Math.abs(this.v) > 0.001) {
      // heading update
      const dTheta = (this.v / this.L) * Math.tan(this.steeringAngle) * dt;
      this.theta += dTheta;

      // position update  (Three.js: X=right, Z=forward)
      this.x += this.v * Math.sin(this.theta) * dt;
      this.z += this.v * Math.cos(this.theta) * dt;
    }

    // ── Stress Index ───────────────────────────────────────────────────────
    const speedNorm = Math.abs(this.v) / this.maxSpeed;
    const steerNorm = Math.abs(this.steeringAngle) / this.maxSteer;
    this.stress = Math.min(1, speedNorm * 0.5 + steerNorm * speedNorm * 0.8);

    return this.getState();
  }

  getState() {
    return {
      x:             this.x,
      z:             this.z,
      v:             this.v,
      theta:         this.theta,
      steeringAngle: this.steeringAngle,
      stress:        this.stress,
    };
  }

  setState(state) {
    this.x             = state.x;
    this.z             = state.z;
    this.v             = state.v;
    this.theta         = state.theta;
    this.steeringAngle = state.steeringAngle;
  }

  reset() {
    this.x = 0; this.z = 0;
    this.v = 0; this.theta = 0;
    this.steeringAngle = 0;
    this.stress = 0;
  }

  /**
   * Dead-reckoning prediction for the digital twin
   */
  predict(state, dt) {
    const theta  = state.theta + (state.v / this.L) * Math.tan(state.steeringAngle) * dt;
    const x      = state.x + state.v * Math.sin(theta) * dt;
    const z      = state.z + state.v * Math.cos(theta) * dt;
    return { ...state, x, z, theta };
  }
}
