/**
 * obstacles.js — Static scene obstacles
 *
 * Creates:
 *   - Box buildings
 *   - Traffic cones
 *   - Barriers
 *   - Road surface / grid
 *
 * Exposes:
 *   .objects[]     — array of { mesh, bbox } for collision
 *   .addToScene(s) — add all meshes
 */

export class ObstacleManager {
  constructor(THREE_) {
    this.THREE   = THREE_;
    this.objects = []; // { mesh: THREE.Mesh, bbox: THREE.Box3, type }
    this._scene  = null;
  }

  build(scene) {
    this._scene = scene;
    this._buildGround();
    this._buildGrid();
    this._buildRoad();
    this._buildBuildings();
    this._buildCones();
    this._buildBarriers();
    this._buildTrees();
  }

  // ── Ground plane ─────────────────────────────────────────────────────────
  _buildGround() {
    const T = this.THREE;
    const geo = new T.PlaneGeometry(300, 300, 30, 30);
    const mat = new T.MeshPhongMaterial({
      color: 0x0d1a0d,
      shininess: 5,
    });
    const ground = new T.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this._scene.add(ground);
  }

  // ── Grid lines ────────────────────────────────────────────────────────────
  _buildGrid() {
    const T = this.THREE;
    const helper = new T.GridHelper(300, 60, 0x112211, 0x112211);
    helper.position.y = 0.01;
    this._scene.add(helper);
  }

