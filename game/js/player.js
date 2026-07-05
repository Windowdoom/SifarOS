// The player ship: movement with momentum, a dash with i-frames, and a
// firing system whose stats are mutated by upgrades from the game loop.
import { clamp, angleTo, TAU, hsl } from './utils.js';
import { Bullet } from './bullet.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 12;
    this.angle = 0;

    // Base stats — upgrades scale these.
    this.speed = 2400;        // acceleration
    this.maxHp = 100;
    this.hp = 100;
    this.fireRate = 0.16;     // seconds between shots
    this.bulletSpeed = 620;
    this.bulletDamage = 24;
    this.bulletCount = 1;     // pellets per shot
    this.spread = 0.14;
    this.pierce = 0;

    // Dash.
    this.dashCd = 0;
    this.dashTime = 0;        // >0 while dashing (invulnerable)

    this._fireCd = 0;
    this._hitFlash = 0;
  }

  get invulnerable() { return this.dashTime > 0 || this._hitFlash > 0.4; }

  damage(amount) {
    if (this.invulnerable) return false;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this._hitFlash = 0.5;
    return true;
  }

  heal(amount) { this.hp = clamp(this.hp + amount, 0, this.maxHp); }

  update(dt, input, bounds, sfx, particles) {
    const move = input.moveVector();

    // Dash.
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    if (input.pressed('shift') && this.dashCd <= 0 && move.active) {
      this.vx += move.x * 900;
      this.vy += move.y * 900;
      this.dashTime = 0.18;
      this.dashCd = 1.1;
      sfx.dash();
      particles.burst(this.x, this.y, hsl(190), 16, 300);
    }

    // Accelerate + friction.
    if (move.active) {
      this.vx += move.x * this.speed * dt;
      this.vy += move.y * this.speed * dt;
      particles.trail(this.x, this.y, hsl(190, 90, 60, 0.8));
    }
    this.vx *= 0.86;
    this.vy *= 0.86;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Keep inside arena.
    this.x = clamp(this.x, this.r, bounds.w - this.r);
    this.y = clamp(this.y, this.r, bounds.h - this.r);

    // Aim at pointer.
    this.angle = angleTo(this.x, this.y, input.mouse.x, input.mouse.y);

    // Fire.
    this._fireCd = Math.max(0, this._fireCd - dt);
    this._hitFlash = Math.max(0, this._hitFlash - dt);
    const wantFire = input.mouse.down || input.held(' ');
    const bullets = [];
    if (wantFire && this._fireCd <= 0) {
      this._fireCd = this.fireRate;
      sfx.shoot();
      const base = this.angle;
      const n = this.bulletCount;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * this.spread * n;
        const a = base + off;
        bullets.push(new Bullet(
          this.x + Math.cos(a) * this.r,
          this.y + Math.sin(a) * this.r,
          Math.cos(a) * this.bulletSpeed,
          Math.sin(a) * this.bulletSpeed,
          this.bulletDamage, this.pierce, true
        ));
      }
    }
    return bullets;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const flash = this._hitFlash > 0 && Math.floor(this._hitFlash * 20) % 2 === 0;
    const glow = this.dashTime > 0 ? hsl(190, 100, 70) : (flash ? '#fff' : hsl(190, 100, 60));

    ctx.shadowBlur = 18;
    ctx.shadowColor = glow;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-11, -10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, 10);
    ctx.closePath();
    ctx.fill();

    // cockpit dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#06070f';
    ctx.beginPath();
    ctx.arc(2, 0, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
