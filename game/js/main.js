// Entry point: wire the canvas, input, audio, UI and game together, then
// bind the two buttons that kick things off.
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const input = new Input(canvas);
const sfx = new Sfx();
const ui = new UI();
const game = new Game(canvas, input, sfx, ui);

ui.showTitle();

const begin = () => { sfx.init(); game.start(); };

document.getElementById('startBtn').addEventListener('click', begin);
document.getElementById('retryBtn').addEventListener('click', begin);

// Expose for quick debugging in the console.
window.__neondrift = { game, input, sfx };
