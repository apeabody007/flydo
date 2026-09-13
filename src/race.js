// Race the fly: you and a copy of the lab's leading fly search the same fresh crowd. The fly's
// whole search is worked out up front with its real brain, then played back in real time on the
// crowd while you look for the striped guy yourself.
(function (F) {
  'use strict';

  // The fly's clock. It flies in from the edge of the page, so it can't win in a blink, and it
  // pays for distance. Tuned by simulation so a trained fly takes about 7.5s on a desktop crowd
  // and 4.3s on a phone crowd, with finds under 2s rare.
  const TAKEOFF_MS = 1500;   // everyone needs a moment after "go"
  const LOOK_MS = 100;       // to look at each person it flies to
  const FLIGHT_PX_S = 1000;  // flying speed, in page pixels per second
  const ZAP_MS = 400;        // a wrong landing costs the fly this much extra
  const PENALTY_MS = 2000;   // a wrong tap costs you this much
  const COUNT_MS = 800;      // each step of "3, 2, 1"
  const TAP_SLOP = 5;        // page pixels of forgiveness around each person
  const DESKTOP = { width: 960, height: 600, crowd: 120 };
  const PHONE = { width: 480, height: 640, crowd: 60 }; // bigger people on small screens
  const COLORS = { ink: '#16181d', red: '#d62626', honey: '#e9a21b', green: '#22c55e', volt: '#3b5bff' };

  const $ = (id) => document.getElementById(id);
  const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
  const shareUrl = () => document.querySelector('meta[property="og:url"]').content;
  const sceneCanvas = document.createElement('canvas');
  let race = null;

  // A random point on the page's border, where the fly flies in from.
  function edgePoint({ W, H }) {
    const t = Math.random() * 2 * (W + H);
    if (t < W) return { x: t, y: 0 };
    if (t < W + H) return { x: W, y: t - W };
    if (t < 2 * W + H) return { x: t - W - H, y: H };
    return { x: 0, y: t - 2 * W - H };
  }

  // Play the fly's search forward until it lands on him or gives up. Each check records when the
  // fly sets off, arrives, finishes looking, and (after any zap) is ready to move on.
  function planSearch(game) {
    const checks = [];
    let at = TAKEOFF_MS;
    let from = { x: game.fly.x, y: game.fly.y };
    while (!game.over) {
      const plan = game.plan();
      const outcome = game.commit(plan);
      if (!plan) break;
      const start = at;
      const arrive = start + (Math.hypot(plan.hx - from.x, plan.hy - from.y) / FLIGHT_PX_S) * 1000;
      const looked = arrive + LOOK_MS;
      at = looked + (outcome === 'zap' ? ZAP_MS : 0);
      checks.push({ from, start, arrive, looked, at, plan, outcome });
      from = { x: plan.hx, y: plan.hy };
    }
    return { checks, done: { at, found: game.found, people: game.seen.size } };
  }

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  // Where the fly is, and what it's doing, `elapsed` ms after go.
  function flyPose(r, elapsed, now) {
    const first = r.checks[0];
    if (!first || elapsed < TAKEOFF_MS) {
      const heading = first ? Math.atan2(first.plan.hy - r.start.y, first.plan.hx - r.start.x) : 0;
      return { x: r.start.x, y: r.start.y, heading, scale: 1, wings: elapsed > TAKEOFF_MS - 500, state: 'takeoff' };
    }
    const check = r.checks.find((c) => elapsed < c.at) || r.checks[r.checks.length - 1];
    const { from, plan } = check;
    const heading = Math.atan2(plan.hy - from.y, plan.hx - from.x);
    if (elapsed < check.arrive) {
      const t = ease((elapsed - check.start) / Math.max(1, check.arrive - check.start));
      return { x: from.x + (plan.hx - from.x) * t, y: from.y + (plan.hy - from.y) * t, heading, scale: 1, wings: true, state: 'flying' };
    }
    if (elapsed < check.looked) {
      return { x: plan.hx + Math.sin(now / 41) * 1.2, y: plan.hy + Math.cos(now / 57) * 1.2, heading, scale: 1, wings: true, state: 'looking' };
    }
    if (check.outcome === 'zap' && elapsed < check.at) {
      const u = (elapsed - check.looked) / ZAP_MS;
      return { x: plan.hx + Math.sin(u * Math.PI) * 10, y: plan.hy - Math.sin(u * Math.PI) * 16, heading: heading + Math.sin(u * Math.PI * 6) * 0.5, scale: 0.9, wings: true, state: 'zap', u, check };
    }
    const landed = check.outcome === 'sugar';
    return { x: plan.hx, y: plan.hy, heading, scale: landed ? 0.8 : 1, wings: !landed, state: landed ? 'sugar' : 'resting', check };
  }

  function start(opponent) {
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    const game = new F.Game({ scene: narrow ? PHONE : DESKTOP, learning: false, helpless: opponent.helpless, zapStrength: opponent.zapStrength });
    game.brain.copyFrom(opponent.brain);
    game.expectation = opponent.expectation;
    game.fly = edgePoint(game.scene);
    const scene = game.scene;
    const startPoint = { ...game.fly };
    const { checks, done } = planSearch(game);
    race = { opponent, scene, checks, start: startPoint, fly: done, you: null, penalty: 0, wrong: [], opened: performance.now(), go: null, over: false };

    sceneCanvas.width = scene.W;
    sceneCanvas.height = scene.H;
    sceneCanvas.getContext('2d').putImageData(new ImageData(scene.rgba, scene.W, scene.H), 0, 0);
    $('raceCanvas').style.aspectRatio = `${scene.W} / ${scene.H}`;

    const name = opponent.name;
    $('raceTitle').textContent = `Race ${name}`;
    $('raceFlyLabel').textContent = opponent.helpless ? `${name} (helpless)` : name;
    $('raceIntro').textContent = `Tap the guy in the red-and-white stripes and bobble hat. Wrong taps cost you 2 seconds. ` +
      `${name} needs a moment to take off, then flies from person to person, and its wrong landings cost it time too.`;
    $('raceYou').textContent = '0.0s';
    $('raceFly').textContent = 'ready';
    $('raceResult').hidden = true;
    $('raceSkip').hidden = true;
    $('raceGiveUp').hidden = false;
    $('racePenalty').hidden = true;
    $('race').hidden = false;
    document.body.classList.add('racing');
    $('raceClose').focus();
    race.frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    const r = race;
    if (!r) return;
    const counting = now - r.opened;
    if (r.go === null) {
      const left = 3 - Math.floor(counting / COUNT_MS);
      if (left > 0) {
        $('raceCountdown').hidden = false;
        $('raceCountdown').textContent = String(left);
      } else {
        r.go = now;
        $('raceCountdown').hidden = true;
      }
    }
    const elapsed = r.go === null ? 0 : now - r.go;

    if (!r.you) $('raceYou').textContent = secs(elapsed + r.penalty);
    if (r.go !== null && !r.over) {
      if (elapsed >= r.fly.at) {
        $('raceFly').textContent = r.fly.found ? `found him · ${secs(r.fly.at)}` : `gave up after ${r.fly.people} people`;
      } else {
        const checked = new Set(r.checks.filter((c) => c.at <= elapsed).map((c) => c.plan.person.id)).size;
        $('raceFly').textContent = `checked ${checked} ${checked === 1 ? 'person' : 'people'}`;
      }
      if (r.you && elapsed >= r.fly.at) finish();
    }
    draw(now, elapsed);
    r.frame = requestAnimationFrame(tick);
  }

  function personAt(scene, x, y) {
    const hit = (p) => x >= p.x - TAP_SLOP && x <= p.x + F.Scene.SPRITE_W + TAP_SLOP &&
      y >= p.y - TAP_SLOP && y <= p.y + F.Scene.SPRITE_H + TAP_SLOP;
    return hit(scene.target) ? scene.target : scene.people.find(hit); // near-misses go your way
  }

  function tap(e) {
    const r = race;
    if (!r || r.go === null || r.you || r.over) return;
    const rect = $('raceCanvas').getBoundingClientRect();
    const person = personAt(r.scene, ((e.clientX - rect.left) / rect.width) * r.scene.W, ((e.clientY - rect.top) / rect.height) * r.scene.H);
    if (!person) return;
    const elapsed = performance.now() - r.go;
    if (person === r.scene.target) {
      r.you = { at: elapsed + r.penalty, found: true };
      $('raceYou').textContent = `found him · ${secs(r.you.at)}`;
      $('raceGiveUp').hidden = true;
      if (elapsed >= r.fly.at) finish();
      else $('raceSkip').hidden = false;
    } else if (!r.wrong.includes(person)) {
      r.wrong.push(person);
      r.penalty += PENALTY_MS;
      const badge = $('racePenalty');
      badge.hidden = false;
      clearTimeout(badge.hideTimer);
      badge.hideTimer = setTimeout(() => { badge.hidden = true; }, 700);
    }
  }

  function finish() {
    const r = race;
    if (!r || r.over) return;
    r.over = true;
    if (!r.you) r.you = { at: null, found: false };
    $('raceSkip').hidden = true;
    $('raceGiveUp').hidden = true;
    $('raceYou').textContent = r.you.found ? `found him · ${secs(r.you.at)}` : 'gave up';
    $('raceFly').textContent = r.fly.found ? `found him · ${secs(r.fly.at)}` : `gave up after ${r.fly.people} people`;

    const you = r.you.found ? r.you.at : null;
    const fly = r.fly.found ? r.fly.at : null;
    const name = r.opponent.name;
    let headline;
    if (you !== null && fly !== null) headline = you < fly ? 'You beat the fly!' : you > fly ? `${name} beat you.` : "It's a tie!";
    else if (you !== null) headline = 'You beat the fly!';
    else if (fly !== null) headline = `${name} beat you.`;
    else headline = 'Nobody found him.';
    $('raceHeadline').textContent = headline;
    $('raceTimes').textContent = `You: ${you === null ? 'gave up' : secs(you)}   ·   ${name}: ${fly === null ? 'gave up' : secs(fly)}`;

    const wrongTaps = r.wrong.length;
    const zaps = r.checks.filter((c) => c.outcome === 'zap').length;
    const details = [];
    if (wrongTaps) details.push(`Your ${wrongTaps} wrong ${wrongTaps === 1 ? 'tap' : 'taps'} added ${wrongTaps * 2}s.`);
    const landings = zaps ? `landed on the wrong one ${zaps} ${zaps === 1 ? 'time' : 'times'}` : 'never landed on the wrong one';
    details.push(`${name} checked ${r.fly.people} ${r.fly.people === 1 ? 'person' : 'people'} and ${landings}. Its path is drawn on the crowd.`);
    if (r.opponent.helpless) details.push(`${name} is helpless right now, so it barely tries.`);
    $('raceDetail').textContent = details.join(' ');

    const text = shareText(you, fly);
    $('raceShareX').href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl())}`;
    $('raceShare').hidden = !navigator.share;
    $('raceShare').onclick = () => navigator.share({ text, url: shareUrl() }).catch(() => {});
    $('raceResult').hidden = false;
    $('raceResult').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function shareText(you, fly) {
    const brain = "a fruit fly's brain, wired from a real fly connectome,";
    if (you !== null && fly !== null) {
      if (you < fly) return `I beat ${brain} at finding the striped guy: me ${secs(you)}, the fly ${secs(fly)}. Race one yourself 🪰`;
      if (you > fly) return `I lost to ${brain} at finding the striped guy: the fly ${secs(fly)}, me ${secs(you)}. Race one yourself 🪰`;
      return `I tied ${brain} at finding the striped guy: ${secs(you)} each. Race one yourself 🪰`;
    }
    if (you !== null) return `I found the striped guy in ${secs(you)}, and ${brain} gave up. Race one yourself 🪰`;
    if (fly !== null) return `I gave up, and ${brain} found the striped guy in ${secs(fly)}. Race one yourself 🪰`;
    return `Neither I nor ${brain} could find the striped guy. Race one yourself 🪰`;
  }

  // ---------- drawing ----------
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

  function draw(now, elapsed) {
    const r = race;
    const canvas = $('raceCanvas');
    const ctx = fit(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (r.go === null) {
      ctx.fillStyle = '#e8dcb0'; // no peeking during the countdown
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sceneCanvas, 0, 0, canvas.width, canvas.height);
    const s = canvas.width / r.scene.W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    for (const person of r.wrong) cross(ctx, person.cx, person.y - 5);
    if (r.over) drawPath(ctx, r, r.start);
    if (r.you && r.you.found) ring(ctx, r.scene.target, COLORS.green, 30);
    else if (r.over) ring(ctx, r.scene.target, COLORS.red, 30);

    // The fly, racing on the same crowd. Once the result is in, it jumps to where it ended up.
    const flyTime = r.over ? Math.max(elapsed, r.fly.at) : elapsed;
    const pose = flyPose(r, flyTime, now);
    F.Sprite.fly(ctx, pose, now);
    if (pose.state === 'zap') {
      F.Sprite.popText(ctx, 'zap', pose.check.plan.hx, pose.check.plan.hy - 30 - pose.u * 10, COLORS.volt);
    }
    if (pose.state === 'sugar' && flyTime - r.fly.at < 1500) {
      F.Sprite.popText(ctx, 'sugar', pose.x, pose.y - 36, COLORS.honey);
    }
  }

  // How the fly searched: its route from person to person, with wrong landings marked.
  function drawPath(ctx, r, start) {
    ctx.save();
    ctx.strokeStyle = 'rgba(22, 24, 29, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (const c of r.checks) ctx.lineTo(c.plan.hx, c.plan.hy);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const c of r.checks) {
      ctx.beginPath();
      ctx.arc(c.plan.hx, c.plan.hy, c.outcome === 'zap' ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = c.outcome === 'zap' ? COLORS.red : c.outcome === 'sugar' ? COLORS.honey : COLORS.ink;
      ctx.fill();
    }
    ctx.restore();
    if (r.fly.found) ring(ctx, r.scene.target, COLORS.honey, 38);
  }

  function ring(ctx, person, color, radius) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(person.cx, person.cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function cross(ctx, x, y) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 3.5);
    ctx.lineTo(x + 3.5, y + 3.5);
    ctx.moveTo(x + 3.5, y - 3.5);
    ctx.lineTo(x - 3.5, y + 3.5);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4.2;
    ctx.stroke();
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  function close() {
    if (!race) return;
    cancelAnimationFrame(race.frame);
    const { onClose } = race.opponent;
    race = null;
    $('race').hidden = true;
    document.body.classList.remove('racing');
    if (onClose) onClose();
  }

  $('raceCanvas').addEventListener('pointerdown', tap);
  $('raceClose').addEventListener('click', close);
  // Clicking the dimmed lab around the race also closes it, but only when the press started there
  // too, so dragging out of the race by accident doesn't end it.
  let pressedBackdrop = false;
  $('race').addEventListener('pointerdown', (e) => {
    pressedBackdrop = e.target === e.currentTarget;
  });
  $('race').addEventListener('click', (e) => {
    if (pressedBackdrop && e.target === e.currentTarget) close();
  });
  $('raceGiveUp').addEventListener('click', finish);
  $('raceSkip').addEventListener('click', finish);
  $('raceAgain').addEventListener('click', () => {
    const opponent = race.opponent;
    cancelAnimationFrame(race.frame);
    start(opponent);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && race) close();
  });

  // Fetch the countdown font now, so the first race doesn't flash a fallback "3".
  if (document.fonts) document.fonts.load('64px "Press Start 2P"').catch(() => {});

  F.Race = { start };
})(globalThis.FLYDO = globalThis.FLYDO || {});
