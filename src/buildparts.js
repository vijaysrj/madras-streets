// Real 3D Chennai facade details (modelled in Blender, blender/building_parts.py): concrete sunshades over the
// windows, welded box grilles, AC outdoor units, balconies with steel railings or parapet walls, and the
// stair head room (mumty) on flat roofs. Placed as instances that line up with the painted windows of the
// facade texture, gathered per 100 m cell so far cells can be skipped.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { pointInPoly, mulberry } from './geom.js';
import { ASSETS } from './assets.js';

export async function loadParts() {
  try {
    const L = new GLTFLoader(), out = {};
    for (const k of ['parts', 'street']) { const g = await L.loadAsync(ASSETS[k]); g.scene.traverse(o => { if (o.isMesh) out[o.name] = o.geometry; }); }
    return out;
  } catch (e) { console.warn('building parts not loaded', e); return null; }
}

const PX = 512 / 6;   // facade texture pixels per metre (textures.js)
export function addBuildingParts({ group, parts, jobs, mumties, inBuilding, facades }) {
  if (!parts) return null;
  const rnd = mulberry(7071);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
  const cells = new Map();
  const add = (kind, x, y, z, yaw, sx, sy, col) => {
    const k = Math.floor(x / 100) + ',' + Math.floor(z / 100); let c = cells.get(k); if (!c) cells.set(k, c = {});
    (c[kind] || (c[kind] = [])).push([x, y, z, yaw, sx, sy, col]);
  };
  const stats = { windows: 0, grille: 0, ac: 0, balcony: 0, mumty: 0, party: 0 };
  for (const J of jobs) {
    const { poly, plan, gf, h } = J;
    const floors = Math.max(0, Math.floor((h - gf + 0.3) / 3.2));
    if (!floors) continue;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 2.5) continue;
      const dx = (q[0] - p[0]) / L, dz = (q[1] - p[1]) / L, m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      let nx = dz, nz = -dx; if (pointInPoly(m[0] + nx * 0.3, m[1] + nz * 0.3, poly)) { nx = -nx; nz = -nz; }
      const yaw = Math.atan2(nx, nz);
      for (const pc of plan[i]) {
        const len = pc.b - pc.a; if (len < 2.5) continue;
        const mid = pc.a + len / 2, mx = p[0] + dx * mid, mz = p[1] + dz * mid;
        // a wall that touches the next building (row houses) gets nothing sticking out of it
        if (inBuilding(mx + nx * 1.6, mz + nz * 1.6)) { stats.party++; continue; }
        const win = facades[pc.style].userData.win, W = win.w, top = 0.82 + win.h;
        const col = pc.col.clone().multiplyScalar(0.9);
        const balc = len >= 4.2 && rnd() < 0.3 ? (rnd() < 0.55 ? 'balc' : 'balcw') : null;
        const grille = rnd() < 0.45, acP = rnd() < 0.25;
        const at = s => [p[0] + dx * s + nx * 0.01, p[1] + dz * s + nz * 0.01];
        for (let f = 0; f < floors; f++) {
          const y = gf + 3.2 * f;
          const hasB = balc && (f > 0 || rnd() < 0.5);
          if (hasB) {
            const bl = len - 0.5, n = Math.max(1, Math.round(bl / 1.5)), sx = bl / (n * 1.5);
            for (let k = 0; k < n; k++) { const [x, z] = at(pc.a + 0.25 + (k + 0.5) * 1.5 * sx); add(balc, x, y, z, yaw, sx, 1, col); }
            for (const s of [pc.a + 0.25, pc.b - 0.25]) { const [x, z] = at(s); add('balcside', x, y, z, yaw, 1, 1, null); }
            stats.balcony++;
          }
          for (let s = pc.a + 1.5; s + W / 2 < pc.b - 0.15; s += 3) {
            const [x, z] = at(s); stats.windows++;
            const shade = !(balc && f + 1 < floors);   // a balcony above already shades this window
            if (shade) add('chajja', x, y + top + 0.13, z, yaw, W + 0.5, 1, col);
            if (grille && !hasB && f < 2) { add('grille', x, y + 0.8, z, yaw, W + 0.04, win.h + 0.04, null); stats.grille++; }
            if (acP && rnd() < 0.5 && s + W / 2 + 1.0 < pc.b) { const [ax, az] = at(s + W / 2 + 0.6); add('ac', ax, y + (hasB ? 1.6 : 0.5), az, yaw, 1, 1, null); stats.ac++; }
          }
        }
      }
    }
  }
  for (const M of mumties) {
    const { r, h, col, poly } = M;
    // put it towards one end of the roof so it does not sit under the water tank
    const off = Math.max(0, r.hx - 1.8), sgn = rnd() < 0.5 ? -1 : 1, x = r.cx + r.ux * off * sgn, z = r.cz + r.uz * off * sgn;
    const ok = [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]].every(([a, b]) => pointInPoly(x + r.ux * a - r.uz * b, z + r.uz * a + r.ux * b, poly));
    if (!ok) continue;
    add('mumty', x, h, z, Math.atan2(r.ux, r.uz) + (rnd() < 0.5 ? 0 : Math.PI), 1, 1, col.clone().multiplyScalar(0.92)); stats.mumty++;
  }
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const SHADOW = { chajja: 1, balc: 1, balcw: 1, mumty: 1 };
  let meshes = 0, inst = 0;
  for (const c of cells.values()) for (const [kind, a] of Object.entries(c)) {
    const geo = parts[kind]; if (!geo) continue;
    const im = new THREE.InstancedMesh(geo, mat, a.length);
    a.forEach(([x, y, z, yaw, sx, sy, col], i) => { qt.setFromAxisAngle(up, yaw); m4.compose(pos.set(x, y, z), qt, scl.set(sx, sy, 1)); im.setMatrixAt(i, m4); if (col) im.setColorAt(i, col); });
    if (im.instanceColor) for (let i = 0; i < a.length; i++) if (!a[i][6]) im.setColorAt(i, new THREE.Color(1, 1, 1));
    im.name = kind === 'mumty' ? 'roofpart' : kind === 'grille' || kind === 'ac' ? 'bsmall' : 'bpart'; im.userData.kind = kind; im.castShadow = !!SHADOW[kind]; im.receiveShadow = true; im.matrixAutoUpdate = false; im.computeBoundingSphere();
    group.add(im); meshes++; inst += a.length;
  }
  stats.meshes = meshes; stats.instances = inst;
  return stats;
}
