// App state, UI wiring, media, playback and export.

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const STORE_KEY = 'panic-slide:v1', THEME_KEY = 'panic-slide:theme';

let photos = [], plan = [], coverPhoto = null; // coverPhoto: { file } chosen as the opening image, else the first photo
let playing = false, elapsed = 0, dirty = true, last = performance.now(), playStart = 0, currentSlide = 0;
const syncClock = () => { playStart = performance.now() - elapsed * 1000; };

// Everything the viewer can change. Picking a theme (applyTheme) resets the look-related keys to its defaults.
const opts = {
  style: 'wedding', aspect: 'landscape', collage: true, dur: 5, fitMusic: true,
  frame: 'mix', filter: 'vivid', transitions: STYLES.wedding.transitions.slice(),
  particles: STYLES.wedding.particles.slice(), particleMode: 'continuous', density: 1,
  showCaptions: true, lyricMode: 'elegant', lyricPos: 'free', title: '', sub: '', end: '',
  sort: 'name',
};
const captions = {}; // per theme: [{ top, bottom, on, custom }]
const themeCaptions = key => captions[key] ??= STYLES[key].captions.map(([top, bottom]) => ({ top, bottom, on: true }));

// localStorage only remembers settings for this browser; photos and media never leave the machine.
function loadSaved() {
  try {
    const s = migrate(JSON.parse(localStorage.getItem(STORE_KEY)));
    if (!s?.opts || !STYLES[s.opts.style]) return false;
    useSaved(s);
    return true;
  } catch { return false; }
}
// Older saves: "Thôi nôi" (firstbday) is now part of "Sinh nhật", and timeline chapters were removed.
function migrate(s) {
  if (!s?.opts) return s;
  if (s.opts.style === 'firstbday') s.opts.style = 'birthday';
  delete s.opts.milestones; delete s.opts.birthDate;
  const old = s.captions?.firstbday;
  if (old) {
    const base = s.captions.birthday || STYLES.birthday.captions.map(([top, bottom]) => ({ top, bottom, on: true }));
    const seen = new Set(base.map(c => (c.top + '|' + c.bottom).toLowerCase()));
    s.captions.birthday = base.concat(old.filter(c => !seen.has((c.top + '|' + c.bottom).toLowerCase())));
    delete s.captions.firstbday;
  }
  return s;
}
function useSaved(s) { // shared by localStorage restore and "Mở dự án"
  Object.assign(opts, s.opts); Object.assign(captions, s.captions);
  if (!Array.isArray(opts.particles)) // saved by the older single-choice dropdown
    opts.particles = opts.particles === 'off' ? [] : PARTICLES[opts.particles] ? [opts.particles] : STYLES[opts.style].particles.slice();
}

