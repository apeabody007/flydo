// Draws assets/learning-curve.svg for the README: how often ten learning flies find the striped
// guy, round by round, next to ten identical flies whose synapses never change. The flies are the
// same ones test/learn.test.js scores.
//   node scripts/learning-curve.js
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const FLIES = 10;
const ROUNDS = 100;
const TAIL = 50;   // the test scores the last 50 rounds
const WINDOW = 10; // the game's "last 10 rounds"

if (!isMainThread) {
  for (const file of ['connectome', 'wiring', 'util', 'scene', 'eye', 'brain', 'game']) {
    require(path.join(__dirname, '..', 'src', `${file}.js`));
  }
  const game = new globalThis.FLYDO.Game({ seed: workerData.seed, learning: workerData.learning });
  while (game.history.length < ROUNDS) game.step();
  parentPort.postMessage(game.history.map((r) => (r.found ? 1 : 0)));
  return;
}

const runFly = (seed, learning) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { seed, learning } });
    worker.once('message', resolve);
    worker.once('error', reject);
  });

const mean = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
const quantile = (xs, q) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const i = (sorted.length - 1) * q;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i - Math.floor(i));
};
// For each round, the share of a fly's last 10 rounds in which it found him.
const rolling = (found) => found.map((_, r) => mean(found.slice(Math.max(0, r - WINDOW + 1), r + 1)));
const acrossFlies = (flies, stat) => Array.from({ length: ROUNDS }, (_, r) => stat(flies.map((fly) => fly[r])));
const pct = (x) => `${Math.round(x * 100)}%`;

const C = { ink: '#16181d', slate: '#6b7280', line: '#dde1e7', red: '#d62626', card: '#ffffff' };
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

// The headline numbers are the test's (the last 50 rounds). The lines end on their own last 10
// rounds, which wander a few points either way, so they're labeled by name, not by value.
function draw({ learn, low, high, cant, tailLearn, tailCant, reach80 }) {
  const W = 880;
  const H = 440;
  const plot = { x: 64, y: 132, w: 620, h: 236 };
  const X = (r) => plot.x + (r / (ROUNDS - 1)) * plot.w;
  const Y = (v) => plot.y + (1 - v) * plot.h;
  const pathOf = (vs) => vs.map((v, r) => `${r ? 'L' : 'M'}${X(r).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const band = pathOf(high) + low.map((v, r) => `L${X(r).toFixed(1)},${Y(v).toFixed(1)}`).reverse().join('') + 'Z';
  const text = (x, y, content, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${content}</text>`;
  const end = ROUNDS - 1;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) =>
    `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}" stroke-width="1"/>` +
    text(plot.x - 10, Y(v) + 4, pct(v), `text-anchor="end" fill="${C.slate}" font-size="12"`)).join('');
  const ticks = [1, 25, 50, 75, 100].map((round) =>
    text(X(round - 1), plot.y + plot.h + 22, round, `text-anchor="middle" fill="${C.slate}" font-size="12"`)).join('');
  const endLabel = (v, color, label) =>
    `<circle cx="${X(end)}" cy="${Y(v)}" r="4.5" fill="${color}" stroke="${C.card}" stroke-width="2"/>` +
    text(X(end) + 12, Y(v) + 5, label, `fill="${C.ink}" font-size="13"`);
  const title = `Flies that learn find him ${pct(tailLearn)} of the time. Flies that can't: ${pct(tailCant)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-labelledby="title desc">
<title id="title">${title}</title>
<desc id="desc">Over 100 rounds, the share of each fly's last 10 rounds in which it found the striped guy, averaged over 10 flies per group. Flies that learn pass 80% by round ${reach80} and find him ${pct(tailLearn)} of the time over rounds 51 to 100. Identical flies that can't learn find him ${pct(tailCant)} of the time.</desc>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${C.card}" stroke="${C.line}"/>
${text(28, 44, title, `fill="${C.ink}" font-size="21" font-weight="700"`)}
${text(28, 68, "Share of each fly's last 10 rounds in which it found the striped guy, averaged over 10 flies per group", `fill="${C.slate}" font-size="13"`)}
<g font-size="13" fill="${C.ink}">
  <line x1="28" x2="52" y1="96" y2="96" stroke="${C.red}" stroke-width="2" stroke-linecap="round"/>${text(60, 100, 'Flies that learn')}
  <rect x="180" y="89" width="24" height="14" rx="2" fill="${C.ink}" fill-opacity="0.08"/>${text(212, 100, 'Middle half of those flies')}
  <line x1="398" x2="422" y1="96" y2="96" stroke="${C.slate}" stroke-width="2" stroke-dasharray="5 4"/>${text(430, 100, "Identical flies that can't learn")}
</g>
${grid}
<path d="${band}" fill="${C.ink}" fill-opacity="0.08"/>
<path d="${pathOf(cant)}" fill="none" stroke="${C.slate}" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>
<path d="${pathOf(learn)}" fill="none" stroke="${C.red}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
${endLabel(learn[end], C.red, 'Flies that learn')}
${endLabel(cant[end], C.slate, "Flies that can't learn")}
${ticks}
${text(plot.x + plot.w / 2, plot.y + plot.h + 44, 'Round', `text-anchor="middle" fill="${C.slate}" font-size="12"`)}
</svg>
`;
}

(async () => {
  const seeds = Array.from({ length: FLIES }, (_, i) => 1000 + i * 7919);
  const [learners, controls] = await Promise.all([true, false].map((learning) => Promise.all(seeds.map((seed) => runFly(seed, learning)))));
  const learnCurves = learners.map(rolling);
  const cantCurves = controls.map(rolling);
  const data = {
    learn: acrossFlies(learnCurves, mean),
    low: acrossFlies(learnCurves, (xs) => quantile(xs, 0.25)),
    high: acrossFlies(learnCurves, (xs) => quantile(xs, 0.75)),
    cant: acrossFlies(cantCurves, mean),
    tailLearn: mean(learners.map((found) => mean(found.slice(-TAIL)))),
    tailCant: mean(controls.map((found) => mean(found.slice(-TAIL)))),
  };
  const firstAt = (level) => data.learn.findIndex((v) => v >= level) + 1;
  data.reach80 = firstAt(0.8);
  const out = path.join(__dirname, '..', 'assets', 'learning-curve.svg');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, draw(data));
  console.log(`last ${TAIL} rounds: learn ${(data.tailLearn * 100).toFixed(1)}%, can't learn ${(data.tailCant * 100).toFixed(1)}%`);
  console.log(`learning flies' average first reaches 50% at round ${firstAt(0.5)}, 80% at round ${data.reach80}, 90% at round ${firstAt(0.9)}`);
  console.log(`round 1: ${pct(data.learn[0])}, round 10: ${pct(data.learn[9])}, round 100: ${pct(data.learn[ROUNDS - 1])} (can't learn: ${pct(data.cant[ROUNDS - 1])})`);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
})();
