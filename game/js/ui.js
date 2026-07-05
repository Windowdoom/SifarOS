// Thin wrapper over the DOM overlays / HUD so game.js never touches the DOM
// directly. Each show* method flips the relevant panels.
export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      title: document.getElementById('title'),
      upgrade: document.getElementById('upgrade'),
      gameover: document.getElementById('gameover'),
      pause: document.getElementById('pause'),
      cards: document.getElementById('cards'),
      score: document.getElementById('score'),
      wave: document.getElementById('wave'),
      best: document.getElementById('best'),
      finalScore: document.getElementById('finalScore'),
      healthfill: document.getElementById('healthfill'),
    };
  }

  _only(...visible) {
    const panels = ['hud', 'title', 'upgrade', 'gameover', 'pause'];
    for (const name of panels) {
      this.el[name].classList.toggle('hidden', !visible.includes(name));
    }
  }

  showTitle() { this._only('title'); }

  showGame() {
    this._only('hud');
  }

  showUpgrades(choices, onPick) {
    this._only('hud', 'upgrade');
    this.el.cards.innerHTML = '';
    for (const c of choices) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        `<div class="icon">${c.icon}</div>` +
        `<div class="name">${c.name}</div>` +
        `<div class="desc">${c.desc}</div>`;
      card.addEventListener('click', () => onPick(c));
      this.el.cards.appendChild(card);
    }
  }

  showGameOver(score) {
    this._only('gameover');
    this.el.finalScore.textContent = `Score: ${score}`;
  }

  showPause() { this._only('hud', 'pause'); }

  setScore(v) { this.el.score.textContent = v; }
  setWave(v) { this.el.wave.textContent = v; }
  setBest(v) { this.el.best.textContent = v; }
  setHealth(ratio) {
    this.el.healthfill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }
}
