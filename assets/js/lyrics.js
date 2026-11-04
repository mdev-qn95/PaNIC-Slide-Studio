// Subtitle parsing, phrase grouping, re-timing corrected lyrics, and VTT export.

const TIME_TAG = /<(\d{1,2}:\d{2}(?::\d{2})?[.,]\d+)>/;
function parseTime(s) {
  const m = s.match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  return m ? (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000 : NaN;
}
const cleanText = s => s.replace(/<[^>]+>/g, '').replace(/\[[^\]]*\]/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

// Returns every sung word with its start time and line id: [{ t, w, ln }].
// words.byLine is true when the file's own lines are real sung lines (hand-made or exported here),
// false for YouTube auto-captions, whose lines break mid-phrase.
function parseSubs(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) { // not \n\s*\n: YouTube cues contain a lone " " line
    const lines = block.split('\n'), ti = lines.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->');
    cues.push({ start: parseTime(a), end: parseTime(b), lines: lines.slice(ti + 1).filter(l => l.trim()) });
  }
  const timed = cues.some(c => c.lines.some(l => TIME_TAG.test(l)));
  // YouTube repeats the previous (untagged) line above the new tagged one; rolling SRTs overlap the next cue.
  const rolling = timed ? cues.some(c => c.lines.some(l => TIME_TAG.test(l)) && c.lines.some(l => !TIME_TAG.test(l) && cleanText(l).trim()))
    : cues.some((c, k) => cues[k + 1] && cues[k + 1].start < c.end - .01);
  const words = [];
  let ln = 0;
  cues.forEach((c, k) => {
    if (timed) {
      for (const line of c.lines.filter(l => TIME_TAG.test(l))) {
        let t = c.start;
        line.split(new RegExp(TIME_TAG.source)).forEach((part, j) => {
          if (j % 2) t = parseTime(part);
          else for (const w of cleanText(part).split(/\s+/)) if (w) words.push({ t, w, ln });
        });
        ln++;
      }
      return;
    }
    const next = cues[k + 1]?.start, end = next > c.start && next < c.end ? next : c.end;
    const ws = c.lines.map(l => cleanText(l).split(/\s+/).filter(Boolean));
    const n = ws.flat().length;
    let j = 0;
    for (const lw of ws) { if (!lw.length) continue; for (const w of lw) words.push({ t: c.start + (end - c.start) * j++ / n, w, ln }); ln++; }
  });
  const out = words.filter(w => !isNaN(w.t)).sort((a, b) => a.t - b.t);
  out.byLine = !rolling;
  return out;
}

// Groups words into displayed phrases: the file's own lines when they are real, else short sung chunks.
function toPhrases(words) {
  const out = [], cap = s => /^\p{Lu}/u.test(s);
  words.forEach((w, k) => {
    const cur = out.at(-1)?.words, prev = words[k - 1], gap = k ? w.t - prev.t : 99, n = cur?.length || 0;
    const chars = cur ? cur.reduce((a, x) => a + x.w.length + 1, 0) : 0;
    const brk = words.byLine ? !cur || w.ln !== prev.ln
      // a capital after a lowercase word usually starts a new sentence ("... biển khơi | Happy ...")
      : !cur || n >= 7 || chars + w.w.length > 30 || w.t - cur[0].t > 3.2 || (n >= 2 && gap > 1.2)
        || (n >= 3 && cap(w.w) && !cap(prev.w)) || (n >= 4 && cap(w.w) && gap > .4);
    if (brk) out.push({ words: [w] }); else cur.push(w);
  });
  out.forEach((p, k) => {
    const last = p.words.at(-1).t, next = out[k + 1]?.words[0].t ?? Infinity;
    p.start = p.words[0].t - .15;
    p.end = Math.max(last + .25, Math.min(next - .2, last + 2.2));
  });
  return out;
}

// ---------- Re-timing corrected lyrics ----------
const baseForm = w => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const linesToWords = lines => lines.flatMap((l, ln) => l.split(/\s+/).filter(Boolean).map(w => ({ w, ln })));

