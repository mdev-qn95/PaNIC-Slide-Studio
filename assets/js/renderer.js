// WebGL renderer. Pass 1 composes each slide from textured quads ("layers") into its own framebuffer;
// pass 2 runs the transition between two slide framebuffers, grades colour and adds the 2D overlay.

let W = 1920, H = 1080;
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false });

const LAYER_VS = `#version 300 es
uniform vec2 uRes; uniform vec4 uRect; uniform float uRot, uScale, uPad;
out vec2 vLocal;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2. - 1.;
  vLocal = c * (uRect.zw * .5 + uPad);
  float s = sin(uRot), k = cos(uRot);
  vec2 p = mat2(k, s, -s, k) * vLocal * uScale + uRect.xy;
  gl_Position = vec4(p.x / uRes.x * 2. - 1., 1. - p.y / uRes.y * 2., 0., 1.);
}`;
const LAYER_FS = `#version 300 es
precision highp float;
in vec2 vLocal; out vec4 o;
uniform sampler2D uTex;
uniform vec4 uRect;
uniform vec2 uImg, uPan;
uniform int uMode;
uniform float uAlpha, uLod, uDim, uBorder, uRadius, uShadow, uZoom, uReveal, uShine, uEdge;
uniform vec3 uBorderColor;
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
void main() {
  vec2 hs = uRect.zw * .5;
  if (uMode == 1) { // caption sprite (premultiplied) with a soft left-to-right reveal
    vec2 uv = vLocal / uRect.zw + .5;
    o = texture(uTex, uv) * (1. - smoothstep(uReveal * 1.3 - .3, uReveal * 1.3, uv.x)) * uAlpha;
    return;
  }
  float d = sdBox(vLocal, hs, uRadius), inside = 1. - smoothstep(-1., .5, d);
  vec2 ih = max(hs - uBorder, vec2(1.));
  float di = sdBox(vLocal, ih, max(uRadius - uBorder, 0.)), photoM = 1. - smoothstep(-1., .5, di);
  float ia = uImg.x / uImg.y, ba = ih.x / ih.y; // cover-fit the photo inside the border, then Ken Burns
  vec2 p = vLocal / (ih * 2.);
  if (ia > ba) p.x *= ba / ia; else p.y *= ia / ba;
  vec2 vis = vec2(min(1., ba / ia), min(1., ia / ba)) / uZoom;
  p = p / uZoom + uPan * (1. - vis) * .5 + .5;
  vec3 col = (uLod > 0. ? textureLod(uTex, p, uLod) : texture(uTex, p)).rgb * uDim;
  if (uShine > 0. && uShine < 1.) {
    float x = dot(vLocal / (hs * 2.), normalize(vec2(1., -.6)));
    col += vec3(1., .97, .9) * exp(-pow((x - mix(-.9, .9, uShine)) * 7., 2.)) * .35;
  }
  col = mix(col, vec3(1.), uEdge * (1. - smoothstep(0., 1.6, abs(di + 1.4)))); // hairline highlight on the photo edge
  col = mix(uBorderColor, col, photoM);
  float sh = uShadow > 0. ? (1. - smoothstep(-uShadow * .2, uShadow, d)) * .5 : 0.;
  o = vec4(col * inside, inside + (1. - inside) * sh) * uAlpha;
}`;

const VS = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uA, uB, uO;
uniform float uP, uTime, uAspect;
uniform vec2 uRes;
uniform int uTr;
uniform vec3 uTint;
uniform float uSat, uCon, uLift, uSepia, uGrain, uVig, uGlow, uFade, uFlicker;
const float PI = 3.14159265;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.; a *= .5; } return v; }
float ease(float x) { return x < .5 ? 4. * x * x * x : 1. - pow(-2. * x + 2., 3.) / 2.; }
float dot2(vec2 v) { return dot(v, v); }
float sdHeart(vec2 p) { p.x = abs(p.x);
  if (p.y + p.x > 1.) return sqrt(dot2(p - vec2(.25, .75))) - sqrt(2.) / 4.;
  return sqrt(min(dot2(p - vec2(0., 1.)), dot2(p - .5 * max(p.x + p.y, 0.)))) * sign(p.x - p.y); }
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(.809016994, -.587785252), k2 = vec2(-.809016994, -.587785252);
  p.x = abs(p.x); p -= 2. * max(dot(k1, p), 0.) * k1; p -= 2. * max(dot(k2, p), 0.) * k2; p.x = abs(p.x); p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1); float h = clamp(dot(p, ba) / dot(ba, ba), 0., r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y); }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
