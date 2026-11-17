// Pedestrians dressed as people on a Chennai street. A rigged human (head, hands, skeleton; Mixamo-compatible)
// is re-clothed with procedurally built, skinned garments: sarees with pallu, salwar kameez with dupatta,
// shirts with veshti, lungi or trousers; South Indian skin tones, black hair, plaits with jasmine, moustaches.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSETS } from './assets.js';

const SKIN = [0xa9744f, 0x96643f, 0xb58058, 0x855638, 0x9c6a46, 0x7a4d32, 0xa06c48];
const SHIRT = [0xf4f4f0, 0xbcd0e6, 0xe9dcc0, 0x86a3c4, 0xd8d8d8, 0xa9b678, 0xf1c9a5, 0x7d8da0, 0xc8553a, 0x4f6fa3, 0xf3e08a, 0x9ad0c0];
const TROUSER = [0x2b3445, 0x3a3a3a, 0x6b5a45, 0x1f2a3a, 0x4a4f57, 0x7a6a52];
const KAMEEZ = [0xd8436b, 0x2f9a8a, 0xf0a030, 0x6a4fb0, 0x2f78c0, 0xe0607a, 0x4caf50, 0xf2d24a, 0xb03060, 0x20a0b0];
// saree body / border pairs seen everywhere in Tamil Nadu: Kanchipuram-style contrast borders
const SAREES = [['#b3123b', '#e0b030'], ['#1f7a4a', '#d9a520'], ['#e09a10', '#8a1538'], ['#5b2a86', '#e6b422'], ['#0e6a9a', '#f0c040'], ['#d81b60', '#2e7d32'], ['#f2c21a', '#b3123b'], ['#2aa198', '#7a1f5c']];
const LUNGIS = [['#2a5d9a', '#e8eef5'], ['#2e6b4a', '#7a2030'], ['#6a2a3a', '#d8c9a0']];

