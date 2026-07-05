// Lightweight particle system for explosions, sparks and thruster trails.
import { rand, TAU } from './utils.js';

class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.92;
    this.vy *= 0.92;
    this.life -= dt;
    return this.life > 0;
  }
}

export class Particles {
  constructor() { this.list = []; }

  burst(x, y, color, count = 14, speed = 260) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      this.list.push(new Particle(
        x, y,
        Math.cos(a) * s, Math.sin(a) * s,
        rand(0.25, 0.6), color, rand(2, 5)
      ));
    }
  }

  trail(x, y, color) {
    this.list.push(new Particle(
      x, y, rand(-20, 20), rand(-20, 20),
      rand(0.15, 0.35), color, rand(1.5, 3)
    ));
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (!this.list[i].update(dt)) this.list.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
