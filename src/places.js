// Real places get their own building shapes instead of the generic street block:
// churches with a bell tower and spire, temples with striped compound walls, a gopuram and a vimana,
// mosques with a dome and minarets, apartment blocks in one colour with stacked balconies,
// schools and hospitals with a gate arch and name board, restaurants with a glass front and awning,
// banks with an ATM booth, petrol bunks with a canopy. Which building is what comes from the map data.
import * as THREE from 'three';
import { mergeGeometries } from './merge.js';
import { pointInPoly, area, centroid, segDist } from './geom.js';

const C = h => new THREE.Color(h);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// hand-modelled elsewhere (game.js addLandmarks): leave these alone
const HAND = /kapalee?s?h?warar|santhome|san thome|st\.? thomas cathedral|schmidt/i;

function typeOf(amenity, kind, religion, name, levels) {
  const n = name || '';
  if (amenity === 'place_of_worship' || /^(temple|church|mosque|chapel|cathedral|shrine)$/.test(kind) || (religion && !amenity && kind === 'yes')) {
    if (religion === 'christian' || kind === 'church' || kind === 'chapel' || kind === 'cathedral' || /church|chapel|basilica|cathedral|\bcsi\b/i.test(n)) return 'church';
    if (religion === 'muslim' || kind === 'mosque' || /masjid|mosque|dargah/i.test(n)) return 'mosque';
    return 'temple';
  }
  if (/^(school|college|kindergarten|university)$/.test(amenity) || /^(school|college|university|kindergarten)$/.test(kind) || (/\bschool\b|vidyalaya|vidya mandir/i.test(n) && !amenity)) return 'school';
  if (amenity === 'hospital' || kind === 'hospital') return 'hospital';
  if (/^(restaurant|cafe|fast_food|food_court|ice_cream)$/.test(amenity) || kind === 'restaurant') return 'restaurant';
  if (amenity === 'bank') return 'bank';
  if (amenity === 'police') return 'police';
  if (amenity === 'post_office') return 'post';
  if (amenity === 'fuel') return 'fuel';
  if (kind === 'hotel') return 'hotel';
  if (kind === 'apartments' || /apartment|\bflats\b|quarters|quaters|\bblock\b|enclave|\btowers?\b|residency|heights/i.test(n) || (kind === 'residential' && levels >= 3)) return 'apartments';
  return '';
}

// Decide what every building is. Uses the building's own tags, then named campuses (a school or temple
// compound drawn as an area), then named points (a restaurant marked as a dot on or beside a building).
export function classifyPlaces(D) {
  D.fuel = [];
  for (const b of D.buildings) { b.c = centroid(b.poly); b.ar = Math.abs(area(b.poly)); }
  for (const b of D.buildings) {
    if (b.part) continue;
    if (b.name && HAND.test(b.name)) { b.place = { type: 'skip', name: b.name }; continue; }
    const t = typeOf(b.amenity, b.kind, b.religion, b.name, b.levels);
    if (t && t !== 'fuel') b.place = { type: t, name: b.name, ta: b.nameTa || '', main: true };
  }
  for (const p of D.pois) {
    if (!p.poly || p.poly.length < 3 || HAND.test(p.name)) continue;
    const tg = p.tags || {}, t = typeOf(tg.amenity || '', tg.building || '', tg.religion || '', p.name, NaN);
    if (t === 'fuel') { D.fuel.push(p); continue; }
    if (!/^(temple|church|mosque|school|hospital|police|post)$/.test(t)) continue;
    const inside = D.buildings.filter(b => !b.part && pointInPoly(b.c[0], b.c[1], p.poly));
    if (!inside.length) {
      if (!/^(temple|church|mosque)$/.test(t)) continue;
      // a temple drawn only as a compound: stand the temple on the compound itself
      let poly = p.poly.slice(); const a = Math.abs(area(poly));
      if (a > 5000 || a < 20) { const c = centroid(poly), r = a < 20 ? 5 : 15; poly = [[c[0] - r, c[1] - r], [c[0] - r, c[1] + r], [c[0] + r, c[1] + r], [c[0] + r, c[1] - r]]; }
      if (area(poly) > 0) poly.reverse();
      const b = { poly, h: NaN, levels: NaN, kind: 'yes', name: p.name, religion: tg.religion || '', amenity: 'place_of_worship', minH: 0, part: false, roofShape: '', colour: '', synth: true };
      b.c = centroid(poly); b.ar = Math.abs(area(poly)); b.place = { type: t, name: p.name, ta: tg['name:ta'] || '', main: true };
      D.buildings.push(b); continue;
    }
    let main = inside[0]; for (const b of inside) if (b.ar > main.ar) main = b;
    for (const b of inside) if (!b.place || b.place.type === 'apartments') b.place = { type: t, name: p.name, ta: tg['name:ta'] || '', main: b === main && !inside.some(o => o.place && o.place.type === t && o.place.main && o !== b) };
  }
  for (const p of D.pois) {
    if (p.poly || HAND.test(p.name)) continue;
    const tg = p.tags || {}, t = typeOf(tg.amenity || '', '', tg.amenity === 'place_of_worship' ? tg.religion || '' : '', p.name, NaN);
    if (!/^(restaurant|bank|temple|church|mosque|police|post)$/.test(t)) continue;
    let best = null, bd = 10;
    for (const b of D.buildings) {
      if (b.part || Math.hypot(b.c[0] - p.x, b.c[1] - p.z) > 70) continue;
      let d = 1e9; if (pointInPoly(p.x, p.z, b.poly)) d = 0; else for (let i = 0; i < b.poly.length; i++) { const a = b.poly[i], q = b.poly[(i + 1) % b.poly.length]; d = Math.min(d, segDist(p.x, p.z, a[0], a[1], q[0], q[1])); }
      if (d < bd) { bd = d; best = b; }
    }
    if (!best || best.place) continue;
    if (/^(temple|church|mosque)$/.test(t) && best.ar > 1500) continue;
    best.place = { type: t, name: p.name, ta: tg['name:ta'] || '', main: true };
  }
  const n = {}; for (const b of D.buildings) if (b.place) n[b.place.type] = (n[b.place.type] || 0) + 1;
  D.placeCounts = n;
}