const CELL = 256, GRID = 4;
// atlas cells: 0-7 sarees, 8 plain white (tinted by vertex colour), 9 striped shirt, 10 checked shirt, 11 printed kameez,
// 12-14 lungis, 15 veshti
function cellRect(i) { const c = i % GRID, r = Math.floor(i / GRID), e = 2 / (CELL * GRID); return [c / GRID + e, 1 - (r + 1) / GRID + e, 1 / GRID - 2 * e, 1 / GRID - 2 * e]; }
let atlasMat = null;
function clothMaterial() {
  if (atlasMat) return atlasMat;
  const cv = document.createElement('canvas'); cv.width = cv.height = CELL * GRID; const g = cv.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cell = (i, fn) => { g.save(); g.translate((i % GRID) * CELL, Math.floor(i / GRID) * CELL); g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip(); fn(); g.restore(); };
  SAREES.forEach(([body, border], i) => cell(i, () => {
    g.fillStyle = body; g.fillRect(0, 0, CELL, CELL);
    // small woven butta motifs
    g.fillStyle = border; g.globalAlpha = 0.75; for (let y = 14; y < 200; y += 26) for (let x = (y / 26 % 2) * 13 + 6; x < CELL; x += 26) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // pleats falling at the front (u = 0.5)
    for (let k = -4; k <= 4; k++) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(CELL / 2 + k * 9, 40, 2, CELL - 40); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(CELL / 2 + k * 9 + 3, 40, 2, CELL - 40); }
    // zari border along the hem
    g.fillStyle = border; g.fillRect(0, CELL - 40, CELL, 40);
    g.fillStyle = '#f4d77a'; g.fillRect(0, CELL - 44, CELL, 4); g.fillRect(0, CELL - 12, CELL, 3);
    g.fillStyle = 'rgba(255,235,160,0.8)'; for (let x = 4; x < CELL; x += 12) { g.beginPath(); g.moveTo(x, CELL - 18); g.lineTo(x + 5, CELL - 32); g.lineTo(x + 10, CELL - 18); g.fill(); }
  }));
  cell(8, () => { g.fillStyle = '#fff'; g.fillRect(0, 0, CELL, CELL); });
  cell(9, () => { g.fillStyle = '#fff'; g.fillRect(0, 0, CELL, CELL); g.fillStyle = 'rgba(40,50,80,0.35)'; for (let x = 0; x < CELL; x += 10) g.fillRect(x, 0, 2, CELL); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(CELL / 2 - 1, 0, 2, CELL); });
  cell(10, () => { g.fillStyle = '#fff'; g.fillRect(0, 0, CELL, CELL); g.fillStyle = 'rgba(30,40,70,0.28)'; for (let x = 0; x < CELL; x += 14) g.fillRect(x, 0, 4, CELL); for (let y = 0; y < CELL; y += 14) g.fillRect(0, y, CELL, 4); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(CELL / 2 - 1, 0, 2, CELL); });
  cell(11, () => { g.fillStyle = '#fff'; g.fillRect(0, 0, CELL, CELL); for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,180' : '40,20,60'},0.35)`; g.beginPath(); g.arc(rnd() * CELL, rnd() * CELL, 2 + rnd() * 3, 0, 7); g.fill(); } g.fillStyle = 'rgba(250,210,90,0.9)'; g.fillRect(0, CELL - 14, CELL, 8); g.fillRect(0, 6, CELL, 5); });
  LUNGIS.forEach(([a, b], i) => cell(12 + i, () => { g.fillStyle = a; g.fillRect(0, 0, CELL, CELL); g.fillStyle = b; g.globalAlpha = 0.55; for (let x = 0; x < CELL; x += 32) { g.fillRect(x, 0, 6, CELL); g.fillRect(x + 12, 0, 2, CELL); } for (let y = 0; y < CELL; y += 32) { g.fillRect(0, y, CELL, 6); g.fillRect(0, y + 12, CELL, 2); } g.globalAlpha = 1; }));
  cell(15, () => { g.fillStyle = '#f6f4ec'; g.fillRect(0, 0, CELL, CELL); for (let x = 0; x < CELL; x += 22) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(x, 0, 3, CELL); } g.fillStyle = '#c9a227'; g.fillRect(0, CELL - 16, CELL, 6); g.fillStyle = '#1f6b3a'; g.fillRect(0, CELL - 10, CELL, 10); g.fillStyle = '#c9a227'; g.fillRect(CELL / 2 + 22, 0, 4, CELL); g.fillStyle = '#1f6b3a'; g.fillRect(CELL / 2 + 26, 0, 7, CELL); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  atlasMat = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
  return atlasMat;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// rest-pose joint positions of the rig (metres; x = character's left, z = forward)
const J = { hips: [0, 1.019, 0.01], spine: [0, 1.118, 0.013], spine1: [0, 1.247, 0], spine2: [0, 1.367, -0.021], neck: [0, 1.523, -0.033], shoulder: [0.166, 1.503, -0.038], elbow: [0.31, 1.258, -0.06], wrist: [0.45, 1.069, 0.031], upleg: [0.095, 1.024, 0.007], knee: [0.125, 0.567, 0.001], ankle: [0.152, 0.126, -0.042] };
// weights down the spine by height
function spineW(y) {
  const ch = [[1.0, 'Hips'], [1.118, 'Spine'], [1.247, 'Spine1'], [1.367, 'Spine2'], [1.53, 'Neck']];
  if (y <= ch[0][0]) return [['Hips', 1]];
  for (let i = 1; i < ch.length; i++) if (y <= ch[i][0]) { const t = (y - ch[i - 1][0]) / (ch[i][0] - ch[i - 1][0]); return [[ch[i - 1][1], 1 - t], [ch[i][1], t]]; }
  return [['Neck', 1]];
}
// a wrapped cloth (saree, veshti, lungi, kameez) follows the hips at the waist and each leg lower down
function wrapW(x, y) {
  const L = smooth(-0.07, 0.07, x), hip = smooth(0.80, 1.0, y), low = 1 - smooth(0.48, 0.66, y);
  const up = (1 - hip) * (1 - low), lo = (1 - hip) * low;
  return [['Hips', hip], ['LeftUpLeg', up * L], ['RightUpLeg', up * (1 - L)], ['LeftLeg', lo * L], ['RightLeg', lo * (1 - L)]];
}

class Builder {
  constructor(boneIndex) { this.bi = boneIndex; this.pos = []; this.uv = []; this.col = []; this.si = []; this.sw = []; this.idx = []; }
  vert(p, u, v, cell, col, w, mirror) {
    const n = this.pos.length / 3, [u0, v0, du, dv] = cellRect(cell);
    this.pos.push(mirror ? -p[0] : p[0], p[1], p[2]); this.uv.push(u0 + du * Math.min(1, Math.max(0, u)), v0 + dv * Math.min(1, Math.max(0, v))); this.col.push(col.r, col.g, col.b);
    const ws = w.filter(a => a[1] > 0.002).sort((a, b) => b[1] - a[1]).slice(0, 4), tot = ws.reduce((s, a) => s + a[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      let name = ws[k] ? ws[k][0] : 'Hips'; if (mirror) name = name.startsWith('Left') ? 'Right' + name.slice(4) : name.startsWith('Right') ? 'Left' + name.slice(5) : name;
      this.si.push(this.bi[name] ?? 0); this.sw.push(ws[k] ? ws[k][1] / tot : 0);
    }
    return n;
  }
  // rings: [{ c, a, b, v }] — points are c + a·cos + b·sin; w(point, ringIndex) gives bone weights. The seam is at the back.
  tube(rings, seg, w, cell, col, o = {}) {
    const base = this.pos.length / 3;
    rings.forEach((r, i) => { for (let s = 0; s <= seg; s++) { const ang = (s / seg) * Math.PI * 2 - Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang); const p = [r.c[0] + r.a[0] * ca + r.b[0] * sa, r.c[1] + r.a[1] * ca + r.b[1] * sa, r.c[2] + r.a[2] * ca + r.b[2] * sa]; this.vert(p, s / seg, r.v ?? i / (rings.length - 1), cell, typeof col === 'function' ? col(p, i) : col, w(p, i), o.mirror); } });
    for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < seg; s++) { const a = base + i * (seg + 1) + s, b = a + seg + 1; this.idx.push(a, b, a + 1, a + 1, b, b + 1); }
    return this;
  }
  // a ribbon of cloth along a path of { p, w (half-width vector), v }
  strip(path, wfn, cell, col, u0 = 0, u1 = 1) {
    const base = this.pos.length / 3;
    path.forEach((q, i) => { for (const s of [-1, 1]) { const p = [q.p[0] + q.w[0] * s, q.p[1] + q.w[1] * s, q.p[2] + q.w[2] * s]; this.vert(p, s < 0 ? u0 : u1, q.v ?? i / (path.length - 1), cell, col, wfn(p, i)); } });
    for (let i = 0; i < path.length - 1; i++) { const a = base + i * 2; this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx); g.computeVertexNormals();
    return g;
  }
}
const V = (y, rx, rz, cx = 0, cz = 0, v) => ({ c: [cx, y, cz], a: [rx, 0, 0], b: [0, 0, rz], v });
// ring across a limb running from P to Q, at parameter t
function limb(P, Q, t, r, v) {
  const d = new THREE.Vector3(Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]).normalize();
  const a = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(r), b = new THREE.Vector3().crossVectors(d, a).normalize().multiplyScalar(r);
  return { c: [lerp(P[0], Q[0], t), lerp(P[1], Q[1], t), lerp(P[2], Q[2], t)], a: a.toArray(), b: b.toArray(), v };
}

// Build all the garments, skin-coloured limbs and hair for one person into a single skinned geometry.
function buildOutfit(bi, S) {
  const B = new Builder(bi), C = h => new THREE.Color(h), skin = C(S.skin), hair = C(S.grey ? 0x9a9a98 : 0x0d0b0a), W = 8;
  const torsoW = p => { const w = spineW(p[1]); if (p[1] > 1.43 && Math.abs(p[0]) > 0.1) w.push([p[0] > 0 ? 'LeftShoulder' : 'RightShoulder', 0.8]); return w; };
  const fem = S.female, sh = fem ? 0.92 : 1; // women: narrower shoulders and waist
  const armRings = (t0, r0, r1) => [limb(J.shoulder, J.elbow, t0, r0), limb(J.shoulder, J.elbow, 0.85, lerp(r0, r1, 0.5)), limb(J.elbow, J.wrist, 0.0, r1 * 1.02), limb(J.elbow, J.wrist, 0.5, r1 * 0.95), limb(J.elbow, J.wrist, 1.02, r1 * 0.72)];
  const armW = (p, i) => i === 0 ? [['LeftArm', 1]] : i === 1 ? [['LeftArm', 0.8], ['LeftForeArm', 0.2]] : i === 2 ? [['LeftArm', 0.35], ['LeftForeArm', 0.65]] : i === 3 ? [['LeftForeArm', 1]] : [['LeftForeArm', 0.6], ['LeftHand', 0.4]];
  const sleeve = (t1, r, cell, col) => { for (const mirror of [false, true]) B.tube([limb(J.shoulder, J.elbow, -0.04, r * 0.78), limb(J.shoulder, J.elbow, 0.2, r * 1.0), limb(J.shoulder, J.elbow, t1, r)], 10, (p, i) => i === 0 ? [['LeftShoulder', 0.5], ['LeftArm', 0.5]] : [['LeftArm', 1]], cell, col, { mirror }); };
  const arms = t0 => { for (const mirror of [false, true]) B.tube(armRings(t0, fem ? 0.04 : 0.046, fem ? 0.034 : 0.04), 8, armW, W, skin, { mirror }); };
  const legs = (yTop, col, r = 1) => { for (const mirror of [false, true]) B.tube([V(Math.min(yTop, 1.0), 0.088 * r, 0.09 * r, 0.097, 0.0), V(0.8, 0.078 * r, 0.082 * r, 0.108, 0.0), V(0.567, 0.058 * r, 0.06 * r, 0.125, 0.0), V(0.36, 0.05 * r, 0.052 * r, 0.138, -0.015), V(0.14, 0.036 * r, 0.04 * r, 0.151, -0.04)], 8, p => { const k = smooth(0.5, 0.64, p[1]), a = smooth(0.12, 0.2, p[1]); return [['LeftUpLeg', k], ['LeftLeg', (1 - k) * a], ['LeftFoot', (1 - k) * (1 - a)]]; }, W, col, { mirror }); };
  const torso = (y0, cell, col, loose = 1) => B.tube([
    V(y0, 0.198 * loose, 0.15 * loose, 0, 0.004, 0), V(1.06, 0.182 * loose * (fem ? 0.9 : 1), 0.138 * loose, 0, 0.008), V(1.2, 0.17 * (fem ? 0.86 : 1) * loose, 0.122 * loose, 0, 0.004),
    V(1.34, 0.185 * sh, fem ? 0.14 : 0.128, 0, fem ? 0.012 : -0.004), V(1.44, 0.195 * sh, 0.125, 0, -0.012), V(1.5, 0.17 * sh, 0.105, 0, -0.022), V(1.535, 0.085, 0.085, 0, -0.03), V(1.56, 0.062, 0.068, 0, -0.03, 1),
  ].filter(r => r.c[1] >= y0), 14, torsoW, cell, col);

  if (S.outfit === 'saree') {
    const blouse = C(S.c2), cell = S.cell;
    // blouse (short, with elbow-ish sleeves), bare midriff, wrapped lower saree, pallu over the left shoulder
    B.tube([V(1.27, 0.15, 0.118, 0, 0.004), V(1.34, 0.172, 0.14, 0, 0.012), V(1.44, 0.18, 0.125, 0, -0.012), V(1.5, 0.158, 0.105, 0, -0.022), V(1.53, 0.1, 0.09, 0, -0.028)], 14, torsoW, W, blouse);
    B.tube([V(1.05, 0.152, 0.115, 0, 0.008), V(1.16, 0.142, 0.108, 0, 0.006), V(1.28, 0.148, 0.114, 0, 0.004)], 12, torsoW, W, skin);
    B.tube([V(1.53, 0.1, 0.09, 0, -0.028), V(1.56, 0.06, 0.066, 0, -0.03)], 10, torsoW, W, skin);
    sleeve(0.55, 0.05, W, blouse); arms(0.45);
    B.tube([V(1.09, 0.162, 0.124, 0, 0.008, 1), V(1.0, 0.185, 0.14, 0, 0.006, 0.9), V(0.8, 0.2, 0.15, 0, 0.004, 0.72), V(0.57, 0.215, 0.16, 0, 0, 0.5), V(0.3, 0.235, 0.17, 0, -0.01, 0.25), V(0.05, 0.255, 0.185, 0, -0.015, 0)], 16, p => wrapW(p[0], p[1]), cell, C(0xffffff));
    const pallu = [
      { p: [-0.15, 1.07, 0.085], w: [0.05, -0.07, 0.03] }, { p: [-0.06, 1.22, 0.142], w: [0.075, -0.075, 0.0] }, { p: [0.035, 1.37, 0.162], w: [0.085, -0.065, 0.0] }, { p: [0.105, 1.5, 0.1], w: [0.085, -0.03, 0.02] },
      { p: [0.115, 1.56, -0.025], w: [0.085, 0.0, 0.0] }, { p: [0.115, 1.48, -0.145], w: [0.09, 0, 0] }, { p: [0.115, 1.2, -0.165], w: [0.1, 0, 0] }, { p: [0.115, 0.95, -0.18], w: [0.11, 0, 0] }, { p: [0.115, 0.78, -0.19], w: [0.115, 0, 0] },
    ];
    pallu.forEach((q, i) => { q.v = 0.25 + 0.5 * i / (pallu.length - 1); }); pallu[pallu.length - 1].v = 0.02; pallu[pallu.length - 2].v = 0.2;
    B.strip(pallu, p => p[1] < 1.0 ? [['Hips', 0.5], ['Spine', 0.5]] : spineW(p[1]), cell, C(0xffffff), 0.02, 0.3);
  } else if (S.outfit === 'kameez') {
    const c = C(S.c1), c2 = C(S.c2);
    // long tunic to the knee, leggings, dupatta draped over both shoulders
    B.tube([V(0.5, 0.235, 0.2, 0, 0.01, 0), V(0.8, 0.208, 0.168, 0, 0.006, 0.3), V(1.0, 0.185, 0.138, 0, 0.006, 0.5)], 14, p => wrapW(p[0], p[1]), S.cell, c);
    B.tube([V(1.0, 0.185, 0.138, 0, 0.006, 0.5), V(1.06, 0.165, 0.126, 0, 0.008, 0.56), V(1.2, 0.152, 0.118, 0, 0.004, 0.7), V(1.34, 0.172, 0.14, 0, 0.012, 0.84), V(1.44, 0.18, 0.125, 0, -0.012, 0.93), V(1.5, 0.158, 0.105, 0, -0.022, 0.97), V(1.535, 0.09, 0.088, 0, -0.03, 1)], 14, torsoW, S.cell, c);
    B.tube([V(1.535, 0.09, 0.088, 0, -0.03), V(1.56, 0.06, 0.066, 0, -0.03)], 10, torsoW, W, skin);
    sleeve(0.7, 0.05, W, c); arms(0.6); legs(0.6, c2, 0.86);
    for (const sx of [1, -1]) B.strip([{ p: [0.0, 1.43, 0.15], w: [0, -0.06, 0.01] }, { p: [sx * 0.09, 1.5, 0.11], w: [0, -0.05, 0.03] }, { p: [sx * 0.125, 1.555, -0.02], w: [0.05, 0, 0] }, { p: [sx * 0.12, 1.45, -0.14], w: [0.055, 0, 0] }, { p: [sx * 0.12, 1.15, -0.16], w: [0.06, 0, 0] }, { p: [sx * 0.12, 0.9, -0.17], w: [0.065, 0, 0] }], p => p[1] < 1.0 ? [['Hips', 0.5], ['Spine', 0.5]] : spineW(p[1]), W, c2);
  } else {
    const shirt = C(S.c1);
    torso(0.9, S.cell, shirt, 1.1);
    sleeve(S.longSleeve ? 0.95 : 0.6, 0.056, S.cell, shirt);
    if (S.longSleeve) for (const mirror of [false, true]) B.tube([limb(J.elbow, J.wrist, -0.05, 0.052), limb(J.elbow, J.wrist, 0.5, 0.046), limb(J.elbow, J.wrist, 0.95, 0.04)], 8, (p, i) => i === 0 ? [['LeftArm', 0.4], ['LeftForeArm', 0.6]] : [['LeftForeArm', 1]], S.cell, shirt, { mirror });
    else arms(0.5);
    if (S.lower === 'veshti' || S.lower === 'lungi') {
      const hem = S.folded ? 0.5 : 0.1, flare = S.folded ? 0.95 : 1;
      B.tube([V(1.06, 0.16, 0.118, 0, 0.008, 1), V(0.98, 0.178, 0.132, 0, 0.006, 0.9), V(0.8, 0.195, 0.148, 0, 0.004, 0.7), V(0.57, 0.2 * flare, 0.15, 0, 0, 0.47)].concat(S.folded ? [V(hem, 0.2, 0.15, 0, 0, 0.4)] : [V(0.3, 0.21, 0.15, 0, -0.01, 0.2), V(hem, 0.215, 0.15, 0, -0.02, 0)]), 16, p => wrapW(p[0], p[1]), S.lowerCell, C(0xffffff));
      if (S.folded) legs(0.62, skin);
    }
  }
  // hair: a cap over the skull with a hairline, ears covered for women; plait with jasmine, or a short crop
  if (!S.bald) {
    const c = [0, 1.737, -0.004], R = [0.113, 0.119, 0.121], LA = 7, LO = 20, base = B.pos.length / 3;
    const side = fem ? 1.665 : 1.715, back = fem ? 1.6 : 1.645, front = S.receding ? 1.825 : 1.802;
    for (let j = 0; j <= LO; j++) {
      const phi = (j / LO) * Math.PI * 2 - Math.PI, a = Math.abs(phi); // phi = 0 is the front
      const bound = lerp(lerp(front, side, smooth(0.75, 1.45, a)), back, smooth(1.75, 2.5, a));
      const tMax = Math.acos(Math.max(-1, Math.min(1, (bound - c[1]) / R[1])));
      for (let i = 0; i <= LA; i++) { const th = tMax * i / LA, s = Math.sin(th); B.vert([c[0] + R[0] * s * Math.sin(phi), c[1] + R[1] * Math.cos(th), c[2] + R[2] * s * Math.cos(phi)], 0.5, 0.5, W, hair, [['Head', 1]]); }
    }
    for (let j = 0; j < LO; j++) for (let i = 0; i < LA; i++) { const a = base + j * (LA + 1) + i, b = a + LA + 1; B.idx.push(a, a + 1, b, b, a + 1, b + 1); }
    if (fem) {
      const pw = p => p[1] > 1.6 ? [['Head', 1]] : p[1] > 1.5 ? [['Head', 0.4], ['Neck', 0.6]] : spineW(p[1]);
      B.tube([V(1.69, 0.05, 0.03, 0, -0.105), V(1.6, 0.042, 0.034, 0, -0.118), V(1.48, 0.034, 0.03, 0, -0.14), V(1.3, 0.03, 0.028, 0, -0.158), V(1.12, 0.024, 0.022, 0, -0.16), V(1.02, 0.012, 0.012, 0, -0.158)], 8, pw, W, hair);
      if (S.jasmine) B.tube([V(1.665, 0.062, 0.04, 0, -0.112), V(1.64, 0.066, 0.046, 0, -0.118), V(1.615, 0.058, 0.042, 0, -0.12)], 8, pw, W, C(0xf7f4e8));
    }
  }
  return B.geometry();
}

// Deterministic description of one person.
function describe(i, female) {
  let s = 1000 + i * 7919; const r = n => { s = (s * 9301 + 49297) % 233280; return Math.floor(s / 233280 * n); };
  const S = { female, skin: SKIN[r(SKIN.length)], grey: r(8) === 0, scale: (female ? 0.845 : 0.905) * (0.96 + r(9) * 0.01) };
  if (female) {
    if (r(10) < 7) { S.outfit = 'saree'; S.cell = r(8); S.c2 = [0x7a1538, 0x1f5f3a, 0xc08a10, 0x2a2a6a, 0x9a2050, 0x204a70, 0x7a1f1f, 0x3a2a5a][S.cell]; }
    else { S.outfit = 'kameez'; S.cell = r(2) ? 11 : 8; S.c1 = KAMEEZ[r(KAMEEZ.length)]; S.c2 = [0xf2efe6, 0x2a2a30, 0xf0c040, 0x1f6f6a, 0xd0356a][r(5)]; }
    S.jasmine = r(3) > 0; S.bindi = r(10) < 7;
  } else {
    S.outfit = 'shirt'; S.c1 = SHIRT[r(SHIRT.length)]; S.cell = [8, 8, 9, 10][r(4)];
    const k = r(10); S.lower = k < 4 ? 'trousers' : k < 7 ? 'veshti' : 'lungi';
    S.lowerCell = S.lower === 'veshti' ? 15 : 12 + r(3); S.folded = S.lower === 'lungi' ? r(3) > 0 : r(4) === 0; S.trouser = TROUSER[r(TROUSER.length)];
    S.longSleeve = r(5) === 0; S.moustache = r(10) < 7; S.receding = r(4) === 0; S.bald = S.grey && r(2) === 0;
  }
  return S;
}

const SKIN_BASE = new THREE.Color(0xf4cdbb); // average colour of the rig's own skin texture
function dress(obj, S) {
  const skin = new THREE.Color(S.skin), tint = new THREE.Color(Math.min(1, skin.r / SKIN_BASE.r), Math.min(1, skin.g / SKIN_BASE.g), Math.min(1, skin.b / SKIN_BASE.b));
  let head = null;
  obj.traverse(o => {
    if (!o.isMesh) return;
    const n = o.name; o.frustumCulled = false; o.castShadow = true;
    if (/Headwear|Outfit_Top|Teeth/.test(n)) { o.visible = false; return; }
    o.material = o.material.clone();
    // women: the "female" shape made in Blender (softer jaw and chin, smaller nose and brow) and a face texture with thin brows and kajal
    if (o.morphTargetDictionary && 'female' in o.morphTargetDictionary) o.morphTargetInfluences[o.morphTargetDictionary.female] = S.female ? 1 : 0;
    if (n === 'Wolf3D_Head') { head = o; o.material.color.copy(tint); o.material.roughness = 0.75; if (S.female && FACE[S.bindi ? 1 : 0]) o.material.map = FACE[S.bindi ? 1 : 0]; }
    else if (n === 'Wolf3D_Body') o.material.color.copy(tint);
    else if (n === 'Wolf3D_Beard') { o.visible = !S.female && !!S.moustache; o.material.map = null; o.material.color.set(S.grey ? 0x8a8a88 : 0x120e0b); }
    else if (n === 'Wolf3D_Outfit_Bottom') { o.visible = S.outfit === 'shirt' && S.lower === 'trousers'; o.material.map = null; o.material.color.set(S.trouser || 0x2b3445); o.material.roughness = 0.9; o.material.metalness = 0; }
    else if (n === 'Wolf3D_Outfit_Footwear') { o.material.map = null; o.material.color.set(S.female ? 0x5a3a2a : 0x2a1f18); o.material.roughness = 0.8; o.material.metalness = 0; }
  });
  const bi = {}; head.skeleton.bones.forEach((b, i) => { bi[b.name] = i; });
  const mesh = new THREE.SkinnedMesh(buildOutfit(bi, S), clothMaterial());
  mesh.name = 'Outfit'; mesh.frustumCulled = false; mesh.castShadow = true;
  head.parent.add(mesh); mesh.bind(head.skeleton, head.bindMatrix);
  obj.scale.setScalar(S.scale);
  return obj;
}

const FACE = [];
export async function loadPeople() {
  const loader = new GLTFLoader();
  { const tl = new THREE.TextureLoader(); for (const k of ['skinF', 'skinFB']) { const t = tl.load(ASSETS[k]); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; FACE.push(t); } }
  const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const [anims, man] = await Promise.all([load(ASSETS.anims), load(ASSETS.man)]);
  // Retarget by world-space rotation deltas: both rigs rest in a T/A-pose, but their bones use different local axes,
  // so copying local quaternions twists limbs. For each frame: delta = srcWorld * srcRestWorld^-1, tgtWorld = delta * tgtRestWorld.
  const src = anims.scene; src.updateMatrixWorld(true);
  const restW = root => { const m = new Map(); root.updateMatrixWorld(true); root.traverse(o => m.set(o, o.getWorldQuaternion(new THREE.Quaternion()))); return m; };
  const srcRest = restW(src), srcByName = new Map(); src.traverse(o => srcByName.set(o.name.replace(/^mixamorig:?/, ''), o));
  const srcMixer = new THREE.AnimationMixer(src);
  const clipFor = (name, gltf) => {
    const clip = anims.animations.find(a => a.name === name);
    const tgtRoot = gltf.scene, tgtRest = restW(tgtRoot);
    const pairs = []; tgtRoot.traverse(o => { if (!o.isBone) return; const s = srcByName.get(o.name); if (s) pairs.push([o, s]); });
    // the animation rig rests in a T-pose and this one in an A-pose: rotate each limb's rest onto the source limb direction
    const wp = o => o.getWorldPosition(new THREE.Vector3()), align = new Map();
    for (const [tb, sb] of pairs) {
      if (!/Arm|UpLeg|Leg$|Shoulder/.test(tb.name)) continue;
      const ct = tb.children.find(c => c.isBone && srcByName.get(c.name)); if (!ct) continue; const cs = srcByName.get(ct.name);
      const dt = wp(ct).sub(wp(tb)).normalize(), ds = wp(cs).sub(wp(sb)).normalize();
      const R = new THREE.Quaternion().setFromUnitVectors(dt, ds); align.set(tb, R);
      tgtRest.set(tb, R.clone().multiply(tgtRest.get(tb)));
    }
    // Hands, fingers, feet and toes keep their rest angle relative to the limb they hang from: they take the same correction
    // as the forearm or shin above them. Without it the wrist is bent by the whole A-pose to T-pose difference and the hands look broken.
    for (const [tb] of pairs) {
      if (!/Hand|Foot|Toe/.test(tb.name)) continue;
      let a = tb.parent; while (a && !align.has(a)) a = a.parent; if (!a) continue;
      tgtRest.set(tb, align.get(a).clone().multiply(tgtRest.get(tb)));
    }
    const act = srcMixer.clipAction(clip); act.play();
    const fps = 30, n = Math.max(2, Math.round(clip.duration * fps) + 1), times = new Float32Array(n);
    const vals = pairs.map(() => new Float32Array(n * 4));
    const tgtW = new Map(), q = new THREE.Quaternion(), d = new THREE.Quaternion(), pw = new THREE.Quaternion();
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / fps); times[f] = t;
      srcMixer.setTime(t); src.updateMatrixWorld(true); tgtW.clear();
      pairs.forEach(([tb, sb], i) => {
        sb.getWorldQuaternion(q); d.copy(srcRest.get(sb)).invert().premultiply(q);
        const w = d.clone().multiply(tgtRest.get(tb)); tgtW.set(tb, w);
        const par = tb.parent; pw.copy(tgtW.get(par) || tgtRest.get(par) || new THREE.Quaternion());
        const local = pw.clone().invert().multiply(w);
        if (f && local.dot(new THREE.Quaternion().fromArray(vals[i], (f - 1) * 4)) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        local.toArray(vals[i], f * 4);
      });
    }
    act.stop(); srcMixer.uncacheAction(clip);
    return new THREE.AnimationClip(name, clip.duration, pairs.map(([tb], i) => new THREE.QuaternionKeyframeTrack(tb.name + '.quaternion', times, vals[i])));
  };
  return { gltf: man, clips: { walk: clipFor('walk', man), idle: clipFor('idle', man), run: clipFor('run', man) } };
}

