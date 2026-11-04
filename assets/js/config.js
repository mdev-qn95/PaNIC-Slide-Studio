// Theme presets and option catalogues. Shared defaults for every theme: frames 'mix' (all four looks), filter 'vivid'.
// Picking a theme copies its defaults into `opts` (app.js);
// everything after that is the viewer's own choice.

const STYLES = {
  wedding: {
    label: 'Cưới', icon: '💍',
    media: { music: 'media/wedding/song.m4a', lyrics: null, title: 'Em đồng ý (I do) — Đức Phúc × 911' }, // add lyrics.vtt here once synced
    transitions: [14, 8, 5, 15, 0, 2, 4, 1],
    particles: ['petals', 'hearts', 'sparkles'], particleMode: 'continuous',
    frame: 'mix', filter: 'vivid', frameColor: [1, 1, 1],
    anim: 'write', frameAnim: 'rise', shine: true,
    pattern: [1, 4, 1, 2, 1, 5, 1, 3],
    title: { font: s => `700 ${s}px "Dancing Script"`, size: 150, color: '#fffaf3' },
    sub: { font: s => `500 ${s}px "Playfair Display"`, size: 42, color: '#f6dcc4', spacing: 6 },
    cap: { top: s => `300 ${s}px "Be Vietnam Pro"`, bottom: s => `700 ${s}px "Dancing Script"`, color: '#fffaf3', color2: '#fffaf3' },
    lyric: { mode: 'elegant', font: s => `700 ${s}px "Dancing Script"`, color: '#fffaf3' },
    captions: [['Just', 'married'], ['Always &', 'forever'], ['Written', 'in the stars'], ['Our', 'love story'],
      ['Happily', 'ever after'], ['Mãi mãi', 'bên nhau'], ['Ngày', 'chung đôi'], ['Two hearts', 'one love']],
    defaults: { title: 'Phú & Thanh', sub: 'LỄ THÀNH HÔN · 16.06.2024', end: 'Trăm năm hạnh phúc' },
    intro: 'cinema', cover: { frame: 'thin', tilt: 0, mat: [.98, .94, .86] }, // opening scene: letterbox, gold frame drawn around the page, handwritten names
  },
  birthday: {
    label: 'Sinh nhật', icon: '🎂',
    media: { music: 'media/birthday/song.m4a', lyrics: 'media/birthday/lyrics.vtt', title: 'Đây là bài hát sinh nhật' },
    transitions: [9, 6, 12, 7, 13, 11, 3, 16],
    particles: ['confetti', 'balloons', 'sparkles'], particleMode: 'accent',
    frame: 'mix', filter: 'vivid', frameColor: [1, 1, 1],
    anim: 'pop', frameAnim: 'pop', shine: true,
    pattern: [1, 3, 1, 4, 1, 5, 1, 2],
    title: { font: s => `800 ${s}px "Baloo 2"`, size: 150, color: '#fff' },
    sub: { font: s => `600 ${s}px "Baloo 2"`, size: 52, color: '#fff3b0', spacing: 2 },
    cap: { top: s => `600 ${s}px "Baloo 2"`, bottom: s => `800 ${s}px "Baloo 2"`, color: '#ffffff', color2: '#ffd84d' },
    lyric: { mode: 'sticker', font: s => `800 ${s}px "Baloo 2"`, color: '#ffffff' },
    // also covers first birthdays (thôi nôi), which used to be a separate theme
    captions: [['Happy', 'day!'], ['Make a', 'wish'], ['Sweet', 'moments'], ['Party', 'time'], ['Chúc mừng', 'sinh nhật'],
      ['Thêm một', 'tuổi mới'], ['Cười', 'thật tươi'], ['Hello', 'one year!'], ['Hello', 'world!'], ['One year', 'of love'],
      ['Little', 'prince'], ['Tròn', '1 tuổi'], ['Con là', 'niềm vui'], ['Mau lớn', 'nhé con'], ['First', 'birthday'],
      ['Ngoan', 'và khoẻ'], ['Nụ cười', 'của bố mẹ']],
    defaults: { title: 'Happy Birthday!', sub: 'SoNIC tròn 1 tuổi 🎈', end: 'Chúc mừng sinh nhật! 🎂' },
    intro: 'celebrate', cover: { frame: 'thin', tilt: -.02, mat: [.99, .95, .85] }, // age-neutral: champagne gold, script + serif lockup // opening scene: turning sunburst, bouncing letters, ribbon banner, twinkling stars
  },
  memory: {
    label: 'Kỷ niệm', icon: '📷',
    media: { music: null, lyrics: null, title: '' },
    transitions: [10, 14, 5, 13, 0, 2, 10, 4],
    particles: ['dust', 'bokeh'], particleMode: 'continuous',
    frame: 'mix', filter: 'vivid', frameColor: [.97, .95, .9],
    anim: 'fade', frameAnim: 'drop', shine: false,
    pattern: [1, 2, 1, 4, 1, 3, 1, 5],
    title: { font: s => `italic 500 ${s}px "Playfair Display"`, size: 120, color: '#f7eedf' },
    sub: { font: s => `400 ${s}px "Be Vietnam Pro"`, size: 40, color: '#e6d6bd', spacing: 8 },
    cap: { top: s => `300 ${s}px "Be Vietnam Pro"`, bottom: s => `italic 500 ${s}px "Playfair Display"`, color: '#f7eedf', color2: '#f7eedf' },
    lyric: { mode: 'elegant', font: s => `italic 500 ${s}px "Playfair Display"`, color: '#f7eedf' },
    captions: [['Our', 'story'], ['Remember', 'when'], ['Những ngày', 'xưa ấy'], ['Forever', 'family'],
      ['Kỷ niệm', 'đong đầy'], ['Thương', 'nhớ mãi']],
    defaults: { title: 'Gia đình mình', sub: 'NHỮNG NĂM THÁNG ĐÃ QUA', end: 'Thương nhớ mãi' },
    intro: 'vintage', cover: { frame: 'polaroid', tilt: .03, mat: [.97, .95, .9] }, // opening scene: iris opening on the photo, warm film tone, slow focus-pull title
  },
};

