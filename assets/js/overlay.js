// 2D overlay drawn on top of the slides every frame: particles, opening/closing titles and lyrics.

const ov = document.createElement('canvas');
const ctx = ov.getContext('2d');
let phrases = [];

function drawOverlay(t, dt, tm, i) {
  ctx.clearRect(0, 0, W, H);
  // the opening title holds for the whole (longer) first slide, fading as the next slide comes in
  const introDur = plan.length > 1 ? Math.max(4, tm.durs[0] - tm.T * .4) : Math.min(8, tm.total * .6);
  const outroStart = Math.max(introDur + .2, tm.total - 4.5);
  stepParticles(t, dt, tm, i, introDur, outroStart);
  drawParticles(t);
  const st = STYLES[opts.style];
  drawIntro(st, opts.title, opts.sub, t, introDur);
  drawText(st, opts.end, '', t - outroStart, 1e9);
  drawLyrics(songTime(t)); // lyrics follow the song, which loops when the video is longer
}
const themeColors = () => STYLES[opts.style].colors || POP;

// ---------- Particles ----------
const rnd = Math.random, pick = a => a[rnd() * a.length | 0];
// rate = spawns per second at density 1, max = live cap at density 1.
const KINDS = {
  confetti: { rate: 26, max: 90, make: () => ({ x: rnd() * W, y: -20, vx: (rnd() - .5) * 80, vy: 140 + rnd() * 140, s: 11 + rnd() * 11, vr: (rnd() - .5) * 10, c: pick(themeColors()), life: 14 }) },
  petals: { rate: 6, max: 30, make: () => ({ x: rnd() * W * 1.1 - W * .1, y: -30, vx: 15 + rnd() * 30, vy: 45 + rnd() * 55, s: 12 + rnd() * 16, vr: (rnd() - .5) * 2.4, c: pick(PETAL), life: 40, sway: 25 }) },
  hearts: { rate: 1.4, max: 10, make: () => ({ x: rnd() * W, y: H + 40, vx: 0, vy: -(50 + rnd() * 60), s: 16 + rnd() * 22, c: pick(['#ff6b8b', '#ff8fab', '#ffc2d1', '#ff4d6d']), life: 16, sway: 30, fade: true }) },
  // balloons rise slowly and live long, so a low rate and cap keep the photos visible
  balloons: { rate: .35, max: 5, make: () => ({ x: rnd() * W, y: H + 120, vx: 0, vy: -(80 + rnd() * 50), s: 28 + rnd() * 18, c: pick(themeColors().filter(c => c !== '#ffffff')), life: 30, sway: 18 }) },
  sparkles: { rate: 5, max: 16, make: () => ({ x: rnd() * W, y: rnd() * H, vx: 0, vy: -8, s: 8 + rnd() * 16, c: pick(['#fff7d6', '#ffe08a', '#ffffff']), life: .9 + rnd() * .9 }) },
  bokeh: { rate: 1.6, max: 14, make: () => ({ x: rnd() * W, y: rnd() * H, vx: (rnd() - .5) * 12, vy: -6 - rnd() * 14, s: 40 + rnd() * 90, a: .05 + rnd() * .09, life: 6 + rnd() * 5, fade: true }) },
  dust: { rate: 16, max: 80, make: () => ({ x: rnd() * W, y: rnd() * H, vx: (rnd() - .5) * 14, vy: (rnd() - .5) * 10, s: .8 + rnd() * 2.2, a: .15 + rnd() * .45, life: 2 + rnd() * 3, fade: true }) },
};
let parts = [], emitAcc = 0, lastBurst = null, scratches = false;
function resetParticles() { parts = []; emitAcc = 0; lastBurst = null; }
const spawn = kind => ({ kind, ph: rnd() * 6.283, rot: rnd() * 6.283, vr: 0, g: 0, sway: 0, age: 0, ...KINDS[kind].make() });

