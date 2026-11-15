// Street life that makes a road read as Chennai: concrete electric poles strung with sagging wires and cable bundles,
// two-wheelers parked along every kerb, petti kadai kiosks, pushcarts and tender-coconut heaps, kolams at doorsteps,
// balconies with sarees drying, terrace stair rooms, flex banners and rooftop hoardings.
import * as THREE from 'three';
import { mergeGeometries } from './merge.js';
import { pointInPoly } from './geom.js';

// Many oriented boxes in one vertex-coloured mesh.
class BoxBatch {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  // centre, half extents, unit direction (ux, uz) of the local x axis in the ground plane
  add(cx, cy, cz, hx, hy, hz, ux, uz, col) {
    const vx = -uz, vz = ux; // local z axis
    const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [nx, ny, nz] of F) {
      const base = this.p.length / 3;
      // two tangent axes
      const t1 = nx ? [0, 1, 0] : ny ? [0, 0, 1] : [1, 0, 0], t2 = [ny * t1[2] - nz * t1[1], nz * t1[0] - nx * t1[2], nx * t1[1] - ny * t1[0]];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = (nx + t1[0] * a + t2[0] * b) * hx, ly = (ny + t1[1] * a + t2[1] * b) * hy, lz = (nz + t1[2] * a + t2[2] * b) * hz;
        this.p.push(cx + lx * ux + lz * vx, cy + ly, cz + lx * uz + lz * vz);
        this.n.push(nx * ux + nz * vx, ny, nx * uz + nz * vz); this.c.push(col.r, col.g, col.b);
      }
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; return m;
  }
}

