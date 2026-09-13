// Drawing the fruit fly, shared by the lab and the race.
(function (F) {
  'use strict';

  const SIZE = 2.6;       // page pixels per sprite unit
  const RED = '#d62626';

  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // pose: { x, y, heading in radians, scale, wings: true while flying }
  function fly(ctx, pose, now) {
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.heading);
    ctx.scale(SIZE * pose.scale, SIZE * pose.scale);
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
    ctx.fillStyle = RED; // red compound eyes that can barely see red
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

  F.Sprite = { fly, popText };
})(globalThis.FLYDO = globalThis.FLYDO || {});
