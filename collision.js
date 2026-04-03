/**
 * collision.js — Bounding-box collision detection
 *
 * Detects overlap between the car's AABB and obstacle BBs.
 * On collision:
 *   - dampens speed
 *   - triggers visual feedback
 *   - fires onCollision callback
 */

export class CollisionDetector {
  constructor(THREE_) {
    this.THREE       = THREE_;
    this.carBBox     = new THREE_.Box3();
    this.carHalfSize = new THREE_.Vector3(0.9, 0.8, 2.1); // car extents
    this.isColliding = false;
    this.onCollision = null; // callback(obstacle)
  }

  /**
   * @param {{ x, z }} carState
   * @param {Array}    obstacles   — [{ bbox: THREE.Box3, type }]
   * @returns {{ hit: bool, obstacle: null|Object }}
   */
  check(carState, obstacles) {
    const T = this.THREE;

    // Build car AABB
    const center = new T.Vector3(carState.x, 0.5, carState.z);
    this.carBBox.setFromCenterAndSize(center, this.carHalfSize.clone().multiplyScalar(2));

    for (const obs of obstacles) {
      // Expand obstacle bbox slightly
      const expanded = obs.bbox.clone().expandByScalar(0.1);
      if (this.carBBox.intersectsBox(expanded)) {
        if (!this.isColliding) {
          this.isColliding = true;
          if (this.onCollision) this.onCollision(obs);
        }
        return { hit: true, obstacle: obs };
      }
    }

    this.isColliding = false;
    return { hit: false, obstacle: null };
  }

  /**
   * Apply collision response to physics state
   * @param {{ v }} physics
   * @param {{ hit }} result
   */
  applyResponse(physics, result) {
    if (result.hit) {
      // Reverse and dampen velocity
      physics.v *= -0.35;
      if (Math.abs(physics.v) < 0.5) physics.v = 0;
    }
  }
}
