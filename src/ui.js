// Animation, panels and controls for a lab of ten flies. Every decision a fly makes lives in
// game.js; this file only shows it.
(function (F) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const K = F.CONNECTOME;
  const C = { ink: '#16181d', slate: '#6b7280', line: '#dde1e7', red: '#d62626', honey: '#e9a21b', volt: '#3b5bff' };
  const FLIES = 10;
  const DURATION = { fly: 520, hover: 420, land: 200, zap: 650, sugar: 1200, miss: 1100 }; // ms at Normal speed
  const PACE = { normal: 1, fast: 0.25 };
  const RERANK_EVERY = 900;  // ms; often enough to feel live, calm enough to click a card
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const zapStrength = () => 0.1 + (1.9 * Number($('zap').value)) / 100;
  const flyName = (i) => `Fly ${String.fromCharCode(65 + i)}`; // letters, so names never look like places
  const WINDOW = 10;       // rounds; every "how often it finds him" number on the page uses this window
  const CANT_LEARN = 0.11; // share found by flies with learning switched off, measured by test/learn.test.js
  const pct = (x) => `${Math.round(x * 100)}%`;

  let speed = 'fast';
  let paused = false;
  let pausedAt = 0;
  let focus = 0;
  let turboNext = 0;
  let turboShown = 0;
  let panelsDirty = true;
  let chartDirty = true;
  let rankDirty = true;
  let rankedAt = -Infinity;
  const lab = [];
  const cards = [];

  // ---------- labels that come straight from the connectome ----------
  const kc = K.visualKenyonCells;
  const visualCells = (side) => side['KCg-d'] + side['KCab-p'];
  $('facets').textContent = `Fly: ${K.eyeColumns.left} + ${K.eyeColumns.right} facets`;
  $('mbLeft').textContent = `Left mushroom body · ${visualCells(kc.left)} visual Kenyon cells`;
  $('mbRight').textContent = `Right mushroom body · ${visualCells(kc.right)} visual Kenyon cells`;
  $('kcTotal').textContent = visualCells(kc.left) + visualCells(kc.right);
  $('dopamine').textContent = `This fly's connectome has ${K.dopamineNeurons.PAM} PAM and ` +
    `${K.dopamineNeurons.PPL1} PPL1 dopamine neurons, and one APL neuron per side.`;
  const wiring = F.WIRING.stats;
  $('wired').textContent = `Wired with this fly's real connections: ${wiring.inputNeurons} visual neurons of ` +
    `${wiring.inputTypes} types feed these cells through ${wiring.inputSynapses.toLocaleString()} synapses.`;
  const flyLabel = (i) => (lab[i].game.helpless ? `${flyName(i)} (helpless)` : flyName(i));

  // ---------- the lab ----------
  function buildCards() {
    for (let i = 0; i < FLIES; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'card';
      button.innerHTML = `<canvas aria-hidden="true"></canvas><span class="name">${flyName(i)}<span class="rank"></span></span><span class="score">searching</span><span class="tag">helpless</span>`;
      button.addEventListener('click', () => setFocus(i));
      $('lab').appendChild(button);
      const thumb = document.createElement('canvas');
      thumb.width = 240;
      thumb.height = 150;
      cards.push({
        button, thumb, canvas: button.querySelector('canvas'), score: button.querySelector('.score'),
        rank: button.querySelector('.rank'), scene: null, seen: -1, flash: '',
      });
    }
  }

  function newLab() {
    lab.length = 0;
    for (let i = 0; i < FLIES; i++) {
      lab.push({ index: i, game: new F.Game({ zapStrength: zapStrength() }), anim: null, plan: null, flash: null });
    }
    for (const card of cards) {
      card.scene = null;
      card.seen = -1;
    }
    banner(null);
    clearEyes();
    panelsDirty = true;
    chartDirty = true;
    rankDirty = true;
    showHelpless();
  }

  // The helplessness experiment: a fly that judges people only by whether they look safe.
  function showHelpless() {
    if (!lab.length || !cards.length) return;
    const name = flyName(focus);
    const helpless = lab[focus].game.helpless;
    $('helpless').textContent = helpless ? `Help ${name} recover` : `Make ${name} helpless`;
    const note = $('helplessNote');
    note.hidden = !helpless;
    note.textContent = helpless
      ? `${name} is helpless now. It only lands on someone who looks safe, and after enough zaps nobody does, ` +
        'so it mostly stops trying. Watch its "Land here?" chance drop, and its red line in the chart fall ' +
        '(Turbo speeds that up). Psychologists call this learned helplessness.'
      : '';
    $('landRule').textContent = helpless
      ? "It's helpless: it only lands on people who look safe."
      : "It lands on people who look better than what it's used to.";
    $('legendFly').textContent = flyLabel(focus);
    cards.forEach((card, i) => card.button.classList.toggle('helpless', lab[i].game.helpless));
  }

  // The lab is a leaderboard: whoever has found him the most sits first. Ties keep fly order,
  // so cards only move when someone actually overtakes someone.
  function rankCards() {
    const order = lab.slice().sort((a, b) => b.game.sugars - a.game.sugars || a.index - b.index);
    order.forEach((fly) => {
      const card = cards[fly.index];
      const finds = fly.game.sugars;
      const place = finds ? order.findIndex((other) => other.game.sugars === finds) + 1 : 0;
      card.rank.textContent = place ? ordinal(place) : '';
      card.button.classList.toggle('leader', place === 1);
    });

    const grid = $('lab');
    const next = order.map((fly) => cards[fly.index].button);
    if (next.every((el, i) => el === grid.children[i])) return;
    const before = new Map(next.map((el) => [el, el.getBoundingClientRect()]));
    const focused = document.activeElement;
    for (const el of next) grid.appendChild(el); // move the real elements, so tab order matches the screen
    if (next.includes(focused)) focused.focus({ preventScroll: true });
    if (reducedMotion) return;
    for (const el of next) {
      const from = before.get(el);
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (dx || dy) {
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
      }
    }
  }

  const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

  function setFocus(i) {
    focus = i;
    cards.forEach((card, j) => card.button.setAttribute('aria-pressed', String(j === i)));
    $('watching').textContent = `Watching ${flyName(i)}`;
    showHelpless();
    banner(null);
    if (lab[i].plan) drawEyes(lab[i]);
    else clearEyes();
    panelsDirty = true;
    chartDirty = true;
  }

  // ---------- one visit, animated: fly, hover, maybe land, then sugar / zap / miss ----------
  function beginVisit(fly, now) {
    const { game } = fly;
    if (game.over) game.newRound();
    const plan = game.plan();
    const from = { x: game.fly.x, y: game.fly.y };
    const to = plan ? { x: plan.hx, y: plan.hy } : from;
    fly.anim = {
      plan,
      phase: 'fly',
      t0: now,
      path: zigzag(from, to),
      flight: DURATION.fly * (0.8 + 0.4 * Math.random()), // so ten flies don't move in lockstep
      heading: fly.anim ? fly.anim.heading : Math.random() * Math.PI * 2,
    };
  }

  const phaseLength = (anim) => (anim.phase === 'fly' ? anim.flight : DURATION[anim.phase]) * (PACE[speed] || 1);
  const progress = (anim, now) => Math.min(1, (now - anim.t0) / phaseLength(anim));

  function advance(fly, now) {
    if (!fly.anim) return beginVisit(fly, now);
    const anim = fly.anim;
    if (now - anim.t0 < phaseLength(anim)) return;
    switch (anim.phase) {
      case 'fly':
        if (!anim.plan) return resolve(fly, now);
        anim.heading = headingOf(anim.path, anim.heading);
        setPhase(anim, 'hover', now);
        fly.plan = anim.plan;
        if (fly.index === focus) {
          drawEyes(fly);
          panelsDirty = true;
        }
        return;
      case 'hover':
        return anim.plan.lands ? setPhase(anim, 'land', now) : resolve(fly, now);
      case 'land':
        return resolve(fly, now);
      default:
        return finish(fly, now);
    }
  }

  function setPhase(anim, phase, now) {
    anim.phase = phase;
    anim.t0 = now;
  }

  function resolve(fly, now) {
    const { game, anim } = fly;
    const outcome = game.commit(anim.plan);
    noteOutcome(fly, outcome, now);
    if (outcome === 'sugar') {
      if (fly.index === focus) banner(`Found him in ${game.visits} ${game.visits === 1 ? 'visit' : 'visits'}`);
      return setPhase(anim, 'sugar', now);
    }
    if (outcome === 'zap') return setPhase(anim, 'zap', now);
    finish(fly, now);
  }

  function finish(fly, now) {
    const { game, anim } = fly;
    if (game.over && !game.found && anim.phase !== 'miss') {
      if (fly.index === focus) banner('Missed him. He was here.');
      return setPhase(anim, 'miss', now);
    }
    if (fly.index === focus) banner(null);
    beginVisit(fly, now);
  }

  function noteOutcome(fly, outcome, now) {
    if (fly.game.over) {
      chartDirty = true;
      rankDirty = true;
    }
    if (speed === 'turbo') return; // too many to show one by one; turbo refreshes the panels itself
    if (outcome !== 'none') {
      const found = outcome === 'sugar';
      fly.flash = { kind: found ? 'found' : 'zap', until: now + (found ? 1000 : 500) };
      if (fly.index === focus) pulseDopamine(outcome);
    }
    if (fly.index === focus || fly.game.over) panelsDirty = true;
  }

  // Turbo: no animation, just as many visits as fit in a frame, shared evenly across the lab.
  function turbo(now) {
    const until = performance.now() + 12;
    do {
      const fly = lab[turboNext];
      const { plan, outcome } = fly.game.step();
      if (plan) fly.plan = plan;
      noteOutcome(fly, outcome, now);
      turboNext = (turboNext + 1) % FLIES;
    } while (performance.now() < until);
    for (const fly of lab) fly.anim = null;
    if (now - turboShown > 120) {
      turboShown = now;
      if (lab[focus].plan) drawEyes(lab[focus]);
      panelsDirty = true;
    }
  }

  function frame(now) {
    if (!paused) {
      if (speed === 'turbo') turbo(now);
      else for (const fly of lab) advance(fly, now);
    }
    drawStage(now);
    drawCards(now);
    if (panelsDirty) drawPanels();
    if (chartDirty) drawChart();
    if (rankDirty && now - rankedAt >= RERANK_EVERY) {
      rankDirty = false;
      rankedAt = now;
      rankCards();
    }
    requestAnimationFrame(frame);
  }

  // ---------- canvases ----------
  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return canvas.getContext('2d');
  }

  const full = document.createElement('canvas'); // the watched fly's page, at full resolution
  full.width = F.Scene.W;
  full.height = F.Scene.H;
  let fullScene = null;

  function paint(scene) {
    if (fullScene === scene) return;
    full.getContext('2d').putImageData(new ImageData(scene.rgba, scene.W, scene.H), 0, 0);
    fullScene = scene;
  }

  function drawStage(now) {
    const fly = lab[focus];
    const { game, anim } = fly;
    paint(game.scene);
    const stage = $('page');
    const ctx = fit(stage);
    const s = stage.width / F.Scene.W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(full, 0, 0, stage.width, stage.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);

    for (const person of game.zapped) drawCross(ctx, person.cx, person.y - 5);
    const phase = anim ? anim.phase : null;
    if (anim && anim.plan && (phase === 'hover' || phase === 'land')) drawFootprint(ctx, anim.plan.hx, anim.plan.hy);
    if (phase === 'miss') drawRing(ctx, game.scene.target, C.red, now);
    if (phase === 'sugar') drawReward(ctx, game.scene.target, progress(anim, now), now);
    F.Sprite.fly(ctx, poseOf(fly, now), now);
    if (phase === 'zap') F.Sprite.popText(ctx, 'zap', anim.plan.hx, anim.plan.hy - 30 - progress(anim, now) * 10, C.volt);
  }

  function poseOf(fly, now) {
    const { game, anim } = fly;
    const rest = { x: game.fly.x, y: game.fly.y, heading: anim ? anim.heading : 0, scale: 1, wings: true };
    if (!anim || !anim.plan) return rest;
    const u = progress(anim, now);
    const { hx, hy } = anim.plan;
    switch (anim.phase) {
      case 'fly':
        return { ...along(anim.path, u, anim.heading), scale: 1, wings: true };
      case 'hover':
        return { x: hx + Math.sin(now / 41) * 1.3, y: hy + Math.cos(now / 57) * 1.3, heading: anim.heading, scale: 1, wings: true };
      case 'land':
        return { x: hx, y: hy, heading: anim.heading, scale: 1 - 0.2 * u, wings: u < 0.6 };
      case 'zap': // a startled hop
        return { x: hx + Math.sin(u * Math.PI) * 10, y: hy - Math.sin(u * Math.PI) * 16, heading: anim.heading + Math.sin(u * Math.PI * 6) * 0.5, scale: 0.9, wings: true };
      case 'sugar':
        return { x: hx, y: hy, heading: anim.heading + Math.sin(now / 90) * 0.2, scale: 0.8, wings: false };
      default:
        return rest;
    }
  }

  // A real fly flies in straight dashes joined by sharp turns (saccades), not smooth curves.
  function zigzag(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const hops = dist < 40 ? 1 : 2 + Math.floor(Math.random() * 2);
    const path = [from];
    for (let i = 1; i < hops; i++) {
      const t = i / hops;
      const off = (Math.random() - 0.5) * Math.min(90, dist * 0.6);
      path.push({ x: from.x + dx * t - (dy / dist) * off, y: from.y + dy * t + (dx / dist) * off });
    }
    path.push(to);
    return path;
  }

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  function along(path, u, fallback) {
    const segments = path.length - 1;
    const s = Math.min(segments - 1e-6, u * segments);
    const i = Math.floor(s);
    const t = ease(s - i);
    const a = path[i];
    const b = path[i + 1];
    const moving = a.x !== b.x || a.y !== b.y;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: moving ? Math.atan2(b.y - a.y, b.x - a.x) : fallback };
  }

  function headingOf(path, fallback) {
    const a = path[path.length - 2];
    const b = path[path.length - 1];
    return a.x !== b.x || a.y !== b.y ? Math.atan2(b.y - a.y, b.x - a.x) : fallback;
  }

  // The part of the page its eye covers, and the patch its visual projection neurons pool.
  function drawFootprint(ctx, x, y) {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(22, 24, 29, 0.55)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(x, y, F.Eye.reach, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(22, 24, 29, 0.35)';
    ctx.strokeRect(x - F.Eye.HALF_W, y - F.Eye.HALF_H, 2 * F.Eye.HALF_W, 2 * F.Eye.HALF_H);
    ctx.restore();
  }

  // A red cross over someone the fly landed on by mistake. The white halo keeps it readable
  // over red hats and shirts.
  function drawCross(ctx, x, y) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 3.5);
    ctx.lineTo(x + 3.5, y + 3.5);
    ctx.moveTo(x + 3.5, y - 3.5);
    ctx.lineTo(x - 3.5, y + 3.5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.2;
    ctx.stroke();
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawRing(ctx, person, color, now) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(person.cx, person.cy, 30 + Math.sin(now / 120) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawReward(ctx, person, u, now) {
    drawRing(ctx, person, C.honey, now);
    ctx.save();
    ctx.fillStyle = C.honey;
    ctx.globalAlpha = 1 - u;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const d = 16 + u * 34;
      ctx.beginPath();
      ctx.arc(person.cx + Math.cos(a) * d, person.cy + Math.sin(a) * d, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    F.Sprite.popText(ctx, 'sugar', person.cx, person.cy - 42 - u * 8, C.honey);
  }

  // ---------- lab cards ----------
  function paintThumb(card, scene) {
    const ctx = card.thumb.getContext('2d');
    const { width: tw, height: th } = card.thumb;
    const image = ctx.createImageData(tw, th);
    for (let y = 0; y < th; y++) {
      const sy = Math.floor((y * scene.H) / th);
      for (let x = 0; x < tw; x++) {
        const si = (sy * scene.W + Math.floor((x * scene.W) / tw)) * 4;
        const di = (y * tw + x) * 4;
        image.data[di] = scene.rgba[si];
        image.data[di + 1] = scene.rgba[si + 1];
        image.data[di + 2] = scene.rgba[si + 2];
        image.data[di + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function drawCards(now) {
    const dpr = window.devicePixelRatio || 1;
    lab.forEach((fly, i) => {
      const card = cards[i];
      const { game } = fly;
      if (card.scene !== game.scene) {
        paintThumb(card, game.scene);
        card.scene = game.scene;
      }
      const ctx = fit(card.canvas);
      const s = card.canvas.width / F.Scene.W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(card.thumb, 0, 0, card.canvas.width, card.canvas.height);
      const pose = poseOf(fly, now);
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(pose.x * s, pose.y * s, 3.2 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.red;
      ctx.beginPath();
      ctx.arc(pose.x * s + Math.cos(pose.heading) * 2.2 * dpr, pose.y * s + Math.sin(pose.heading) * 2.2 * dpr, 1.3 * dpr, 0, Math.PI * 2);
      ctx.fill();

      const flash = fly.flash && now < fly.flash.until ? fly.flash.kind : '';
      if (card.flash !== flash) {
        card.flash = flash;
        if (flash) card.button.dataset.flash = flash;
        else delete card.button.dataset.flash;
      }
      if (card.seen !== game.history.length) {
        card.seen = game.history.length;
        card.score.textContent = game.history.length ? `${game.sugars} ${game.sugars === 1 ? 'find' : 'finds'}` : 'searching';
      }
    });
  }

  // ---------- side panels ----------
  function drawEyes(fly) {
    drawFlyView(fly.plan.view);
    paint(fly.game.scene);
    drawYouView(fly.plan);
  }

  function clearEyes() {
    for (const id of ['flyview', 'youview']) {
      const canvas = $(id);
      fit(canvas).clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function hexagon(ctx, x, y, r) {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      if (i === 0) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath();
  }

  function drawFlyView(view) {
    const canvas = $('flyview');
    const ctx = fit(canvas);
    const size = canvas.width;
    const outer = F.Eye.reach + F.Eye.SPACING;
    const scale = size / (2 * outer);
    const r = (F.Eye.SPACING / Math.sqrt(3)) * scale * 0.9;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    // Group facets by brightness so the eye takes a few dozen fills instead of 1,779.
    const LEVELS = 32;
    const groups = Array.from({ length: LEVELS }, () => []);
    F.Eye.facets.forEach((f, i) => groups[Math.min(LEVELS - 1, Math.floor(view.lum[i] * LEVELS))].push(f));
    groups.forEach((group, level) => {
      if (!group.length) return;
      const g = Math.round(((level + 0.5) / LEVELS) * 255);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.beginPath();
      for (const f of group) hexagon(ctx, size / 2 + f.x * scale, size / 2 + f.y * scale, r);
      ctx.fill();
    });
  }

  function drawYouView(plan) {
    const canvas = $('youview');
    const ctx = fit(canvas);
    const size = canvas.width;
    const outer = F.Eye.reach + F.Eye.SPACING;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#e8dcb0';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(full, plan.hx - outer, plan.hy - outer, 2 * outer, 2 * outer, 0, 0, size, size);
    ctx.restore();
  }

  // Grey when a Kenyon cell means nothing yet, shading to honey for sugar and blue for zaps.
  function tint(meaning) {
    const base = [221, 225, 231];
    const target = meaning >= 0 ? [233, 162, 27] : [59, 91, 255];
    const t = Math.min(1, Math.abs(meaning) * 1.6);
    const c = base.map((b, i) => Math.round(b + (target[i] - b) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function drawKenyonCells(canvas, brain, side, active) {
    const meaning = brain.meaning(side);
    const cols = 24;
    const rows = Math.ceil(meaning.length / cols);
    if (!canvas.clientWidth) return;
    const height = `${Math.round((canvas.clientWidth / cols) * rows)}px`;
    if (canvas.style.height !== height) canvas.style.height = height;
    const ctx = fit(canvas);
    const cell = canvas.width / cols;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const firing = new Set(active);
    for (let k = 0; k < meaning.length; k++) {
      const x = (k % cols) * cell + cell / 2;
      const y = Math.floor(k / cols) * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = tint(meaning[k]);
      ctx.fill();
      if (firing.has(k)) {
        ctx.lineWidth = Math.max(1.5, cell * 0.14);
        ctx.strokeStyle = C.ink;
        ctx.stroke();
      }
    }
  }

  function drawPanels() {
    panelsDirty = false;
    const { game, plan } = lab[focus];
    const recent = game.history.slice(-WINDOW);
    $('statRound').textContent = game.round;
    $('statFound').textContent = recent.length ? `${recent.filter((r) => r.found).length}/${recent.length}` : '–';
    $('statVisits').textContent = recent.length ? Math.round(recent.reduce((t, r) => t + r.visits, 0) / recent.length) : '–';
    $('statZaps').textContent = game.zaps.toLocaleString();
    const labNow = labAverageNow();
    $('labFound').textContent = labNow === null ? '–' : pct(labNow);
    if (!plan) return;
    const inputs = game.brain.strongestInputs(plan.view, plan.thought.active);
    $('inputsNow').textContent = inputs.length ? inputs.join(', ') : '–';
    drawKenyonCells($('kcLeft'), game.brain, 0, plan.thought.active[0]);
    drawKenyonCells($('kcRight'), game.brain, 1, plan.thought.active[1]);
    const v = Math.max(-1, Math.min(1, plan.relative / 0.5));
    const fill = $('meterFill');
    fill.style.left = `${50 + Math.min(0, v) * 50}%`;
    fill.style.width = `${Math.abs(v) * 50}%`;
    fill.style.background = v >= 0 ? C.honey : C.volt;
    $('chance').textContent = `Land here? ${Math.round(plan.chance * 100)}%`;
  }

  function pulseDopamine(outcome) {
    const el = $(outcome === 'sugar' ? 'pam' : 'ppl1');
    el.classList.add('on');
    clearTimeout(el.offTimer);
    el.offTimer = setTimeout(() => el.classList.remove('on'), 450);
  }

  function banner(text) {
    const el = $('banner');
    el.hidden = !text;
    if (text) el.textContent = text;
  }

  // ---------- learning curves ----------
  const chartView = { hover: null, geom: null };

  // After each round: the share of the fly's last WINDOW rounds where it found him.
  function foundRates(history) {
    const rates = [];
    let found = 0;
    history.forEach((round, i) => {
      found += round.found ? 1 : 0;
      if (i >= WINDOW) found -= history[i - WINDOW].found ? 1 : 0;
      rates.push(found / Math.min(i + 1, WINDOW));
    });
    return rates;
  }

  function quantile(sorted, p) {
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  // The lab's curve runs for as long as at least half the flies have played that many rounds.
  function chartSeries() {
    const rates = lab.map((fly) => foundRates(fly.game.history));
    const labCurve = [];
    for (let r = 0; ; r++) {
      const values = rates.filter((fly) => fly.length > r).map((fly) => fly[r]).sort((a, b) => a - b);
      if (values.length < FLIES / 2) break;
      labCurve.push({ mean: values.reduce((a, b) => a + b, 0) / values.length, low: quantile(values, 0.25), high: quantile(values, 0.75) });
    }
    return { labCurve, mine: rates[focus] };
  }

  // The lab's average right now is the last point on its curve, so the chart, its end label and
  // the scorecard always agree.
  function labAverageNow(series = chartSeries()) {
    const { labCurve } = series;
    return labCurve.length ? labCurve[labCurve.length - 1].mean : null;
  }

  function drawChart() {
    chartDirty = false;
    const canvas = $('chart');
    const ctx = fit(canvas);
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const series = chartSeries();
    const { labCurve, mine } = series;
    const labNow = labAverageNow(series);
    $('labNow').textContent = labNow === null ? '–' : pct(labNow);
    drawTable(series);

    const endLabels = w >= 480;
    const m = { l: 44, r: endLabels ? 122 : 14, t: 24, b: 30 };
    const pw = w - m.l - m.r;
    const ph = h - m.t - m.b;
    const rounds = Math.max(labCurve.length, mine.length);
    const span = Math.max(20, rounds);
    const X = (round) => m.l + ((round - 1) / (span - 1)) * pw;
    const Y = (rate) => m.t + ph - rate * ph;
    chartView.geom = { m, pw, span, rounds };

    // Recessive grid, labels in text colours.
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(m.l, Math.round(Y(v)) + 0.5);
      ctx.lineTo(m.l + pw, Math.round(Y(v)) + 0.5);
      ctx.stroke();
      ctx.fillStyle = C.slate;
      ctx.fillText(pct(v), m.l - 8, Y(v));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = span <= 30 ? 5 : span <= 100 ? 10 : span <= 250 ? 25 : span <= 600 ? 50 : 100;
    for (let r = step; r <= span; r += step) ctx.fillText(String(r), X(r), m.t + ph + 8);
    ctx.textAlign = 'left';
    ctx.fillText('round', m.l, m.t + ph + 8);
    ctx.textBaseline = 'bottom';
    ctx.fillText('found him', m.l, m.t - 8);

    if (!rounds) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Curves appear as flies finish their first rounds.', m.l + pw / 2, m.t + ph / 2);
      chartTip(null);
      return;
    }

    // What a fly that can't learn manages, for scale.
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.slate;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.l, Y(CANT_LEARN));
    ctx.lineTo(m.l + pw, Y(CANT_LEARN));
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.slate;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`can't learn ${pct(CANT_LEARN)}`, m.l + pw - 4, Y(CANT_LEARN) - 3);

    // Where the middle half of the flies are: a light wash.
    if (labCurve.length > 1) {
      ctx.fillStyle = 'rgba(22, 24, 29, 0.1)';
      ctx.beginPath();
      labCurve.forEach((p, i) => (i ? ctx.lineTo(X(i + 1), Y(p.high)) : ctx.moveTo(X(1), Y(p.high))));
      for (let i = labCurve.length - 1; i >= 0; i--) ctx.lineTo(X(i + 1), Y(labCurve[i].low));
      ctx.closePath();
      ctx.fill();
    }

    const trace = (values, color) => {
      if (values.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      values.forEach((v, i) => (i ? ctx.lineTo(X(i + 1), Y(v)) : ctx.moveTo(X(1), Y(v))));
      ctx.stroke();
    };
    trace(mine, C.red);
    trace(labCurve.map((p) => p.mean), C.ink);

    const ends = [
      { name: 'lab average', value: labCurve.length ? labCurve[labCurve.length - 1].mean : null, x: X(labCurve.length), color: C.ink },
      { name: flyName(focus), value: mine.length ? mine[mine.length - 1] : null, x: X(mine.length), color: C.red },
    ].filter((end) => end.value !== null);
    for (const end of ends) dot(ctx, end.x, Y(end.value), end.color);
    if (endLabels) drawEndLabels(ctx, ends, Y, m, pw, ph);

    // Crosshair on the round under the pointer (or keyboard), and a readout for every series.
    const hover = chartView.hover === null ? null : Math.min(chartView.hover, rounds);
    if (hover === null) return chartTip(null);
    const hx = X(hover);
    ctx.strokeStyle = 'rgba(22, 24, 29, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(hx) + 0.5, m.t);
    ctx.lineTo(Math.round(hx) + 0.5, m.t + ph);
    ctx.stroke();
    const point = labCurve[hover - 1];
    if (point) dot(ctx, hx, Y(point.mean), C.ink);
    if (mine[hover - 1] !== undefined) dot(ctx, hx, Y(mine[hover - 1]), C.red);
    chartTip({ round: hover, point, mine: mine[hover - 1], x: hx, top: m.t, bottom: m.t + ph, width: w });
  }

  // A filled end marker with a 2px surface ring, so it stays legible where lines cross.
  function dot(ctx, x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // Value and name just past each line's end. If two labels would collide they spread apart,
  // and a short leader line keeps each tied to its own line.
  function drawEndLabels(ctx, ends, Y, m, pw, ph) {
    const GAP = 16;
    const top = m.t + 6;
    const bottom = m.t + ph - 6;
    const items = ends
      .map((end) => ({ ...end, y: Y(end.value), labelX: Math.min(end.x, m.l + pw) + 10, labelY: Math.max(top, Math.min(bottom, Y(end.value))) }))
      .sort((a, b) => a.y - b.y);
    const sideBySide = items.length === 2 && Math.abs(items[0].labelX - items[1].labelX) < 110;
    if (sideBySide && items[1].labelY - items[0].labelY < GAP) {
      const mid = (items[0].labelY + items[1].labelY) / 2;
      items[0].labelY = Math.max(top, Math.min(bottom - GAP, mid - GAP / 2));
      items[1].labelY = items[0].labelY + GAP;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const item of items) {
      const x = item.labelX;
      const ly = item.labelY;
      if (Math.abs(ly - item.y) > 1) {
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(item.x + 6, item.y);
        ctx.lineTo(x - 2, ly);
        ctx.stroke();
      }
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = C.ink;
      const value = pct(item.value);
      const valueWidth = ctx.measureText(value).width;
      ctx.fillText(value, x, ly);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = C.slate;
      ctx.fillText(item.name, x + valueWidth + 5, ly);
    }
  }

  function chartTip(info) {
    const tip = $('chartTip');
    if (!info) {
      tip.hidden = true;
      return;
    }
    const rows = [];
    const row = (key, value, label) => {
      const el = document.createElement('div');
      el.className = 'row';
      const swatch = document.createElement('i');
      swatch.className = `key ${key}`;
      const v = document.createElement('span');
      v.className = 'value';
      v.textContent = value;
      const l = document.createElement('span');
      l.className = 'label';
      l.textContent = label;
      el.append(swatch, v, l);
      rows.push(el);
    };
    if (info.point) {
      row('avg', pct(info.point.mean), 'lab average');
      row('band', `${pct(info.point.low)}–${pct(info.point.high)}`, 'middle half of the flies');
    }
    row('mine', info.mine === undefined ? '–' : pct(info.mine), flyLabel(focus));
    row('base', pct(CANT_LEARN), "flies that can't learn");
    const head = document.createElement('div');
    head.className = 'tip-round';
    head.textContent = `Round ${info.round}`;
    tip.replaceChildren(head, ...rows);
    tip.hidden = false;
    // Beside the crosshair when there's room on either side. On a narrow screen there isn't, so it
    // stays inside the chart and sits low, where learned flies' lines rarely are.
    const right = info.x + 16;
    const left = info.x - 16 - tip.offsetWidth;
    if (right + tip.offsetWidth <= info.width) {
      tip.style.left = `${right}px`;
      tip.style.top = `${info.top}px`;
    } else if (left >= 0) {
      tip.style.left = `${left}px`;
      tip.style.top = `${info.top}px`;
    } else {
      tip.style.left = `${Math.max(0, Math.min(info.width - tip.offsetWidth, info.x - tip.offsetWidth / 2))}px`;
      tip.style.top = `${Math.max(info.top, info.bottom - tip.offsetHeight - 4)}px`;
    }
  }

  // The chart's numbers as a table, for anyone who'd rather read than hover.
  function drawTable({ labCurve, mine }) {
    if (!$('numbers').open) return;
    $('numbersFly').textContent = flyLabel(focus);
    const newest = Math.max(labCurve.length, mine.length);
    const rows = [];
    for (let r = newest; r >= 1 && r > newest - 15; r--) {
      const point = labCurve[r - 1];
      const cells = [
        String(r),
        point ? pct(point.mean) : '–',
        mine[r - 1] !== undefined ? pct(mine[r - 1]) : '–',
        point ? `${pct(point.low)}–${pct(point.high)}` : '–',
      ];
      const tr = document.createElement('tr');
      for (const text of cells) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      rows.push(tr);
    }
    $('numbersBody').replaceChildren(...rows);
  }

  {
    const canvas = $('chart');
    const hoverAt = (clientX) => {
      const g = chartView.geom;
      if (!g || !g.rounds) return;
      const x = clientX - canvas.getBoundingClientRect().left;
      chartView.hover = Math.max(1, Math.min(g.rounds, Math.round(((x - g.m.l) / g.pw) * (g.span - 1)) + 1));
      chartDirty = true;
    };
    canvas.addEventListener('pointermove', (e) => hoverAt(e.clientX));
    canvas.addEventListener('pointerdown', (e) => hoverAt(e.clientX)); // a tap on a phone
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch' || document.activeElement === canvas) return; // taps keep the readout
      chartView.hover = null;
      chartDirty = true;
    });
    document.addEventListener('pointerdown', (e) => {
      if (chartView.hover === null || e.target === canvas) return;
      chartView.hover = null;
      chartDirty = true;
    });
    canvas.addEventListener('focus', () => {
      if (chartView.geom && chartView.geom.rounds) chartView.hover = chartView.geom.rounds;
      chartDirty = true;
    });
    canvas.addEventListener('blur', () => {
      chartView.hover = null;
      chartDirty = true;
    });
    canvas.addEventListener('keydown', (e) => {
      const steps = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
      const g = chartView.geom;
      if (!(e.key in steps) || !g || !g.rounds) return;
      e.preventDefault();
      chartView.hover = Math.max(1, Math.min(g.rounds, (chartView.hover ?? g.rounds) + steps[e.key]));
      chartDirty = true;
    });
    $('numbers').addEventListener('toggle', () => {
      chartDirty = true;
    });
  }

  // ---------- controls ----------
  document.querySelectorAll('[data-speed]').forEach((button) => {
    button.addEventListener('click', () => {
      speed = button.dataset.speed;
      document.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      for (const fly of lab) fly.anim = null; // unfinished visits are dropped; they hadn't changed anything yet
      banner(null);
    });
  });

  $('zap').addEventListener('input', () => {
    for (const fly of lab) fly.game.zapStrength = zapStrength();
  });

  $('pause').addEventListener('click', () => {
    const now = performance.now();
    paused = !paused;
    if (paused) {
      pausedAt = now;
    } else {
      for (const fly of lab) {
        if (fly.anim) fly.anim.t0 += now - pausedAt;
        if (fly.flash) fly.flash.until += now - pausedAt;
      }
    }
    $('pause').textContent = paused ? 'Resume' : 'Pause';
    $('pause').setAttribute('aria-pressed', String(paused));
  });

  $('helpless').addEventListener('click', () => {
    const { game } = lab[focus];
    game.helpless = !game.helpless;
    showHelpless();
    panelsDirty = true;
    chartDirty = true;
  });

  // Race the lab's leading fly. A helpless one barely tries, so it races the best fly that isn't,
  // unless every fly is helpless. One that has barely played gets a quick warm-up first (capped, so
  // the page never stalls). The lab pauses while you race.
  $('raceStart').addEventListener('click', () => {
    const ranked = lab.slice().sort((a, b) => b.game.sugars - a.game.sugars || a.index - b.index);
    const leader = ranked.find((fly) => !fly.game.helpless) || ranked[0];
    for (let steps = 0; leader.game.sugars < 10 && steps < 6000; steps++) leader.game.step();
    leader.anim = null; // any visit in progress belongs to a crowd the warm-up moved past
    panelsDirty = true;
    chartDirty = true;
    rankDirty = true;
    const wasPaused = paused;
    if (!wasPaused) $('pause').click();
    const { game } = leader;
    F.Race.start({
      name: flyName(leader.index),
      brain: game.brain,
      expectation: game.expectation,
      zapStrength: game.zapStrength,
      helpless: game.helpless,
      onClose: () => {
        if (!wasPaused && paused) $('pause').click();
        $('raceStart').focus();
      },
    });
  });

  $('reset').addEventListener('click', () => {
    newLab();
    setFocus(focus);
  });

  new ResizeObserver(() => {
    panelsDirty = true;
    chartDirty = true;
    if (lab[focus] && lab[focus].plan) drawEyes(lab[focus]);
  }).observe(document.body);

  buildCards();
  newLab();
  setFocus(0);
  requestAnimationFrame(frame);
})(globalThis.FLYDO = globalThis.FLYDO || {});
