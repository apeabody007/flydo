// Shared helpers.
(function (F) {
  'use strict';

  // mulberry32: a small seeded random number generator, so any run can be replayed.
  F.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  F.pick = (items, rand) => items[Math.floor(rand() * items.length)];
})(globalThis.FLYDO = globalThis.FLYDO || {});