function quadGeo(quads) {
  const pos = []; for (const [a, b, c, d] of quads) { pos.push(...a, ...b, ...c); if (d) pos.push(...a, ...c, ...d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
// rectangular frustum: base w0 x d0 at y 0, top w1 x d1 at y h
function frusGeo(w0, d0, w1, d1, h) {
  const b = [[-w0 / 2, 0, -d0 / 2], [w0 / 2, 0, -d0 / 2], [w0 / 2, 0, d0 / 2], [-w0 / 2, 0, d0 / 2]], t = [[-w1 / 2, h, -d1 / 2], [w1 / 2, h, -d1 / 2], [w1 / 2, h, d1 / 2], [-w1 / 2, h, d1 / 2]];
  return quadGeo([[b[3], b[2], t[2], t[3]], [b[1], b[0], t[0], t[1]], [b[2], b[1], t[1], t[2]], [b[0], b[3], t[3], t[0]], [t[0], t[3], t[2], t[1]]]);
}
// gabled roof: ridge along z
function gableGeo(w, h, d) {
  const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], R0 = [0, h, -d / 2], A2 = [-w / 2, 0, d / 2], B2 = [w / 2, 0, d / 2], R1 = [0, h, d / 2];
  return quadGeo([[A, A2, R1, R0], [B, R0, R1, B2], [A2, B2, R1], [B, A, R0]]);
}

function boardAtlas(list) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 4096; const g = c.getContext('2d');
  g.fillStyle = '#ddd'; g.fillRect(0, 0, 2048, 4096);
  const tamil = document.fonts && document.fonts.check('20px "Noto Sans Tamil"') ? '"Noto Sans Tamil", ' : '';
  const ST = { school: ['#0d3b8c', '#ffffff', '#ffd54a'], worship: ['#fbf3dc', '#8a1c1c', '#3a2a10'], hospital: ['#ffffff', '#0d47a1', '#c62828'], granite: ['#15171a', '#e3c15a', '#cfcfcf'], rbi: ['#efe6cf', '#7a2d22', '#3a2a10'], plain: ['#ffffff', '#1b1b1b', '#555555'] };
  list.forEach((b, i) => {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 128, [bg, fg, sub] = ST[b.style] || ST.plain;
    g.fillStyle = bg; g.fillRect(x, y, 512, 128); g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x + 5, y + 5, 502, 118);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
    const top = b.ta && tamil ? b.ta : b.name, low = b.ta && tamil ? b.name.toUpperCase() : b.sub || '';
    let fs = low ? 40 : 46; g.font = `700 ${fs}px ${tamil}"Segoe UI", Arial, sans-serif`;
    // long names go on two lines rather than being squeezed flat
    const words = top.split(' '); let l1 = top, l2 = '';
    if (!low && g.measureText(top).width > 470 && words.length > 1) { let k = 1, bestD = 1e9; for (let j = 1; j < words.length; j++) { const d = Math.abs(g.measureText(words.slice(0, j).join(' ')).width - g.measureText(words.slice(j).join(' ')).width); if (d < bestD) { bestD = d; k = j; } } l1 = words.slice(0, k).join(' '); l2 = words.slice(k).join(' '); fs = 38; g.font = `700 ${fs}px ${tamil}"Segoe UI", Arial, sans-serif`; }
    if (l2) { g.fillText(l1, x + 256, y + 42, 480); g.fillText(l2, x + 256, y + 88, 480); }
    else g.fillText(l1, x + 256, y + (low ? 46 : 64), 480);
    if (low) { g.font = '700 26px "Segoe UI", Arial, sans-serif'; g.fillStyle = sub; g.fillText(low, x + 256, y + 94, 480); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function makePlaces({ D, hash, roads, polyGeom, group }) {
  const cells = new Map();
  const cellAt = (x, z) => { const k = Math.floor(x / 250) + ',' + Math.floor(z / 250); let a = cells.get(k); if (!a) cells.set(k, a = []); return a; };
  const boards = [], boardIdx = new Map(), boardList = [];
  const stats = {};
  const paint = (g, col) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
  // a model in its own frame: +z points out of the front of the building, x runs along the front
  class Model {
    constructor(cx, cz, fx, fz) { this.cx = cx; this.cz = cz; this.fx = fx; this.fz = fz; this.yaw = Math.atan2(fx, fz); this.out = cellAt(cx, cz); }
    put(g, x, y, z, col, ry) { if (ry) g.rotateY(ry); g.translate(x, y, z); g.rotateY(this.yaw); g.translate(this.cx, 0, this.cz); this.out.push(paint(g, col)); }
    box(x, y, z, w, h, d, col, ry) { this.put(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, col, ry); }
    cyl(x, y, z, rTop, rBot, h, col, seg = 10) { this.put(new THREE.CylinderGeometry(rTop, rBot, h, seg), x, y + h / 2, z, col); }
    cone(x, y, z, r, h, col, seg = 8, ry = 0) { this.put(new THREE.ConeGeometry(r, h, seg), x, y + h / 2, z, col, ry); }
    dome(x, y, z, r, col, sy = 1) { const g = new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, sy, 1); this.put(g, x, y, z, col); }
    frus(x, y, z, w0, d0, w1, d1, h, col) { this.put(frusGeo(w0, d0, w1, d1, h), x, y, z, col); }
    gable(x, y, z, w, h, d, col, ry) { this.put(gableGeo(w, h, d), x, y, z, col, ry); }
    world(x, z) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return [this.cx + x * c + z * s, this.cz - x * s + z * c]; }
  }
  // world-space box whose long (x) side runs along (ux, uz)
  const wbox = (x, y, z, w, h, d, ux, uz, col) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(Math.atan2(-uz, ux)); g.translate(x, y + h / 2, z); cellAt(x, z).push(paint(g, col)); };
  const board = (name, ta, sub, style, x, y, z, nx, nz, w, two) => {
    const key = style + '|' + name + '|' + (sub || ''); let i = boardIdx.get(key);
    if (i === undefined) { if (boardList.length >= 128) return; i = boardList.length; boardIdx.set(key, i); boardList.push({ name, ta, sub, style }); }
    boards.push({ i, x, y, z, nx, nz, w }); if (two) boards.push({ i, x: x - nx * 0.24, y, z: z - nz * 0.24, nx: -nx, nz: -nz, w });
  };

  // the wall that faces the nearest proper road, its outward normal, and the room between wall and road
  function frontOf(poly, c) {
    let nb = hash.nearest(c[0], c[1], 250, s => roads[s.ri] && roads[s.ri].cls !== 'service'); if (!nb.s) nb = hash.nearest(c[0], c[1], 250);
    let maxL = 0; const E = poly.map((p, i) => { const q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); maxL = Math.max(maxL, L); return { p, q, L, m: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }; });
    const tgt = nb.s ? [nb.q.qx, nb.q.qz] : [c[0], c[1] + 50]; let best = null;
    for (const e of E) { if (e.L < Math.max(2.5, maxL * 0.3)) continue; const d = Math.hypot(e.m[0] - tgt[0], e.m[1] - tgt[1]); if (!best || d < best.d) best = { ...e, d }; }
    if (!best) return null;
    const tx = (best.q[0] - best.p[0]) / best.L, tz = (best.q[1] - best.p[1]) / best.L; let nx = tz, nz = -tx;
    if (pointInPoly(best.m[0] + nx * 0.4, best.m[1] + nz * 0.4, poly)) { nx = -nx; nz = -nz; }
    const r = hash.nearest(best.m[0], best.m[1], 80), gap = r.s ? Math.max(0, r.e - r.s.hw) : 12;
    // extent of the footprint in the front frame
    let mnN = 1e9, mxN = -1e9, mnT = 1e9, mxT = -1e9; for (const p of poly) { const a = p[0] * nx + p[1] * nz, b = p[0] * tx + p[1] * tz; mnN = Math.min(mnN, a); mxN = Math.max(mxN, a); mnT = Math.min(mnT, b); mxT = Math.max(mxT, b); }
    const cn = (mnN + mxN) / 2, ct = (mnT + mxT) / 2;
    return { m: best.m, L: best.L, nx, nz, tx, tz, gap, hf: (mxN - mnN) / 2, hs: (mxT - mnT) / 2, cx: cn * nx + ct * tx, cz: cn * nz + ct * tz };
  }
  const STONE = C(0xb9b2a3), DARK = C(0x2a2622), WOOD = C(0x5a3a22), GOLD = C(0xd4a017), WHITE = C(0xf4f1e8), GLASS = C(0x24485a), GREY = C(0x8d8d8d);

  // gate arch with the name on it, or a board on the wall when there is no room in front
  function nameGate(F, name, ta, sub, style, pillar, wallY = 4.4) {
    const d = clamp(F.gap - 1.4, 0, 6);
    if (d < 1.6) { const w = clamp(F.L * 0.8, 2.4, 6.5); board(name, ta, sub, style, F.m[0] + F.nx * 0.22, wallY, F.m[1] + F.nz * 0.22, F.nx, F.nz, w, false); return; }
    const gx = F.m[0] + F.nx * d, gz = F.m[1] + F.nz * d, half = 3.3;
    for (const s of [-1, 1]) wbox(gx + F.tx * half * s, 0, gz + F.tz * half * s, 0.7, 4.7, 0.7, F.tx, F.tz, pillar);
    wbox(gx, 4.7, gz, half * 2 + 1.1, 0.45, 0.8, F.tx, F.tz, pillar);
    wbox(gx, 5.15, gz, 6.4, 1.75, 0.2, F.tx, F.tz, pillar.clone().multiplyScalar(0.85));
    board(name, ta, sub, style, gx + F.nx * 0.12, 6.02, gz + F.nz * 0.12, F.nx, F.nz, 6.2, true);
  }

  function church(b, F, ctx) {
    const velan = /velankanni|vailankanni/i.test(b.place.name), v = velan ? { body: C(0xfbfbf8), trim: C(0x2a6fb8), roof: C(0x2a6fb8), tower: 2.7 } : (hashStr(b.place.name) % 2 ? { body: C(0xf3ead2), trim: C(0x8a2f2a), roof: C(0xa8472e), tower: 2.1 } : { body: C(0xf6f4ee), trim: C(0x6b6f76), roof: C(0x8c4a35), tower: 2.2 });
    let hs = F.hs, hf = F.hf; const fill = ctx.ar / (4 * hs * hf); let cx = F.cx, cz = F.cz;
    if (fill < 0.55 || ctx.ar > 2500) { hs = Math.min(hs, 9); hf = Math.min(hf, 16); }
    hs = Math.max(hs, 3); hf = Math.max(hf, 3);
    const M = new Model(cx, cz, F.nx, F.nz), W = 2 * hs, L = 2 * hf, H = clamp(Math.min(W, L) * 0.62, 5.5, 11), long = L >= W;
    M.box(0, 0, 0, W + 0.4, 0.6, L + 0.4, STONE); M.box(0, 0.6, 0, W, H - 0.6, L, v.body); M.box(0, H - 0.3, 0, W + 0.3, 0.3, L + 0.3, v.trim);
    if (long) M.gable(0, H, 0, W + 0.7, W * 0.45, L + 0.5, v.roof); else M.gable(0, H, 0, L + 0.7, L * 0.45, W + 0.5, v.roof, Math.PI / 2);
    const tw = clamp(Math.min(W, L) * 0.36, 3.2, 6.5), th = H * v.tower, z0 = hf + tw * 0.2;
    M.box(0, 0, z0, tw, th, tw, v.body);
    for (const y of [H, th * 0.72, th]) M.box(0, y - 0.3, z0, tw + 0.4, 0.38, tw + 0.4, v.trim);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) M.box(dx * tw / 2, th * 0.78, z0 + dz * tw / 2, dx ? 0.14 : tw * 0.34, th * 0.14, dz ? 0.14 : tw * 0.34, DARK);
    M.cone(0, th, z0, tw * 0.74, tw * 2.0, v.trim, 4, Math.PI / 4);
    const ct = th + tw * 2.0; M.box(0, ct - 0.2, z0, 0.24, 2.4, 0.24, WHITE); M.box(0, ct + 1.25, z0, 1.3, 0.24, 0.24, WHITE);
    // door, steps and rose window
    M.box(0, 0.6, z0 + tw / 2, tw * 0.42, 3.0, 0.18, WOOD); { const g = new THREE.CylinderGeometry(tw * 0.21, tw * 0.21, 0.18, 14); g.rotateX(Math.PI / 2); M.put(g, 0, 3.6, z0 + tw / 2, WOOD); }
    M.box(0, 0, z0 + tw / 2 + 1.0, tw * 0.9, 0.3, 2.0, STONE); M.box(0, 0.3, z0 + tw / 2 + 0.6, tw * 0.8, 0.3, 1.2, STONE);
    { const g = new THREE.CylinderGeometry(tw * 0.2, tw * 0.2, 0.14, 18); g.rotateX(Math.PI / 2); M.put(g, 0, th * 0.5, z0 + tw / 2 + 0.03, C(0x2b5f9e)); }
    // tall windows down the sides
    if (long) { for (let z = -hf + 2; z <= hf - 2; z += 3.4) for (const s of [-1, 1]) { M.box(s * hs, H * 0.28, z, 0.16, H * 0.46, 1.0, C(0x2b5f9e)); M.box(s * hs, H * 0.28 + H * 0.46, z, 0.2, 0.3, 1.3, v.trim); } }
    else for (let x = -hs + 2; x <= hs - 2; x += 3.4) { if (Math.abs(x) < tw / 2 + 0.8) continue; for (const s of [-1, 1]) M.box(x, H * 0.28, s * hf, 1.0, H * 0.46, 0.16, C(0x2b5f9e)); }
    if (velan) for (const s of [-1, 1]) { M.box(s * (hs - 1), 0, hf - 1, 2, H * 1.5, 2, v.body); M.box(s * (hs - 1), H * 1.5 - 0.3, hf - 1, 2.3, 0.3, 2.3, v.trim); M.cone(s * (hs - 1), H * 1.5, hf - 1, 1.5, 3.6, v.trim, 4, Math.PI / 4); }
    // name over the door, or on a gate arch when the church stands back from the road
    const fw = M.world(0, z0 + tw / 2 + 0.2);
    if (F.gap > 9) nameGate({ ...F, m: M.world(0, z0 + tw / 2) }, b.place.name, b.place.ta, 'CHURCH', 'worship', v.body);
    else board(b.place.name, b.place.ta, '', 'worship', fw[0], 4.9, fw[1], F.nx, F.nz, tw * 0.95, false);
  }

  const TIER = [0xe9c9a2, 0x6fa8dc, 0xe9a0b0, 0x86c58f, 0xf0cf6a, 0xd98f6a, 0x9fd0d8].map(C), FIG = [0xc0392b, 0x2e86c1, 0xf4d03f, 0x27ae60, 0xf5f0e6, 0xe67e22].map(C);
  function gopuram(M, gz, gw, s, tiers) {
    const gd = gw * 0.62, baseH = 3.6 * s + 1.4;
    M.box(0, 0, gz, gw, baseH, gd, STONE); M.box(0, 0, gz, gw * 0.3, baseH * 0.8, gd + 0.3, DARK); M.box(0, baseH - 0.3, gz, gw + 0.4, 0.3, gd + 0.4, C(0xf5f0e6));
    let y = baseH, w = gw, d = gd;
    for (let k = 0; k < tiers; k++) {
      const w1 = w * 0.87, d1 = d * 0.88, th = 2.3 * s * (1 - k * 0.04);
      M.frus(0, y, gz, w, d, w1, d1, th, TIER[k % TIER.length]);
      // rows of painted figures on both faces, and a cornice
      const n = Math.max(3, Math.round(w / (1.1 * s + 0.3)));
      for (let j = 0; j < n; j++) { const x = (j - (n - 1) / 2) * (w * 0.82 / n); for (const sd of [-1, 1]) M.box(x, y + th * 0.18, gz + sd * (d + d1) / 4, 0.42 * s + 0.1, th * 0.6, 0.3, FIG[(j + k * 2) % FIG.length]); }
      M.box(0, y + th - 0.12, gz, w1 + 0.35, 0.2, d1 + 0.35, C(0xf5f0e6));
      y += th; w = w1; d = d1;
    }
    // barrel roof with a row of kalasams
    { const g = new THREE.CylinderGeometry(d * 0.42, d * 0.42, w, 14); g.rotateZ(Math.PI / 2); g.scale(1, 1.25, 1); M.put(g, 0, y + d * 0.18, gz, TIER[tiers % TIER.length]); }
    const top = y + d * 0.18 + d * 0.5, nk = Math.min(9, tiers + 2);
    for (let i = 0; i < nk; i++) M.cone((i - (nk - 1) / 2) * (w * 0.8 / nk), top - 0.05, gz, 0.14 * s + 0.08, 0.8 * s + 0.2, GOLD, 8);
    for (const sx of [-1, 1]) M.box(sx * (w / 2 + 0.05), y, gz, 0.3, d * 0.75, d * 0.5, FIG[4]);
  }
  function vimana(M, x, z, sw, y0, tiers, s) {
    let y = y0, w = sw;
    for (let k = 0; k < tiers; k++) { const w1 = w * 0.78, th = 1.5 * s + 0.4; M.frus(x, y, z, w, w, w1, w1, th, TIER[(k + 2) % TIER.length]); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) M.box(x + dx * (w + w1) / 4, y + th * 0.2, z + dz * (w + w1) / 4, dx ? 0.25 : w * 0.3, th * 0.55, dz ? 0.25 : w * 0.3, FIG[(k + (dx ? 1 : 3)) % FIG.length]); M.box(x, y + th - 0.1, z, w1 + 0.25, 0.16, w1 + 0.25, C(0xf5f0e6)); y += th; w = w1; }
    M.cyl(x, y, z, w * 0.42, w * 0.46, 0.5, C(0xf5f0e6), 12); M.dome(x, y + 0.5, z, w * 0.46, GOLD, 1.15); M.cone(x, y + 0.5 + w * 0.5, z, 0.14, 0.9, GOLD, 8);
  }
  function temple(b, F, ctx) {
    const poly = ctx.poly, ar = ctx.ar, big = ar > 220, wallH = big ? 3.4 : 2.6, RED = C(0xb5432e), CRM = C(0xf5f0e6);
    const M = new Model(F.cx, F.cz, F.nx, F.nz), hs = F.hs, hf = F.hf, s = clamp(Math.sqrt(ar) / 24, 0.5, 1.5);
    if (/ashtalakshmi temple/i.test(b.place.name)) {
      // Ashtalakshmi Temple: the white stepped tower of shrines stacked one above another, facing the sea
      const k = clamp(Math.min(hs, hf) / 11, 0.6, 1.3); M.box(0, 0, 0, 22 * k, 5 * k, 18 * k, C(0xf2ead8));
      const bands = [0xf6f0e0, 0xe9c46a, 0xf6f0e0, 0xd9764a, 0xf6f0e0, 0x7fb0d8].map(C);
      for (let i = 0; i < 6; i++) { const r = (7.2 - i * 1.0) * k; M.put(new THREE.CylinderGeometry(r - 0.5 * k, r, 2.6 * k, 8), 0, (6.3 + i * 2.6) * k, 0, bands[i], Math.PI / 8); }
      M.put(new THREE.SphereGeometry(1.6 * k, 12, 8), 0, 22.4 * k, 0, C(0xf6f0e0)); M.cone(0, 23.6 * k, 0, 0.45 * k, 1.8 * k, GOLD, 10);
      for (const sx of [-1, 1]) M.box(sx * 6 * k, 0, 9 * k + 1.2, 1.2, 4.2 * k, 1.2, C(0xf6f0e0)); M.box(0, 4.2 * k, 9 * k + 1.2, 14 * k, 0.5, 2.6, C(0xe9c46a));
      nameGate({ ...F, m: M.world(0, 9 * k + 2.6) }, b.place.name, b.place.ta, 'TEMPLE', 'worship', CRM); return;
    }
    // red and white striped compound wall, with a granite floor inside
    if (ar > 60) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.6) continue;
        const ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L, n = Math.max(1, Math.round(L / 1.2)), w = L / n;
        for (let k = 0; k < n; k++) wbox(p[0] + ux * (k + 0.5) * w, 0, p[1] + uz * (k + 0.5) * w, w, wallH, 0.32, ux, uz, k % 2 ? RED : CRM);
        wbox((p[0] + q[0]) / 2, wallH, (p[1] + q[1]) / 2, L + 0.3, 0.22, 0.55, ux, uz, STONE);
      }
      cellAt(ctx.c[0], ctx.c[1]).push(paint(polyGeom([poly], 0.07), C(0xa9a297)));
    }
    if (big) {
      const gw = clamp(2 * hs * 0.34, 5, 13), tiers = ar > 2500 ? 7 : ar > 700 ? 5 : 3, gz = hf - gw * 0.31;
      gopuram(M, gz, gw, s, tiers);
      const sw = clamp(Math.min(hs, hf) * 0.55, 3.5, 10), sz = -hf * 0.3, sh = 3.6;
      M.box(0, 0, sz, sw, sh, sw, STONE); M.box(0, 0, sz + sw / 2, sw * 0.28, sh * 0.72, 0.2, DARK); vimana(M, 0, sz, sw * 0.9, sh, ar > 700 ? 3 : 2, s);
      // pillared hall between the tower and the shrine, and the gold flag mast
      const z0 = sz + sw / 2, z1 = gz - gw * 0.31 - 1.2, len = z1 - z0;
      if (len > 4) { const mw = sw * 1.15; M.box(0, 3.3, (z0 + z1) / 2, mw, 0.35, len, CRM); const n = Math.max(2, Math.round(len / 3)); for (let j = 0; j < n; j++) for (const sx of [-1, 1]) M.box(sx * (mw / 2 - 0.3), 0, z0 + (j + 0.5) * len / n, 0.42, 3.3, 0.42, STONE); M.cyl(0, 0, z1 + 0.6, 0.11, 0.16, 6.5 * s + 2.5, GOLD, 8); M.box(0, 0, z1 + 0.6, 0.9, 0.7, 0.9, STONE); }
    } else {
      // street-corner koil: one shrine with a painted tower over it
      const sw = clamp(Math.min(hs, hf) * 1.3, 2.4, 6), sh = 3.0;
      M.box(0, 0, 0, sw, sh, sw, CRM); for (const sx of [-1, 1]) M.box(sx * (sw / 2 - 0.2), 0, sw / 2 + 0.02, 0.4, sh, 0.08, RED);
      M.box(0, 0, sw / 2, sw * 0.34, sh * 0.72, 0.16, DARK); M.box(0, sh - 0.15, 0, sw + 0.4, 0.2, sw + 0.4, RED); vimana(M, 0, 0, sw * 0.92, sh, 2, clamp(sw / 5, 0.5, 1));
    }
    const gate = M.world(0, hf + 0.2);
    board(b.place.name, b.place.ta, '', 'worship', gate[0] + F.nx * 0.1, big ? 3.6 * s + 1.4 + 0.6 : wallH + 0.9, gate[1] + F.nz * 0.1, F.nx, F.nz, clamp(2 * hs * 0.5, 2.6, 6), false);
  }
  function mosque(b, F, ctx) {
    let hs = Math.max(3, F.hs), hf = Math.max(3, F.hf); if (ctx.ar / (4 * hs * hf) < 0.55) { hs = Math.min(hs, 9); hf = Math.min(hf, 9); }
    const M = new Model(F.cx, F.cz, F.nx, F.nz), W = 2 * hs, L = 2 * hf, H = 5.6, GRN = C(0x1f8a5b), body = C(0xf7f6f0);
    M.box(0, 0, 0, W, H, L, body); M.box(0, H - 0.5, 0, W + 0.3, 0.5, L + 0.3, GRN);
    const r = Math.min(W, L) * 0.27; M.cyl(0, H, 0, r * 1.02, r * 1.05, 1.0, body, 16); M.dome(0, H + 1.0, 0, r, GRN, 1.1); M.cone(0, H + 1.0 + r * 1.05, 0, 0.14, 1.0, GOLD, 8);
    const mh = H * 2.3; for (const sx of [-1, 1]) { const x = sx * (hs - 0.5), z = hf - 0.5; M.cyl(x, 0, z, 0.5, 0.62, mh, body, 10); M.cyl(x, mh * 0.72, z, 0.85, 0.85, 0.25, GRN, 10); M.dome(x, mh, z, 0.62, GRN, 1.3); M.cone(x, mh + 0.75, z, 0.08, 0.7, GOLD, 6); }
    M.box(0, 0, hf, Math.min(2.4, W * 0.3), 3.2, 0.18, C(0x145c3c)); { const g = new THREE.CylinderGeometry(Math.min(1.2, W * 0.15), Math.min(1.2, W * 0.15), 0.18, 14); g.rotateX(Math.PI / 2); M.put(g, 0, 3.2, hf, C(0x145c3c)); }
    for (let x = -hs + 1.8; x <= hs - 1.8; x += 3) if (Math.abs(x) > 2) M.box(x, 1.4, hf, 0.9, 2.2, 0.14, GLASS);
    const p = M.world(0, hf + 0.2); board(b.place.name, b.place.ta, 'MASJID', 'worship', p[0], 4.6, p[1], F.nx, F.nz, clamp(W * 0.6, 2.6, 5.5), false);
  }

  const APT = [[0xefe4c8, 0x8a3b2e], [0xf5f3ee, 0x5f7f9c], [0xf3e2a6, 0x7a5a36], [0xf0cfc6, 0xf7f3ee], [0xcfe3cf, 0xf5f3ee], [0xd6d3cc, 0xf5f3ee], [0xf2c9a4, 0xa8553a], [0xbfd8ea, 0xf5f3ee]];
  function apartments(b, F, ctx) {
    const nm = b.place.name || '', rbi = /^[a-z] block$/i.test(nm.trim()), key = rbi ? 'rbi' : (nm.toLowerCase().split(/ - |,|\bblock\b/)[0].trim() || 'apt' + Math.round(ctx.c[0] / 120) + '_' + Math.round(ctx.c[1] / 120));
    const hk = hashStr(key), sc = rbi ? [0xe9dfc6, 0x9a4a35] : APT[hk % APT.length], body = C(sc[0]), band = C(sc[1]), h = ctx.h, poly = ctx.poly;
    // stacked balconies on every long wall, one stack about every 4.6 m
    const floors = Math.min(18, Math.floor((h - 3.6) / 3.2)); let count = 0;
    for (let i = 0; i < poly.length && count < 320; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 7) continue;
      const ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L; let nx = uz, nz = -ux; const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2; if (pointInPoly(mx + nx * 0.4, mz + nz * 0.4, poly)) { nx = -nx; nz = -nz; }
      const n = Math.floor(L / 4.6);
      for (let j = 0; j < n; j++) { const t = (j + 0.5) / n * L, x = p[0] + ux * t + nx * 0.55, z = p[1] + uz * t + nz * 0.55; for (let k = 0; k < floors && count < 320; k++) { wbox(x, 3.6 + k * 3.2, z, 2.3, 1.0, 1.1, ux, uz, band); count++; } }
    }
    // lift and stair room, and black water tanks on the terrace
    const M = new Model(ctx.c[0], ctx.c[1], F ? F.nx : 0, F ? F.nz : 1);
    if (pointInPoly(ctx.c[0], ctx.c[1], poly) && ctx.ar > 80) { M.box(0, h, 0, 3.6, 2.7, 3.6, body); M.box(0, h + 2.7, 0, 4, 0.2, 4, band); M.cyl(1.0, h + 2.9, 0.6, 0.75, 0.75, 1.3, C(0x1c1c1c), 12); M.cyl(-1.0, h + 2.9, -0.4, 0.75, 0.75, 1.3, C(0x1c1c1c), 12); }
    if (F) {
      if (rbi) board(nm.toUpperCase(), '', 'RESERVE BANK STAFF QUARTERS', 'rbi', F.m[0] + F.nx * 0.2, Math.max(4.2, h - 1.6), F.m[1] + F.nz * 0.2, F.nx, F.nz, clamp(F.L * 0.5, 3, 5.5), false);
      else if (nm) {
        const d = clamp(F.gap - 0.9, 0, 2.4);
        if (d > 1) { const x = F.m[0] + F.nx * d, z = F.m[1] + F.nz * d; wbox(x, 0, z, 3.2, 1.9, 0.3, F.tx, F.tz, C(0x202327)); board(nm, b.place.ta, '', 'granite', x + F.nx * 0.17, 1.25, z + F.nz * 0.17, F.nx, F.nz, 3.0, false); }
        else board(nm, b.place.ta, '', 'granite', F.m[0] + F.nx * 0.2, 2.5, F.m[1] + F.nz * 0.2, F.nx, F.nz, clamp(F.L * 0.5, 2.4, 3.6), false);
      }
    }
    return { col: body, par: band, uniform: true, shop: false, style: hk % 7, noFront: true };
  }
  function school(b, F, ctx) {
    const nm = b.place.name, corp = /corporation|corpn|govt|government/i.test(nm), sc = corp ? [0xe8d9a8, 0x8a2f2a] : [[0xf5f1e4, 0x1f5fa8], [0xf1e2b0, 0x2f7d4f], [0xf7f3ea, 0x8a2f2a], [0xf3d9a0, 0x6b4a2a]][hashStr(nm) % 4];
    if (F && b.place.main) {
      nameGate(F, nm, b.place.ta, '', 'school', C(sc[0]));
      // flag mast with the tricolour in the forecourt
      const d = clamp(F.gap * 0.45, 0.8, 3), x = F.m[0] + F.nx * d + F.tx * 5, z = F.m[1] + F.nz * d + F.tz * 5;
      if (F.gap > 2.2) { wbox(x, 0, z, 0.9, 0.6, 0.9, F.tx, F.tz, STONE); wbox(x, 0.6, z, 0.09, 8, 0.09, F.tx, F.tz, GREY); [0xff9933, 0xffffff, 0x138808].forEach((c, i) => wbox(x + F.tx * 0.62, 8.2 - i * 0.26, z + F.tz * 0.62, 1.15, 0.26, 0.04, F.tx, F.tz, C(c))); }
    }
    return { col: C(sc[0]), par: C(sc[1]), uniform: true, shop: false, style: hashStr(nm) % 7, noFront: true };
  }
  function hospital(b, F, ctx) {
    const BLUE = C(0x1f6fb5), RED = C(0xc62828), h = ctx.h;
    if (F && b.place.main) {
      // entrance porch, the name above it and a red cross on the parapet
      const d = clamp(F.gap - 0.8, 0, 3.6);
      if (d > 1.6) { const x = F.m[0] + F.nx * d / 2, z = F.m[1] + F.nz * d / 2; wbox(x, 3.5, z, 7, 0.3, d, F.tx, F.tz, C(0xf4f6f7)); wbox(x, 3.5, z + 0, 7.1, 0.5, 0.12, F.tx, F.tz, BLUE); for (const s of [-1, 1]) wbox(F.m[0] + F.nx * (d - 0.3) + F.tx * 3.2 * s, 0, F.m[1] + F.nz * (d - 0.3) + F.tz * 3.2 * s, 0.4, 3.5, 0.4, F.tx, F.tz, C(0xf4f6f7)); }
      board(b.place.name, b.place.ta, 'HOSPITAL', 'hospital', F.m[0] + F.nx * 0.22, Math.min(h - 0.9, 5.2), F.m[1] + F.nz * 0.22, F.nx, F.nz, clamp(F.L * 0.7, 3, 7), false);
      const x = F.m[0] + F.nx * 0.1, z = F.m[1] + F.nz * 0.1, y = h + 0.9; wbox(x, y, z, 2.4, 2.4, 0.25, F.tx, F.tz, C(0xffffff));
      wbox(x + F.nx * 0.16, y + 0.85, z + F.nz * 0.16, 1.7, 0.6, 0.08, F.tx, F.tz, RED); wbox(x + F.nx * 0.16, y + 0.3, z + F.nz * 0.16, 0.6, 1.7, 0.08, F.tx, F.tz, RED);
    }
    return { col: C(0xf2f4f5), par: BLUE, uniform: true, shop: false, style: hashStr(b.place.name) % 7, noFront: true };
  }
  function restaurant(b, F) {
    if (!F) return null;
    const w = Math.min(F.L * 0.9, 11), x0 = F.m[0], z0 = F.m[1], A = [[0xc62828, 0xfaf7ef], [0x1b5e20, 0xfaf7ef], [0xef6c00, 0xfff3d6], [0x4e342e, 0xf3e2a6]][hashStr(b.place.name) % 4].map(C);
    // glass front with a door, a striped awning, planters and a menu stand
    wbox(x0 + F.nx * 0.08, 0.5, z0 + F.nz * 0.08, w, 2.4, 0.12, F.tx, F.tz, GLASS); wbox(x0 + F.nx * 0.1, 0, z0 + F.nz * 0.1, 1.3, 2.7, 0.16, F.tx, F.tz, C(0x6b4a2a));
    for (let k = -1; k <= 1; k += 2) wbox(x0 + F.nx * 0.12 + F.tx * k * w * 0.27, 0.5, z0 + F.nz * 0.12 + F.tz * k * w * 0.27, 0.08, 2.4, 0.14, F.tx, F.tz, C(0xe8e2d2));
    const n = Math.max(4, Math.round(w / 0.8)), sw = w / n, dep = clamp(F.gap - 0.2, 0.6, 1.5);
    for (let k = 0; k < n; k++) wbox(x0 + F.nx * dep / 2 + F.tx * ((k + 0.5) * sw - w / 2), 3.05, z0 + F.nz * dep / 2 + F.tz * ((k + 0.5) * sw - w / 2), sw, 0.1, dep, F.tx, F.tz, A[k % 2]);
    wbox(x0 + F.nx * dep, 2.8, z0 + F.nz * dep, w, 0.3, 0.06, F.tx, F.tz, A[0]);
    if (F.gap > 1.4) for (const s of [-1, 1]) { const px = x0 + F.nx * 0.6 + F.tx * s * (w / 2 - 0.4), pz = z0 + F.nz * 0.6 + F.tz * s * (w / 2 - 0.4); wbox(px, 0, pz, 0.6, 0.55, 0.6, F.tx, F.tz, C(0x9a5a3a)); wbox(px, 0.55, pz, 0.7, 0.8, 0.7, F.tx, F.tz, C(0x2f7d3a)); }
    if (F.gap > 3.2) { // a couple of tables outside
      for (const s of [-1, 1]) { const tx = x0 + F.nx * 1.9 + F.tx * s * w * 0.24, tz = z0 + F.nz * 1.9 + F.tz * s * w * 0.24; wbox(tx, 0.7, tz, 0.9, 0.06, 0.9, F.tx, F.tz, C(0xe9e4d8)); wbox(tx, 0, tz, 0.1, 0.7, 0.1, F.tx, F.tz, GREY); for (const c of [-1, 1]) wbox(tx + F.tx * c * 0.75, 0, tz + F.tz * c * 0.75, 0.36, 0.45, 0.36, F.tx, F.tz, A[0]); }
      wbox(x0 + F.nx * 1.2 + F.tx * (w / 2 + 0.2), 0, z0 + F.nz * 1.2 + F.tz * (w / 2 + 0.2), 0.6, 1.1, 0.08, F.tx, F.tz, C(0x1c1c1c));
    }
    return { shop: true };
  }
  function bank(b, F) {
    if (!F) return null; const BL = C(0x0d47a1);
    wbox(F.m[0] + F.nx * 0.1, 3.2, F.m[1] + F.nz * 0.1, Math.min(F.L * 0.9, 10), 0.7, 0.14, F.tx, F.tz, BL);
    if (F.gap > 2.4 && F.L > 6) { const o = Math.min(F.L / 2 - 1.2, 4), x = F.m[0] + F.nx * 0.95 + F.tx * o, z = F.m[1] + F.nz * 0.95 + F.tz * o; wbox(x, 0, z, 1.7, 2.3, 1.7, F.tx, F.tz, C(0x7fb4c8)); wbox(x, 2.3, z, 1.9, 0.45, 1.9, F.tx, F.tz, BL); board('ATM', '', b.place.name.toUpperCase(), 'plain', x + F.nx * 0.97, 2.52, z + F.nz * 0.97, F.nx, F.nz, 1.7, false); }
    return { shop: true };
  }

  function build(b, ctx) {
    const pl = b.place, t = pl.type; stats[t] = (stats[t] || 0) + 1;
    if (t === 'skip') return { replace: true };
    const F = frontOf(ctx.poly, ctx.c);
    if (t === 'church' || t === 'temple' || t === 'mosque') {
      if (!F || !pl.main || ctx.ar < 14) return { col: C(0xf5f0e6), par: C(t === 'temple' ? 0xb5432e : 0xd8d2c2), uniform: true, shop: false, style: 0, noFront: true };
      (t === 'church' ? church : t === 'temple' ? temple : mosque)(b, F, ctx); return { replace: true };
    }
    if (t === 'apartments') return apartments(b, F, ctx);
    if (t === 'hotel') { const r = apartments(b, F, ctx); return r; }
    if (t === 'school') return school(b, F, ctx);
    if (t === 'hospital') return hospital(b, F, ctx);
    if (t === 'restaurant') return restaurant(b, F);
    if (t === 'bank') return bank(b, F);
    if (t === 'police') { if (F) { wbox(F.m[0] + F.nx * 0.1, 3.0, F.m[1] + F.nz * 0.1, Math.min(F.L * 0.9, 9), 0.35, 0.12, F.tx, F.tz, C(0x1a3f8f)); wbox(F.m[0] + F.nx * 0.1, 3.35, F.m[1] + F.nz * 0.1, Math.min(F.L * 0.9, 9), 0.35, 0.12, F.tx, F.tz, C(0xb3261e)); board(pl.name, pl.ta, 'POLICE', 'plain', F.m[0] + F.nx * 0.22, 4.4, F.m[1] + F.nz * 0.22, F.nx, F.nz, clamp(F.L * 0.6, 2.6, 5), false); } return { col: C(0xe6dcc3), par: C(0xb3261e), uniform: true, shop: false, style: 1, noFront: true }; }
    if (t === 'post') { if (F) board(pl.name, pl.ta, 'INDIA POST', 'plain', F.m[0] + F.nx * 0.22, 4.2, F.m[1] + F.nz * 0.22, F.nx, F.nz, clamp(F.L * 0.6, 2.6, 5), false); return { col: C(0xc8372d), par: C(0xf2efe6), uniform: true, shop: false, style: 2, noFront: true }; }
    return null;
  }

  // petrol bunks are mapped as an open yard: a canopy on columns with pump islands under it
  function fuelStations() {
    for (const p of D.fuel) {
      const c = centroid(p.poly), F = frontOf(p.poly, c); if (!F) continue; stats.fuel = (stats.fuel || 0) + 1;
      const M = new Model(F.cx, F.cz, F.nx, F.nz), w = clamp(F.hs * 1.5, 8, 16), d = clamp(F.hf * 1.3, 6, 10), ioc = /iocl|indian ?oil/i.test(p.name), fa = C(ioc ? 0xf26a21 : 0xd32f2f), st = C(ioc ? 0x1d3f94 : 0xfdd835);
      M.box(0, 5.0, 0, w, 0.25, d, C(0xf5f5f5)); M.box(0, 5.25, 0, w + 0.1, 0.75, d + 0.1, fa); M.box(0, 5.4, 0, w + 0.16, 0.18, d + 0.16, st);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) M.box(sx * (w / 2 - 1.2), 0, sz * (d / 2 - 1.5), 0.45, 5, 0.45, C(0xf0f0f0));
      for (const sx of [-1, 1]) { M.box(sx * w * 0.22, 0, 0, 1.2, 0.2, 4.2, GREY); for (const sz of [-1, 1]) { M.box(sx * w * 0.22, 0.2, sz * 1.2, 0.7, 1.7, 0.5, fa); M.box(sx * w * 0.22, 1.2, sz * 1.2, 0.72, 0.4, 0.52, C(0x1c1c1c)); } }
      const q = M.world(0, F.hf + Math.min(F.gap, 2) * 0.5); wbox(q[0], 0, q[1], 0.3, 6, 0.3, F.tx, F.tz, GREY); wbox(q[0], 6, q[1], 2.6, 1.6, 0.3, F.tx, F.tz, fa);
    }
  }

  function finish() {
    fuelStations();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
    let tris = 0;
    for (const a of cells.values()) { if (!a.length) continue; const g = mergeGeometries(a); if (!g) continue; g.computeBoundingSphere(); g.computeBoundingBox(); tris += (g.index ? g.index.count : g.attributes.position.count) / 3; const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); m.name = 'place'; group.add(m); }
    if (boards.length) {
      const tex = boardAtlas(boardList), bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), gs = [];
      for (const b of boards) { const g = new THREE.PlaneGeometry(b.w, b.w / 4), uv = g.attributes.uv, u0 = (b.i % 4) / 4, v0 = 1 - (Math.floor(b.i / 4) + 1) / 32; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 32); g.rotateY(Math.atan2(b.nx, b.nz)); g.translate(b.x, b.y, b.z); gs.push(g); }
      const g = mergeGeometries(gs); if (g) { g.computeBoundingSphere(); const m = new THREE.Mesh(g, bm); m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); }
    }
    return { ...stats, boards: boardList.length, tris: Math.round(tris) };
  }
  return { build, finish };
}