// Sample texts shipped by earlier versions; still treated as samples (replaced when the theme changes).
const OLD_SAMPLES = ['Minh & Lan', 'LỄ THÀNH HÔN · 20.12.2026', 'Bé An tròn 5 tuổi 🎈', 'Bé yêu', 'THÔI NÔI · TRÒN 1 TUỔI', 'Cảm ơn cả nhà đã đến chung vui'];

// Colour grades applied in the final shader pass.
const FILTERS = {
  natural: { label: 'Tự nhiên', tint: [1, 1, 1], sat: 1, con: 1, lift: 0, sepia: 0, grain: .015, vig: .22, glow: .1, flicker: 0 },
  warm: { label: 'Ấm áp', tint: [1.05, 1, .95], sat: 1, con: 1.02, lift: .02, sepia: 0, grain: .03, vig: .4, glow: .35, flicker: 0 },
  vivid: { label: 'Tươi sáng', tint: [1, 1, 1], sat: 1.15, con: 1.05, lift: 0, sepia: 0, grain: .015, vig: .25, glow: .15, flicker: 0 },
  pastel: { label: 'Pastel trong trẻo', tint: [1.02, 1.01, 1.04], sat: 1.05, con: .96, lift: .045, sepia: 0, grain: .012, vig: .18, glow: .32, flicker: 0 },
  dreamy: { label: 'Mơ màng', tint: [1.03, 1, 1.03], sat: .92, con: .95, lift: .05, sepia: 0, grain: .02, vig: .3, glow: .55, flicker: 0 },
  vintage: { label: 'Hoài cổ', tint: [1.04, .98, .88], sat: .7, con: .94, lift: .05, sepia: .3, grain: .07, vig: .55, glow: .12, flicker: .06 },
  bw: { label: 'Đen trắng', tint: [1, 1, 1], sat: 0, con: 1.1, lift: 0, sepia: 0, grain: .05, vig: .45, glow: .1, flicker: .02 },
};