// ---------- Projects: every setting of one event in a .json file (photos and music stay as files) ----------
function exportProject() {
  const name = opts.title || STYLES[opts.style].label;
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'panic-slide', version: 1, name, opts, captions }, null, 2)], { type: 'application/json' }));
  a.download = `du-an-${opts.style}-${slug || 'slideshow'}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast(`Đã lưu ${a.download}. Lần sau bấm "Mở dự án" để dùng lại.`, 'ok', 6000);
}
async function importProject(file) {
  let s;
  try { s = migrate(JSON.parse(await file.text())); } catch {}
  if (s?.app !== 'panic-slide' || !STYLES[s.opts?.style]) return toast(`"${file.name}" không phải file dự án PaNIC Slide Studio.`, 'warn');
  pause(); useSaved(s);
  setAspect(opts.aspect); sortPhotos(); afterPhotosChanged(); syncUI(); loadDefaultMedia(); saveSoon();
  toast(`Đã mở dự án "${s.name || file.name}"`, 'ok');
}
let saveTimer;
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ opts, captions })); } catch {} }, 300); };

// ---------- Toasts ----------
function toast(msg, kind = 'info', ms = 4200, action) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.setAttribute('role', 'status'); el.textContent = msg;
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-action'; b.textContent = action.label; b.onclick = () => { action.run(); el.remove(); }; el.append(b); }
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- Plan & timing ----------
// Slide 0 is always the cover. With music, photos are repeated in a shuffled order until the slideshow is long
// enough to end exactly with the song (a whole number of plays) at a comfortable pace.
const MAX_SLIDE_FIT = 8; // seconds per regular slide we aim to stay under when fitting to music
function seeded(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
function buildPlan() {
  const st = STYLES[opts.style], pat = opts.collage ? st.pattern : [1];
  const caps = opts.showCaptions ? themeCaptions(opts.style).filter(c => c.on && c.bottom.trim()) : [];
  plan = [];
  if (!photos.length) { clearCaps(); dirty = true; updateMeta(); return; }
  plan.push({ cover: true, photos: [coverPhoto ? 'cover' : 0], cap: null, look: 0 });
  const first = coverPhoto ? 0 : 1; // without a chosen cover the first photo is the cover
  let k = 0, c = 0, g = 0;
  const addRun = (order, repeat) => {
    for (let i = 0; i < order.length;) {
      const m = Math.min(pat[k++ % pat.length], order.length - i), cap = m > 1 && caps.length ? caps[c++ % caps.length] : null;
      plan.push({ photos: order.slice(i, i + m), cap: cap && [cap.top, cap.bottom], look: m > 1 ? g++ : plan.length, repeat });
      i += m;
    }
  };
  const all = photos.map((_, i) => i);
  addRun(all.slice(first), false);
  if (plan.length === 1 && photos.length === 1 && !coverPhoto) { /* a single photo: cover only */ }
  // repeat (shuffled, never starting with the photo that just played) until the pace is comfortable
  const rnd = seeded(photos.length * 131 + (coverPhoto ? 7 : 0)), limit = Math.max(MAX_SLIDE_FIT, opts.dur * 1.15);
  for (let guard = 0; musicDur && guard < 60 && times().D > (opts.fitMusic ? MAX_SLIDE_FIT : limit); guard++) {
    const order = all.slice();
    for (let i = order.length - 1; i > 0; i--) { const r = rnd() * (i + 1) | 0; [order[i], order[r]] = [order[r], order[i]]; }
    const lastShown = plan.at(-1).photos.at(-1);
    if (order.length > 1 && order[0] === lastShown) order.push(order.shift());
    addRun(order, true);
  }
  clearCaps(); dirty = true; updateMeta();
}
// Date taken: EXIF DateTimeOriginal (JPEG), else a date in the file name (IMG_20260302…), else the file's modified time.
function exifDate(v, t) {
  const le = v.getUint16(t) === 0x4949, u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
  const find = (ifd, tag) => { const n = u16(t + ifd); for (let i = 0; i < n; i++) { const e = t + ifd + 2 + i * 12; if (u16(e) === tag) return e; } return 0; };
  const str = e => { const n = u32(e + 4), o = n > 4 ? t + u32(e + 8) : e + 8; let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(o + i)); return s; };
  const ifd0 = u32(t + 4), exif = find(ifd0, 0x8769), orig = exif && find(u32(exif + 8), 0x9003), plain = find(ifd0, 0x0132);
  const m = (orig ? str(orig) : plain ? str(plain) : '').match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
}
async function photoDate(file) {
  try {
    const v = new DataView(await file.slice(0, 131072).arrayBuffer());
    if (v.getUint16(0) === 0xFFD8) for (let o = 2; o + 10 < v.byteLength;) {
      const marker = v.getUint16(o);
      if ((marker & 0xFF00) !== 0xFF00) break;
      if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) { const d = exifDate(v, o + 10); if (d) return d; break; }
      o += 2 + v.getUint16(o + 2);
    }
  } catch {}
  const n = file.name.match(/(20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)/);
  return n ? new Date(+n[1], n[2] - 1, +n[3], 12).getTime() : file.lastModified;
}
async function readDates(list) {
  let k = 0;
  const worker = async () => { while (k < list.length) { const p = list[k++]; p.date = await photoDate(p.file); } };
  await Promise.all(Array.from({ length: 6 }, worker));
}
const byDate = () => opts.sort === 'date';
const byName = (a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true });
function sortPhotos() { photos.sort(byDate() ? (a, b) => (a.date ?? 0) - (b.date ?? 0) || byName(a, b) : byName); }
// With music the video always lasts a whole number of plays of the song (see buildPlan for the repeats).
const INTRO_MAX = 13; // seconds: the opening slide plays about twice as long as the others, up to this
function times() {
  const w = plan.map(s => s.cover ? 2 : s.photos.length > 1 ? 1.6 : 1), rest = w.slice(1).reduce((a, b) => a + b, 0);
  let D = opts.dur, plays = 0;
  if (musicDur && w.length) {
    const sum = rest + w[0];
    // fit: the fewest plays that still give every slide at least 3 s; fixed: the number of plays closest to the chosen pace
    plays = opts.fitMusic ? Math.max(1, Math.ceil(sum * 3 / musicDur)) : Math.max(1, Math.round(sum * opts.dur / musicDur));
    D = musicDur * plays / sum;
  }
  // the cover plays about twice as long as a slide, up to INTRO_MAX; with music the other slides absorb the difference
  let intro = w.length > 1 ? Math.min(w[0] * D, INTRO_MAX) : (plays ? musicDur * plays : D * 2);
  if (plays && w.length > 1 && intro < w[0] * D) D = (musicDur * plays - intro) / rest;
  const durs = w.map((x, i) => i === 0 ? intro : x * D), starts = [];
  let total = 0;
  for (const d of durs) { starts.push(total); total += d; }
  return { D, durs, starts, total, plays, T: Math.min(1.4, D * .35) };
}
function checkTimes() { // self-check: with music the slideshow always ends on a whole play of the song
  const save = [plan, musicDur, opts.fitMusic, opts.dur];
  [musicDur, opts.dur] = [150, 5];
  for (const fit of [true, false]) for (const n of [1, 2, 7, 40, 101]) {
    opts.fitMusic = fit; plan = [{ cover: true, photos: [0] }, ...Array.from({ length: n - 1 }, () => ({ photos: [0] }))];
    const a = times(), sum = a.durs.reduce((x, y) => x + y, 0);
    console.assert(a.plays >= 1 && Number.isInteger(a.plays) && Math.abs(a.total - 150 * a.plays) < 1e-6 && Math.abs(sum - a.total) < 1e-6
      && (n < 2 || a.durs[0] <= INTRO_MAX + 1e-6), 'times', fit, n, a);
  }
  [plan, musicDur, opts.fitMusic, opts.dur] = save;
}
function updateMeta() {
  const tm = times(), mb = photos.reduce((n, p) => n + p.file.size, 0) / 1048576;
  $('#projMeta').textContent = photos.length ? `${photos.length} ảnh · ${plan.length} slide · ${fmt(tm.total)}` : 'Chưa có ảnh';
  $('#statPhotos').textContent = photos.length; $('#statSlides').textContent = plan.length;
  $('#statSize').textContent = mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
  $('#photoStats').hidden = $('#photoActions').hidden = !photos.length;
  const reps = plan.filter(s => s.repeat).length;
  const loop = musicDur && photos.length ? (tm.plays > 1 ? ` · nhạc phát ${tm.plays} lần` : '') + (reps ? ` · lặp lại ${reps} slide` : '') : '';
  $('#durOut').textContent = tm.D.toFixed(1) + ' giây' + (musicDur && opts.fitMusic ? ' · theo nhạc' : '') + loop;
  $('#densityOut').textContent = Math.round(opts.density * 100) + '%';
  $('#durRow').classList.toggle('muted', !!(musicDur && opts.fitMusic));
}

// ---------- Theme & options ----------
function applyTheme(key) {
  const st = STYLES[key], keys = ['title', 'sub', 'end'], prevStyle = opts.style;
  const sample = v => !v || OLD_SAMPLES.includes(v) || Object.values(STYLES).some(s => s.defaults && keys.some(k => s.defaults[k] === v));
  const typed = Object.fromEntries(keys.map(k => [k, opts[k]])), hadOwn = keys.some(k => !sample(opts[k]));
  for (const k of keys) opts[k] = st.defaults[k];
  if (hadOwn && key !== prevStyle && arguments[1] !== 'silent') {
    setTimeout(() => toast(`Chữ mở đầu và kết thúc đã đổi theo chủ đề ${st.label}.`, 'info', 7000, {label: 'Giữ chữ cũ', run: () => {
      Object.assign(opts, typed); resetTitleCache(); buildPlan(); syncUI(); saveSoon(); }}), 0);
  }
  Object.assign(opts, { style: key, frame: st.frame, filter: st.filter, transitions: st.transitions.slice(),
    particles: st.particles.slice(), particleMode: st.particleMode, lyricMode: st.lyric.mode });
  sortPhotos(); evict(Infinity, -1);
  resetParticles(); resetTitleCache(); buildPlan(); syncUI(); loadDefaultMedia(); saveSoon();
}
function setOpt(key, v) {
  if (key === 'style') return applyTheme(v);
  opts[key] = v;
  if (key === 'aspect') { setAspect(v); buildPlan(); }
  if (key === 'dur' || key === 'fitMusic') buildPlan();
  if (key === 'collage' || key === 'showCaptions') { buildPlan(); renderCaptions(); }
  if (key === 'title') resetTitleCache();
  if (key === 'particles' || key === 'particleMode') lastBurst = null;
  if (key === 'sort') { sortPhotos(); afterPhotosChanged(); }
  dirty = true; updateMeta(); saveSoon();
}
function readValue(el) { return el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value; }
function syncUI() {
  for (const el of $$('[data-opt]')) {
    const v = opts[el.dataset.opt];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = el.value === String(v);
    else el.value = v;
  }
  // empty title fields hint at the theme's own sample text
  const sample = STYLES[opts.style].defaults;
  for (const k of ['title', 'sub', 'end']) { const el = $(`[data-opt="${k}"]`); if (el) el.placeholder = 'VD: ' + sample[k]; }
  renderCaptions(); renderTransitions(); renderParticles(); renderMediaCards(); updateMeta();
}

// ---------- Photos ----------
const isImage = f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|bmp|heic)$/i.test(f.name);
const isAudio = f => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name);
function addFiles(list) {
  const files = [...list], imgs = files.filter(isImage), aud = files.find(isAudio);
  const subs = files.filter(f => /\.(srt|vtt)$/i.test(f.name)).sort((a, b) => /\.vtt$/i.test(b.name) - /\.vtt$/i.test(a.name))[0];
  if (subs) subs.text().then(t => loadSubsText(t, subs.name, 'user')); // .vtt preferred: YouTube's carries per-word timing
  if (aud) setMusic(aud, 'user');
  const proj = files.find(f => /\.json$/i.test(f.name));
  if (proj) importProject(proj);
  if (imgs.length) {
    const added = imgs.map(file => ({ file }));
    photos = photos.concat(added); sortPhotos();
    afterPhotosChanged();
    toast(`Đã thêm ${imgs.length} ảnh`);
    readDates(added).then(() => { if (byDate()) { sortPhotos(); afterPhotosChanged(); } });
  }
}
// Photos are not previewed in the sidebar: decoding hundreds of thumbnails made the page lag.
function afterPhotosChanged() {
  evict(Infinity, -1); buildPlan();
  elapsed = Math.min(elapsed, times().total);
  $('#empty').hidden = photos.length > 0;
  renderCover();
}
function clearPhotos() { pause(); photos = []; elapsed = 0; afterPhotosChanged(); }

// ---------- Cover: the opening image ----------
let coverURL = null;
function setCover(file) {
  coverPhoto = file ? { file } : null;
  if (coverURL) URL.revokeObjectURL(coverURL);
  coverURL = file ? URL.createObjectURL(file) : null;
  evict(Infinity, -1); buildPlan(); renderCover();
  if (file) toast('Đã đặt ảnh bìa cho slide mở đầu.', 'ok');
}
function renderCover() {
  const f = coverPhoto?.file || photos[0]?.file;
  if (f && !coverPhoto && (!renderCover.u || renderCover.f !== f)) { if (renderCover.u) URL.revokeObjectURL(renderCover.u); renderCover.u = URL.createObjectURL(f); renderCover.f = f; }
  const src = coverPhoto ? coverURL : f ? renderCover.u : '';
  $('#coverImg').hidden = !src; if (src) $('#coverImg').src = src;
  $('#coverEmpty').hidden = !!src;
  $('#coverName').textContent = coverPhoto ? coverPhoto.file.name : f ? 'Ảnh đầu tiên (tự chọn)' : 'Chưa có ảnh';
  $('#coverMeta').textContent = coverPhoto ? 'Ảnh bìa bạn chọn' : f ? 'Chọn một ảnh đẹp nhất để làm bìa' : 'Thêm ảnh hoặc chọn một ảnh bìa riêng';
  $('#coverReset').hidden = !coverPhoto;
}

// ---------- Music & lyrics (theme defaults live in media/<theme>/) ----------
const audio = new Audio();
audio.loop = true; // a video longer than the song keeps the music going; times() makes "fit" end on a whole play
const songTime = t => musicDur ? t % musicDur : t;
let musicDur = 0, actx, gain, audioDest, music = null, lyricsInfo = null, mediaToken = 0, fileWarned = false;
audio.onloadedmetadata = () => { musicDur = audio.duration; buildPlan(); elapsed = Math.min(elapsed, times().total); dirty = true; renderMediaCards(); updateMeta(); };
function setMusic(file, source) {
  pause();
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(file);
  music = { name: file.name, source }; musicDur = 0; buildPlan();
  renderMediaCards();
}
function clearMusic() {
  if (audio.src) { pause(); URL.revokeObjectURL(audio.src); audio.removeAttribute('src'); audio.load(); }
  music = null; musicDur = 0; buildPlan(); dirty = true; renderMediaCards(); updateMeta();
}
function loadSubsText(text, name, source) {
  phrases = toPhrases(parseSubs(text));
  lyricsInfo = phrases.length ? { name, source, song: music?.name } : null;
  if (!phrases.length) toast('File phụ đề không có nội dung đọc được.', 'warn');
  dirty = true; renderMediaCards();
}
function clearLyrics() { phrases = []; lyricsInfo = null; dirty = true; renderMediaCards(); }
function warnFileProtocol() {
  if (location.protocol !== 'file:' || fileWarned) return;
  fileWarned = true;
  toast('Trang đang mở trực tiếp từ ổ đĩa nên không tự nạp được nhạc và phụ đề mặc định. Hãy mở qua web server (xem README).', 'warn', 9000);
}
async function loadDefaultMedia() {
  const m = STYLES[opts.style].media, token = ++mediaToken;
  const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r; };
  // your own lyrics stay only while they still belong to the song that will be playing
  const song = music?.source === 'user' ? music.name : m.music && (m.title || m.music.split('/').pop());
  if (lyricsInfo?.source === 'user' && lyricsInfo.song !== song) lyricsInfo = null;
  if (music?.source !== 'user') {
    if (!m.music) clearMusic();
    else try {
      const b = await (await get(m.music)).blob();
      if (token === mediaToken) setMusic(new File([b], m.title || m.music.split('/').pop(), { type: b.type || 'audio/mp4' }), 'default');
    } catch { if (token === mediaToken) { clearMusic(); warnFileProtocol(); } }
  }
  if (lyricsInfo?.source !== 'user') {
    if (!m.lyrics) clearLyrics();
    else try {
      const text = await (await get(m.lyrics)).text();
      if (token === mediaToken) loadSubsText(text, 'Phụ đề của bài mặc định', 'default');
    } catch { if (token === mediaToken) { clearLyrics(); warnFileProtocol(); } }
  }
}
function renderMediaCards() {
  const m = STYLES[opts.style].media, viaFile = location.protocol === 'file:';
  const missing = (has, what) => has ? (viaFile ? `Cần mở qua web server để nạp ${what} mặc định` : 'Đang tải…') : `Chủ đề này chưa có ${what} mặc định`;
  $('#musicName').textContent = music ? music.name : 'Chưa có nhạc';
  $('#musicMeta').textContent = music ? `${music.source === 'default' ? 'Mặc định của chủ đề' : 'Bạn tải lên'}${musicDur ? ' · ' + fmt(musicDur) : ''}` : missing(m.music, 'nhạc');
  $('#musicReset').hidden = !(music?.source === 'user' && m.music);
  $('#musicClear').hidden = !music;
  $('#lyricsName').textContent = lyricsInfo ? lyricsInfo.name : 'Chưa có phụ đề';
  $('#lyricsMeta').textContent = lyricsInfo ? `${phrases.length} câu · ${lyricsInfo.source === 'default' ? 'Mặc định của chủ đề' : 'Bạn tải lên'}` : missing(m.lyrics, 'phụ đề');
  $('#lyricsReset').hidden = !(lyricsInfo?.source === 'user' && m.lyrics);
  $('#lyricsClear').hidden = !lyricsInfo;
  $('#fitRow').hidden = !music;
}
function initAudio() {
  if (!actx) {
    actx = new AudioContext();
    const src = actx.createMediaElementSource(audio);
    gain = actx.createGain(); audioDest = actx.createMediaStreamDestination();
    src.connect(gain); gain.connect(actx.destination); gain.connect(audioDest);
  }
  actx.resume();
}

// ---------- Date picker: dd/mm/yyyy, weeks from Monday (the native picker follows the browser locale and can't be styled) ----------
// ---------- Lyrics editor: fix the words, then re-time them (align to the old timing, or tap along) ----------
const dlg = $('#lyricsDlg');
let tap = null; // { lines, starts } while tapping along
const editorLines = () => $('#lyricsText').value.split('\n').map(l => l.trim()).filter(Boolean);
function applyWords(words, name) { phrases = toPhrases(words); lyricsInfo = { name, source: 'user', song: music?.name }; dirty = true; renderMediaCards(); }
function showTap() {
  const k = tap.starts.length, done = k >= tap.lines.length;
  $('#tapLine').textContent = done ? 'Bấm khi dòng cuối hát xong' : tap.lines[k];
  $('#tapNextLine').textContent = done ? '' : tap.lines[k + 1] ?? '(dòng cuối)';
  $('#tapProg').textContent = `${Math.min(k + 1, tap.lines.length)} / ${tap.lines.length}`;
  $('#tapNext').textContent = done ? 'Kết thúc' : 'Dòng này bắt đầu';
}
function stopTap() { if (tap) audio.pause(); tap = null; $('#tapPanel').hidden = true; }
$('#lyricsEdit').onclick = () => {
  $('#lyricsText').value = phrases.map(p => p.words.map(w => w.w).join(' ')).join('\n');
  $('#alignBtn').disabled = !phrases.length; $('#tapBtn').disabled = !audio.src;
  stopTap(); pause(); dlg.showModal();
};
$('#alignBtn').onclick = () => {
  const lines = editorLines();
  if (!lines.length) return toast('Hãy nhập lời bài hát.', 'warn');
  applyWords(alignLyrics(lines, phrases.flatMap(p => p.words)), 'Phụ đề đã sửa');
  toast(`Đã căn ${lines.length} dòng theo thời gian cũ. Bấm "Tải file .vtt" để lưu lại.`, 'ok');
};
$('#tapBtn').onclick = () => {
  const lines = editorLines();
  if (!lines.length) return toast('Hãy dán lời bài hát, mỗi câu một dòng.', 'warn');
  initAudio(); if (gain) gain.gain.value = 1;
  audio.currentTime = 0; audio.play().catch(() => {});
  tap = { lines, starts: [] };
  $('#tapPanel').hidden = false; showTap(); $('#tapNext').focus();
};
$('#tapNext').onclick = () => {
  if (!tap) return;
  const t = audio.currentTime;
  if (tap.starts.length < tap.lines.length) { tap.starts.push(t); return showTap(); }
  applyWords(tapToWords(tap.lines, tap.starts, t), 'Phụ đề gõ nhịp');
  toast('Đã đồng bộ xong. Bấm "Tải file .vtt" để lưu lại.', 'ok');
  stopTap();
};
$('#tapStop').onclick = stopTap;
dlg.addEventListener('close', stopTap);
$('#vttDownload').onclick = () => {
  if (!phrases.length) return toast('Chưa có phụ đề để tải.', 'warn');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buildVtt(phrases)], { type: 'text/vtt' }));
  a.download = 'lyrics.vtt'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast(`Lưu file vào media/${opts.style}/lyrics.vtt để làm phụ đề mặc định của chủ đề.`, 'info', 8000);
};

// ---------- Captions & transitions lists ----------
function renderCaptions() {
  const list = themeCaptions(opts.style);
  $('#capList').innerHTML = list.map((c, i) => `<li class="cap-item">
    <label class="switch sm"><input type="checkbox" data-cap="${i}" ${c.on ? 'checked' : ''} aria-label="Dùng câu ${esc(c.bottom)}"><span></span></label>
    <div class="cap-text">${c.top ? `<small>${esc(c.top)}</small>` : ''}<b>${esc(c.bottom)}</b></div>
    ${c.custom ? `<button class="icon-btn sm" data-capdel="${i}" aria-label="Xoá câu"><svg class="ico"><use href="#i-trash"/></svg></button>` : ''}</li>`).join('');
  $('#capCard').classList.toggle('is-off', !opts.showCaptions);
}
const chip = (value, name, on) => `<label class="chip"><input type="checkbox" value="${value}" ${on ? 'checked' : ''}><span>${name}</span></label>`;
const TR_PRESETS = {
  theme: () => STYLES[opts.style].transitions, calm: () => TRANSITIONS.filter(t => t.calm).map(t => t.id),
  fun: () => TRANSITIONS.filter(t => !t.calm).map(t => t.id), all: () => TRANSITIONS.map(t => t.id),
};
const PT_PRESETS = { theme: () => STYLES[opts.style].particles, all: () => Object.keys(PARTICLES), none: () => [] };
const sameSet = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every(x => B.has(x)); };
// A preset badge lights up whenever the current selection is exactly its set.
function markPresets() {
  for (const b of $$('[data-trpreset]')) { const on = sameSet(opts.transitions, TR_PRESETS[b.dataset.trpreset]()); b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); }
  for (const b of $$('[data-ppreset]')) { const on = sameSet(opts.particles, PT_PRESETS[b.dataset.ppreset]()); b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); }
}
function renderTransitions() {
  $('#trList').innerHTML = TRANSITIONS.map(t => chip(t.id, t.name, opts.transitions.includes(t.id))).join('');
  markPresets();
}
function renderParticles() {
  $('#ptList').innerHTML = Object.entries(PARTICLES).map(([k, n]) => chip(k, n, opts.particles.includes(k))).join('');
  $('#ptOff').hidden = opts.particles.length > 0;
  markPresets();
}

// ---------- Playback ----------
function play() {
  if (!photos.length) return toast('Hãy thêm ảnh trước.', 'warn');
  initAudio();
  if (elapsed >= times().total) restart();
  playing = true; syncClock();
  if (audio.src) { audio.currentTime = songTime(elapsed); audio.play().catch(() => {}); }
  $('#playIco').setAttribute('href', '#i-pause'); $('#playBtn').setAttribute('aria-label', 'Tạm dừng');
}
function pause() {
  playing = false; audio.pause(); dirty = true;
  $('#playIco').setAttribute('href', '#i-play'); $('#playBtn').setAttribute('aria-label', 'Phát');
}
function restart() { elapsed = 0; syncClock(); resetParticles(); if (audio.src) audio.currentTime = 0; if (gain) gain.gain.value = 1; dirty = true; }
function seek(t) {
  elapsed = clamp(t, 0, times().total); syncClock(); lastBurst = null;
  if (audio.src && playing) audio.currentTime = songTime(elapsed);
  dirty = true;
}
function onEnded() { pause(); if (recorder) recorder.stop(); }

function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  const tm = times();
  if (playing) {
    elapsed = (now - playStart) / 1000; // wall clock, so dropped frames never drift from the music
    if (gain) gain.gain.value = clamp((tm.total - elapsed) / 1.5);
    if (audio.src && musicDur && !audio.paused) {
      const want = songTime(elapsed), off = Math.abs(audio.currentTime - want);
      if (off > .25 && off < musicDur - .25 && want > .3 && want < musicDur - .3) audio.currentTime = want;
    }
    if (elapsed >= tm.total) { elapsed = tm.total; onEnded(); }
  }
  if (playing || dirty) {
    dirty = false;
    currentSlide = renderFrame(elapsed, playing ? dt : 0, tm) ?? 0;
    $('#timeNow').textContent = fmt(elapsed); $('#timeTotal').textContent = fmt(tm.total);
    $('#fill').style.width = tm.total ? elapsed / tm.total * 100 + '%' : 0;
    $('#slideInd').textContent = plan.length ? `Slide ${currentSlide + 1}/${plan.length}` : '';
  }
  requestAnimationFrame(frame);
}

// ---------- Export (records the canvas in real time) ----------
let recorder = null, recAborted = false;
function startExport() {
  if (!photos.length) return toast('Hãy thêm ảnh trước.', 'warn');
  const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) return toast('Trình duyệt này không hỗ trợ ghi video. Hãy dùng Chrome hoặc Edge.', 'warn');
  initAudio();
  const stream = canvas.captureStream(30);
  if (audio.src) audioDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16e6 });
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    stream.getVideoTracks().forEach(t => t.stop());
    recorder = null; document.body.classList.remove('recording');
    if (recAborted) return toast('Đã huỷ xuất video.', 'warn');
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm', a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: mime.split(';')[0] }));
    a.download = `slideshow-${opts.style}-${H > W ? 'doc' : 'ngang'}.${ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(`Đã xuất ${a.download}`, 'ok', 6000);
  };
  recAborted = false; restart();
  document.body.classList.add('recording');
  toast(`Đang ghi video (${fmt(times().total)}). Giữ tab này mở, không chuyển tab.`, 'info', 6000);
  Promise.all(plan[0].photos.map(j => ensure(j).promise)).then(() => { recorder.start(1000); play(); });
}
function abortRec() { if (recorder) { recAborted = true; pause(); recorder.stop(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden && recorder) abortRec(); });

