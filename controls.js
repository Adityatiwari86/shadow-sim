/**
 * controls.js — Keyboard input handler
 */

export class Controls {
  constructor() {
    this.keys = {};
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _onKeyDown(e) {
    this.keys[e.code] = true;
    e.preventDefault && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code) && e.preventDefault();
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  getInput() {
    return {
      forward:    !!(this.keys['KeyW'] || this.keys['ArrowUp']),
      brake:      !!(this.keys['KeyS'] || this.keys['ArrowDown']),
      steerLeft:  !!(this.keys['KeyA'] || this.keys['ArrowLeft']),
      steerRight: !!(this.keys['KeyD'] || this.keys['ArrowRight']),
    };
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }
}
