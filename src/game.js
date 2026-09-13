// One search at a time: the fly glances at everyone nearby, flies to whoever looks most like
// past sugar, looks closely, and lands if that person looks better than what it's used to.
(function (F) {
  'use strict';

  const MAX_VISITS = 120;    // give up on a round after checking this many people
  const SCAN_RADIUS = 190;   // how far away the fly considers its next person, in page pixels
  const CHOICE_TEMP = 0.12;  // lower = picks its favourite more reliably
  const RECENT_MEMORY = 20;  // inhibition of return: it skips the last 20 people it checked
  const ADAPTATION = 0.05;   // how quickly "what it's used to" follows its surroundings
  const JITTER = 3;          // it never hovers perfectly centred

  class Game {
    constructor({ seed = (Math.random() * 2 ** 32) >>> 0, zapStrength = 0.4, learning = true, helpless = false } = {}) {
      this.rand = F.rng(seed);
      this.zapStrength = zapStrength;
      this.learning = learning;
      // A helpless fly judges each person only by whether they look safe, not by whether they look
      // better than what it's used to. That's the rule our first version used.
      this.helpless = helpless;
      this.newFly();
    }

    newFly() {
      this.brain = new F.Brain();
      this.expectation = 0; // how appealing people usually look to this fly
      this.history = [];
      this.round = 0;
      this.zaps = 0;
      this.sugars = 0;
      this.newRound();
    }

    newRound() {
      this.round++;
      this.scene = F.Scene.generate(this.rand);
      this.scene.lum = F.Eye.luminanceMap(this.scene.rgba, this.scene.W, this.scene.H);
      this.codes = new Map(); // which Kenyon cells fire for each person, reused all round
      this.recent = [];
      this.zapped = [];
      this.visits = 0;
      this.wrong = 0;
      this.over = false;
      this.found = false;
      this.fly = { x: this.rand() * this.scene.W, y: this.rand() * this.scene.H };
    }

    // The Kenyon cell code for looking straight at someone. It only depends on the person and the
    // fly's wiring, so it is worked out once per round; what the code means is re-read every time.
    codeOf(person) {
      if (!this.codes.has(person.id)) this.codes.set(person.id, this.brain.encode(F.Eye.look(this.scene, person.cx, person.cy)));
      return this.codes.get(person.id);
    }

    // Pick who to fly to, look closely, and decide whether to land. Changes nothing yet.
    plan() {
      const { fly, scene, rand } = this;
      const candidates = scene.people.filter((p) => !this.recent.includes(p.id));
      if (!candidates.length) return null;
      const distance = (p) => Math.hypot(p.cx - fly.x, p.cy - fly.y);
      let nearby = candidates.filter((p) => distance(p) <= SCAN_RADIUS);
      if (!nearby.length) nearby = [candidates.reduce((a, b) => (distance(a) <= distance(b) ? a : b))];

      const glances = nearby.map((p) => this.brain.value(this.codeOf(p)));
      const appeal = glances.map((v) => Math.exp(v / CHOICE_TEMP));
      let roll = rand() * appeal.reduce((a, b) => a + b, 0);
      let person = nearby[nearby.length - 1];
      for (let i = 0; i < nearby.length; i++) {
        roll -= appeal[i];
        if (roll <= 0) {
          person = nearby[i];
          break;
        }
      }

      const hx = person.cx + (rand() - 0.5) * 2 * JITTER;
      const hy = person.cy + (rand() - 0.5) * 2 * JITTER;
      const view = F.Eye.look(scene, hx, hy);
      const thought = this.brain.evaluate(view);
      const relative = this.helpless ? thought.valence : thought.valence - this.expectation;
      const chance = F.landChance(relative);
      const surroundings = glances.reduce((a, b) => a + b, 0) / glances.length;
      return { person, hx, hy, view, thought, relative, chance, surroundings, lands: rand() < chance };
    }

    // Carry out a plan: move the fly, reward or punish a landing, close the round if done.
    commit(plan) {
      let outcome = 'none';
      if (!plan) {
        this.over = true;
      } else {
        this.visits++;
        this.recent.push(plan.person.id);
        if (this.recent.length > RECENT_MEMORY) this.recent.shift();
        this.expectation += ADAPTATION * (plan.surroundings - this.expectation);
        this.fly = { x: plan.hx, y: plan.hy };
        if (plan.lands) {
          if (plan.person.type === 'target') {
            outcome = 'sugar';
            this.sugars++;
            this.found = true;
            this.over = true;
          } else {
            outcome = 'zap';
            this.zaps++;
            this.wrong++;
            this.zapped.push(plan.person);
          }
          if (this.learning) this.brain.learn(plan.thought, outcome, this.zapStrength);
        }
        if (this.visits >= MAX_VISITS) this.over = true;
      }
      if (this.over) this.history.push({ round: this.round, visits: this.visits, wrong: this.wrong, found: this.found });
      return outcome;
    }

    step() {
      if (this.over) this.newRound();
      const plan = this.plan();
      return { plan, outcome: this.commit(plan) };
    }
  }

  F.Game = Game;
  F.MAX_VISITS = MAX_VISITS;
})(globalThis.FLYDO = globalThis.FLYDO || {});