// The chosen kinds take turns every two slides so one effect never runs start to finish; none chosen = off.
function currentKind(i) {
  const list = opts.particles;
  return list.length ? list[Math.floor(i / 2) % list.length] : null;
}
function burst(kind) {
  const d = opts.density;
  if (kind === 'confetti') { // two cannons from the bottom corners
    for (let k = 0; k < 44 * d; k++) {
      const left = k % 2 === 0;
      parts.push({ ...spawn('confetti'), x: left ? -10 : W + 10, y: H * .92, vx: (left ? 1 : -1) * (250 + rnd() * 650),
        vy: -(700 + rnd() * 700) * H / 1080, g: 1100, cannon: true });
    }
  } else { // a small top-up that never pushes the kind past its live cap
    const room = KINDS[kind].max * d - parts.reduce((c, p) => c + (p.kind === kind), 0);
    for (let k = 0; k < Math.min(room, Math.ceil(KINDS[kind].max * d * .6)); k++) parts.push(spawn(kind));
  }
}
function stepParticles(t, dt, tm, i, introDur, outroStart) {
  if (!dt) return;
  const kind = currentKind(i), n = tm.starts.length;
  scratches = kind === 'dust';
  if (kind) {
    // accent mode only emits around the intro, the ending and each transition
    const nextT = i < n - 1 ? tm.starts[i + 1] - tm.T : Infinity;
    const accent = opts.particleMode === 'accent';
    const on = !accent || t < introDur || t > outroStart || t > nextT - .2 || (i > 0 && t - tm.starts[i] < 1.4);
    if (on) {
      emitAcc += KINDS[kind].rate * opts.density * (accent ? .5 : 1) * dt;
      let live = parts.reduce((c, p) => c + (p.kind === kind), 0);
      for (; emitAcc >= 1; emitAcc--) if (live < KINDS[kind].max * opts.density) { parts.push(spawn(kind)); live++; }
    }
    const key = t < .2 ? -1 : t >= nextT && t < nextT + .15 ? i : null;
    if (accent && key !== null && key !== lastBurst) { burst(kind); lastBurst = key; }
  }
  for (const p of parts) {
    p.age += dt; p.vy += p.g * dt;
    if (p.cannon) { p.vx *= 1 - 1.2 * dt; if (p.vy > 220) p.vy = 220; } // paper flutters down after the shot
    p.x += (p.vx + Math.sin(t * 1.2 + p.ph) * p.sway) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
  parts = parts.filter(p => p.age < p.life && p.y < H + 160 && p.y > -220 && p.x > -220 && p.x < W + 220);
}
function star4(x, y, r, c, a) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = r * 1.5;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, rr = k % 2 ? r * .22 : r; ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawParticles(t) {
  for (const p of parts) {
    const life = p.fade ? Math.max(0, Math.min(1, p.age / .5, (p.life - p.age) / .8)) : 1;
    if (p.kind === 'bokeh') {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
      g.addColorStop(0, `rgba(255,236,210,${p.a * life})`); g.addColorStop(1, 'rgba(255,236,210,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
    } else if (p.kind === 'dust') {
      ctx.fillStyle = `rgba(255,245,225,${p.a * life * (.5 + .5 * Math.sin(t * 5 + p.ph))})`;
      ctx.fillRect(p.x, p.y, p.s, p.s);
    } else if (p.kind === 'sparkles') {
      const k = Math.sin(Math.PI * clamp(p.age / p.life));
      star4(p.x, p.y, p.s * k, p.c, k);
    } else {
      ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = p.c;
      if (p.kind === 'hearts') {
        const s = p.s; ctx.rotate(Math.sin(t * 1.5 + p.ph) * .3); ctx.globalAlpha = .85 * life;
        ctx.beginPath(); ctx.moveTo(0, s * .55);
        ctx.bezierCurveTo(-s * 1.1, -s * .15, -s * .5, -s * .95, 0, -s * .25);
        ctx.bezierCurveTo(s * .5, -s * .95, s * 1.1, -s * .15, 0, s * .55); ctx.fill();
      } else if (p.kind === 'balloons') {
        const s = p.s; ctx.rotate(Math.sin(t * 1.1 + p.ph) * .08);
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, s + 4); ctx.quadraticCurveTo(s * .3 * Math.sin(t + p.ph), s * 1.8, 0, s * 2.6); ctx.stroke();
        const g = ctx.createRadialGradient(-s * .3, -s * .4, 0, 0, 0, s * 1.2);
        g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(.28, p.c); g.addColorStop(1, p.c);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s * .8, s, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.moveTo(-5, s + 6); ctx.lineTo(5, s + 6); ctx.lineTo(0, s - 2); ctx.fill();
      } else if (p.kind === 'petals') {
        ctx.rotate(p.rot); ctx.scale(1, .3 + .7 * Math.abs(Math.cos(t * 1.7 + p.ph))); ctx.globalAlpha = .9;
        ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * .55, 0, 0, 6.283); ctx.fill();
      } else { // confetti
        ctx.rotate(p.rot); ctx.scale(1, Math.cos(t * 4 + p.ph)); ctx.fillRect(-p.s / 2, -p.s * .3, p.s, p.s * .6);
      }
      ctx.restore();
    }
  }
  if (scratches && Math.random() < .3) { // film scratch
    ctx.fillStyle = 'rgba(255,250,235,.12)'; ctx.fillRect(Math.random() * W, 0, 1 + Math.random(), H);
  }
}