// How each photo frame looks on collage slides (sizes in px at 1080p).
const FRAMES = {
  soft: { label: 'Bo góc mềm', border: 0, radius: 34, shadow: 64, edge: .35 },
  thin: { label: 'Viền mảnh', border: 4, radius: 10, shadow: 36, edge: 0 },
  sharp: { label: 'Tối giản', border: 0, radius: 0, shadow: 30, edge: .22 },
  polaroid: { label: 'Polaroid', border: 16, radius: 3, shadow: 36, edge: 0 },
  mix: { label: 'Kết hợp cả 4 kiểu', mix: ['soft', 'thin', 'sharp', 'polaroid'] }, // a different look on each slide
};

// ids match the branches of transition() in the final shader.
const TRANSITIONS = [
  { id: 14, name: 'Hoà tan mờ ảo', calm: true }, { id: 0, name: 'Zoom mờ', calm: true }, { id: 5, name: 'Vệt sáng', calm: true },
  { id: 2, name: 'Gạt mềm', calm: true }, { id: 1, name: 'Vòng tròn', calm: true }, { id: 8, name: 'Trái tim', calm: true },
  { id: 15, name: 'Mở cửa', calm: true }, { id: 4, name: 'Xoáy', calm: true }, { id: 10, name: 'Cháy phim', calm: true },
  { id: 13, name: 'Lá sách' }, { id: 9, name: 'Ngôi sao' }, { id: 6, name: 'Ô vuông' }, { id: 7, name: 'Đẩy ngang' },
  { id: 3, name: 'Gợn nước' }, { id: 11, name: 'Xoay zoom' }, { id: 12, name: 'Nhiễu RGB' }, { id: 16, name: 'Cắt lát' },
];

const PARTICLES = {
  confetti: 'Pháo giấy', balloons: 'Bóng bay', sparkles: 'Lấp lánh', petals: 'Cánh hoa', hearts: 'Trái tim', bokeh: 'Đốm sáng', dust: 'Bụi phim',
};

// Collage frames as [x, y, w, h] fractions of the canvas, keyed by photo count; capY = caption centre.
const LAYOUTS = {
  portrait: { capY: .88,
    2: [[.08, .06, .84, .34], [.08, .42, .84, .34]],
    3: [[.08, .06, .84, .36], [.08, .44, .41, .33], [.51, .44, .41, .33]],
    4: [[.08, .06, .41, .34], [.51, .06, .41, .34], [.08, .42, .41, .34], [.51, .42, .41, .34]],
    5: [[.08, .06, .41, .30], [.51, .06, .41, .30], [.08, .38, .27, .38], [.365, .38, .27, .38], [.65, .38, .27, .38]] },
  landscape: { capY: .885,
    2: [[.1, .07, .39, .71], [.51, .07, .39, .71]],
    3: [[.06, .07, .5, .71], [.58, .07, .36, .345], [.58, .435, .36, .345]],
    4: [[.06, .07, .21, .71], [.29, .07, .21, .71], [.52, .07, .21, .71], [.75, .07, .21, .71]],
    5: [[.06, .07, .36, .345], [.06, .435, .36, .345], [.44, .07, .24, .71], [.70, .07, .24, .345], [.70, .435, .24, .345]] },
};

const POP = ['#ff5d8f', '#ffd84d', '#5ce1e6', '#b69cff', '#7ee081'];
const PETAL = ['#ffd6e0', '#ffc2d1', '#fff0f3', '#f8b4c4', '#fde2e4'];
const LYRIC_PALETTES = [['#ec5a1e', '#1f6e30'], ['#e2336b', '#2563c9'], ['#7b3fe4', '#f08a00'], ['#0f8f8a', '#e8501c']];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const easeInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOut = x => 1 - Math.pow(1 - x, 3);
const easeOutBack = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
