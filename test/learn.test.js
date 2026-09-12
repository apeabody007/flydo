// Does the fly actually learn? Runs ten flies that learn and ten identical flies whose synapses
// never change, all at once, and checks the learners find the striped guy more, in fewer visits.
//   node test/learn.test.js
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const FLIES = 10;
const ROUNDS = 100;
const TAIL = 50;

if (!isMainThread) {
  for (const file of ['connectome', 'util', 'scene', 'eye', 'brain', 'game']) {
    require(path.join(__dirname, '..', 'src', `${file}.js`));
  }
  const game = new globalThis.FLYDO.Game({ seed: workerData.seed, learning: workerData.learning });
  while (game.history.length < ROUNDS) game.step();
  const tail = game.history.slice(-TAIL);
  parentPort.postMessage({
    learning: workerData.learning,
    found: tail.filter((r) => r.found).length / TAIL,
    visits: tail.reduce((t, r) => t + r.visits, 0) / TAIL,
  });
  return;
}

const runFly = (seed, learning) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { seed, learning } });
    worker.once('message', resolve);
    worker.once('error', reject);
  });

(async () => {
  const started = Date.now();
  const seeds = Array.from({ length: FLIES }, (_, i) => 1000 + i * 7919);
  const results = await Promise.all(seeds.flatMap((seed) => [runFly(seed, true), runFly(seed, false)]));
  const learners = results.filter((r) => r.learning);
  const controls = results.filter((r) => !r.learning);
  const mean = (rs, key) => rs.reduce((t, r) => t + r[key], 0) / rs.length;
  const pct = (x) => `${Math.round(x * 100)}%`;

  console.log(`${FLIES} flies each, ${ROUNDS} rounds, scored on the last ${TAIL}`);
  console.log(`  learning flies:        ${pct(mean(learners, 'found'))} found, ${mean(learners, 'visits').toFixed(1)} visits per round`);
  console.log(`  flies that can't learn: ${pct(mean(controls, 'found'))} found, ${mean(controls, 'visits').toFixed(1)} visits per round`);

  const worstLearner = Math.min(...learners.map((r) => r.found));
  const bestControl = Math.max(...controls.map((r) => r.found));
  const checks = [
    ['learning flies find him far more often', mean(learners, 'found') >= mean(controls, 'found') + 0.5],
    ['learning flies need less than half the visits', mean(learners, 'visits') <= mean(controls, 'visits') / 2],
    [`the worst learning fly (${pct(worstLearner)}) beats the best fly that can't learn (${pct(bestControl)})`, worstLearner > bestControl],
  ];
  let failures = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures++;
  }
  console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exit(failures ? 1 : 0);
})();