// ---------- Opening and closing titles ----------
function fitSize(fontFn, size, text, maxW) {
  ctx.font = fontFn(size);
  const w = ctx.measureText(text).width;
  return w > maxW ? Math.floor(size * maxW / w) : size;
}
let TX = 0, TY = 0, TW = 0, PR = null; // opening-title anchor and the cover photo's rectangle
const wc = document.createElement('canvas'), wx = wc.getContext('2d');
const mask = document.createElement('canvas'), mx = mask.getContext('2d');
let wKey = '';
const resetTitleCache = () => { wKey = ''; };
function drawWrite(st, text, size, y, prog) { // soft left-to-right reveal, like handwriting
  const key = text + st.title.font(size);
  if (key !== wKey) {
    wKey = key; wx.font = st.title.font(size);
    wc.width = mask.width = Math.ceil(wx.measureText(text).width) + 120;
    wc.height = mask.height = Math.ceil(size * 1.8);
    Object.assign(wx, { font: st.title.font(size), textAlign: 'center', textBaseline: 'middle', fillStyle: st.title.color,
      shadowColor: 'rgba(0,0,0,.5)', shadowBlur: 24, shadowOffsetY: 4 });
    wx.fillText(text, wc.width / 2, wc.height / 2);
  }
  if (prog <= 0) return;
  const w = wc.width, f = 180, x = (w + f) * easeOut(prog);
  mx.globalCompositeOperation = 'copy'; mx.drawImage(wc, 0, 0);
  mx.globalCompositeOperation = 'destination-in';
  const g = mx.createLinearGradient(x - f, 0, x, 0);
  g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  mx.fillStyle = g; mx.fillRect(0, 0, w, mask.height);
  mx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.shadowColor = 'transparent';
  ctx.drawImage(mask, (TX || W / 2) - w / 2, y - mask.height / 2);
  ctx.restore();
}
function drawPop(st, text, size, y, lt, bob = 0) { // letters bounce in one by one; bob > 0 keeps them dancing afterwards
  ctx.font = st.title.font(size);
  const chars = [...text], ws = chars.map(c => ctx.measureText(c).width);
  let x = (TX || W / 2) - ws.reduce((a, b) => a + b, 0) / 2;
  ctx.lineJoin = 'round'; ctx.lineWidth = size * .08; ctx.strokeStyle = '#fff';
  chars.forEach((c, k) => {
    const p = clamp((lt - k * .06) / .55);
    if (p > 0 && c.trim()) {
      const dy = bob && p >= 1 ? Math.sin(lt * 3.2 + k * .55) * size * .035 * bob : 0;
      ctx.save(); ctx.translate(x + ws[k] / 2, y + dy); ctx.rotate((1 - p) * -.5 + (dy ? Math.sin(lt * 2.1 + k) * .03 : 0));
      const s = easeOutBack(p); ctx.scale(s, s); ctx.globalAlpha *= Math.min(1, p * 2);
      const pal = themeColors().filter(x => x !== '#ffffff');
      ctx.strokeText(c, 0, 0); ctx.fillStyle = pal[k % pal.length]; ctx.fillText(c, 0, 0);
      ctx.restore();
    }
    x += ws[k];
  });
}
function drawFade(st, text, size, y, lt) { // slow focus-pull with tightening letter spacing
  const p = clamp(lt / 1.8), e = easeOut(p);
  ctx.save();
  ctx.font = st.title.font(size); ctx.letterSpacing = (1 - e) * 24 + 'px';
  ctx.globalAlpha *= p; ctx.filter = `blur(${(1 - e) * 10}px)`; ctx.fillStyle = st.title.color;
  ctx.fillText(text, TX || W / 2, y + (1 - e) * 10);
  ctx.restore();
}
function drawText(st, title, sub, lt, dur) {
  if (lt < 0 || lt > dur || !(title || sub)) return;
  const out = clamp((dur - lt) / .8), a = clamp(lt / .8) * out;
  const g = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, Math.max(W, H) * .6);
  g.addColorStop(0, `rgba(0,0,0,${.45 * a})`); g.addColorStop(1, `rgba(0,0,0,${.15 * a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = out; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 4;
  const ty = sub ? H * .45 : H * .5, ts = fitSize(st.title.font, st.title.size, title, W * .84);
  if (title) {
    if (st.anim === 'write') drawWrite(st, title, ts, ty, clamp((lt - .2) / 1.8));
    else if (st.anim === 'pop') drawPop(st, title, ts, ty, lt - .2);
    else drawFade(st, title, ts, ty, lt);
  }
  if (sub) {
    const sp = clamp((lt - 1.1) / 1), e = easeOut(sp), ss = fitSize(st.sub.font, st.sub.size, sub, W * .8);
    const sy = title ? ty + ts * .62 + 20 * (1 - e) : ty;
    ctx.font = st.sub.font(ss); ctx.letterSpacing = st.sub.spacing + (1 - e) * 14 + 'px';
    ctx.globalAlpha = out * sp; ctx.fillStyle = st.sub.color;
    ctx.fillText(sub, W / 2, sy);
    if (st.anim === 'write') {
      const hw = ctx.measureText(sub).width / 2 + 30, len = Math.min(120, (W - hw * 2) / 2 - 20) * e;
      if (len > 0) { ctx.fillRect(W / 2 - hw - len, sy - 1, len, 2); ctx.fillRect(W / 2 + hw, sy - 1, len, 2); }
    }
  }
  ctx.restore();
}

// ---------- Opening scenes: one signature title card per theme (st.intro), laid out next to the cover photo ----------
// Every scene: in over ~1 s, holds while the cover plays, then fades out ahead of the transition.
function drawIntro(st, title, sub, t, dur) {
  if (!(title || sub) || t > dur) return;
  const scene = { cinema: introCinema, party: introParty, celebrate: introCelebrate, vintage: introVintage }[st.intro];
  const cb = plan[0]?.cover ? coverBox : null;
  [TX, TY, TW] = cb ? [cb.tx, cb.ty, cb.tw] : [W / 2, H * .47, W * .84];
  PR = cb ? { cx: cb.cx, cy: cb.cy, w: cb.pw, h: cb.ph, rot: (st.cover?.tilt || 0) * easeOut(clamp(t / 1.6)) } : null;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (scene) scene(st, title, sub, t, clamp((dur - t) / 1.1)); else drawText(st, title, sub, t - .4, dur - .4);
  ctx.restore(); TX = 0;
}
const u0 = () => Math.min(W, H);
function withoutPhoto(fn) { // paint everywhere except over the cover photo, so it stays crisp
  ctx.save();
  if (PR) {
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    ctx.save(); ctx.translate(PR.cx, PR.cy); ctx.rotate(PR.rot); ctx.rect(-PR.w / 2 - 8, -PR.h / 2 - 8, PR.w + 16, PR.h + 16); ctx.restore();
    ctx.clip('evenodd');
  }
  fn(); ctx.restore();
}
function shade(a, inner = .5, outer = .2) { // darken around the text so light photos never swallow the type
  withoutPhoto(() => {
    const g = ctx.createRadialGradient(TX, TY, u0() * .05, TX, TY, Math.max(W, H) * .7);
    g.addColorStop(0, `rgba(0,0,0,${inner * a})`); g.addColorStop(1, `rgba(0,0,0,${outer * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });
}
function spacedSub(st, sub, y, p, color, size) {
  const e = easeOut(p), ss = fitSize(st.sub.font, size || st.sub.size, sub, TW * .96);
  ctx.font = st.sub.font(ss); ctx.letterSpacing = st.sub.spacing + (1 - e) * 18 + 'px';
  ctx.fillStyle = color || st.sub.color; ctx.globalAlpha *= p;
  ctx.fillText(sub, TX, y + (1 - e) * 16);
  ctx.letterSpacing = '0px';
  return { w: ctx.measureText(sub).width, ss };
}
const pick2 = (a, k) => a[k % a.length];

