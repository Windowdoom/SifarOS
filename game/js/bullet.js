// Projectiles fired by the player (and, potentially, enemies). `pierce`
// lets a bullet punch through multiple targets before dying.
import { TAU, hsl } from './utils.js';

export class Bullet {
  constructor(x, y, vx, vy, damage, pierce = 0, friendly = true) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = 4;
    this.damage = damage;
    this.pierce = pierce;
    this.friendly = friendly;
    this.dead = false;
    this.hitSet = new Set(); // avoid double-hitting the same enemy while piercing
  }

  update(dt, bounds) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -10 || this.x > bounds.w + 10 || this.y < -10 || this.y > bounds.h + 10) {
      this.dead = true;
    }
  }

  draw(ctx) {
    const c = this.friendly ? hsl(55, 100, 65) : hsl(340, 100, 65);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 12;
    ctx.shadowColor = c;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
