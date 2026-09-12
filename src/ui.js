// Animation, panels and controls for a lab of ten flies. Every decision a fly makes lives in
// game.js; this file only shows it.
(function (F) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const K = F.CONNECTOME;
  const C = { ink: '#16181d', slate: '#6b7280', line: '#dde1e7', red: '#d62626', honey: '#e9a21b', volt: '#3b5bff' };
  const FLIES = 10;
  const DURATION = { fly: 520, hover: 420, land: 200, zap: 650, sugar: 1200, miss: 1100 }; // ms at Watch speed
  const PACE = { watch: 1, fast: 0.25 };
  const FLY_SIZE = 2.6;
  const zapStrength = () => 0.1 + (1.9 * Number($('zap').value)) / 100;

  let speed = 'fast';
  let paused = false;
  let pausedAt = 0;
  let focus = 0;
  let turboNext = 0;
  let turboShown = 0;
  let panelsDirty = true;
  let chartDirty = true;
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

  // ---------- the lab ----------
  function buildCards() {
    for (let i = 0; i < FLIES; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'card';
      button.innerHTML = `<canvas aria-hidden="true"></canvas><span class="name">Fly ${i + 1}</span><span class="score">searching</span>`;
      button.addEventListener('click', () => setFocus(i));
      $('lab').appendChild(button);
      const thumb = document.createElement('canvas');
      thumb.width = 240;
      thumb.height = 150;
      cards.push({ button, canvas: button.querySelector('canvas'), score: button.querySelector('.score'), thumb, scene: null, seen: -1, flash: '' });
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
  }

  function setFocus(i) {
    focus = i;
    cards.forEach((card, j) => card.button.setAttribute('aria-pressed', String(j === i)));
    $('watching').textContent = `Watching Fly ${i + 1}`;
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
    if (fly.game.over) chartDirty = true;
    if (speed === 'turbo') return; // too many to show one by one; turbo refreshes the panels itself
    if (outcome !== 'none') {
      fly.flash = { kind: outcome, until: now + 500 };
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
    drawFly(ctx, poseOf(fly, now), now);
    if (phase === 'zap') popText(ctx, 'zap', anim.plan.hx, anim.plan.hy - 30 - progress(anim, now) * 10, C.volt);
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

  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFly(ctx, pose, now) {
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.heading);
    ctx.scale(FLY_SIZE * pose.scale, FLY_SIZE * pose.scale);
    ctx.strokeStyle = '#2b2419';
    ctx.lineWidth = 0.6;
    for (const side of [-1, 1]) {
      for (const [x0, x1, y1] of [[2.6, 5.2, 4.2], [1.2, 1.2, 4.8], [-0.2, -3, 4.4]]) {
        ctx.beginPath();
        ctx.moveTo(x0, side * 1.4);
        ctx.lineTo(x1, side * y1);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#5a4630'; // abdomen, with its dark bands
    ellipse(ctx, -3.8, 0, 4.2, 2.6);
    ctx.strokeStyle = 'rgba(24, 16, 8, 0.75)';
    ctx.lineWidth = 0.7;
    for (const x of [-2.4, -4, -5.6]) {
      ctx.beginPath();
      ctx.moveTo(x, -2.2);
      ctx.lineTo(x, 2.2);
      ctx.stroke();
    }
    ctx.fillStyle = '#8a6a44'; // thorax and head
    ellipse(ctx, 1.2, 0, 2.6, 2.3);
    ellipse(ctx, 4.2, 0, 1.7, 1.9);
    ctx.fillStyle = C.red; // red compound eyes that can barely see red
    ellipse(ctx, 4.6, -1.35, 1.2, 1);
    ellipse(ctx, 4.6, 1.35, 1.2, 1);
    const flap = pose.wings ? Math.sin(now / 16) * 0.35 : 0;
    ctx.fillStyle = 'rgba(205, 220, 240, 0.6)';
    ctx.strokeStyle = 'rgba(40, 50, 70, 0.5)';
    ctx.lineWidth = 0.4;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(0.6, side * 1.2);
      ctx.rotate(Math.PI - side * (0.42 + flap));
      ellipse(ctx, 4.6, 0, 5.2, 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
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

  function drawCross(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = C.volt;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 3.5);
    ctx.lineTo(x + 3.5, y + 3.5);
    ctx.moveTo(x + 3.5, y - 3.5);
    ctx.lineTo(x - 3.5, y + 3.5);
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
    popText(ctx, 'sugar', person.cx, person.cy - 42 - u * 8, C.honey);
  }

  function popText(ctx, text, x, y, color) {
    ctx.save();
    ctx.font = '700 15px "Pixelify Sans", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
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
        const recent = game.history.slice(-10);
        card.score.textContent = recent.length ? `${recent.filter((r) => r.found).length}/${recent.length} found` : 'searching';
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
    const recent = game.history.slice(-20);
    $('statRound').textContent = game.round;
    $('statFound').textContent = recent.length ? `${recent.filter((r) => r.found).length}/${recent.length}` : '–';
    $('statVisits').textContent = recent.length ? Math.round(recent.reduce((t, r) => t + r.visits, 0) / recent.length) : '–';
    $('statZaps').textContent = game.zaps.toLocaleString();
    const everyone = lab.flatMap((fly) => fly.game.history.slice(-20));
    $('labFound').textContent = everyone.length
      ? `${Math.round((100 * everyone.filter((r) => r.found).length) / everyone.length)}%`
      : '–';
    if (!plan) return;
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
  function drawChart() {
    chartDirty = false;
    const canvas = $('chart');
    const ctx = fit(canvas);
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const m = { l: 40, r: 14, t: 10, b: 26 };
    const pw = w - m.l - m.r;
    const ph = h - m.t - m.b;
    const most = Math.max(...lab.map((fly) => fly.game.history.length));
    const span = Math.max(30, most);
    const X = (round) => m.l + ((round - 1) / (span - 1)) * pw;
    const Y = (visits) => m.t + ph - (visits / F.MAX_VISITS) * ph;

    ctx.font = '11px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= F.MAX_VISITS; v += 30) {
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(m.l, Y(v));
      ctx.lineTo(m.l + pw, Y(v));
      ctx.stroke();
      ctx.fillStyle = C.slate;
      ctx.fillText(String(v), m.l - 8, Y(v));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = span <= 40 ? 5 : span <= 100 ? 10 : span <= 250 ? 25 : span <= 600 ? 50 : 100;
    for (let r = step; r <= span; r += step) ctx.fillText(String(r), X(r), m.t + ph + 8);

    const smooth = (history) => history.map((_, i) => {
      const window = history.slice(Math.max(0, i - 4), i + 1);
      return window.reduce((t, r) => t + r.visits, 0) / window.length;
    });
    const trace = (values, color, width) => {
      if (values.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      values.forEach((v, i) => (i ? ctx.lineTo(X(i + 1), Y(v)) : ctx.moveTo(X(1), Y(v))));
      ctx.stroke();
    };
    if (most === 0) {
      ctx.fillStyle = C.slate;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Curves appear as flies finish their first rounds.', m.l + pw / 2, m.t + ph / 2);
      return;
    }
    const lines = lab.map((fly) => smooth(fly.game.history));
    lines.forEach((line, i) => { if (i !== focus) trace(line, 'rgba(107, 114, 128, 0.35)', 1); });
    trace(lines[focus], C.red, 2);
    const mean = [];
    for (let r = 0; r < most; r++) {
      const values = lines.filter((line) => line.length > r).map((line) => line[r]);
      if (values.length < FLIES / 2) break;
      mean.push(values.reduce((a, b) => a + b, 0) / values.length);
    }
    trace(mean, C.ink, 2.5);
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