// Wedding — a cinematic invitation: letterbox bars, a gold frame traced around the page, names written by hand.
function introCinema(st, title, sub, t, out) {
  const gold = '#e7cf9b', bar = H * .085 * easeOut(clamp(t / 1.4));
  ctx.globalAlpha = out; shade(clamp(t / 1), .5, .22);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
  const m = u0() * .045, x0 = m, y0 = bar + m * .5, fw = W - m * 2, fh = H - (bar + m * .5) * 2, per = 2 * (fw + fh);
  const fp = easeInOut(clamp((t - .5) / 2.4));
  ctx.strokeStyle = gold; ctx.lineWidth = Math.max(1.5, u0() * .0022); ctx.globalAlpha = out * .9;
  ctx.setLineDash([per * fp, per]); ctx.strokeRect(x0, y0, fw, fh);
  ctx.globalAlpha = out * .45; ctx.strokeRect(x0 + 10, y0 + 10, fw - 20, fh - 20); ctx.setLineDash([]);
  const cd = clamp((t - 2.7) / .6);
  if (cd > 0) for (const [cx, cy] of [[x0, y0], [x0 + fw, y0], [x0, y0 + fh], [x0 + fw, y0 + fh]]) {
    ctx.save(); ctx.globalAlpha = out * cd; ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillStyle = gold;
    const s = u0() * .009 * easeOutBack(cd); ctx.fillRect(-s, -s, s * 2, s * 2); ctx.restore();
  }
  ctx.globalAlpha = out;
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 4;
  const ts = fitSize(st.title.font, st.title.size * 1.18, title, TW * .96), ty = sub ? TY - ts * .32 : TY;
  if (title) drawWrite(st, title, ts, ty, clamp((t - .9) / 2.6));
  if (title && t > 3.2) {
    const gp = clamp((t - 3.2) / 1.3), gx = TX - TW * .38 + TW * .76 * gp;
    star4(gx, ty - ts * .3, u0() * .02 * Math.sin(Math.PI * gp), '#fff6dc', out * Math.sin(Math.PI * gp));
  }
  const rp = clamp((t - 2.6) / 1.2), ry = ty + ts * .6;
  if (rp > 0) {
    const half = Math.min(TW * .4, u0() * .34) * easeOut(rp);
    ctx.shadowColor = 'transparent'; ctx.fillStyle = gold; ctx.globalAlpha = out * .9;
    ctx.fillRect(TX - half, ry, half - 12, 1.5); ctx.fillRect(TX + 12, ry, half - 12, 1.5);
    ctx.save(); ctx.translate(TX, ry + 1); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  }
  if (sub) { ctx.globalAlpha = out; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 16; spacedSub(st, sub, ry + u0() * .065, clamp((t - 3.1) / 1.4), gold); }
}

