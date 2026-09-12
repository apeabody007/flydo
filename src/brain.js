// The fly's two mushroom bodies, where it learns. Visual projection neurons drive Kenyon
// cells, the APL neuron lets only the most strongly driven ~5% fire, and dopamine weakens
// whichever Kenyon cell -> output neuron synapses were active at that moment.
(function (F) {
  'use strict';

  const FAN_IN = 6;         // visual inputs per Kenyon cell (a simplification)
  const SPARSITY = 0.05;    // share of Kenyon cells the APL neuron lets fire (about 5% in real flies)
  const SUGAR_RATE = 0.35;  // how much one sugar weakens active synapses onto "avoid"
  const ZAP_RATE = 0.35;    // how much one zap weakens active synapses onto "approach", at strength 1
  const RECOVERY = 0.004;   // after each lesson, every synapse drifts this far back toward baseline

  class MushroomBody {
    constructor(kenyonCells, inputs, rand) {
      this.size = kenyonCells;
      this.firing = Math.max(1, Math.round(kenyonCells * SPARSITY));
      this.inputIds = new Uint16Array(kenyonCells * FAN_IN);
      this.inputWeights = new Float32Array(kenyonCells * FAN_IN);
      const ids = Array.from({ length: inputs }, (_, i) => i);
      for (let k = 0; k < kenyonCells; k++) {
        F.shuffle(ids, rand);
        for (let j = 0; j < FAN_IN; j++) {
          this.inputIds[k * FAN_IN + j] = ids[j];
          this.inputWeights[k * FAN_IN + j] = 0.6 + 0.8 * rand();
        }
      }
      this.toApproach = new Float32Array(kenyonCells).fill(1);
      this.toAvoid = new Float32Array(kenyonCells).fill(1);
      this.drive = new Float32Array(kenyonCells);
      this.ranked = new Float32Array(kenyonCells);
    }

    // Indices of the Kenyon cells that fire for this input.
    encode(vpn) {
      for (let k = 0; k < this.size; k++) {
        let sum = 0;
        for (let j = k * FAN_IN; j < (k + 1) * FAN_IN; j++) sum += this.inputWeights[j] * vpn[this.inputIds[j]];
        this.drive[k] = sum;
      }
      this.ranked.set(this.drive);
      this.ranked.sort();
      const threshold = this.ranked[this.size - this.firing];
      const active = [];
      for (let k = 0; k < this.size && active.length < this.firing; k++) {
        if (this.drive[k] >= threshold) active.push(k);
      }
      return active;
    }
  }

  class Brain {
    constructor(rand) {
      const kc = F.CONNECTOME.visualKenyonCells;
      const cells = (side) => side['KCg-d'] + side['KCab-p'];
      this.bodies = [
        new MushroomBody(cells(kc.left), F.Eye.VPN_PER_EYE, rand),
        new MushroomBody(cells(kc.right), F.Eye.VPN_PER_EYE, rand),
      ];
    }

    // Which Kenyon cells fire for a view: the left eye feeds the left mushroom body, the right
    // eye the right one. This depends only on the view and the fly's wiring, never on learning.
    encode(view) {
      return this.bodies.map((body, side) => body.encode(view.vpn[side]));
    }

    // What those firing cells add up to, from -1 (all say "avoid") to +1 (all say "approach").
    value(active) {
      let sum = 0;
      let n = 0;
      this.bodies.forEach((body, side) => {
        for (const k of active[side]) {
          sum += body.toApproach[k] - body.toAvoid[k];
          n++;
        }
      });
      return n ? sum / n : 0;
    }

    evaluate(view) {
      const active = this.encode(view);
      return { active, valence: this.value(active) };
    }

    // Sugar fires PAM dopamine neurons, which weaken active synapses onto avoidance output
    // neurons. A zap fires PPL1 neurons, which weaken active synapses onto approach outputs.
    learn(thought, outcome, zapStrength = 1) {
      const rate = outcome === 'sugar' ? SUGAR_RATE : Math.min(0.95, ZAP_RATE * zapStrength);
      this.bodies.forEach((body, side) => {
        const weakened = outcome === 'sugar' ? body.toAvoid : body.toApproach;
        for (const k of thought.active[side]) weakened[k] -= rate * weakened[k];
        for (let k = 0; k < body.size; k++) {
          body.toApproach[k] += RECOVERY * (1 - body.toApproach[k]);
          body.toAvoid[k] += RECOVERY * (1 - body.toAvoid[k]);
        }
      });
    }

    // What each Kenyon cell has come to mean: + for sugar, - for zaps. Used for drawing.
    meaning(side) {
      const body = this.bodies[side];
      return Array.from(body.toApproach, (a, k) => a - body.toAvoid[k]);
    }
  }

  // `relative` is how much better someone looks than what the fly is used to. At 0 it lands
  // about 12% of the time, and it never quite loses its curiosity.
  F.landChance = (relative) => Math.max(0.03, 1 / (1 + Math.exp(-(10 * relative - 2))));
  F.Brain = Brain;
})(globalThis.FLYDO = globalThis.FLYDO || {});