// Explicit LOD 0: several transitions sample under non-uniform branches, where implicit derivatives are undefined.
vec3 A(vec2 u) { return textureLod(uA, u, 0.).rgb; }
vec3 B(vec2 u) { return textureLod(uB, u, 0.).rgb; }

vec3 transition(vec2 uv, float p) {
  if (p < .002) return A(uv);
  if (p > .998) return B(uv);
  float s = sin(p * PI);
  vec2 asp = vec2(uAspect, 1.), c = uv - .5, cc = c * asp;
  float d = length(cc);
  if (uTr == 0) { // cross zoom with radial blur
    vec3 a = vec3(0), b = vec3(0);
    for (int i = 0; i < 6; i++) { float f = 1. - float(i) * .014 * s;
      a += A(c * (1. - .12 * p) * f + .5); b += B(c * (1. - .12 * (1. - p)) * f + .5); }
    return mix(a, b, smoothstep(.3, .7, p)) / 6.;
  }
  if (uTr == 1) { // circle iris
    float r = p * 1.25, m = 1. - smoothstep(r - .04, r, d);
    return mix(A(uv), B(uv), m) + vec3(1., .9, .8) * exp(-abs(d - r) * 60.) * .35 * s;
  }
  if (uTr == 2) { // soft diagonal wipe with light edge
    float e = dot(c, normalize(vec2(1., .35))) + .5, x = mix(-.25, 1.25, p);
    float m = 1. - smoothstep(x - .12, x + .12, e);
    return mix(A(uv), B(uv), m) + vec3(1., .85, .65) * exp(-pow((e - x) * 8., 2.)) * .35 * s;
  }
  if (uTr == 3) { // ripple
    vec2 u2 = uv + normalize(cc + 1e-5) * sin(d * 35. - p * 25.) * .025 * s / asp;
    return mix(A(u2), B(u2), smoothstep(.2, .8, p));
  }
  if (uTr == 4) { // swirl
    vec2 u2 = rot(s * 2.5 * max(0., 1. - d * 1.2)) * cc / asp + .5;
    return mix(A(u2), B(u2), smoothstep(.35, .65, p));
  }
  if (uTr == 5) { // light leak
    vec3 col = mix(A(uv), B(uv), smoothstep(.25, .75, p));
    float lx = mix(-.4, 1.4, p);
    vec3 leak = vec3(1., .55, .25) * exp(-pow((uv.x - lx) * 2.2, 2.))
              + vec3(1., .35, .45) * exp(-pow((uv.x - lx + .35) * 3., 2.)) * .6 * (1. - uv.y * .5);
    return mix(col + leak * s * .9, vec3(1., .95, .88), s * s * .35);
  }
  if (uTr == 6) { // squares pop in
    vec2 g = vec2(16., 9.) * (uAspect > 1. ? vec2(1.) : vec2(9. / 16., 16. / 9.)), cell = floor(uv * g), f = fract(uv * g) - .5;
    float t = ease(clamp((p - hash(cell) * .6) / .4, 0., 1.));
    return mix(A(uv), B(uv), step(max(abs(f.x), abs(f.y)), t * .5 + .0001));
  }
  if (uTr == 7) { // push with motion blur
    vec3 col = vec3(0);
    for (int i = 0; i < 5; i++) { float x = uv.x + p + (float(i) / 4. - .5) * s * .035;
      col += mix(A(vec2(x, uv.y)), B(vec2(x - 1., uv.y)), step(1., x)); }
    return col / 5.;
  }
  if (uTr == 8) { // heart iris
    float sc = .001 + pow(p, 1.6) * 3.6, hd = sdHeart(cc / sc + vec2(0., .5)) * sc;
    return mix(A(uv), B(uv), 1. - smoothstep(-.01, .01, hd)) + vec3(1., .6, .7) * exp(-abs(hd) * 50.) * .5 * s;
  }
  if (uTr == 9) { // spinning star iris
    float sd = sdStar5(rot(p * 1.5) * cc, pow(p, 1.5) * 2.8, .45);
    return mix(A(uv), B(uv), 1. - smoothstep(-.01, .01, sd)) + vec3(1., .85, .3) * exp(-abs(sd) * 40.) * .6 * s;
  }
  if (uTr == 10) { // film burn
    float n = fbm(cc * 3.), x = mix(-.1, 1.1, p);
    float m = 1. - smoothstep(x - .05, x, n), edge = (1. - smoothstep(x, x + .08, n)) * (1. - m);
    return mix(A(uv) * (1. - edge * .5), B(uv), m) + vec3(1., .45, .1) * edge * 1.6;
  }
  if (uTr == 11) { // spin zoom: A whips in, B unwinds out
    float ang = (p < .5 ? p : p - 1.) * 2.4; vec3 col = vec3(0);
    for (int i = 0; i < 6; i++) { vec2 u2 = rot(ang) * cc * (1. - float(i) * .03 * s) / (1. + s * 1.2) / asp + .5;
      col += p < .5 ? A(u2) : B(u2); }
    return col / 6.;
  }
  if (uTr == 12) { // RGB glitch
    float n = hash(vec2(floor(uv.y * 24.), floor(p * 20.)));
    vec2 u2 = vec2(uv.x + (n - .5) * .25 * s * step(.4, n), uv.y), o = vec2(.012 * s, 0.);
    float m = step(.5, p + (n - .5) * .3 * s);
    vec3 a = vec3(A(u2 + o).r, A(u2).g, A(u2 - o).b), b = vec3(B(u2 + o).r, B(u2).g, B(u2 - o).b);
    return mix(a, b, m) + (hash(uv * vec2(300., 8.) + p) - .5) * .15 * s;
  }
  if (uTr == 13) { // blinds
    float k = floor(uv.x * 10.), t = ease(clamp(p * 1.6 - k * .06, 0., 1.)), f = fract(uv.x * 10.);
    return mix(A(uv), B(uv), step(f, t)) + vec3(1., .95, .85) * exp(-abs(f - t) * 80.) * .3 * s * step(t, .999);
  }
  if (uTr == 14) { // dreamy blur dissolve
    float lod = s * 5.5;
    return mix(textureLod(uA, uv, lod).rgb, textureLod(uB, uv, lod).rgb, smoothstep(.3, .7, p)) * (1. + .15 * s);
  }
  if (uTr == 15) { // doors open onto B
    float e = ease(p), l = uv.x + e * .5, r = uv.x - e * .5;
    vec3 b = B((uv - .5) / (1.15 - .15 * e) + .5) * (.6 + .4 * e);
    if (uv.x < .5) return l < .5 ? A(vec2(l, uv.y)) * (1. - .35 * smoothstep(.4, .5, l)) : b;
    return r > .5 ? A(vec2(r, uv.y)) * (1. - .35 * (1. - smoothstep(.5, .6, r))) : b;
  }
  if (uTr == 16) { // diagonal slices slide away
    float k = floor((uv.x + uv.y * .3) * 6.), e = ease(clamp(p * 1.4 - k * .06, 0., 1.));
    vec2 ua = uv + vec2(0., (mod(k, 2.) * 2. - 1.) * e * 1.2);
    return mix(B(uv) * (.7 + .3 * e), A(ua), step(0., ua.y) * step(ua.y, 1.));
  }
  return mix(A(uv), B(uv), p);
}