// Birthday — a party: a sunburst turning behind the photo, letters that bounce in and keep dancing, a ribbon banner, stars.
function introParty(st, title, sub, t, out) {
  const pal = themeColors().filter(c => c !== '#ffffff'), u = u0();
  ctx.globalAlpha = out; shade(clamp(t / .8), .45, .3);
  const cx = PR ? PR.cx : W / 2, cy = PR ? PR.cy : H * .46;
  const sp = easeOutBack(clamp(t / 1.2)), R = Math.hypot(W, H) * .9 * sp, n = 20;
  withoutPhoto(() => {
    ctx.translate(cx, cy); ctx.rotate(t * .16);
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = pal[k % pal.length]; ctx.globalAlpha = out * .16;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, k * 2 * Math.PI / n, (k + .5) * 2 * Math.PI / n); ctx.closePath(); ctx.fill();
    }
  });
  const halo = ctx.createRadialGradient(TX, TY, 0, TX, TY, TW * .7);
  halo.addColorStop(0, `rgba(255,255,255,${.14 * out})`); halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 1; withoutPhoto(() => { ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H); });
  for (let k = 0; k < 9; k++) { // stars scattered around the text block
    const ang = k * 2.39996 + 1, rx = TW * (.45 + .07 * (k % 3)), ry = u * (.2 + .05 * (k % 2));
    const tw = Math.max(0, Math.sin(t * 2.6 + k * 1.7)), on = clamp((t - .8 - k * .08) / .4);
    star4(TX + Math.cos(ang) * rx, TY + Math.sin(ang) * ry, u * (.012 + .008 * (k % 3)) * tw * on, pick2(pal, k), out * on * (.5 + .5 * tw));
  }
  ctx.globalAlpha = out;
  const ts = fitSize(st.title.font, st.title.size * 1.2, title, TW * .96), ty = sub ? TY - ts * .38 : TY;
  if (title) drawPop(st, title, ts, ty, t - .5, 1);
  if (sub) { // ribbon banner pops in under the title
    const bp = clamp((t - 1.6) / .7), s = easeOutBack(bp);
    if (bp > 0) {
      const ss = fitSize(st.sub.font, st.sub.size * 1.05, sub, TW * .74); ctx.font = st.sub.font(ss);
      const tw = ctx.measureText(sub).width, bw = tw + ss * 1.6, bh = ss * 1.65, by = ty + ts * .66 + bh * .3;
      ctx.save(); ctx.translate(TX, by); ctx.scale(s, s); ctx.rotate(-.025 + Math.sin(t * 1.4) * .012); ctx.globalAlpha = out * Math.min(1, bp * 2);
      for (const sgn of [-1, 1]) { // ribbon tails
        ctx.fillStyle = pal[1 % pal.length]; ctx.beginPath();
        ctx.moveTo(sgn * (bw / 2 - bh * .2), -bh * .3); ctx.lineTo(sgn * (bw / 2 + bh * .6), -bh * .45); ctx.lineTo(sgn * (bw / 2 + bh * .35), 0);
        ctx.lineTo(sgn * (bw / 2 + bh * .6), bh * .45); ctx.lineTo(sgn * (bw / 2 - bh * .2), bh * .3); ctx.fill();
      }
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      ctx.fillStyle = pal[0]; ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sub, 0, ss * .04);
      ctx.restore();
    }
  }
}

