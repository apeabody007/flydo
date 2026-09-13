// The fly's two mushroom bodies, where it learns, wired with this fly's real connections from the
// connectome (src/wiring.js). Real visual neurons drive the visual Kenyon cells through their
// actual synapses, the APL neuron lets only the most strongly driven ~5% fire, and dopamine weakens
// whichever Kenyon cell -> output neuron connections were active at that moment.
(function (F) {
  'use strict';

  const SPARSITY = 0.05;    // share of Kenyon cells the APL neuron lets fire (about 5% in real flies)
  const SUGAR_RATE = 0.35;  // how much one sugar weakens active connections onto "avoid" outputs
  const ZAP_RATE = 0.35;    // how much one zap weakens active connections onto "approach" outputs, at strength 1
  const RECOVERY = 0.004;   // after each lesson, every connection drifts this far back toward its real strength
  const W = F.WIRING;

  // What a real input neuron reports for a view: one feature from one small patch of its eye.
  // Which feature and patch is the simplified part, picked per neuron in the wiring file.
  const inputActivity = (input, vpn) => vpn[input.eye][input.region * F.Eye.FEATURES + input.feature];

  class MushroomBody {
    constructor(cells) {
      this.size = cells.length;
      this.firing = Math.max(1, Math.round(cells.length * SPARSITY));
      this.start = new Uint32Array(cells.length + 1);
      const ids = [];
      const synapses = [];
      cells.forEach((cell, k) => {
        this.start[k] = ids.length;
        for (const [input, count] of cell.inputs) {
          ids.push(input);
          synapses.push(count);
        }
      });
      this.start[cells.length] = ids.length;
      this.inputIds = Uint16Array.from(ids);
      this.synapses = Float32Array.from(synapses);
      // Real synapse counts onto approach and avoid output neurons; learning weakens copies of them.
      this.approach0 = Float32Array.from(cells, (cell) => cell.approach);
      this.avoid0 = Float32Array.from(cells, (cell) => cell.avoid);
      this.toApproach = Float32Array.from(this.approach0);
      this.toAvoid = Float32Array.from(this.avoid0);
      this.drive = new Float32Array(cells.length);
      this.ranked = new Float32Array(cells.length);
    }

    // Indices of the Kenyon cells that fire, given every input neuron's activity.
    encode(activity) {
      for (let k = 0; k < this.size; k++) {
        let sum = 0;
        let total = 0;
        for (let j = this.start[k]; j < this.start[k + 1]; j++) {
          sum += this.synapses[j] * activity[this.inputIds[j]];
          total += this.synapses[j];
        }
        this.drive[k] = total ? sum / total : -1; // a cell with no visual input never fires
      }
      this.ranked.set(this.drive);
      this.ranked.sort();
      const threshold = this.ranked[this.size - this.firing];
      const active = [];
      for (let k = 0; k < this.size && active.length < this.firing; k++) {
        if (this.drive[k] >= threshold && this.drive[k] >= 0) active.push(k);
      }
      return active;
    }
  }

  class Brain {
    constructor() {
      this.bodies = [new MushroomBody(W.sides.left), new MushroomBody(W.sides.right)];
      this.activity = new Float32Array(W.inputs.length);
    }

    // Which Kenyon cells fire for a view. It depends only on the view and the wiring, never on learning.
    encode(view) {
      W.inputs.forEach((input, i) => {
        this.activity[i] = inputActivity(input, view.vpn);
      });
      return this.bodies.map((body) => body.encode(this.activity));
    }

    // How the firing cells' connections have changed since birth, weighted by their real strength:
    // from -1 (everything says "avoid") to +1 ("approach"). A fly that hasn't learned anything is at 0.
    value(active) {
      let approach = 0;
      let approach0 = 0;
      let avoid = 0;
      let avoid0 = 0;
      this.bodies.forEach((body, side) => {
        for (const k of active[side]) {
          approach += body.toApproach[k];
          approach0 += body.approach0[k];
          avoid += body.toAvoid[k];
          avoid0 += body.avoid0[k];
        }
      });
      return (approach0 ? approach / approach0 : 1) - (avoid0 ? avoid / avoid0 : 1);
    }

    evaluate(view) {
      const active = this.encode(view);
      return { active, valence: this.value(active) };
    }

    // Sugar fires PAM dopamine neurons, which weaken active connections onto the output neurons in
    // their compartments (the ones that push toward avoiding). A zap fires PPL1 neurons, which weaken
    // active connections onto the output neurons that push toward approaching.
    learn(thought, outcome, zapStrength = 1) {
      const rate = outcome === 'sugar' ? SUGAR_RATE : Math.min(0.95, ZAP_RATE * zapStrength);
      this.bodies.forEach((body, side) => {
        const weakened = outcome === 'sugar' ? body.toAvoid : body.toApproach;
        for (const k of thought.active[side]) weakened[k] -= rate * weakened[k];
        for (let k = 0; k < body.size; k++) {
          body.toApproach[k] += RECOVERY * (body.approach0[k] - body.toApproach[k]);
          body.toAvoid[k] += RECOVERY * (body.avoid0[k] - body.toAvoid[k]);
        }
      });
    }

    // The real input neuron types doing the most to drive the firing cells right now. For display.
    strongestInputs(view, active, count = 3) {
      const drive = new Map();
      this.bodies.forEach((body, side) => {
        for (const k of active[side]) {
          for (let j = body.start[k]; j < body.start[k + 1]; j++) {
            const input = W.inputs[body.inputIds[j]];
            drive.set(input.type, (drive.get(input.type) || 0) + body.synapses[j] * inputActivity(input, view.vpn));
          }
        }
      });
      return [...drive.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([type]) => type);
    }

    // What each Kenyon cell has come to mean: + for sugar, - for zaps. Used for drawing.
    meaning(side) {
      const body = this.bodies[side];
      const ratio = (now, born) => (born ? now / born : 1);
      return Array.from(body.toApproach, (a, k) => ratio(a, body.approach0[k]) - ratio(body.toAvoid[k], body.avoid0[k]));
    }
  }

  // `relative` is how much better someone looks than what the fly is used to. At 0 it lands
  // about 12% of the time, and it never quite loses its curiosity.
  F.landChance = (relative) => Math.max(0.03, 1 / (1 + Math.exp(-(10 * relative - 2))));
  F.Brain = Brain;
})(globalThis.FLYDO = globalThis.FLYDO || {});
