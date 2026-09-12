// The page: a procedurally drawn crowd with one striped guy somewhere in it.
// Everything is painted into a plain RGBA buffer, so the fly's eye and your screen
// read exactly the same pixels.
(function (F) {
  'use strict';

  const W = 960;
  const H = 600;
  const SPRITE_W = 18;
  const SPRITE_H = 40;
  const CROWD = 120;

  const RED = [214, 38, 38];
  const WHITE = [246, 246, 242];
  const BLACK = [28, 28, 32];
  const SKY = [70, 120, 215];
  const DENIM = [58, 86, 150];
  const BROWN = [110, 72, 44];
  const SKINS = [[244, 204, 170], [224, 172, 128], [176, 120, 82], [120, 78, 52]];
  const HAIR = [[40, 30, 24], [96, 60, 30], [200, 160, 90], [150, 150, 150], [180, 70, 30]];
  // Red and white appear twice: solid red and solid white shirts are the easy confusions.
  const SHIRTS = [RED, RED, WHITE, WHITE, BLACK, [52, 132, 72], [236, 196, 48], [232, 124, 36],
    [128, 64, 168], [236, 120, 168], [40, 150, 160], [120, 84, 60], [150, 154, 160], SKY];
  const PANTS = [DENIM, BLACK, [90, 90, 96], [150, 120, 80], [40, 60, 40]];

  const solid = (c) => () => c;
  const hStripes = (a, b) => (dx, dy) => (Math.floor(dy / 3) % 2 ? b : a);
  const vStripes = (a, b) => (dx) => (Math.floor(dx / 3) % 2 ? b : a);

  // Paint a rectangle. ox/oy shift the pattern so stripes line up across separate fills.
  function fill(buf, x0, y0, w, h, paint, ox = 0, oy = 0) {
    for (let dy = 0; dy < h; dy++) {
      const y = y0 + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx;
        if (x < 0 || x >= W) continue;
        const c = paint(dx + ox, dy + oy);
        const i = (y * W + x) * 4;
        buf[i] = c[0];
        buf[i + 1] = c[1];
        buf[i + 2] = c[2];
        buf[i + 3] = 255;
      }
    }
  }

  const HATS = {
    hair(buf, x, y, look) {
      fill(buf, x + 5, y + 4, 8, 3, solid(look.hair));
      fill(buf, x + 4, y + 6, 1, 4, solid(look.hair));
      fill(buf, x + 13, y + 6, 1, 4, solid(look.hair));
    },
    // The striped guy's bobble hat, in red and white bands.
    bobble(buf, x, y) {
      fill(buf, x + 8, y, 2, 2, solid(RED));
      fill(buf, x + 7, y + 2, 4, 2, solid(WHITE));
      fill(buf, x + 6, y + 4, 6, 2, solid(RED));
      fill(buf, x + 5, y + 6, 8, 2, solid(WHITE));
    },
    beret(buf, x, y) {
      fill(buf, x + 8, y + 3, 2, 1, solid(BLACK));
      fill(buf, x + 4, y + 4, 10, 3, solid(BLACK));
    },
    sailor(buf, x, y) {
      fill(buf, x + 5, y + 3, 8, 3, solid(WHITE));
      fill(buf, x + 5, y + 5, 8, 1, solid(SKY));
    },
    cap(buf, x, y, look) {
      fill(buf, x + 5, y + 4, 8, 3, solid(look.hatColor));
      fill(buf, x + 12, y + 6, 4, 1, solid(look.hatColor));
    },
    beanie(buf, x, y, look) {
      fill(buf, x + 5, y + 3, 8, 4, solid(look.hatColor));
    },
  };

  function lookFor(type, rand) {
    const skin = F.pick(SKINS, rand);
    switch (type) {
      case 'target':
        return { hat: 'bobble', skin, glasses: true, shirt: hStripes(RED, WHITE), pants: DENIM, shoes: BROWN };
      case 'mime':
        return { hat: 'beret', skin: WHITE, shirt: hStripes(BLACK, WHITE), pants: BLACK, shoes: BLACK };
      case 'sailor':
        return { hat: 'sailor', skin, shirt: hStripes(SKY, WHITE), pants: WHITE, shoes: BLACK };
      case 'referee':
        return { hat: 'cap', hatColor: BLACK, skin, shirt: vStripes(BLACK, WHITE), pants: BLACK, shoes: BLACK };
      default:
        return {
          hat: F.pick(['hair', 'hair', 'hair', 'cap', 'beanie'], rand),
          hair: F.pick(HAIR, rand),
          hatColor: F.pick(SHIRTS, rand),
          skin,
          shirt: solid(F.pick(SHIRTS, rand)),
          pants: F.pick(PANTS, rand),
          shoes: F.pick([BLACK, BROWN], rand),
        };
    }
  }

  function drawPerson(buf, p) {
    const { x, y, look } = p;
    fill(buf, x + 2, y + 38, 6, 2, solid(look.shoes));
    fill(buf, x + 10, y + 38, 6, 2, solid(look.shoes));
    fill(buf, x + 3, y + 33, 5, 5, solid(look.pants));
    fill(buf, x + 10, y + 33, 5, 5, solid(look.pants));
    fill(buf, x + 3, y + 28, 12, 5, solid(look.pants));
    fill(buf, x, y + 14, 18, 12, look.shirt);           // arms and chest
    fill(buf, x + 2, y + 26, 14, 2, look.shirt, 2, 12); // waist, stripes continued
    fill(buf, x, y + 26, 2, 2, solid(look.skin));       // hands
    fill(buf, x + 16, y + 26, 2, 2, solid(look.skin));
    fill(buf, x + 5, y + 6, 8, 8, solid(look.skin));    // head
    if (look.glasses) {
      fill(buf, x + 5, y + 8, 4, 3, solid(BLACK));
      fill(buf, x + 9, y + 8, 4, 3, solid(BLACK));
      fill(buf, x + 6, y + 9, 2, 1, solid(WHITE));
      fill(buf, x + 10, y + 9, 2, 1, solid(WHITE));
    } else {
      fill(buf, x + 6, y + 9, 2, 2, solid(BLACK));
      fill(buf, x + 10, y + 9, 2, 2, solid(BLACK));
    }
    HATS[look.hat](buf, x, y, look);
  }

  function paintGround(buf, rand) {
    const sand = [232, 214, 172];
    const grass = [140, 190, 100];
    const patches = Array.from({ length: 6 }, () => ({
      x: rand() * W, y: rand() * H, rx: 60 + rand() * 140, ry: 40 + rand() * 90,
    }));
    const onGrass = new Uint8Array(W);
    for (let y = 0; y < H; y++) {
      onGrass.fill(0);
      for (const p of patches) {
        const t = (y - p.y) / p.ry;
        if (t * t >= 1) continue;
        const half = p.rx * Math.sqrt(1 - t * t);
        onGrass.fill(1, Math.max(0, Math.ceil(p.x - half)), Math.min(W, Math.floor(p.x + half) + 1));
      }
      for (let x = 0; x < W; x++) {
        const base = onGrass[x] ? grass : sand;
        const noise = (rand() - 0.5) * 14;
        const i = (y * W + x) * 4;
        buf[i] = base[0] + noise;
        buf[i + 1] = base[1] + noise;
        buf[i + 2] = base[2] + noise;
        buf[i + 3] = 255;
      }
    }
  }

  // Scatter people so nobody overlaps.
  function placeCrowd(rand) {
    const spots = [];
    for (let tries = 0; spots.length < CROWD && tries < CROWD * 400; tries++) {
      const x = 4 + Math.floor(rand() * (W - SPRITE_W - 8));
      const y = 4 + Math.floor(rand() * (H - SPRITE_H - 8));
      const clear = spots.every((s) => Math.abs(s.x - x) >= SPRITE_W + 6 || Math.abs(s.y - y) >= SPRITE_H + 4);
      if (clear) spots.push({ x, y });
    }
    return spots;
  }

  // Everyone after the first seven is a solid-shirt bystander.
  const CAST = ['target', 'mime', 'mime', 'sailor', 'sailor', 'referee', 'referee'];

  function generate(rand) {
    const rgba = new Uint8ClampedArray(W * H * 4);
    paintGround(rgba, rand);
    const people = placeCrowd(rand).map((spot, id) => {
      const type = CAST[id] || 'solid';
      return {
        id, type, x: spot.x, y: spot.y,
        cx: spot.x + SPRITE_W / 2, cy: spot.y + SPRITE_H / 2,
        look: lookFor(type, rand),
      };
    });
    people.slice().sort((a, b) => a.y - b.y).forEach((p) => drawPerson(rgba, p));
    return { W, H, rgba, people, target: people[0] };
  }

  F.Scene = { W, H, SPRITE_W, SPRITE_H, generate };
})(globalThis.FLYDO = globalThis.FLYDO || {});