// Birthday — a celebration that suits any age (a first birthday or a 70th): champagne-gold script "Happy" over a spaced
// serif "BIRTHDAY", a light sweep across the gold, the name line between fine rules, slow gold rays and sparkles.
const GOLD = ['#fff4d0', '#f1d38a', '#c9963f', '#f7e2a8', '#b98232'];
const rc = document.createElement('canvas'), rx = rc.getContext('2d');
function goldText(text, font, size, x, y, reveal, shine, spacing = 0) { // gold gradient fill, soft left-to-right reveal, moving highlight
  rx.font = font(size); rx.letterSpacing = spacing + 'px';
  const tw = Math.ceil(rx.measureText(text).width) + 80, th = Math.ceil(size * 1.7);
  if (rc.width < tw || rc.height < th) { rc.width = Math.max(rc.width, tw); rc.height = Math.max(rc.height, th); }
  rx.clearRect(0, 0, rc.width, rc.height);
  Object.assign(rx, { font: font(size), textAlign: 'center', textBaseline: 'middle', letterSpacing: spacing + 'px' });
  const g = rx.createLinearGradient(0, th * .2, 0, th * .8);
  g.addColorStop(0, GOLD[0]); g.addColorStop(.45, GOLD[1]); g.addColorStop(.55, GOLD[2]); g.addColorStop(1, GOLD[3]);
  rx.fillStyle = g; rx.fillText(text, tw / 2, th / 2);
  if (shine > 0 && shine < 1) { // a diagonal band of light crossing the letters once
    rx.globalCompositeOperation = 'source-atop';
    const sx = -tw * .3 + tw * 1.6 * shine, sg = rx.createLinearGradient(sx - th, 0, sx + th * .3, th);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,255,255,.85)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    rx.fillStyle = sg; rx.fillRect(0, 0, tw, th); rx.globalCompositeOperation = 'source-over';
  }
  if (reveal < 1) { // soft-edged wipe
    rx.globalCompositeOperation = 'destination-in';
    const f = 160, xr = (tw + f) * easeOut(reveal), mg = rx.createLinearGradient(xr - f, 0, xr, 0);
    mg.addColorStop(0, '#000'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    rx.fillStyle = mg; rx.fillRect(0, 0, tw, th); rx.globalCompositeOperation = 'source-over';
  }
  rx.letterSpacing = '0px';
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * .18; ctx.shadowOffsetY = size * .03;
  ctx.drawImage(rc, 0, 0, tw, th, x - tw / 2, y - th / 2, tw, th); ctx.restore();
}
function introCelebrate(st, title, sub, t, out) {
  const u = u0(), script = s => `700 ${s}px "Dancing Script"`, serif = s => `500 ${s}px "Playfair Display"`, sans = s => `500 ${s}px "Be Vietnam Pro"`;
  ctx.globalAlpha = out; shade(clamp(t / .9), .55, .35);
  // slow, fine champagne rays and a warm glow behind the photo
  const cx = PR ? PR.cx : TX, cy = PR ? PR.cy : TY, R = Math.hypot(W, H) * easeOut(clamp(t / 1.6)), n = 36;
  withoutPhoto(() => {
    ctx.translate(cx, cy); ctx.rotate(t * .05);
    ctx.fillStyle = '#f1d38a';
    for (let k = 0; k < n; k++) { ctx.globalAlpha = out * (k % 2 ? .035 : .07); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, k * 2 * Math.PI / n, (k + .35) * 2 * Math.PI / n); ctx.closePath(); ctx.fill(); }
    ctx.rotate(-t * .05); ctx.globalAlpha = out;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, u * .75);
    glow.addColorStop(0, 'rgba(255,214,140,.22)'); glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow; ctx.fillRect(-u, -u, u * 2, u * 2);
  });
  // the lockup: a familiar "Happy Birthday" becomes script + spaced serif; any other title is set in gold script
  const m = /^\s*happy\s+birthday\s*!?\s*$/i.exec(title || '');
  const big = m ? 'Happy' : title, small = m ? 'BIRTHDAY' : '';
  const hs = fitSize(script, st.title.size * (m ? 1.45 : 1.2), big || ' ', TW * .9), bs = small ? fitSize(serif, hs * .34, small, TW * .9) : 0;
  const block = hs * .9 + (small ? bs * 1.5 : 0) + (sub ? u * .1 : 0), top = TY - block / 2;
  const hy = top + hs * .45, by = hy + hs * .55 + bs * .5, sy = (small ? by + bs * .95 : hy + hs * .6) + u * .05;
  ctx.globalAlpha = out;
  if (big) goldText(big, script, hs, TX, hy, clamp((t - .6) / 2.2), clamp((t - 3.2) / 1.6));
  if (small) { // tracking tightens as it fades in
    const p = clamp((t - 1.8) / 1.4), e = easeOut(p);
    ctx.globalAlpha = out * p; goldText(small, serif, bs, TX, by + (1 - e) * 10, 1, clamp((t - 3.6) / 1.6), bs * (.6 + (1 - e) * .5));
  }
  if (sub) { // the name line, white, between two fine gold rules with diamonds
    const p = clamp((t - 2.8) / 1.3), e = easeOut(p), ss = fitSize(sans, st.sub.size * .92, sub, TW * .72);
    ctx.globalAlpha = out * p; ctx.font = sans(ss); ctx.letterSpacing = ss * .08 + 'px'; ctx.fillStyle = '#fffaf0';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 14; ctx.fillText(sub, TX, sy + (1 - e) * 12);
    const half = ctx.measureText(sub).width / 2 + ss * .9; ctx.letterSpacing = '0px';
    const len = Math.min(TW * .5 - half, ss * 3.2) * e;
    ctx.shadowColor = 'transparent'; ctx.fillStyle = GOLD[1];
    if (len > 4) for (const sgn of [-1, 1]) {
      ctx.fillRect(sgn < 0 ? TX - half - len : TX + half, sy - .75, len, 1.5);
      ctx.save(); ctx.translate(TX + sgn * (half + len + 6), sy); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
  }
  for (let k = 0; k < 8; k++) { // champagne sparkles around the lockup
    const ang = k * 2.39996 + .6, rx0 = TW * (.48 + .06 * (k % 3)), ry0 = block * (.62 + .1 * (k % 2));
    const tw = Math.max(0, Math.sin(t * 2.2 + k * 1.9)), on = clamp((t - 1.2 - k * .1) / .5);
    star4(TX + Math.cos(ang) * rx0, TY + Math.sin(ang) * ry0, u * (.01 + .007 * (k % 3)) * tw * on, k % 2 ? '#fff4d0' : '#f1d38a', out * on * (.4 + .6 * tw));
  }
}