  // ── Road surface ─────────────────────────────────────────────────────────
  _buildRoad() {
    const T = this.THREE;
    const roadMat = new T.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 20 });

    // Main straight road (Z axis)
    const roadMain = new T.Mesh(new T.PlaneGeometry(10, 200), roadMat);
    roadMain.rotation.x = -Math.PI / 2;
    roadMain.position.y = 0.01;
    roadMain.receiveShadow = true;
    this._scene.add(roadMain);

    // Cross road (X axis)
    const roadCross = new T.Mesh(new T.PlaneGeometry(200, 10), roadMat);
    roadCross.rotation.x = -Math.PI / 2;
    roadCross.position.y = 0.01;
    roadCross.receiveShadow = true;
    this._scene.add(roadCross);

    // Road markings (dashes)
    const dashMat = new T.MeshPhongMaterial({ color: 0xdddd00 });
    for (let z = -90; z < 90; z += 12) {
      const dash = new T.Mesh(new T.PlaneGeometry(0.25, 6), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.02, z);
      this._scene.add(dash);
    }
  }

  // ── Buildings ─────────────────────────────────────────────────────────────
  _buildBuildings() {
    const layout = [
      // { x, z, w, h, d }
      { x:  20, z:  20, w: 8,  h: 14, d: 10 },
      { x: -25, z:  30, w: 10, h: 20, d: 8  },
      { x:  30, z: -15, w: 6,  h: 10, d: 12 },
      { x: -18, z: -25, w: 12, h: 18, d: 7  },
      { x:  40, z:  50, w: 9,  h: 12, d: 9  },
      { x: -40, z: -45, w: 7,  h: 22, d: 11 },
      { x:  50, z: -40, w: 8,  h: 16, d: 8  },
      { x: -50, z:  40, w: 10, h: 10, d: 10 },
    ];

    layout.forEach(b => this._addBox(
      b.x, b.h / 2, b.z,
      b.w, b.h, b.d,
      this._buildingColor(),
      'building'
    ));
  }

  _buildingColor() {
    const palette = [0x1a2233, 0x223344, 0x1a3322, 0x332211, 0x221133];
    return palette[Math.floor(Math.random() * palette.length)];
  }

  // ── Traffic cones ─────────────────────────────────────────────────────────
  _buildCones() {
    const positions = [
      [  6, 15 ], [ -6, 15 ], [  6, -15 ], [ -6, -15 ],
      [  8, 35 ], [ -8, 35 ], [  8, -35 ], [ -8, -35 ],
    ];
    positions.forEach(([x, z]) => this._addCone(x, z));
  }

  _addCone(x, z) {
    const T = this.THREE;
    const group = new T.Group();

    // Cone body
    const coneMat = new T.MeshPhongMaterial({ color: 0xff6600, emissive: new T.Color(0.2, 0.1, 0) });
    const cone = new T.Mesh(new T.ConeGeometry(0.3, 0.9, 8), coneMat);
    cone.position.y = 0.45;
    group.add(cone);

    // White stripe
    const stripeMat = new T.MeshPhongMaterial({ color: 0xffffff });
    const stripe = new T.Mesh(new T.CylinderGeometry(0.31, 0.31, 0.1, 8), stripeMat);
    stripe.position.y = 0.5;
    group.add(stripe);

    // Base
    const base = new T.Mesh(new T.CylinderGeometry(0.4, 0.42, 0.08, 8),
      new T.MeshPhongMaterial({ color: 0x111111 }));
    base.position.y = 0.04;
    group.add(base);

    group.position.set(x, 0, z);
    group.castShadow = true;
    this._scene.add(group);

    // Collision box (simplified cylinder → box)
    const bbox = new T.Box3().setFromObject(group);
    this.objects.push({ mesh: group, bbox, type: 'cone' });
  }

  // ── Barriers ──────────────────────────────────────────────────────────────
  _buildBarriers() {
    const segments = [
      { x:  12, z: 0,   len: 20, axis: 'z' },
      { x: -12, z: 0,   len: 20, axis: 'z' },
      { x: 0,   z: 45,  len: 12, axis: 'x' },
      { x: 0,   z: -45, len: 12, axis: 'x' },
    ];

    segments.forEach(s => {
      const count = Math.floor(s.len / 3);
      for (let i = 0; i < count; i++) {
        const ox = s.axis === 'z' ? s.x : s.x + (i - count / 2) * 3;
        const oz = s.axis === 'z' ? s.z + (i - count / 2) * 3 : s.z;
        this._addBarrierBlock(ox, oz);
      }
    });
  }

  _addBarrierBlock(x, z) {
    const T = this.THREE;
    const mat = new T.MeshPhongMaterial({
      color: 0xcccccc,
      shininess: 40,
    });
    // Concrete K-rail shape via scaled box
    const barrier = new T.Mesh(new T.BoxGeometry(0.6, 0.8, 2.5), mat);
    barrier.position.set(x, 0.4, z);
    barrier.castShadow    = true;
    barrier.receiveShadow = true;

    // Red/white markings
    const markMat = new T.MeshPhongMaterial({ color: 0xff2200 });
    const mark = new T.Mesh(new T.BoxGeometry(0.62, 0.1, 2.52), markMat);
    mark.position.set(x, 0.75, z);
    this._scene.add(mark);
    this._scene.add(barrier);

    const bbox = new T.Box3().setFromObject(barrier);
    this.objects.push({ mesh: barrier, bbox, type: 'barrier' });
  }

  // ── Trees ─────────────────────────────────────────────────────────────────
  _buildTrees() {
    const positions = [
      [ 60, 60], [-60, 60], [60, -60], [-60, -60],
      [ 25, 60], [-25, 60], [25, -60], [-25, -60],
    ];
    positions.forEach(([x, z]) => this._addTree(x, z));
  }

  _addTree(x, z) {
    const T = this.THREE;
    const group = new T.Group();

    const trunk = new T.Mesh(
      new T.CylinderGeometry(0.3, 0.4, 2.5, 6),
      new T.MeshPhongMaterial({ color: 0x4a2e00 })
    );
    trunk.position.y = 1.25;
    group.add(trunk);

    const foliage = new T.Mesh(
      new T.ConeGeometry(2.5, 5, 7),
      new T.MeshPhongMaterial({ color: 0x1a5c1a, emissive: new T.Color(0.02, 0.08, 0.02) })
    );
    foliage.position.y = 5.5;
    group.add(foliage);

    group.position.set(x, 0, z);
    group.castShadow = true;
    this._scene.add(group);

    const bbox = new T.Box3().setFromObject(trunk);
    this.objects.push({ mesh: group, bbox, type: 'tree' });
  }

  // ── Generic box helper ────────────────────────────────────────────────────
  _addBox(x, y, z, w, h, d, color, type) {
    const T = this.THREE;
    const mat = new T.MeshPhongMaterial({ color, shininess: 30 });
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    this._scene.add(mesh);

    // Window glow (emissive plane patches)
    this._addWindowGlow(mesh, w, h, d, x, y, z);

    const bbox = new T.Box3().setFromObject(mesh);
    this.objects.push({ mesh, bbox, type });
  }

  _addWindowGlow(parent, w, h, d, px, py, pz) {
    const T = this.THREE;
    const mat = new T.MeshPhongMaterial({
      color: 0xffffaa,
      emissive: new T.Color(0.4, 0.4, 0.1),
      transparent: true,
      opacity: 0.6,
    });
    const rows = Math.floor(h / 3);
    const cols = Math.floor(w / 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.4) {
          const win = new T.Mesh(new T.PlaneGeometry(0.6, 0.8), mat);
          win.position.set(
            px - w / 2 + 1.2 + c * 2,
            py - h / 2 + 2 + r * 3,
            pz + d / 2 + 0.01
          );
          this._scene.add(win);
        }
      }
    }
  }

  /**
   * Recompute bounding boxes (call after scene setup)
   */
  refreshBBoxes() {
    this.objects.forEach(o => {
      o.bbox.setFromObject(o.mesh);
    });
  }
}
