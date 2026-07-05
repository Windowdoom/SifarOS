// Small math + helper toolkit shared across modules.

export const TAU = Math.PI * 2;

export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

// Angle between two points.
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

// Circle vs circle overlap test.
export const collides = (a, b) => dist2(a.x, a.y, b.x, b.y) < (a.r + b.r) ** 2;

// HSL string helper for cheap neon coloring.
export const hsl = (h, s = 90, l = 55, a = 1) =>
  `hsla(${h}, ${s}%, ${l}%, ${a})`;