// ---------- Wiring ----------
function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  $('#themeIco').setAttribute('href', mode === 'dark' ? '#i-sun' : '#i-moon');
  try { localStorage.setItem(THEME_KEY, mode); } catch {}
}
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

$$('[role=tab]').forEach(b => b.onclick = () => {
  $$('[role=tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  $$('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
});

$('#styleSel').innerHTML = Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${s.icon}  ${s.label}</option>`).join('');
$('#filterSel').innerHTML = Object.entries(FILTERS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('');
$('#frameOpts').innerHTML = Object.entries(FRAMES).map(([k, f]) => `<label class="frame-opt">
  <input type="radio" name="frame" value="${k}" data-opt="frame"><span class="frame-prev">${(f.mix || [k, k]).map(m => `<i class="fp-${m}"></i>`).join('')}</span><b>${f.label}</b></label>`).join('');

for (const el of $$('[data-opt]')) {
  el.addEventListener(el.type === 'text' || el.type === 'range' ? 'input' : 'change', () => {
    if (el.type === 'radio' && !el.checked) return;
    setOpt(el.dataset.opt, readValue(el));
  });
}

$('#photoInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
$('#musicInput').onchange = e => { if (e.target.files[0]) setMusic(e.target.files[0], 'user'); e.target.value = ''; };
$('#lyricsInput').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => loadSubsText(t, f.name, 'user')); e.target.value = ''; };
$('#addPhotos').onclick = () => $('#photoInput').click();
$('#openProject').onclick = () => $('#projectInput').click();
$('#projectInput').onchange = e => { if (e.target.files[0]) importProject(e.target.files[0]); e.target.value = ''; };
$('#saveProject').onclick = exportProject;
$('#clearPhotos').onclick = clearPhotos;
$('#coverPick').onclick = () => $('#coverInput').click();
$('#coverInput').onchange = e => { const f = e.target.files[0]; if (f && isImage(f)) setCover(f); e.target.value = ''; };
$('#coverReset').onclick = () => setCover(null);
$('#musicPick').onclick = () => $('#musicInput').click();
$('#lyricsPick').onclick = () => $('#lyricsInput').click();
$('#musicClear').onclick = clearMusic;
$('#lyricsClear').onclick = clearLyrics;
$('#musicReset').onclick = () => { music = null; loadDefaultMedia(); };
$('#lyricsReset').onclick = () => { lyricsInfo = null; loadDefaultMedia(); };


$('#capList').onchange = e => {
  const i = e.target.dataset.cap;
  if (i === undefined) return;
  themeCaptions(opts.style)[i].on = e.target.checked; buildPlan(); saveSoon();
};
$('#capList').onclick = e => {
  const del = e.target.closest('[data-capdel]');
  if (!del) return;
  themeCaptions(opts.style).splice(+del.dataset.capdel, 1); renderCaptions(); buildPlan(); saveSoon();
};
$('#capForm').onsubmit = e => {
  e.preventDefault();
  const top = $('#capTop').value.trim(), bottom = $('#capMain').value.trim();
  if (!bottom) return toast('Hãy nhập dòng chữ chính.', 'warn');
  themeCaptions(opts.style).push({ top, bottom, on: true, custom: true });
  $('#capTop').value = $('#capMain').value = '';
  renderCaptions(); buildPlan(); saveSoon();
};
$('#capReset').onclick = () => { delete captions[opts.style]; renderCaptions(); buildPlan(); saveSoon(); };

$('#trList').onchange = e => {
  const ids = $$('#trList input:checked').map(x => +x.value);
  if (!ids.length) { e.target.checked = true; return toast('Cần giữ ít nhất 1 hiệu ứng chuyển cảnh.', 'warn'); }
  setOpt('transitions', ids); markPresets();
};
$('#ptList').onchange = () => { setOpt('particles', $$('#ptList input:checked').map(x => x.value)); renderParticles(); };
$$('[data-ppreset]').forEach(b => b.onclick = () => { setOpt('particles', PT_PRESETS[b.dataset.ppreset]().slice()); renderParticles(); });
$$('[data-trpreset]').forEach(b => b.onclick = () => { setOpt('transitions', TR_PRESETS[b.dataset.trpreset]().slice()); renderTransitions(); });

$('#playBtn').onclick = () => playing ? pause() : play();
$('#restartBtn').onclick = () => { restart(); play(); }; // replay = from the top, playing
// Fullscreen: the real API where it exists; otherwise (iPhone Safari) the stage fills the viewport in-page.
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function setPseudoFs(on) {
  $('#screen').classList.toggle('is-fs', on); document.body.classList.toggle('pseudo-fs', on);
  $('#fsExit').hidden = !on;
}
function toggleFullscreen() {
  const scr = $('#screen');
  if (scr.classList.contains('is-fs')) return setPseudoFs(false);
  if (fsElement()) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  const req = scr.requestFullscreen || scr.webkitRequestFullscreen;
  if (!req) return setPseudoFs(true);
  try { const p = req.call(scr); if (p && p.catch) p.catch(() => setPseudoFs(true)); } catch { setPseudoFs(true); }
}
$('#fsBtn').onclick = toggleFullscreen;
$('#fsExit').onclick = e => { e.stopPropagation(); setPseudoFs(false); };
$('#screen').addEventListener('click', e => { if ($('#screen').classList.contains('is-fs') && !e.target.closest('#fsExit')) $('#playBtn').click(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#screen').classList.contains('is-fs')) setPseudoFs(false); });
$('#exportBtn').onclick = startExport;
$('#cancelRec').onclick = abortRec;

const track = $('#track');
const seekAt = e => { const r = track.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * times().total); };
track.onpointerdown = e => { if (recorder) return; track.setPointerCapture(e.pointerId); seekAt(e); };
track.onpointermove = e => { if (track.hasPointerCapture(e.pointerId)) seekAt(e); };
track.onkeydown = e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); seek(elapsed + (e.key === 'ArrowRight' ? 5 : -5)); }
};

addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); addFiles(e.dataTransfer.files); });
addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea') || recorder || dlg.open) return;
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
  if (e.key === 'f') $('#fsBtn').click();
});

// ---------- Boot ----------
setTheme(document.documentElement.dataset.theme);
checkTimes();
const restored = loadSaved();
setAspect(opts.aspect);
if (restored) { buildPlan(); syncUI(); loadDefaultMedia(); } else applyTheme('wedding');
if (glError) toast('Lỗi đồ hoạ: ' + glError, 'warn', 10000);
// Canvas text only triggers a font download on first use, so fetch every font up front.
Promise.all(Object.values(STYLES).flatMap(s => [s.title.font(40), s.sub.font(40), s.cap.top(40), s.cap.bottom(40), s.lyric.font(40)])
  .map(f => document.fonts.load(f, 'Aa Ắ ệ'))).catch(() => {}).then(() => { resetTitleCache(); clearCaps(); dirty = true; });
requestAnimationFrame(frame);
