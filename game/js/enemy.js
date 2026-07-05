// Enemy types with distinct behaviours. All share a simple interface:
// update(dt, player) and draw(ctx). Stats scale with the wave number.
import { angleTo, TAU, hsl, rand } from './utils.js';

const TYPES = {
  // Chaser: fast, weak, homes straight in.
  grunt: {
    color: 0,        // hue
    hp: 30, r: 11, speed: 95, damage: 12, score: 10,
  },
  // Tank: slow, tough, big hit.
  brute: {
    color: 280,
    hp: 120, r: 20, speed: 55, damage: 26, score: 30,
  },
  // Weaver: erratic sine-wave approach, hard to hit.
  weaver: {
    color: 150,
    hp: 45, r: 10, speed: 120, damage: 14, score: 20,
  },
};

export class Enemy {
  constructor(type, x, y, wave) {
    const t = TYPES[type];
    this.type = type;
    this.x = x; this.y = y;
    this.r = t.r;
    this.hue = t.color;
    const scale = 1 + (wave - 1) * 0.12;
    this.maxHp = t.hp * scale;
    this.hp = this.maxHp;
    this.speed = t.speed * (1 + (wave - 1) * 0.04);
    this.damage = t.damage;
    this.score = t.score;
    this.dead = false;
    this._phase = rand(0, TAU);
    this._flash = 0;
  }

  hurt(amount) {
    this.hp -= amount;
    this._flash = 0.12;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  update(dt, player) {
    this._flash = Math.max(0, this._flash - dt);
    const a = angleTo(this.x, this.y, player.x, player.y);
    let vx = Math.cos(a) * this.speed;
    let vy = Math.sin(a) * this.speed;

    if (this.type === 'weaver') {
      // Add a perpendicular oscillation for a serpentine path.
      this._phase += dt * 6;
      const perp = a + Math.PI / 2;
      const sway = Math.sin(this._phase) * this.speed * 0.9;
      vx += Math.cos(perp) * sway;
      vy += Math.sin(perp) * sway;
    }

    this.x += vx * dt;
    this.y += vy * dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const lit = this._flash > 0;
    const color = lit ? '#fff' : hsl(this.hue, 85, 58);
    ctx.shadowBlur = 16;
    ctx.shadowColor = hsl(this.hue, 90, 55);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    if (this.type === 'grunt') {
      // triangle
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * TAU - Math.PI / 2;
        const px = Math.cos(ang) * this.r, py = Math.sin(ang) * this.r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
    } else if (this.type === 'brute') {
      // hexagon, hollow
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU;
        const px = Math.cos(ang) * this.r, py = Math.sin(ang) * this.r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      this._drawHpRing(ctx);
      return;
    } else {
      // weaver: diamond
      ctx.moveTo(0, -this.r);
      ctx.lineTo(this.r, 0);
      ctx.lineTo(0, this.r);
      ctx.lineTo(-this.r, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawHpRing() { /* placeholder kept for API symmetry */ }
}

// Weighted spawn table that unlocks tougher foes as waves progress.
export function spawnTypeForWave(wave) {
  const table = [['grunt', 6]];
  if (wave >= 2) table.push(['weaver', 3]);
  if (wave >= 3) table.push(['brute', 2]);
  const total = table.reduce((s, [, w]) => s + w, 0);
  let roll = rand(0, total);
  for (const [type, w] of table) {
    if ((roll -= w) <= 0) return type;
  }
  return 'grunt';
}
