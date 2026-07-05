// Zero-asset sound: everything is synthesised with the WebAudio API so the
// game stays a handful of text files with no binary blobs.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // Must be created after a user gesture (browser autoplay policy).
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _blip(freq, dur, type = 'square', vol = 0.15, slide = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  shoot() { this._blip(720, 0.08, 'square', 0.08, -400); }
  hit()   { this._blip(180, 0.06, 'sawtooth', 0.12, -60); }
  kill()  { this._blip(90, 0.22, 'triangle', 0.16, -50); }
  hurt()  { this._blip(140, 0.3, 'sawtooth', 0.2, -90); }
  dash()  { this._blip(520, 0.16, 'sine', 0.12, 300); }
  pickup(){ this._blip(880, 0.14, 'sine', 0.14, 400); }
  wave()  { this._blip(440, 0.25, 'triangle', 0.16, 220); }
  over()  { this._blip(220, 0.6, 'sawtooth', 0.22, -160); }
}
