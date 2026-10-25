// A copy of dewarim-merchants' rng.mjs (modules cannot import each other's files) - test/copies.test.mjs.
// A small seeded random number generator (mulberry32), so a restock plan can be tested with fixed dice.

/** @returns {() => number} a generator of numbers in [0, 1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n items picked from a list without repeats. */
export function sample(items, n, rng) {
  const pool = [...items];
  const out = [];
  while ( pool.length && (out.length < n) ) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