// Gives each word of the corrected lyrics the time of its best match in the old timed words (edit-distance
// alignment, accents ignored so "mùng" still matches "mừng"); unmatched words are interpolated between neighbours.
function alignLyrics(lines, timed) {
  const words = linesToWords(lines), A = words.map(x => baseForm(x.w)), B = timed.map(x => baseForm(x.w));
  const n = A.length, m = B.length, W1 = m + 1, D = new Float32Array((n + 1) * W1), P = new Uint8Array((n + 1) * W1);
  for (let i = 1; i <= n; i++) { D[i * W1] = i; P[i * W1] = 1; }
  for (let j = 1; j <= m; j++) { D[j] = j; P[j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const a = A[i - 1], b = B[j - 1], sub = a === b ? 0 : Math.min(1.6, 2 * lev(a, b) / Math.max(a.length, b.length, 1));
    const d = D[(i - 1) * W1 + j - 1] + sub, up = D[(i - 1) * W1 + j] + 1, left = D[i * W1 + j - 1] + 1;
    const k = i * W1 + j;
    if (d <= up && d <= left) { D[k] = d; P[k] = 0; } else if (up <= left) { D[k] = up; P[k] = 1; } else { D[k] = left; P[k] = 2; }
  }
  for (let i = n, j = m; i > 0 || j > 0;) {
    const p = P[i * W1 + j];
    if (p === 0) { words[i - 1].t = timed[j - 1].t; i--; j--; } else if (p === 1) i--; else j--;
  }
  return fillGaps(words);
}
function fillGaps(words) {
  const known = words.map((w, i) => w.t !== undefined ? i : -1).filter(i => i >= 0);
  words.forEach((w, i) => {
    if (w.t !== undefined) return;
    const a = known.filter(k => k < i).at(-1), b = known.find(k => k > i);
    w.t = a === undefined ? (b === undefined ? i * .5 : words[b].t - (b - i) * .35)
      : b === undefined ? words[a].t + (i - a) * .35 : words[a].t + (words[b].t - words[a].t) * (i - a) / (b - a);
  });
  for (let i = 1; i < words.length; i++) words[i].t = Math.max(words[i].t, words[i - 1].t + .05); // keep order
  words.forEach(w => { w.t = Math.max(0, w.t); });
  words.byLine = true;
  return words;
}
// Tap-sync: lineStarts[i] is when line i begins, end is when the last one finishes; words spread within each line.
function tapToWords(lines, lineStarts, end) {
  const words = linesToWords(lines);
  lines.forEach((_, ln) => {
    const ws = words.filter(w => w.ln === ln), s = lineStarts[ln], e = (lineStarts[ln + 1] ?? end) - .15;
    ws.forEach((w, k) => { w.t = s + Math.max(.1, e - s) * .9 * k / ws.length; });
  });
  words.byLine = true;
  return words;
}

const vttTime = t => { const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = (ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`; };
// One cue per sung line, every word carrying its own time tag (so even one-word lines keep their timing).
function buildVtt(phrasesList) {
  let out = 'WEBVTT\n\nNOTE Made with PaNIC Slide Studio: one cue per sung line, one time tag per word.\n';
  phrasesList.forEach((p, k) => {
    const start = p.words[0].t, end = Math.max(start + .3, phrasesList[k + 1] ? phrasesList[k + 1].words[0].t - .05 : p.words.at(-1).t + 2);
    out += `\n${vttTime(start)} --> ${vttTime(end)}\n${p.words.map(w => `<${vttTime(w.t)}>${w.w}`).join(' ')}\n`;
  });
  return out;
}

{ const v = parseSubs('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n[âm nhạc]\n\n00:00:08.920 --> 00:00:13.070\n \nHappy<00:00:09.360><c> Birthday</c>\n\n00:00:13.080 --> 00:00:15.709\nHappy Birthday\nYou<00:00:13.639><c> mừng</c>');
  const s = parseSubs('1\n00:00:02,000 --> 00:00:06,000\nmột hai\n\n2\n00:00:04,000 --> 00:00:08,000\nba');
  const a = alignLyrics(['Happy Birthday to you', 'mừng tuổi'], v);
  const back = parseSubs(buildVtt(toPhrases(a)));
  console.assert(v.map(w => w.w).join(' ') === 'Happy Birthday You mừng' && v[1].t === 9.36 && v[2].t === 13.08 && !v.byLine
    && s.map(w => w.t).join() === '2,3,4' && !s.byLine
    && a.map(w => w.t.toFixed(2)).join() === '8.92,9.36,11.22,13.08,13.64,13.99'
    && back.byLine && toPhrases(back).length === 2 && back[3].t === 13.08, 'lyrics'); }