// Memory — an old film reel: the scene opens through an iris on the photo, warm tone and flicker, a focus-pull title.
function introVintage(st, title, sub, t, out) {
  const ip = easeInOut(clamp(t / 2.6)), cx = PR ? PR.cx : W / 2, cy = PR ? PR.cy : H / 2, r = Math.hypot(W, H) * 1.05 * ip, cream = st.title.color;
  ctx.globalAlpha = out;
  ctx.fillStyle = 'rgba(70,45,20,.16)'; ctx.fillRect(0, 0, W, H);
  shade(1, .4, .5);
  if (ip < 1) {
    ctx.save(); ctx.fillStyle = '#0d0a07'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, Math.max(1, r), 0, 6.283, true); ctx.fill('evenodd');
    const edge = ctx.createRadialGradient(cx, cy, r * .82, cx, cy, r);
    edge.addColorStop(0, 'rgba(13,10,7,0)'); edge.addColorStop(1, 'rgba(13,10,7,.9)');
    ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, 6.283); ctx.fill(); ctx.restore();
  }
  const fl = .04 * Math.sin(t * 37) * Math.sin(t * 13);
  ctx.fillStyle = `rgba(255,240,215,${Math.max(0, fl) * out})`; ctx.fillRect(0, 0, W, H);
  const ts = fitSize(st.title.font, st.title.size * 1.15, title, TW * .92), ty = sub ? TY - ts * .3 : TY;
  const tp = clamp((t - 1.4) / 2.4), e = easeOut(tp), lp = easeOut(clamp((t - 2.2) / 1.4)), half = Math.min(TW * .46, u0() * .4) * lp;
  if (lp > 0) { ctx.fillStyle = cream; ctx.globalAlpha = out * .7; for (const y of [ty - ts * .78, ty - ts * .78 + 6]) ctx.fillRect(TX - half, y, half * 2, 1.2); }
  if (title && tp > 0) {
    ctx.save(); ctx.font = st.title.font(ts); ctx.letterSpacing = (1 - e) * 30 + 'px';
    ctx.globalAlpha = out * tp; ctx.filter = `blur(${(1 - e) * 12}px)`; ctx.fillStyle = cream;
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 22; ctx.fillText(title, TX, ty + (1 - e) * 12); ctx.restore();
  }
  if (sub) {
    ctx.globalAlpha = out; const { ss } = spacedSub(st, sub, ty + ts * .7, clamp((t - 3.2) / 1.6), st.sub.color);
    if (lp > 0) { ctx.globalAlpha = out * .7 * clamp((t - 3.4) / 1); ctx.fillStyle = cream;
      for (const y of [ty + ts * .7 + ss * 1.1, ty + ts * .7 + ss * 1.1 + 6]) ctx.fillRect(TX - half, y, half * 2, 1.2); }
  }
}