void main() {
  vec2 uv = vUv;
  vec3 col;
  if (uTr < 0) col = A(uv); else col = transition(uv, uP);
  if (uGlow > 0.) {
    vec3 g = textureLod(uA, uv, 4.).rgb;
    if (uTr >= 0) g = mix(g, textureLod(uB, uv, 4.).rgb, uP);
    col += max(g - .5, 0.) * uGlow * 2.;
  }
  col *= uTint;
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(l), col, uSat);
  col = mix(col, vec3(l) * vec3(1.07, .74, .43) * 1.2, uSepia);
  col = (col - .5) * uCon + .5 + uLift;
  col *= 1. - uVig * smoothstep(.25, .85, length((uv - .5) * vec2(1., .85)) * 1.25);
  col *= 1. + uFlicker * (hash(vec2(floor(uTime * 24.), 7.)) - .5);
  vec4 ov = texture(uO, vec2(uv.x, 1. - uv.y));
  col = mix(col, ov.rgb, ov.a);
  col += (hash(uv * uRes + fract(uTime) * 100.) - .5) * uGrain;
  outColor = vec4(clamp(col, 0., 1.) * uFade, 1.);
}`;

function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function link(vs, fs, names) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return [p, u];
}
function makeTex(src, mip) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function makeTarget() { // mipmapped so the final pass can blur it cheaply
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(W, H))) + 1, gl.RGBA8, W, H);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb };
}

let prog, U, layerProg, L, ovTex, tgtA, tgtB, blackTex, glError = '';
try {
  if (!gl) throw new Error('Trình duyệt không hỗ trợ WebGL2');
  [prog, U] = link(VS, FS, ['uA', 'uB', 'uO', 'uP', 'uTime', 'uAspect', 'uRes', 'uTr', 'uTint', 'uSat', 'uCon', 'uLift',
    'uSepia', 'uGrain', 'uVig', 'uGlow', 'uFade', 'uFlicker']);
  [layerProg, L] = link(LAYER_VS, LAYER_FS, ['uRes', 'uRect', 'uRot', 'uScale', 'uPad', 'uTex', 'uImg', 'uPan', 'uMode', 'uAlpha',
    'uLod', 'uDim', 'uBorder', 'uRadius', 'uShadow', 'uZoom', 'uReveal', 'uShine', 'uEdge', 'uBorderColor']);
  gl.useProgram(prog); gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uO, 2);
  gl.useProgram(layerProg); gl.uniform1i(L.uTex, 0);
  gl.bindVertexArray(gl.createVertexArray());
  blackTex = makeTex(new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1), false);
} catch (e) { prog = null; glError = e.message; console.error(e); }

function setAspect(key) {
  [W, H] = key === 'portrait' ? [1080, 1920] : [1920, 1080];
  canvas.width = ov.width = W; canvas.height = ov.height = H;
  const scr = document.getElementById('screen');
  if (scr) { scr.style.setProperty('--ar', W / H); scr.dataset.orient = W > H ? 'landscape' : 'portrait'; }
  if (prog) {
    for (const tg of [tgtA, tgtB]) if (tg) { gl.deleteTexture(tg.tex); gl.deleteFramebuffer(tg.fb); }
    tgtA = makeTarget(); tgtB = makeTarget();
    if (ovTex) gl.deleteTexture(ovTex);
    ovTex = makeTex(ov, false);
    gl.useProgram(prog); gl.uniform1f(U.uAspect, W / H); gl.uniform2f(U.uRes, W, H);
    gl.useProgram(layerProg); gl.uniform2f(L.uRes, W, H);
  }
  clearCaps(); resetTitleCache(); resetParticles();
}

// ---------- Photos (decoded lazily, only the nearby slides live on the GPU) ----------
const cache = new Map();
const photoAt = i => i === 'cover' ? coverPhoto : photos[i]; // 'cover' = the separately chosen cover image
function ensure(i) {
  if (!photoAt(i) || cache.has(i)) return cache.get(i);
  const entry = { ready: false };
  entry.promise = (async () => {
    try {
      let bmp = await createImageBitmap(photoAt(i).file);
      const s = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
      if (s < 1) {
        const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * s), resizeHeight: Math.round(bmp.height * s), resizeQuality: 'high' });
        bmp.close(); bmp = small;
      }
      Object.assign(entry, { tex: makeTex(bmp, true), w: bmp.width, h: bmp.height });
      bmp.close();
    } catch {
      Object.assign(entry, { tex: blackTex, w: 16, h: 9, shared: true });
      toast(`Không đọc được ảnh "${photoAt(i)?.file.name}" (HEIC? hãy đổi sang JPG)`, 'warn');
    }
    if (cache.get(i) !== entry && !entry.shared) gl.deleteTexture(entry.tex);
    entry.ready = true; dirty = true;
  })();
  cache.set(i, entry);
  return entry;
}
function evict(keepFrom, keepTo) { // evict(Infinity, -1) clears everything
  for (const [k, e] of cache) if (typeof k !== 'number' || k < keepFrom || k > keepTo) {
    if (e.ready && !e.shared) gl.deleteTexture(e.tex);
    cache.delete(k);
  }
}

// Captions ("JUST / married") are drawn once per slide into a texture, then revealed in the layer shader.
const capCache = new Map();
function clearCaps() { for (const c of capCache.values()) gl?.deleteTexture(c.tex); capCache.clear(); }
function captionTex(si) {
  let c = capCache.get(si);
  if (c) return c;
  const [top, bottom] = plan[si].cap, st = STYLES[opts.style], u = Math.min(W, H) * (H > W ? 1.25 : 1);
  const cv = document.createElement('canvas'), x = cv.getContext('2d'), cw = Math.round(W * .84);
  const TOP = top.trim().toUpperCase(), s1 = u * .042, sp = s1 * .35, pad = u * .025, gap = u * .014;
  // Lines are stacked from their real ink extents: Vietnamese stacked accents (ổ, ẫ) rise well above the em box.
  x.font = st.cap.top(s1); x.letterSpacing = sp + 'px';
  const m1 = TOP && x.measureText(TOP);
  x.letterSpacing = '0px';
  let s2 = u * .085;
  x.font = st.cap.bottom(s2);
  let m2 = x.measureText(bottom);
  if (m2.width > cw * .95) { s2 *= cw * .95 / m2.width; x.font = st.cap.bottom(s2); m2 = x.measureText(bottom); }
  const y1 = pad + (m1 ? m1.actualBoundingBoxAscent : 0);
  const y2 = (m1 ? y1 + m1.actualBoundingBoxDescent + gap : pad) + m2.actualBoundingBoxAscent;
  const oy = y2 + m2.actualBoundingBoxDescent + gap * 1.3, ow = u * .12, lw = Math.max(1.5, u * .002);
  cv.width = cw; cv.height = Math.ceil(oy + u * .01 + pad); // resizing resets the context, so draw after
  const ch = cv.height;
  Object.assign(x, { textAlign: 'center', textBaseline: 'alphabetic', shadowColor: 'rgba(0,0,0,.45)', shadowBlur: u * .02 });
  if (m1) { x.font = st.cap.top(s1); x.letterSpacing = sp + 'px'; x.fillStyle = st.cap.color; x.fillText(TOP, cw / 2 + sp / 2, y1); }
  x.letterSpacing = '0px'; x.font = st.cap.bottom(s2); x.fillStyle = st.cap.color2;
  x.fillText(bottom, cw / 2, y2);
  x.shadowBlur = 0; x.globalAlpha = .8; x.fillStyle = st.cap.color;
  x.fillRect(cw / 2 - ow - u * .02, oy, ow, lw); x.fillRect(cw / 2 + u * .02, oy, ow, lw);
  x.beginPath(); x.arc(cw / 2, oy + lw / 2, u * .005, 0, 7); x.fill();
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  c = { tex: makeTex(cv, false), w: cw, h: ch };
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  capCache.set(si, c);
  return c;
}

function slideParams(j) {
  let seed = j * 7919 + 13;
  const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const a = r() * Math.PI * 2, from = [Math.cos(a), Math.sin(a)];
  return { zin: j % 2 === 0, from, to: [-from[0] * .6 + (r() - .5) * .4, -from[1] * .6 + (r() - .5) * .4], tilt: r() * 2 - 1 };
}

function layer(o) {
  gl.bindTexture(gl.TEXTURE_2D, o.tex);
  gl.uniform4f(L.uRect, o.cx, o.cy, o.w, o.h);
  gl.uniform1f(L.uRot, o.rot || 0); gl.uniform1f(L.uScale, o.scale ?? 1); gl.uniform1f(L.uPad, (o.shadow || 0) * 1.2);
  gl.uniform1i(L.uMode, o.mode || 0); gl.uniform1f(L.uAlpha, o.alpha ?? 1);
  gl.uniform1f(L.uLod, o.lod || 0); gl.uniform1f(L.uDim, o.dim ?? 1);
  gl.uniform1f(L.uBorder, o.border || 0); gl.uniform1f(L.uRadius, o.radius || 0); gl.uniform1f(L.uShadow, o.shadow || 0);
  gl.uniform1f(L.uZoom, o.zoom || 1); gl.uniform2fv(L.uPan, o.pan || [0, 0]); gl.uniform2f(L.uImg, o.iw, o.ih);
  gl.uniform1f(L.uReveal, o.reveal ?? 1); gl.uniform1f(L.uShine, o.shine ?? -1); gl.uniform1f(L.uEdge, o.edge || 0);
  gl.uniform3fv(L.uBorderColor, o.color || [1, 1, 1]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
const bgLayer = (e, k) => layer({ tex: e.tex, iw: e.w, ih: e.h, cx: W / 2, cy: H / 2, w: W + 4, h: H + 4, zoom: 1.1 + .08 * k, lod: 5, dim: .45 });

// How a collage frame flies in (q = entrance progress 0..1).
function frameAnim(kind, q, tilt, lt, j) {
  const e = easeOut(q), drift = Math.sin(lt * .8 + j * 1.7) * 4;
  if (kind === 'pop') return { dy: drift, scale: .5 + .5 * easeOutBack(q), rot: (1 - e) * -.25 + tilt * .03, alpha: Math.min(1, q * 2) };
  if (kind === 'drop') return { dy: -(1 - e) * 140 + drift, scale: 1.08 - .08 * e, rot: (1 - e) * .2 + tilt * .035, alpha: e };
  return { dy: (1 - e) * 80 + drift, scale: .94 + .06 * e, rot: 0, alpha: e };
}

// ---------- Cover (slide 0): the photo framed on one side, the title on the other ----------
// Landscape: photo right-aligned in the right half, text column on the left. Portrait: photo on top, text below.
let coverBox = null; // read by the overlay to place the opening title next to the photo
function coverLayout(iw, ih) {
  const land = W >= H;
  const box = land ? { x0: W * .5, x1: W * .93, y0: H * .14, y1: H * .86 } : { x0: W * .09, x1: W * .91, y0: H * .12, y1: H * .6 };
  const s = Math.min((box.x1 - box.x0) / iw, (box.y1 - box.y0) / ih), pw = iw * s, ph = ih * s;
  const cx = land ? box.x1 - pw / 2 : W / 2, cy = (box.y0 + box.y1) / 2;
  if (land) { const left = W * .06, right = cx - pw / 2 - W * .045; return { cx, cy, pw, ph, tx: (left + right) / 2, ty: H * .5, tw: right - left, land }; }
  const top = cy + ph / 2, bottom = H * .92;
  return { cx, cy, pw, ph, tx: W / 2, ty: (top + bottom) / 2, tw: W * .86, land };
}
function drawCover(e, st, lt, kk, unit) {
  const cv = st.cover || { frame: 'soft', tilt: 0, mat: [1, 1, 1] }, fr = FRAMES[cv.frame] || FRAMES.soft;
  const L0 = coverBox = coverLayout(e.w, e.h), q = easeOut(clamp(lt / 1.6));
  bgLayer(e, kk);
  const b = (fr.border || 0) * unit * (cv.frame === 'thin' ? 2.6 : 1.4);
  layer({ tex: e.tex, iw: e.w, ih: e.h, cx: L0.cx, cy: L0.cy + (1 - q) * 30 * unit, w: L0.pw + 2 * b, h: L0.ph + 2 * b,
    border: b, radius: fr.radius * unit, shadow: fr.shadow * unit * 1.6, edge: fr.edge, color: cv.mat,
    rot: cv.tilt * q, scale: .93 + .07 * q, alpha: clamp(lt / .9), zoom: 1 + .07 * kk, pan: [.12 * kk, -.08 * kk],
    shine: st.shine ? clamp((lt - 2.2) / 1.3) : -1 });
}

// lt = seconds since this slide became visible, k = 0..1 across its whole visible span.
function drawSlide(si, lt, k) {
  const s = plan[si], st = STYLES[opts.style], unit = Math.min(W, H) / 1080, kk = easeInOut(clamp(k));
  if (s.cover) return drawCover(cache.get(s.photos[0]), st, lt, kk, unit);
  const pick = FRAMES[opts.frame] || FRAMES.soft, fr = pick.mix ? FRAMES[pick.mix[s.look % pick.mix.length]] : pick;
  const ph = s.photos.map(j => cache.get(j));
  const frameLook = { border: fr.border * unit, radius: fr.radius * unit, shadow: fr.shadow * unit, edge: fr.edge, color: st.frameColor };
  if (s.photos.length === 1) {
    const e = ph[0], sp = slideParams(s.photos[0] + (s.repeat ? si * 97 : 0)), r = (e.w / e.h) / (W / H);
    if (r > .72 && r < 1.4) {
      layer({ tex: e.tex, iw: e.w, ih: e.h, cx: W / 2, cy: H / 2, w: W + 4, h: H + 4,
        zoom: sp.zin ? 1 + .16 * kk : 1.16 - .16 * kk, pan: lerp2(sp.from, sp.to, kk) });
    } else { // aspect too different to crop: framed photo on a blurred copy of itself
      bgLayer(e, kk);
      const fit = Math.min(W * .86 / e.w, H * .86 / e.h), b = frameLook.border * .6;
      layer({ ...frameLook, tex: e.tex, iw: e.w, ih: e.h, cx: W / 2, cy: H / 2, w: e.w * fit + 2 * b, h: e.h * fit + 2 * b,
        border: b, shadow: frameLook.shadow * 1.4, scale: sp.zin ? 1 + .05 * kk : 1.05 - .05 * kk });
    }
    return;
  }
  bgLayer(ph[0], kk);
  const lay = LAYOUTS[H > W ? 'portrait' : 'landscape'];
  let rects = lay[s.photos.length];
  if (!s.cap) { // no caption: stretch the frames down into the space it would have used
    const top = rects[0][1], bottom = Math.max(...rects.map(r => r[1] + r[3])), f = (1 - 2 * top) / (bottom - top);
    rects = rects.map(([x, y, w, h]) => [x, top + (y - top) * f, w, h * f]);
  }
  rects.forEach(([x, y, w, h], j) => {
    const e = ph[j], sp = slideParams(s.photos[j] + (s.repeat ? si * 97 : 0));
    const a = frameAnim(st.frameAnim, clamp((lt - .3 - j * .18) / .9), sp.tilt, lt, j);
    layer({ ...frameLook, tex: e.tex, iw: e.w, ih: e.h, cx: (x + w / 2) * W, cy: (y + h / 2) * H + a.dy * unit, w: w * W, h: h * H,
      rot: a.rot, scale: a.scale, alpha: a.alpha, zoom: 1.04 + .08 * kk, pan: lerp2(sp.from, sp.to, kk).map(v => v * .5),
      shine: st.shine ? clamp((lt - 1.5 - j * .15) / 1.1) : -1 });
  });
  if (!s.cap) return;
  // caption sits just under the frames, shrinking if needed to clear the bottom lyrics band
  const cap = captionTex(si), cq = clamp((lt - .5 - rects.length * .18) / 1.4);
  const framesBottom = Math.max(...rects.map(r => r[1] + r[3])) * H + 4 * unit;
  const avail = H - framesBottom - lyricBand() - 6 * unit, f = Math.min(1, avail / cap.h);
  layer({ mode: 1, tex: cap.tex, iw: cap.w, ih: cap.h, cx: W / 2, cy: framesBottom + cap.h * f / 2 + (1 - easeOut(cq)) * 20 * unit,
    w: cap.w * f, h: cap.h * f, alpha: clamp(cq * 1.5), reveal: easeOut(cq) });
}
function drawSlideTo(tg, si, t, tm) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fb);
  gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  const lt = t - (tm.starts[si] - tm.T);
  drawSlide(si, lt, lt / (tm.durs[si] + tm.T));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, tg.tex); gl.generateMipmap(gl.TEXTURE_2D);
}

// Which slide is on screen at time t, and transition progress p into the next one (-1 = none).
function timeline(t, starts, durs, T) {
  let i = 0;
  while (i < starts.length - 1 && t >= starts[i + 1]) i++;
  const local = t - starts[i];
  return { i, p: i < starts.length - 1 && local > durs[i] - T ? (local - (durs[i] - T)) / T : -1 };
}
{ const s = [0, 5, 12], d = [5, 7, 5];
  console.assert(timeline(0, s, d, 1).p === -1 && timeline(4.5, s, d, 1).p === .5 && timeline(5, s, d, 1).i === 1
    && timeline(11.5, s, d, 1).p === .5 && timeline(16.9, s, d, 1).p === -1 && timeline(17, s, d, 1).i === 2, 'timeline'); }

function renderFrame(t, dt, tm) {
  const n = plan.length, black = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  if (!prog) return;
  if (!n) return black();
  const { i, p } = timeline(Math.min(t, tm.total - 1e-3), tm.starts, tm.durs, tm.T);
  for (let j = i; j <= Math.min(n - 1, i + 2); j++) plan[j].photos.forEach(ensure);
  // repeated photos make indices non-monotonic, so keep exactly what the nearby slides use
  const keep = new Set(plan.slice(Math.max(0, i - 1), i + 3).flatMap(s => s.photos));
  for (const [k, e] of cache) if (!keep.has(k)) { if (e.ready && !e.shared) gl.deleteTexture(e.tex); cache.delete(k); }
  for (const [k, c] of capCache) if (k < i - 1 || k > i + 2) { gl.deleteTexture(c.tex); capCache.delete(k); }
  const ready = si => plan[si].photos.every(j => cache.get(j)?.ready);
  if (!ready(i)) { dirty = true; return black(); }
  const useB = p >= 0 && ready(i + 1), gr = FILTERS[opts.filter] || FILTERS.natural;

  gl.useProgram(layerProg); gl.activeTexture(gl.TEXTURE0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  drawSlideTo(tgtA, i, t, tm);
  if (useB) drawSlideTo(tgtB, i + 1, t, tm);
  gl.disable(gl.BLEND);

  drawOverlay(t, dt, tm, i);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
  gl.useProgram(prog);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tgtA.tex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (useB ? tgtB : tgtA).tex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ovTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, ov);
  const trs = opts.transitions.length ? opts.transitions : [14];
  gl.uniform1i(U.uTr, useB ? trs[i % trs.length] : -1);
  gl.uniform1f(U.uP, useB ? easeInOut(p) : 0);
  gl.uniform1f(U.uTime, t);
  gl.uniform3fv(U.uTint, gr.tint);
  for (const [u, v] of [['uSat', gr.sat], ['uCon', gr.con], ['uLift', gr.lift], ['uSepia', gr.sepia], ['uGrain', gr.grain],
    ['uVig', gr.vig], ['uGlow', gr.glow], ['uFlicker', gr.flicker]]) gl.uniform1f(U[u], v);
  gl.uniform1f(U.uFade, clamp(t / .6) * clamp((tm.total - t) / 1.2));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return i;
}
