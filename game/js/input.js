// Centralised keyboard + pointer state. The rest of the game just reads
// from an `Input` instance rather than wiring its own listeners.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this._pressed = new Set(); // one-shot: consumed on read

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this._pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    const setMouse = (e) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      if (!t) return;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouse.x = (t.clientX - rect.left) * scaleX;
      this.mouse.y = (t.clientY - rect.top) * scaleY;
    };

    canvas.addEventListener('mousemove', setMouse);
    canvas.addEventListener('mousedown', (e) => { setMouse(e); this.mouse.down = true; });
    addEventListener('mouseup', () => { this.mouse.down = false; });

    // Basic touch support: touch = aim + fire.
    canvas.addEventListener('touchstart', (e) => { setMouse(e); this.mouse.down = true; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { setMouse(e); e.preventDefault(); }, { passive: false });
    addEventListener('touchend', () => { this.mouse.down = false; });
  }

  // Held-down check.
  held(...keys) {
    return keys.some((k) => this.keys.has(k));
  }

  // True exactly once per physical key press.
  pressed(key) {
    if (this._pressed.has(key)) {
      this._pressed.delete(key);
      return true;
    }
    return false;
  }

  // Movement vector from WASD / arrows, normalised.
  moveVector() {
    let x = 0, y = 0;
    if (this.held('a', 'arrowleft')) x -= 1;
    if (this.held('d', 'arrowright')) x += 1;
    if (this.held('w', 'arrowup')) y -= 1;
    if (this.held('s', 'arrowdown')) y += 1;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, active: x !== 0 || y !== 0 };
  }
}