// ---------- Lyrics ----------
// "bottom" keeps every lyric style in one line on a band along the bottom edge, so it never covers the photos' middle.
const lyricsAtBottom = () => opts.lyricPos === 'bottom' && opts.lyricMode !== 'off' && phrases.length > 0;
const lyricBand = () => lyricsAtBottom() ? Math.min(W, H) * .11 : 0;
function bottomScrim(a) {
  const b = lyricBand(), g = ctx.createLinearGradient(0, H - b * 1.7, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${.5 * a})`);
  ctx.fillStyle = g; ctx.fillRect(0, H - b * 1.7, W, b * 1.7);
}
function drawSticker(ph, t, k) { // chunky slanted words that pop in as they are sung, last word(s) blown up
  const u = Math.min(W, H), portrait = H > W, bottom = lyricsAtBottom(), font = s => `800 ${s}px "Baloo 2"`;
  const base = u * (bottom ? .058 : portrait ? .1 : .105);
  const ws = ph.words.map(w => ({ ...w, w: w.w.toLocaleUpperCase('vi') }));
  const ne = bottom ? 0 : ws.length >= 3 && ws.at(-1).w.length + ws.at(-2).w.length <= 9 ? 2 : 1, lines = [];
  if (bottom) bottomScrim(clamp((ph.end - t) / .3) * clamp((t - ph.start) / .25));
  for (const w of ws.slice(0, ws.length - ne)) {
    const l = lines.at(-1);
    if (l && (bottom || l.ws.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length <= 13)) l.ws.push(w); else lines.push({ ws: [w], size: base });
  }
  for (const w of ws.slice(ws.length - ne)) lines.push({ ws: [w], size: base * 1.6, big: true });
  if (bottom) lines[0].ws.at(-1).last = true; // one line: only the last word takes the accent colour
  const pals = STYLES[opts.style].lyric.palettes || LYRIC_PALETTES, v = k % 4, [c1, c2] = pals[k % pals.length];
  const align = portrait || bottom ? 'center' : ['left', 'right', 'center', 'center'][v];
  const maxW = portrait || bottom ? W * .9 : align === 'center' ? W * .8 : W * .5;
  for (const l of lines) {
    ctx.font = font(l.size); l.w = ctx.measureText(l.ws.map(x => x.w).join(' ')).width;
    if (l.w > maxW) { l.size *= maxW / l.w; l.w = maxW; }
  }
  const lh = l => l.size * 1.12, out = clamp((ph.end - t) / .3);
  const cy = bottom ? H - lyricBand() / 2 : H * (portrait ? [.3, .62, .45, .5][v] : .5);
  let y = cy - lines.reduce((n, l) => n + lh(l), 0) / 2;
  ctx.save();
  ctx.translate(W / 2, cy); ctx.rotate(v === 2 && !bottom ? -.06 : 0); ctx.scale(.9 + .1 * out, .9 + .1 * out); ctx.translate(-W / 2, -cy);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  lines.forEach((l, li) => {
    y += lh(l) / 2;
    const indent = align === 'center' ? 0 : li * l.size * (l.big ? .25 : .12);
    let x = align === 'left' ? W * .06 + indent : align === 'right' ? W * .94 - l.w - indent : W / 2 - l.w / 2;
    ctx.font = font(l.size);
    const sp = ctx.measureText(' ').width;
    for (const w of l.ws) {
      const ww = ctx.measureText(w.w).width, p = clamp((t - w.t + .06) / .35);
      if (p > 0) {
        ctx.save();
        ctx.translate(x + ww / 2, y); ctx.rotate((1 - p) * -.3);
        const s = easeOutBack(p); ctx.scale(s, s); ctx.transform(1, 0, -.16, 1, 0, 0);
        ctx.globalAlpha = out * Math.min(1, p * 2);
        ctx.lineWidth = l.size * .16; ctx.strokeStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = l.size * .15; ctx.shadowOffsetY = l.size * .05;
        ctx.strokeText(w.w, 0, 0);
        ctx.shadowColor = 'transparent'; ctx.fillStyle = l.big || w.last ? c2 : c1; ctx.fillText(w.w, 0, 0);
        ctx.restore();
      }
      x += ww + sp;
    }
    y += lh(l) / 2;
  });
  ctx.restore();
}
function drawKaraoke(ph, t) { // whole line on a pill, sung part fills with colour word by word
  const u = Math.min(W, H), ws = ph.words, font = s => `800 ${s}px "Baloo 2"`, bottom = lyricsAtBottom();
  let size = u * (bottom ? .05 : .06);
  ctx.font = font(size);
  let tw = ctx.measureText(ws.map(w => w.w).join(' ')).width;
  if (tw > W * .9) { size *= W * .9 / tw; ctx.font = font(size); tw = W * .9; }
  const a = clamp((t - ph.start) / .25) * clamp((ph.end - t) / .25), y = bottom ? H - lyricBand() / 2 : H * .72, sp = ctx.measureText(' ').width;
  ctx.save();
  ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2 - size * .6, y - size * .8, tw + size * 1.2, size * 1.6, size * .8); ctx.fill();
  let x = W / 2 - tw / 2;
  ws.forEach((w, j) => {
    const ww = ctx.measureText(w.w).width, next = ws[j + 1]?.t ?? w.t + .6, f = clamp((t - w.t) / clamp(next - w.t, .15, 1.2));
    ctx.lineWidth = size * .14; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(w.w, x, y);
    ctx.fillStyle = '#fff'; ctx.fillText(w.w, x, y);
    if (f > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - size, ww * f + 2, size * 2); ctx.clip();
      ctx.fillStyle = '#ffd84d'; ctx.fillText(w.w, x, y); ctx.restore();
    }
    x += ww + sp;
  });
  ctx.restore();
}
function drawElegant(ph, t, st) { // words drift up out of a soft blur, in the theme's script font
  const u = Math.min(W, H), ws = ph.words, font = st.lyric.font, width = l => ctx.measureText(l.map(w => w.w).join(' ')).width;
  const bottom = lyricsAtBottom();
  let size = u * (bottom ? .06 : .09);
  ctx.font = font(size);
  const mid = Math.ceil(ws.length / 2), lines = !bottom && width(ws) > W * .86 ? [ws.slice(0, mid), ws.slice(mid)] : [ws];
  const widest = Math.max(...lines.map(width));
  if (widest > W * .86) { size *= W * .86 / widest; ctx.font = font(size); }
  const out = clamp((ph.end - t) / .5), sp = ctx.measureText(' ').width;
  const y0 = bottom ? H - lyricBand() / 2 : H * .74 - (lines.length - 1) * size * .6;
  if (bottom) bottomScrim(out * clamp((t - ph.start) / .3));
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = st.lyric.color;
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = size * .3;
  lines.forEach((l, li) => {
    let x = W / 2 - width(l) / 2;
    for (const w of l) {
      const ww = ctx.measureText(w.w).width, p = clamp((t - w.t + .1) / .6), e = easeOut(p);
      if (p > 0) {
        ctx.globalAlpha = out * p; ctx.filter = `blur(${(1 - e) * 6}px)`;
        ctx.fillText(w.w, x, y0 + li * size * 1.2 + (1 - e) * size * .25);
      }
      x += ww + sp;
    }
  });
  ctx.restore();
}
function drawLyrics(t) {
  if (!phrases.length || opts.lyricMode === 'off') return;
  let k = -1;
  for (let j = 0; j < phrases.length && phrases[j].start <= t; j++) k = j;
  if (k < 0 || t >= phrases[k].end) return;
  if (opts.lyricMode === 'sticker') drawSticker(phrases[k], t, k);
  else if (opts.lyricMode === 'karaoke') drawKaraoke(phrases[k], t);
  else drawElegant(phrases[k], t, STYLES[opts.style]);
}
