// The orchestrator: owns the world state, the fixed update/draw loop, wave
// pacing, collisions, scoring and transitions between UI states.
import { Player } from './player.js';
import { Enemy, spawnTypeForWave } from './enemy.js';
import { Particles } from './particles.js';
import { rollUpgrades } from './upgrades.js';
import { collides, clamp, rand, hsl, TAU } from './utils.js';

const STATE = { TITLE: 'title', PLAYING: 'playing', UPGRADE: 'upgrade', OVER: 'over', PAUSED: 'paused' };
const BEST_KEY = 'neondrift.best';

export class Game {
  constructor(canvas, input, sfx, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.sfx = sfx;
    this.ui = ui;
    this.bounds = { w: canvas.width, h: canvas.height };

    this.state = STATE.TITLE;
    this.best = Number(localStorage.getItem(BEST_KEY) || 0);
    this.ui.setBest(this.best);

    this._last = performance.now();
    this._acc = 0;
    this._starfield = this._makeStars(90);

    requestAnimationFrame(this._frame);
  }

  // ---- lifecycle ----------------------------------------------------------
  reset() {
    this.player = new Player(this.bounds.w / 2, this.bounds.h / 2);
    this.enemies = [];
    this.bullets = [];
    this.particles = new Particles();
    this.score = 0;
    this.wave = 0;
    this.shake = 0;
    this.ui.setScore(0);
    this.ui.setHealth(1);
    this.startWave(1);
  }

  start() {
    this.reset();
    this.state = STATE.PLAYING;
    this.ui.showGame();
  }

  startWave(n) {
    this.wave = n;
    // Enemy budget grows each wave; spawns are metered out over time.
    this._toSpawn = 4 + n * 3;
    this._spawnTimer = 0;
    this._spawnEvery = clamp(1.1 - n * 0.05, 0.35, 1.1);
    this.ui.setWave(n);
    if (n > 1) this.sfx.wave();
  }

  offerUpgrades() {
    this.state = STATE.UPGRADE;
    const choices = rollUpgrades(3);
    this.ui.showUpgrades(choices, (choice) => {
      choice.apply(this.player);
      this.sfx.pickup();
      this.startWave(this.wave + 1);
      this.state = STATE.PLAYING;
      this.ui.showGame();
    });
  }

  gameOver() {
    this.state = STATE.OVER;
    this.sfx.over();
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(BEST_KEY, String(this.best));
      this.ui.setBest(this.best);
    }
    this.ui.showGameOver(this.score);
  }

  // ---- main loop ----------------------------------------------------------
  _frame = (now) => {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;

    if (this.state === STATE.PLAYING) this.update(dt);
    else if (this.input.pressed('p') && this.state === STATE.PAUSED) this.resume();

    this.draw(dt);
    requestAnimationFrame(this._frame);
  };

  update(dt) {
    if (this.input.pressed('p')) { this.pause(); return; }

    const { player, enemies, bullets, particles, bounds } = this;

    // Player + firing.
    const newBullets = player.update(dt, this.input, bounds, this.sfx, particles);
    bullets.push(...newBullets);

    // Spawning.
    this._spawnTimer -= dt;
    if (this._toSpawn > 0 && this._spawnTimer <= 0) {
      this._spawnTimer = this._spawnEvery;
      this._toSpawn--;
      this.spawnEnemy();
    }

    // Enemies.
    for (const e of enemies) e.update(dt, player);

    // Bullets.
    for (const b of bullets) b.update(dt, bounds);

    // Bullet -> enemy collisions.
    for (const b of bullets) {
      if (!b.friendly || b.dead) continue;
      for (const e of enemies) {
        if (e.dead || b.hitSet.has(e)) continue;
        if (collides(b, e)) {
          b.hitSet.add(e);
          const killed = e.hurt(b.damage);
          this.sfx.hit();
          particles.burst(b.x, b.y, hsl(e.hue, 90, 60), 5, 160);
          if (killed) {
            this.score += e.score;
            this.ui.setScore(this.score);
            this.sfx.kill();
            this.shake = Math.min(10, this.shake + 4);
            particles.burst(e.x, e.y, hsl(e.hue, 90, 60), 18, 300);
          }
          if (b.pierce > 0) { b.pierce--; } else { b.dead = true; break; }
        }
      }
    }

    // Enemy -> player collisions.
    for (const e of enemies) {
      if (e.dead) continue;
      if (collides(e, player)) {
        if (player.damage(e.damage)) {
          this.sfx.hurt();
          this.shake = 12;
          particles.burst(player.x, player.y, hsl(0, 90, 60), 20, 320);
          this.ui.setHealth(player.hp / player.maxHp);
          // Knock the enemy back so it doesn't melt the player instantly.
          const a = Math.atan2(e.y - player.y, e.x - player.x);
          e.x += Math.cos(a) * 26;
          e.y += Math.sin(a) * 26;
        }
      }
    }

    // Cleanup.
    this.bullets = bullets.filter((b) => !b.dead);
    this.enemies = enemies.filter((e) => !e.dead);
    particles.update(dt);
    this.shake *= 0.86;

    // End conditions.
    if (player.hp <= 0) { this.gameOver(); return; }
    if (this._toSpawn === 0 && this.enemies.length === 0) this.offerUpgrades();
  }

  spawnEnemy() {
    // Spawn just outside a random edge, then let it home in.
    const edge = Math.floor(rand(0, 4));
    const { w, h } = this.bounds;
    let x, y;
    if (edge === 0) { x = rand(0, w); y = -20; }
    else if (edge === 1) { x = w + 20; y = rand(0, h); }
    else if (edge === 2) { x = rand(0, w); y = h + 20; }
    else { x = -20; y = rand(0, h); }
    this.enemies.push(new Enemy(spawnTypeForWave(this.wave), x, y, this.wave));
  }

  pause() { this.state = STATE.PAUSED; this.ui.showPause(); }
  resume() { this.state = STATE.PLAYING; this.ui.showGame(); this._last = performance.now(); }

  // ---- rendering ----------------------------------------------------------
  _makeStars(n) {
    return Array.from({ length: n }, () => ({
      x: rand(0, this.bounds.w),
      y: rand(0, this.bounds.h),
      z: rand(0.3, 1),
    }));
  }

  draw(dt) {
    const { ctx, bounds } = this;
    ctx.clearRect(0, 0, bounds.w, bounds.h);

    // Camera shake.
    ctx.save();
    if (this.shake > 0.3) {
      ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
    }

    // Parallax starfield (drifts slowly, always animated).
    for (const s of this._starfield) {
      s.y += s.z * 14 * dt;
      if (s.y > bounds.h) { s.y = 0; s.x = rand(0, bounds.w); }
      ctx.globalAlpha = s.z;
      ctx.fillStyle = '#7fb8ff';
      ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2);
    }
    ctx.globalAlpha = 1;

    // Grid glow.
    this._drawGrid(ctx);

    if (this.state !== STATE.TITLE && this.player) {
      for (const b of this.bullets) b.draw(ctx);
      for (const e of this.enemies) e.draw(ctx);
      this.particles.draw(ctx);
      this.player.draw(ctx);
    }

    ctx.restore();
  }

  _drawGrid(ctx) {
    const step = 48;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.bounds.w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, this.bounds.h); }
    for (let y = 0; y <= this.bounds.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(this.bounds.w, y); }
    ctx.stroke();
  }
}

export { STATE };
