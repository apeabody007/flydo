// The fly's compound eye: one facet per eye column, using this fly's real column counts,
// looking down at the page from just above whoever it is checking out.
(function (F) {
  'use strict';

  const SPACING = 2;                          // page pixels between neighbouring facets
  const ROW_H = (SPACING * Math.sqrt(3)) / 2; // hex rows sit closer together than columns
  const HALF_W = 11;                          // the patch the visual projection neurons pool:
  const HALF_H = 22;                          // one person plus a little margin
  const REGION_COLS = 2;                      // per eye
  const REGION_ROWS = 6;
  const FEATURES = 4;                         // bright, dark, horizontal stripes, vertical stripes
  const REGIONS = REGION_COLS * REGION_ROWS;
  const VPN_PER_EYE = REGIONS * FEATURES;

  // Outer photoreceptors peak in blue-green and barely respond to red, so red paint reads
  // as dark to a fly. These are rough weights for sRGB primaries.
  const flyLuminance = (r, g, b) => (0.05 * r + 0.45 * g + 0.5 * b) / 255;

  const columns = F.CONNECTOME.eyeColumns;
  const facets = buildFacets(columns.left + columns.right);
  const reach = Math.sqrt(facets[facets.length - 1].d);

  function buildFacets(total) {
    const radius = Math.sqrt((total * SPACING * ROW_H) / Math.PI) + 4;
    const rows = Math.ceil(radius / ROW_H);
    const cols = Math.ceil(radius / SPACING) + 1;
    const lattice = [];
    for (let r = -rows; r <= rows; r++) {
      const odd = ((r % 2) + 2) % 2 === 1;
      for (let c = -cols; c <= cols; c++) {
        const x = c * SPACING + (odd ? SPACING / 2 : 0);
        const y = r * ROW_H;
        lattice.push({ r, c, odd, x, y, d: x * x + y * y });
      }
    }
    lattice.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    const disc = lattice.slice(0, total);

    // The leftmost `columns.left` facets are the left eye; the rest are the right eye.
    disc.slice().sort((a, b) => a.x - b.x || a.y - b.y)
      .forEach((f, i) => { f.eye = i < columns.left ? 0 : 1; });

    const index = new Map(disc.map((f, i) => [`${f.r},${f.c}`, i]));
    const at = (r, c) => index.get(`${r},${c}`) ?? -1;
    for (const f of disc) {
      f.right = at(f.r, f.c + 1);
      f.upLeft = at(f.r - 1, f.odd ? f.c : f.c - 1);
      f.upRight = at(f.r - 1, f.odd ? f.c + 1 : f.c);
      f.region = regionOf(f);
    }
    return disc;
  }

  function regionOf(f) {
    if (Math.abs(f.x) >= HALF_W || Math.abs(f.y) >= HALF_H) return -1;
    const left = f.eye === 0 ? -HALF_W : 0;
    const col = Math.min(REGION_COLS - 1, Math.max(0, Math.floor(((f.x - left) * REGION_COLS) / HALF_W)));
    const row = Math.min(REGION_ROWS - 1, Math.floor(((f.y + HALF_H) * REGION_ROWS) / (2 * HALF_H)));
    return row * REGION_COLS + col;
  }

  function luminanceMap(rgba, width, height) {
    const lum = new Float32Array(width * height);
    for (let j = 0, i = 0; j < lum.length; j++, i += 4) lum[j] = flyLuminance(rgba[i], rgba[i + 1], rgba[i + 2]);
    return lum;
  }

  function sample(scene, x, y) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= scene.W || iy >= scene.H) return 0.5;
    return scene.lum[iy * scene.W + ix];
  }

  // What the fly sees hovering at (cx, cy): a brightness for every facet, plus what its
  // visual projection neurons report to each mushroom body.
  function look(scene, cx, cy) {
    const lum = new Float32Array(facets.length);
    for (let i = 0; i < facets.length; i++) {
      const x = cx + facets[i].x;
      const y = cy + facets[i].y;
      // Each facet blurs over roughly its own width.
      lum[i] = (sample(scene, x - 0.5, y - 0.5) + sample(scene, x + 0.5, y - 0.5) +
        sample(scene, x - 0.5, y + 0.5) + sample(scene, x + 0.5, y + 0.5)) / 4;
    }

    const vpn = [new Float32Array(VPN_PER_EYE), new Float32Array(VPN_PER_EYE)];
    const counts = [new Uint16Array(REGIONS), new Uint16Array(REGIONS)];
    for (let i = 0; i < facets.length; i++) {
      const f = facets[i];
      if (f.region < 0 || f.upLeft < 0 || f.upRight < 0 || f.right < 0) continue;
      const v = vpn[f.eye];
      const base = f.region * FEATURES;
      const L = lum[i];
      v[base] += L;                                                        // bright
      v[base + 1] += 1 - L;                                                // dark
      v[base + 2] += Math.abs(L - (lum[f.upLeft] + lum[f.upRight]) / 2);  // changes going up: horizontal stripes
      v[base + 3] += Math.abs(L - lum[f.right]);                          // changes going across: vertical stripes
      counts[f.eye][f.region]++;
    }
    for (let e = 0; e < 2; e++) {
      for (let r = 0; r < REGIONS; r++) {
        const n = counts[e][r] || 1;
        const base = r * FEATURES;
        vpn[e][base] /= n;
        vpn[e][base + 1] /= n;
        vpn[e][base + 2] = Math.min(1, (2 * vpn[e][base + 2]) / n);
        vpn[e][base + 3] = Math.min(1, (2 * vpn[e][base + 3]) / n);
      }
    }
    return { cx, cy, lum, vpn };
  }

  F.Eye = { facets, reach, look, luminanceMap, flyLuminance, SPACING, HALF_W, HALF_H, VPN_PER_EYE };
})(globalThis.FLYDO = globalThis.FLYDO || {});