export function makePerson(rig, S) { return dress(skClone(rig.gltf.scene), S); }
export { describe };

export class Crowd {
  constructor(scene, rig, n = 36) {
    this.items = []; this.rig = rig;
    for (let i = 0; i < n; i++) {
      const female = i % 2 === 0, S = describe(i, female), obj = makePerson(rig, S);
      const mixer = new THREE.AnimationMixer(obj);
      const walk = mixer.clipAction(rig.clips.walk), idle = mixer.clipAction(rig.clips.idle), run = mixer.clipAction(rig.clips.run);
      walk.play(); idle.play(); run.play(); walk.time = Math.random() * 2; idle.setEffectiveWeight(0); run.setEffectiveWeight(0);
      obj.visible = false;
      scene.add(obj);
      this.items.push({ obj, mixer, walk, idle, run, female, slot: -1, x: 0, z: 0, stride: female ? 1.15 : 1.35 });
    }
    this.player = null;
  }
  makePlayer(scene) {
    // the player: an auto driver in the khaki uniform shirt and trousers
    const rig = this.rig, obj = makePerson(rig, { female: false, skin: 0x8a5a3c, outfit: 'shirt', c1: 0xb59a66, cell: 8, lower: 'trousers', trouser: 0x8a744a, moustache: true, scale: 0.915 });
    const mixer = new THREE.AnimationMixer(obj);
    const walk = mixer.clipAction(rig.clips.walk), idle = mixer.clipAction(rig.clips.idle), run = mixer.clipAction(rig.clips.run);
    walk.play(); idle.play(); run.play();
    scene.add(obj);
    this.player = { obj, mixer, walk, idle, run };
    return this.player;
  }
  static blend(p, speed, dt) {
    const w = speed < 0.2 ? 0 : speed < 3 ? 1 : 0, rn = speed >= 3 ? 1 : 0, id = speed < 0.2 ? 1 : 0;
    const k = Math.min(1, dt * 6);
    p.walk.setEffectiveWeight(p.walk.getEffectiveWeight() + (w - p.walk.getEffectiveWeight()) * k);
    p.run.setEffectiveWeight(p.run.getEffectiveWeight() + (rn - p.run.getEffectiveWeight()) * k);
    p.idle.setEffectiveWeight(p.idle.getEffectiveWeight() + (id - p.idle.getEffectiveWeight()) * k);
    p.walk.timeScale = Math.max(0.6, speed / (p.stride || 1.35)); p.run.timeScale = Math.max(0.7, speed / 4.5);
    p.mixer.update(dt);
  }
  // peds: Float32Array from the simulation (PF floats each)
  update(peds, PF, maxPeds, cam, dt) {
    const near = [], R2 = (this.range || 140) ** 2, fwd = this.fwd || [0, 0], maxShow = Math.min(this.items.length, this.maxShow || this.items.length), shN = this.shadowN ?? 8;
    for (let i = 0; i < maxPeds; i++) {
      const o = i * PF; if (!peds[o + 3]) continue;
      const dx = peds[o] - cam.x, dz = peds[o + 1] - cam.z, d = dx * dx + dz * dz;
      if (d < R2 && (d < 64 || dx * fwd[0] + dz * fwd[1] > -4)) near.push([d, i]); // not the ones behind the camera
    }
    near.sort((a, b) => a[0] - b[0]);
    const want = new Set(near.slice(0, maxShow).map(a => a[1])), shadowSet = new Set(near.slice(0, shN).map(a => a[1]));
    this.frame = (this.frame | 0) + 1;
    for (const it of this.items) if (it.slot >= 0 && !want.has(it.slot)) { it.slot = -1; it.obj.visible = false; }
    const taken = new Set(this.items.filter(it => it.slot >= 0).map(it => it.slot));
    for (const s of want) if (!taken.has(s)) { const it = this.items.find(t => t.slot < 0 && (peds[s * PF + 10] % 2 === 0) === t.female) || this.items.find(t => t.slot < 0); if (it) { it.slot = s; it.obj.visible = true; it.x = peds[s * PF]; it.z = peds[s * PF + 1]; } }
    for (const it of this.items) {
      if (it.slot < 0) continue;
      const o = it.slot * PF, x = peds[o], z = peds[o + 1];
      const sp = it.sp = it.sp === undefined ? 1.2 : it.sp + (Math.hypot(x - it.x, z - it.z) / Math.max(dt, 1e-3) - it.sp) * 0.3;
      it.x = x; it.z = z;
      it.obj.position.set(x, 0, z); it.obj.rotation.y = peds[o + 2];
      const st = peds[o + 3];
      // only the closest few cast shadows; far walkers are animated every third frame
      const sh = shadowSet.has(it.slot); if (sh !== it.sh) { it.sh = sh; it.obj.traverse(m => { if (m.isMesh) m.castShadow = sh; }); }
      const dxc = x - cam.x, dzc = z - cam.z, far = dxc * dxc + dzc * dzc > 45 * 45; it.acc = (it.acc || 0) + dt;
      if (far && (this.frame + it.slot) % 3) continue;
      Crowd.blend(it, st === 2 ? 0 : Math.min(sp, 2.2), it.acc) /* street walkers never break into the run cycle, even when a slow frame makes the measured speed jump */; it.acc = 0;
    }
  }
}
