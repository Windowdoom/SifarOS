// Roguelite upgrade pool. Each entry mutates the player's stats. The game
// offers three random, distinct upgrades between waves.
import { pick } from './utils.js';

export const UPGRADES = [
  {
    icon: '⚡', name: 'RAPID FIRE',
    desc: 'Fire 18% faster.',
    apply: (p) => { p.fireRate *= 0.82; },
  },
  {
    icon: '🔥', name: 'HIGH CALIBER',
    desc: '+30% bullet damage.',
    apply: (p) => { p.bulletDamage *= 1.3; },
  },
  {
    icon: '➕', name: 'SPLIT SHOT',
    desc: '+1 pellet per shot.',
    apply: (p) => { p.bulletCount += 1; },
  },
  {
    icon: '🎯', name: 'PIERCING',
    desc: 'Bullets pass through +1 enemy.',
    apply: (p) => { p.pierce += 1; },
  },
  {
    icon: '💨', name: 'OVERDRIVE',
    desc: '+15% move speed.',
    apply: (p) => { p.speed *= 1.15; },
  },
  {
    icon: '❤️', name: 'REINFORCE',
    desc: '+25 max HP and full heal.',
    apply: (p) => { p.maxHp += 25; p.heal(9999); },
  },
  {
    icon: '🚀', name: 'VELOCITY',
    desc: '+20% bullet speed.',
    apply: (p) => { p.bulletSpeed *= 1.2; },
  },
  {
    icon: '🩹', name: 'PATCH KIT',
    desc: 'Restore 40 HP now.',
    apply: (p) => { p.heal(40); },
  },
];

// Return `n` distinct random upgrades.
export function rollUpgrades(n = 3) {
  const pool = [...UPGRADES];
  const out = [];
  while (out.length < n && pool.length) {
    const idx = pool.indexOf(pick(pool));
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