const BANNERS = [
  ['திருமண வாழ்த்துக்கள்', 'WEDDING WISHES', '#b3123b', '#ffe07a'], ['பொங்கல் நல்வாழ்த்துக்கள்', 'HAPPY PONGAL', '#1f7a3a', '#fff3b0'],
  ['தீபாவளி சிறப்பு விற்பனை', 'DEEPAVALI SALE', '#e06a10', '#ffffff'], ['புதிய கிளை திறப்பு விழா', 'GRAND OPENING', '#2a3f9a', '#ffd84a'],
  ['பட்டு புடவைகள் – 50% தள்ளுபடி', 'SILK SAREES 50% OFF', '#7a1f6a', '#ffe9a0'], ['இனிய பிறந்தநாள் வாழ்த்துக்கள்', 'HAPPY BIRTHDAY', '#c2185b', '#fff'],
  ['தங்க நகை மாளிகை', 'GOLD JEWELLERY MART', '#8a1a1a', '#ffd24a'], ['கோடை கால சலுகை', 'SUMMER OFFER', '#0e7a8a', '#fff7c0'],
];
function bannerAtlas() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024; const g = cv.getContext('2d');
  BANNERS.forEach(([ta, en, bg, fg], i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    const gr = g.createLinearGradient(x, y, x + 512, y + 256); gr.addColorStop(0, bg); gr.addColorStop(1, '#101010'); g.fillStyle = gr; g.fillRect(x, y, 512, 256);
    g.fillStyle = fg; g.globalAlpha = 0.18; for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(x + 430, y + 128, 30 + k * 26, 0, 7); g.lineWidth = 6; g.strokeStyle = fg; g.stroke(); } g.globalAlpha = 1;
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(x + 8, y + 8, 496, 240);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 58; g.font = `800 ${fs}px "Noto Sans Tamil", "Latha", "Nirmala UI", sans-serif`; while (g.measureText(ta).width > 460 && fs > 20) { fs -= 3; g.font = `800 ${fs}px "Noto Sans Tamil", "Latha", "Nirmala UI", sans-serif`; }
    g.fillText(ta, x + 256, y + 100);
    g.font = '700 34px "Segoe UI", Arial, sans-serif'; g.fillText(en, x + 256, y + 185);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function kolamTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.fillStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round';
  const N = 5, s = 256 / (N + 1);
  for (let i = 1; i <= N; i++) for (let j = 1; j <= N; j++) if (Math.abs(i - 3) + Math.abs(j - 3) <= 2) { g.beginPath(); g.arc(i * s, j * s, 4, 0, 7); g.fill(); }
  // loops woven around the dots (a pulli kolam)
  for (let k = 0; k < 4; k++) { g.save(); g.translate(128, 128); g.rotate(k * Math.PI / 2); g.beginPath(); g.moveTo(0, -s * 2.6); g.bezierCurveTo(s * 1.3, -s * 2.6, s * 1.3, -s * 1.0, 0, -s * 0.55); g.bezierCurveTo(-s * 1.3, -s * 1.0, -s * 1.3, -s * 2.6, 0, -s * 2.6); g.stroke(); g.beginPath(); g.arc(s * 1.05, -s * 1.05, s * 0.62, 0, 7); g.stroke(); g.restore(); }
  g.beginPath(); g.arc(128, 128, s * 0.5, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function kioskTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#1d5fa8'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#f7d21a'; g.fillRect(0, 0, 256, 48); g.fillStyle = '#b3123b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 26px "Noto Sans Tamil", "Latha", "Nirmala UI", sans-serif'; g.fillText('டீ • காபி • ஜூஸ்', 128, 25);
  g.fillStyle = '#17120e'; g.fillRect(14, 58, 228, 120); // open counter
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 16; k++) { g.fillStyle = `hsl(${Math.floor(r() * 360)},80%,55%)`; g.fillRect(18 + k * 14, 60, 10, 30 + r() * 26); } // hanging snack packets
  for (let k = 0; k < 6; k++) { g.fillStyle = ['#e8d9b0', '#c9a26a', '#f2efe6'][k % 3]; g.fillRect(22 + k * 37, 140, 28, 36); g.fillStyle = '#b33'; g.fillRect(22 + k * 37, 136, 28, 6); } // glass jars
  g.fillStyle = '#e9c21a'; for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(200 + k * 5, 96 + k * 3, 4, 13, 0.5, 0, 7); g.fill(); } // bananas
  g.fillStyle = '#144a85'; g.fillRect(0, 178, 256, 78); g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '700 20px Arial'; g.fillText('TEA STALL', 128, 216);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function addStreetLife({ D, group, roads, hash, rnd, addObb, inBuilding, fronts, roofs, coastX }) {
  const C = h => new THREE.Color(h);
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const inst = (geo, mat, list, colours, opts = {}) => {
    if (!list.length) return [];
    // one InstancedMesh per 250 m cell, so whole neighbourhoods outside the view are culled
    const cells = new Map(); list.forEach((l, i) => { const k = Math.floor(l.x / 250) + ',' + Math.floor(l.z / 250); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push([l, i]); });
    const out = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1);
    for (const a of cells.values()) {
      const im = new THREE.InstancedMesh(geo, mat, a.length);
      a.forEach(([l, gi], i) => { q.setFromAxisAngle(up, l.yaw || 0); sc.setScalar(l.s || 1); m4.compose(new THREE.Vector3(l.x, l.y || 0, l.z), q, sc); im.setMatrixAt(i, m4); if (colours) im.setColorAt(i, colours(l, gi)); });
      im.computeBoundingSphere(); im.castShadow = opts.cast !== false; im.receiveShadow = true; im.matrixAutoUpdate = false; im.name = 'prop'; group.add(im); out.push(im);
    }
    return out;
  };
  // walk along a road, calling fn(x, z, tx, tz, side) at spaced points offset from the kerb
  const along = (r, step, off, fn, sides = [-1, 1]) => {
    let next = step * (0.3 + rnd() * 0.7);
    let acc = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      while (next < acc + L) { const d = next - acc; for (const side of sides) { const x = a[0] + tx * d + tz * off * side, z = a[1] + tz * d - tx * off * side; fn(x, z, tx, tz, side); } next += step * (0.6 + rnd() * 0.8); }
      acc += L;
    }
  };
  // spread the props evenly over the whole map rather than filling the first roads in the file
  let lenMajor = 0, lenMinor = 0; for (const r of roads) { if (r.cls === 'service' || r.bridge) continue; let L = 0; for (let i = 0; i < r.pts.length - 1; i++) L += Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]); if (r.major) lenMajor += L; else lenMinor += L; }
  const bikeStepMajor = Math.max(9, lenMajor * 2 / 1700), bikeStepMinor = Math.max(24, lenMinor * 2 / 1100), poleStep = Math.max(38, lenMinor / 2900);
  const land = (x, z) => x < coastX(z) - 25 && !inBuilding(x, z);

  // ---- electric poles and overhead wires on the smaller streets
  const poles = [], wire = [];
  for (const r of roads) {
    if (r.major || r.cls === 'service' || r.bridge) continue;
    let prev = null;
    along(r, poleStep, r.hw + 0.45, (x, z, tx, tz) => {
      if (!land(x, z) || poles.length > 3200) { prev = null; return; }
      const p = { x, z, yaw: Math.atan2(tx, tz), tx, tz }; poles.push(p);
      if (prev && Math.hypot(prev.x - x, prev.z - z) < 75) {
        const N = 6;
        // three conductors on the cross-arm, and a fat bundle of cable-TV and phone lines lower down
        for (const [o, y, sag] of [[-0.65, 8.05, 0.45], [0, 8.05, 0.45], [0.65, 8.05, 0.45], [0.15, 5.8, 0.9], [0.2, 5.6, 1.1]]) for (let k = 0; k < N; k++) {
          const t0 = k / N, t1 = (k + 1) / N, s0 = 4 * t0 * (1 - t0) * sag, s1 = 4 * t1 * (1 - t1) * sag;
          const ox0 = -prev.tz * o, oz0 = prev.tx * o, ox1 = -tz * o, oz1 = tx * o;
          wire.push(prev.x + ox0 + (x + ox1 - prev.x - ox0) * t0, y - s0, prev.z + oz0 + (z + oz1 - prev.z - oz0) * t0, prev.x + ox0 + (x + ox1 - prev.x - ox0) * t1, y - s1, prev.z + oz0 + (z + oz1 - prev.z - oz0) * t1);
        }
      }
      prev = p;
    }, [1]);
  }
  if (poles.length) {
    const shaft = new THREE.BoxGeometry(0.2, 8.6, 0.16); shaft.translate(0, 4.3, 0);
    const arm = new THREE.BoxGeometry(1.7, 0.1, 0.1); arm.translate(0, 8.0, 0);
    const parts = [shaft, arm]; for (const o of [-0.65, 0, 0.65]) { const ins = new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6); ins.translate(o, 8.12, 0); parts.push(ins); }
    const box = new THREE.BoxGeometry(0.34, 0.5, 0.22); box.translate(0, 5.2, 0.18); parts.push(box);
    inst(mergeGeometries(parts), std({ color: 0x9a968c }), poles.map(p => ({ x: p.x, z: p.z, yaw: p.yaw + Math.PI / 2 })));
    for (const p of poles) addObb(p.x, p.z, 0.15, 0.15, 1, 0);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const wl = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x15171a })); wl.matrixAutoUpdate = false; wl.name = 'wire'; group.add(wl);
  }

  // ---- two-wheelers parked along the kerbs
  const bikes = [];
  for (const r of roads) {
    if (r.cls === 'service' || r.bridge) continue;
    along(r, r.major ? bikeStepMajor : bikeStepMinor, r.hw + 0.75, (x, z, tx, tz, side) => {
      if (bikes.length > 4200 || rnd() < 0.4) return;
      if (!land(x, z)) { x -= tz * side * 1.25; z += tx * side * 1.25; if (!land(x, z)) return; } // shop fronts on the kerb: park at the road edge instead
      const n = rnd() < 0.5 ? 1 : 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) bikes.push({ x: x + tx * k * 0.75, z: z + tz * k * 0.75, yaw: Math.atan2(tx, tz) + side * (Math.PI / 2 - 0.35) + (rnd() - 0.5) * 0.2, lean: side });
    });
  }
  if (bikes.length) {
    const wheel = (zz) => { const w = new THREE.CylinderGeometry(0.28, 0.28, 0.09, 7); w.rotateZ(Math.PI / 2); w.translate(0, 0.28, zz); return w; };
    const seat = new THREE.BoxGeometry(0.26, 0.1, 0.62); seat.translate(0, 0.8, -0.2);
    const bar = new THREE.BoxGeometry(0.56, 0.05, 0.05); bar.translate(0, 1.02, 0.42);
    const fork = new THREE.BoxGeometry(0.07, 0.7, 0.07); fork.rotateX(-0.35); fork.translate(0, 0.66, 0.5);
    const dark = mergeGeometries([wheel(0.62), wheel(-0.6), seat, bar, fork]);
    const tank = new THREE.BoxGeometry(0.3, 0.3, 0.75); tank.translate(0, 0.6, 0.05);
    const shield = new THREE.BoxGeometry(0.36, 0.5, 0.08); shield.rotateX(-0.3); shield.translate(0, 0.72, 0.42);
    const tail = new THREE.BoxGeometry(0.28, 0.22, 0.45); tail.translate(0, 0.62, -0.42);
    const body = mergeGeometries([tank, shield, tail]);
    // tilt on the side stand
    for (const g of [dark, body]) g.rotateZ(0.12);
    const cols = [0x1a1a1c, 0xb3202a, 0x1f4f9a, 0xd9d9d6, 0x2a2a2e, 0x8a8f96, 0x0f5a4a, 0xe0a020].map(C);
    inst(dark, std({ color: 0x141414, roughness: 0.7 }), bikes, null, { cast: false });
    inst(body, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), bikes, (l, i) => cols[i * 7 % cols.length]);
  }

  // ---- petti kadai (tea and snack kiosks) and pushcarts on the busier roads
  const kiosks = [], carts = [], heaps = [];
  for (const r of roads) {
    if (r.cls === 'service' || r.bridge) continue;
    along(r, r.major ? 110 : 260, r.hw + 1.9, (x, z, tx, tz, side) => {
      if (!land(x, z) || rnd() < 0.3) return;
      const yaw = Math.atan2(-tz * side, tx * side) + Math.PI; // face the road
      const k = rnd();
      if (k < 0.4 && kiosks.length < 260) { kiosks.push({ x, z, yaw }); addObb(x, z, 1.1, 0.8, tx, tz); }
      else if (k < 0.8 && carts.length < 320) carts.push({ x: x - tz * side * -0.9, z: z + tx * side * -0.9, yaw: Math.atan2(tx, tz) + (rnd() - 0.5) * 0.5, kind: Math.floor(rnd() * 4) });
      else if (heaps.length < 160) heaps.push({ x, z, yaw: rnd() * 6 });
    }, [rnd() < 0.5 ? 1 : -1]);
  }
  if (kiosks.length) {
    const g = new THREE.BoxGeometry(2.2, 2.3, 1.5); g.translate(0, 1.15, 0);
    const side = std({ color: 0x1d5fa8, metalness: 0.2, roughness: 0.6 }), front = std({ map: kioskTexture(), roughness: 0.7 });
    inst(g, [side, side, std({ color: 0x8a8d90, metalness: 0.4, roughness: 0.5 }), side, front, side], kiosks);
    const aw = new THREE.BoxGeometry(2.5, 0.05, 1.1); aw.rotateX(0.25); aw.translate(0, 2.25, 1.15);
    const bench = new THREE.BoxGeometry(1.4, 0.06, 0.3); bench.translate(1.9, 0.45, 0.6); const leg1 = new THREE.BoxGeometry(0.06, 0.45, 0.28); leg1.translate(1.3, 0.22, 0.6); const leg2 = leg1.clone(); leg2.translate(1.2, 0, 0);
    inst(mergeGeometries([aw, bench, leg1, leg2]), std({ color: 0x7a5a3a }), kiosks);
  }
  if (carts.length) {
    const top = new THREE.BoxGeometry(1.7, 0.08, 0.95); top.translate(0, 0.85, 0);
    const parts = [top]; for (const [x, z] of [[0.6, 0.5], [-0.6, 0.5], [0.6, -0.5], [-0.6, -0.5]]) { const w = new THREE.CylinderGeometry(0.34, 0.34, 0.04, 14); w.rotateX(Math.PI / 2); w.translate(x, 0.34, z); parts.push(w); const l = new THREE.BoxGeometry(0.05, 0.5, 0.05); l.translate(x, 0.6, z * 0.85); parts.push(l); }
    const handle = new THREE.BoxGeometry(0.05, 0.05, 1.0); handle.translate(-0.95, 0.95, 0); parts.push(handle);
    inst(mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)), std({ color: 0x6a5238 }), carts);
    // heaps of produce: oranges, bananas, guavas, tomatoes
    const heap = []; let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 46; k++) { const sp = new THREE.IcosahedronGeometry(0.075, 0); const a = r() * 6.28, d = Math.sqrt(r()); sp.translate(Math.cos(a) * d * 0.7, 0.95 + (1 - d) * 0.22 + r() * 0.03, Math.sin(a) * d * 0.38); heap.push(sp); }
    const pc = [0xf08a1a, 0xe8c81a, 0x8fbf3a, 0xd83a2a].map(C);
    inst(mergeGeometries(heap), std({ roughness: 0.6 }), carts, l => pc[l.kind]);
    const umb = new THREE.ConeGeometry(1.0, 0.35, 8); umb.translate(0, 2.25, 0); const pole = new THREE.CylinderGeometry(0.02, 0.02, 1.4, 5); pole.translate(0, 1.55, 0);
    const uc = [0xd8342a, 0x2a6fd8, 0xf2c21a, 0x2a9a4a].map(C);
    inst(mergeGeometries([umb, pole]), std({ roughness: 0.8 }), carts.filter((c, i) => i % 2 === 0), (l, i) => uc[i % 4]);
  }
  if (heaps.length) { // tender coconuts piled at the roadside
    const parts = []; let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 40; k++) { const sp = new THREE.IcosahedronGeometry(0.14, 1); sp.scale(1, 1.2, 1); const a = r() * 6.28, d = Math.sqrt(r()) * 0.9; sp.translate(Math.cos(a) * d, 0.14 + (0.9 - d) * 0.55, Math.sin(a) * d); parts.push(sp); }
    inst(mergeGeometries(parts), std({ color: 0x6f9a3a, roughness: 0.7 }), heaps);
  }

  // ---- building fronts: balconies, drying clothes, kolams, banners, hoardings
  const batches = new Map(), banner = [], kolams = [];
  const bb = { add(cx, ...rest) { const k = Math.floor(cx / 250) + ',' + Math.floor(rest[1] / 250); let b = batches.get(k); if (!b) batches.set(k, b = new BoxBatch()); b.add(cx, ...rest); } };
  const cloth = [0xb3123b, 0xf2c21a, 0x1f7a4a, 0x2a6fd8, 0xf4f4f0, 0xe0607a, 0xe07a1a, 0x5b2a86, 0x20a0b0].map(C);
  const pushBanner = (cx, cy, cz, w, h, nx, nz, idx) => {
    const tx = -nz, tz = nx, u0 = (idx % 2) * 0.5, v0 = 1 - (Math.floor(idx / 2) + 1) * 0.25;
    const P = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([a, b, u, v]) => [cx + tx * a * w / 2, cy + b * h / 2, cz + tz * a * w / 2, u0 + u * 0.5, v0 + v * 0.25]);
    banner.push(P);
  };
  for (const f of fronts) {
    const dx = (f.q[0] - f.p[0]) / f.L, dz = (f.q[1] - f.p[1]) / f.L; let nx = dz, nz = -dx;
    if (inBuilding(f.m[0] + nx * 0.4, f.m[1] + nz * 0.4)) { nx = -nx; nz = -nz; } // make the normal point out of the building
    const floors = Math.floor((f.h - f.gf) / 3.2);
    if (f.gf && floors >= 1 && f.L > 5 && f.d < 30 && rnd() < 0.6) {
      const w = Math.min(f.L * 0.62, 7), rail = f.col.clone().multiplyScalar(0.8), grill = rnd() < 0.5;
      for (let k = 0; k < floors; k++) {
        const y = f.gf + k * 3.2; if (f.used && k === 0) continue;
        bb.add(f.m[0] + nx * 0.6, y + 0.02, f.m[1] + nz * 0.6, w / 2, 0.07, 0.6, dx, dz, f.col.clone().multiplyScalar(0.88));
        if (grill) { bb.add(f.m[0] + nx * 1.17, y + 0.3, f.m[1] + nz * 1.17, w / 2, 0.3, 0.05, dx, dz, rail); bb.add(f.m[0] + nx * 1.17, y + 1.02, f.m[1] + nz * 1.17, w / 2, 0.035, 0.035, dx, dz, C(0x2a2a2a)); }
        else bb.add(f.m[0] + nx * 1.17, y + 0.5, f.m[1] + nz * 1.17, w / 2, 0.5, 0.05, dx, dz, rail);
        // sarees, towels and shirts drying over the railing
        if (rnd() < 0.55) { const n = 1 + Math.floor(rnd() * 4); for (let c = 0; c < n; c++) { const t = (rnd() - 0.5) * 0.85, cw = 0.25 + rnd() * 0.3, ch = 0.35 + rnd() * (rnd() < 0.3 ? 1.1 : 0.4); bb.add(f.m[0] + nx * 1.25 + dx * t * w, y + 1.02 - ch, f.m[1] + nz * 1.25 + dz * t * w, cw, ch, 0.015, dx, dz, cloth[Math.floor(rnd() * cloth.length)]); } }
      }
    }
    // kolam on the ground before the door of houses
    if (!f.shop && f.d < 14 && f.d > 2.2 && kolams.length < 2500 && rnd() < 0.7) { const x = f.m[0] + nx * 1.5, z = f.m[1] + nz * 1.5; if (!inBuilding(x, z)) kolams.push({ x, y: 0.045, z, yaw: Math.atan2(dx, dz), s: 0.8 + rnd() * 0.5 }); }
    // flex banner tied across the upper wall, or a hoarding on the roof
    if (f.L > 7 && f.d < 30 && rnd() < (f.shop ? 0.22 : 0.06) && !f.used) {
      const idx = Math.floor(rnd() * 8);
      if (f.shop && f.h > 9 && rnd() < 0.5) { const w = Math.min(9, f.L * 0.8), h = w * 0.5, y = f.h + 1.4 + h / 2; pushBanner(f.m[0] + nx * 0.1, y, f.m[1] + nz * 0.1, w, h, nx, nz, idx); for (const t of [-0.45, 0, 0.45]) bb.add(f.m[0] - nx * 0.15 + dx * t * w, f.h + 0.7 + h / 2, f.m[1] - nz * 0.15 + dz * t * w, 0.06, 0.7 + h / 2, 0.06, dx, dz, C(0x3a3a3a)); }
      else if (f.gf) { const w = Math.min(5, f.L * 0.6); pushBanner(f.m[0] + nx * 0.3, f.gf + 1.9, f.m[1] + nz * 0.3, w, w * 0.5, nx, nz, idx); }
    }
  }
  // terrace stair rooms
  for (const r of roofs) if (r.ar > 55 && r.h < 40 && rnd() < 0.7 && pointInPoly(r.c[0], r.c[1], r.poly)) { const a = rnd() * 3.14; bb.add(r.c[0], r.h + 1.25, r.c[1], 1.5, 1.25, 1.3, Math.cos(a), Math.sin(a), r.col.clone().multiplyScalar(0.9)); bb.add(r.c[0], r.h + 2.55, r.c[1], 1.7, 0.06, 1.5, Math.cos(a), Math.sin(a), C(0x9a958c)); }
  // free-standing banners on bamboo poles beside the main roads
  for (const r of roads) {
    if (!r.major || r.bridge) continue;
    along(r, 170, r.hw + 1.6, (x, z, tx, tz, side) => {
      if (!land(x, z) || rnd() < 0.4) return;
      const w = 3.2, h = 2.0; pushBanner(x, 3.4, z, w, h, tx, tz, Math.floor(rnd() * 8)); pushBanner(x - tx * 0.02, 3.4, z - tz * 0.02, w, h, -tx, -tz, Math.floor(rnd() * 8));
      for (const t of [-0.5, 0.5]) bb.add(x - tz * t * w, 2.25, z + tx * t * w, 0.04, 2.25, 0.04, tx, tz, C(0x9a7a4a));
    }, [1]);
  }
  const boxMat = std({ vertexColors: true, roughness: 0.88 }); for (const b of batches.values()) { const bm = b.mesh(boxMat); bm.name = 'prop'; group.add(bm); }
  if (banner.length) {
    const p = [], uv = [], idx = [];
    banner.forEach((P, i) => { for (const v of P) { p.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); } idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: bannerAtlas(), roughness: 0.55, side: THREE.DoubleSide })); m.castShadow = true; m.matrixAutoUpdate = false; group.add(m);
  }
  if (kolams.length) {
    const g = new THREE.PlaneGeometry(1.5, 1.5); g.rotateX(-Math.PI / 2);
    inst(g, new THREE.MeshBasicMaterial({ map: kolamTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, color: 0xe8e4da }), kolams, null, { cast: false });
  }
  return { poles: poles.length, bikes: bikes.length, kiosks: kiosks.length, carts: carts.length, kolams: kolams.length, banners: banner.length };
}
