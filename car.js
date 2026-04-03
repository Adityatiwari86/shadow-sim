/**
 * car.js — Vehicle mesh builder for Three.js
 *
 * Creates a stylised low-poly car mesh.
 * Exposes:
 *   .mesh       — THREE.Group (add to scene)
 *   .setStress(0–1) — colour heatmap
 *   .update(state)  — sync position / rotation
 */

export class Car {
  /**
   * @param {THREE} THREE_
   * @param {Object} opts  { color, isGhost }
   */
  constructor(THREE_, opts = {}) {
    this.THREE  = THREE_;
    this.color  = opts.color  || 0x00ffb4;
    this.isGhost = !!opts.isGhost;
    this.mesh   = this._build();
    this._stress = 0;
  }

  _build() {
    const T = this.THREE;
    const group = new T.Group();

    const bodyMat = new T.MeshPhongMaterial({
      color:       this.color,
      emissive:    new T.Color(this.color).multiplyScalar(0.15),
      shininess:   80,
      transparent: this.isGhost,
      opacity:     this.isGhost ? 0.55 : 1,
    });
    this._bodyMat = bodyMat;

    // ── Body ──────────────────────────────────────────────────────────────
    const body = new T.Mesh(
      new T.BoxGeometry(1.8, 0.5, 4.0),
      bodyMat
    );
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);

    // ── Cabin ─────────────────────────────────────────────────────────────
    const cabinMat = new T.MeshPhongMaterial({
      color:       this.isGhost ? this.color : 0x112233,
      transparent: this.isGhost,
      opacity:     this.isGhost ? 0.4 : 1,
      shininess:   120,
    });
    const cabin = new T.Mesh(
      new T.BoxGeometry(1.55, 0.4, 2.0),
      cabinMat
    );
    cabin.position.set(0, 0.95, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // ── Windshield glow (emissive strip) ──────────────────────────────────
    const windMat = new T.MeshPhongMaterial({
      color:     0x88ccff,
      emissive:  new T.Color(0x2244aa),
      shininess: 200,
      transparent: true,
      opacity: 0.7,
    });
    const wind = new T.Mesh(new T.BoxGeometry(1.5, 0.28, 0.05), windMat);
    wind.position.set(0, 0.97, 0.82);
    group.add(wind);

    // ── Wheels ────────────────────────────────────────────────────────────
    const wheelMat = new T.MeshPhongMaterial({ color: 0x111111, shininess: 60 });
    const rimMat   = new T.MeshPhongMaterial({ color: 0xcccccc, shininess: 120 });

    const wheelPositions = [
      { x:  1.0, y: 0.3, z:  1.3, steer: true,  name: 'wFL' },
      { x: -1.0, y: 0.3, z:  1.3, steer: true,  name: 'wFR' },
      { x:  1.0, y: 0.3, z: -1.3, steer: false, name: 'wRL' },
      { x: -1.0, y: 0.3, z: -1.3, steer: false, name: 'wRR' },
    ];

    this._frontWheels = [];

    wheelPositions.forEach(wp => {
      const wGroup = new T.Group();
      wGroup.position.set(wp.x, wp.y, wp.z);

      const tire = new T.Mesh(
        new T.CylinderGeometry(0.32, 0.32, 0.22, 12),
        wheelMat
      );
      tire.rotation.z = Math.PI / 2;
      wGroup.add(tire);

      const rim = new T.Mesh(
        new T.CylinderGeometry(0.18, 0.18, 0.24, 6),
        rimMat
      );
      rim.rotation.z = Math.PI / 2;
      wGroup.add(rim);

      group.add(wGroup);

      if (wp.steer) this._frontWheels.push(wGroup);
    });

    // ── Headlights ────────────────────────────────────────────────────────
    const hlMat = new T.MeshPhongMaterial({
      color:   0xffffcc,
      emissive: new T.Color(0x998800),
    });
    [-0.6, 0.6].forEach(x => {
      const hl = new T.Mesh(new T.BoxGeometry(0.35, 0.15, 0.05), hlMat);
      hl.position.set(x, 0.55, 2.03);
      group.add(hl);
    });

    // ── Tail-lights ───────────────────────────────────────────────────────
    const tlMat = new T.MeshPhongMaterial({
      color:   0xff2200,
      emissive: new T.Color(0x880000),
    });
    [-0.6, 0.6].forEach(x => {
      const tl = new T.Mesh(new T.BoxGeometry(0.35, 0.15, 0.05), tlMat);
      tl.position.set(x, 0.55, -2.03);
      group.add(tl);
    });

    group.castShadow    = true;
    group.receiveShadow = true;
    return group;
  }

  /**
   * Sync mesh with physics state
   * @param {{ x, z, theta, steeringAngle }} state
   */
  update(state) {
    this.mesh.position.set(state.x, 0, state.z);
    this.mesh.rotation.y = -state.theta;

    // Steer front wheels
    this._frontWheels.forEach(w => {
      w.rotation.y = -state.steeringAngle;
    });
  }

  /**
   * Set stress heatmap colour (0 = green, 1 = red)
   * @param {number} s 0–1
   */
  setStress(s) {
    s = Math.max(0, Math.min(1, s));
    this._stress = s;

    // Interpolate green → yellow → red
    let r, g, b;
    if (s < 0.5) {
      r = s * 2;
      g = 1;
      b = 0;
    } else {
      r = 1;
      g = 1 - (s - 0.5) * 2;
      b = 0;
    }

    const c = new this.THREE.Color(r, g, b);
    if (!this.isGhost) {
      this._bodyMat.color.set(c);
      this._bodyMat.emissive.copy(c).multiplyScalar(0.25);
    }
  }

  /**
   * Smooth lerp the mesh toward a target state (for twin)
   */
  lerpTo(state, alpha) {
    const target = new this.THREE.Vector3(state.x, 0, state.z);
    this.mesh.position.lerp(target, alpha);

    // Slerp heading
    const targetQ = new this.THREE.Quaternion().setFromEuler(
      new this.THREE.Euler(0, -state.theta, 0)
    );
    this.mesh.quaternion.slerp(targetQ, alpha);
  }
}
