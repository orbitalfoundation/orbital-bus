// mulberry32 — fast seeded 32-bit PRNG.
// Returns a function that produces a float in [0, 1) on each call.
// Same seed -> same sequence, useful for reproducible simulations.
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
