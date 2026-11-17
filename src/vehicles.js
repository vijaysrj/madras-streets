// Vehicle models built from rounded, bevelled parts with PBR paint, glass and chrome.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from './merge.js';

const CAR_COLS = [0xf4f4f2, 0xc8cacc, 0xf7f7f5, 0x8c1218, 0x1d3466, 0x15161a, 0x6b6e73, 0xe9e9e6, 0x5a0d14, 0x9da2a8, 0xeeeeea, 0x2f4a3a, 0xfafafa, 0x7a5a3a, 0x24508c, 0xb0b2b4];
const BUS_COLS = [0x9e1b1b, 0x1f5f99, 0x2a7a46];
const rb = (w, h, d, r, x, y, z) => { const g = new RoundedBoxGeometry(w, h, d, 3, r); g.translate(x, y, z); return g; };

export class Fleet {
  constructor(scene, envMap) {
    this.scene = scene;
    const paint = c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 });
    this.paints = CAR_COLS.map(paint);
    this.busPaints = BUS_COLS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 }));
    this.M = {
      yellow: new THREE.MeshPhysicalMaterial({ color: 0xf3b911, roughness: 0.38, metalness: 0.2, clearcoat: 0.6 }),
      green: new THREE.MeshPhysicalMaterial({ color: 0x2e8b3a, roughness: 0.4, metalness: 0.2, clearcoat: 0.5 }),
      canvas: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, side: THREE.DoubleSide }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x1a232b, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, envMapIntensity: 1.4 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.25, metalness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.6 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 }),
      head: new THREE.MeshStandardMaterial({ color: 0xf5f2e8, emissive: 0xfff4d6, emissiveIntensity: 0.2, roughness: 0.1 }),
      tail: new THREE.MeshStandardMaterial({ color: 0x7a0b0b, emissive: 0xff1a0a, emissiveIntensity: 0.15, roughness: 0.2 }),
      tailOn: new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0xff2010, emissiveIntensity: 2.2, roughness: 0.2 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.8 }),
      cream: new THREE.MeshStandardMaterial({ color: 0xe9e0c8, roughness: 0.6 }),
      plate: new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.5 }),
      taxiSign: new THREE.MeshStandardMaterial({ color: 0xffd21f, emissive: 0xffb000, emissiveIntensity: 0.2 }),
    };
    this.wheelG = {};
    const wheel = (r, w) => { const k = r + '_' + w; if (!this.wheelG[k]) { const t = new THREE.CylinderGeometry(r, r, w, 20); t.rotateZ(Math.PI / 2); const h = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.01, 14); h.rotateZ(Math.PI / 2); this.wheelG[k] = [t, h]; } return this.wheelG[k]; };
    this.T = {};
    // ---- sedan / taxi / hatchback ----
    const car = (L, W, H, hatch) => {
      const body = [rb(W, 0.62, L, 0.2, 0, 0.6, 0), rb(W * 0.94, 0.25, L * 0.32, 0.12, 0, 0.92, L * 0.3)];
      const cabinZ = hatch ? -0.25 : -0.15, cabinL = hatch ? L * 0.55 : L * 0.45;
      const glass = [rb(W * 0.86, 0.5, cabinL, 0.18, 0, 1.15, cabinZ)];
      body.push(rb(W * 0.82, 0.07, cabinL * 0.86, 0.04, 0, 1.42, cabinZ));
      const dark = [rb(W * 1.01, 0.22, 0.18, 0.08, 0, 0.42, L / 2 - 0.05), rb(W * 1.01, 0.24, 0.18, 0.08, 0, 0.42, -L / 2 + 0.05), rb(W * 0.5, 0.16, 0.05, 0.03, 0, 0.62, L / 2 + 0.02)];
      const head = [rb(0.36, 0.13, 0.06, 0.03, 0.55, 0.74, L / 2 - 0.01), rb(0.36, 0.13, 0.06, 0.03, -0.55, 0.74, L / 2 - 0.01)];
      const tail = [rb(0.34, 0.14, 0.06, 0.03, 0.58, 0.78, -L / 2 + 0.01), rb(0.34, 0.14, 0.06, 0.03, -0.58, 0.78, -L / 2 + 0.01)];
      const plate = [rb(0.5, 0.12, 0.02, 0.01, 0, 0.5, L / 2 + 0.06), rb(0.5, 0.12, 0.02, 0.01, 0, 0.5, -L / 2 - 0.06)];
      const wz = L / 2 - 0.8, wx = W / 2 - 0.12;
      return { body: mergeGeometries(body), glass: mergeGeometries(glass), dark: mergeGeometries(dark), head: mergeGeometries(head), tail: mergeGeometries(tail), plate: mergeGeometries(plate), wheels: [[wx, 0.32, wz, 1], [-wx, 0.32, wz, 1], [wx, 0.32, -wz, 0], [-wx, 0.32, -wz, 0]], wheel: wheel(0.32, 0.22) };
    };
    this.T[0] = car(4.4, 1.76, 1.45, false);
    this.T[3] = car(3.7, 1.66, 1.5, true);
    this.T[4] = car(4.5, 1.78, 1.45, false);
    // ---- auto-rickshaw ----
    {
      const body = [rb(1.32, 0.42, 1.9, 0.14, 0, 0.52, -0.3), rb(0.82, 0.95, 0.62, 0.28, 0, 0.82, 0.92), rb(1.34, 0.5, 0.12, 0.05, 0, 0.98, -1.2)];
      const hood = new THREE.CylinderGeometry(0.69, 0.69, 2.1, 20, 1, true, -Math.PI / 2, Math.PI); hood.rotateX(-Math.PI / 2); hood.scale(1, 0.55, 1); hood.translate(0, 1.55, -0.2);
      const canvas = [hood, rb(1.36, 0.85, 0.05, 0.02, 0, 1.2, -1.24)];
      const dark = [rb(0.06, 0.95, 0.06, 0.02, 0.62, 1.2, 0.78), rb(0.06, 0.95, 0.06, 0.02, -0.62, 1.2, 0.78), rb(0.75, 0.05, 0.05, 0.02, 0, 1.12, 0.6), rb(0.25, 0.25, 0.12, 0.05, 0, 0.48, 1.25)];
      const seat = [rb(1.15, 0.14, 0.6, 0.06, 0, 0.92, -0.65), rb(1.15, 0.5, 0.12, 0.05, 0, 1.18, -0.98), rb(0.45, 0.12, 0.35, 0.05, 0, 0.98, 0.25)];
      const glass = [rb(0.8, 0.5, 0.04, 0.02, 0, 1.48, 0.86)];
      const head = [rb(0.16, 0.14, 0.06, 0.04, 0, 0.88, 1.24)];
      const tail = [rb(0.16, 0.08, 0.05, 0.02, 0.5, 0.62, -1.26), rb(0.16, 0.08, 0.05, 0.02, -0.5, 0.62, -1.26)];
      const plate = [rb(0.36, 0.14, 0.02, 0.01, 0, 0.45, -1.27)];
      this.T[1] = { body: mergeGeometries(body), canvas: mergeGeometries(canvas), dark: mergeGeometries(dark), seat: mergeGeometries(seat), glass: mergeGeometries(glass), head: mergeGeometries(head), tail: mergeGeometries(tail), plate: mergeGeometries(plate), wheels: [[0, 0.24, 1.0, 1], [0.6, 0.24, -0.8, 0], [-0.6, 0.24, -0.8, 0]], wheel: wheel(0.24, 0.13), auto: true };
    }
    // ---- MTC bus ----
    {
      const L = 11.2, W = 2.55;
      const body = [rb(W, 1.25, L, 0.12, 0, 1.05, 0)];
      const cream = [rb(W, 0.45, L, 0.12, 0, 2.65, 0)];
      const glass = [rb(W * 0.99, 0.75, L * 0.985, 0.08, 0, 2.05, 0)];
      const dark = [rb(W * 1.01, 0.3, 0.2, 0.08, 0, 0.5, L / 2), rb(W * 1.01, 0.3, 0.2, 0.08, 0, 0.5, -L / 2)];
      const head = [rb(0.3, 0.16, 0.06, 0.03, 0.9, 0.8, L / 2 + 0.03), rb(0.3, 0.16, 0.06, 0.03, -0.9, 0.8, L / 2 + 0.03), rb(1.6, 0.28, 0.04, 0.02, 0, 2.62, L / 2 + 0.05)];
      const tail = [rb(0.25, 0.2, 0.06, 0.03, 0.95, 0.85, -L / 2 - 0.03), rb(0.25, 0.2, 0.06, 0.03, -0.95, 0.85, -L / 2 - 0.03)];
      this.T[2] = { body: mergeGeometries(body), cream: mergeGeometries(cream), glass: mergeGeometries(glass), dark: mergeGeometries(dark), head: mergeGeometries(head), tail: mergeGeometries(tail), wheels: [[1.12, 0.5, 3.6, 1], [-1.12, 0.5, 3.6, 1], [1.12, 0.5, -3.3, 0], [-1.12, 0.5, -3.3, 0]], wheel: wheel(0.5, 0.32) };
    }
    // ---- scooter with rider ----
    {
      const body = [rb(0.34, 0.42, 1.2, 0.12, 0, 0.5, -0.12), rb(0.3, 0.7, 0.2, 0.1, 0, 0.95, 0.58)];
      const dark = [rb(0.28, 0.1, 0.62, 0.05, 0, 0.78, -0.25), rb(0.62, 0.04, 0.04, 0.02, 0, 1.28, 0.62)];
      const rider = [rb(0.4, 0.58, 0.26, 0.12, 0, 1.38, -0.28), rb(0.14, 0.16, 0.58, 0.06, 0.13, 0.92, 0.0), rb(0.14, 0.16, 0.58, 0.06, -0.13, 0.92, 0.0), rb(0.1, 0.45, 0.1, 0.05, 0.2, 1.25, 0.15), rb(0.1, 0.45, 0.1, 0.05, -0.2, 1.25, 0.15)];
      const helmet = [rb(0.28, 0.3, 0.3, 0.13, 0, 1.84, -0.26)];
      const head = [rb(0.12, 0.1, 0.05, 0.04, 0, 1.0, 0.7)];
      const tail = [rb(0.12, 0.06, 0.04, 0.02, 0, 0.68, -0.73)];
      this.T[5] = { body: mergeGeometries(body), dark: mergeGeometries(dark), rider: mergeGeometries(rider), helmet: mergeGeometries(helmet), head: mergeGeometries(head), tail: mergeGeometries(tail), wheels: [[0, 0.27, 0.72, 1], [0, 0.27, -0.7, 0]], wheel: wheel(0.27, 0.1) };
    }
    this.riderMats = [0xf2f2ee, 0x9fb8d6, 0xb4472f, 0x3f5e8c, 0x8a9a5b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
    this.helmetMats = [0x111111, 0xeeeeee, 0x1f4fa0, 0xb01010].map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.2, clearcoat: 1 }));
    this.cars = new Map();
  }
  // swap the procedural auto-rickshaw for the Blender model (blender/street_objects.py)
  useModels(P) {
    if (!P || !P.auto_body) return;
    const T = this.T[1];
    for (const k of ['body', 'canvas', 'dark', 'seat', 'glass', 'head', 'tail', 'plate']) if (P['auto_' + k]) T[k] = P['auto_' + k];
    T.darkVC = true;
    this.M.darkVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 });
    this.M.glass2 = this.M.glass.clone(); this.M.glass2.side = THREE.DoubleSide;
  }
  make(type, col, isPlayer) {
    const T = this.T[type], g = new THREE.Group(), M = this.M;
    const add = (geo, mat) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    let bodyMat = this.paints[col % this.paints.length];
    if (type === 4) bodyMat = this.paints[2];
    if (type === 3 && isPlayer) bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xa3150f, roughness: 0.3, metalness: 0.4, clearcoat: 1 });
    if (type === 1) bodyMat = M.yellow;
    if (type === 2) bodyMat = this.busPaints[col % this.busPaints.length];
    if (type === 5) bodyMat = this.paints[(col * 3) % this.paints.length];
    const parts = {};
    parts.body = add(T.body, bodyMat);
    add(T.glass, T.darkVC ? M.glass2 : M.glass); add(T.dark, T.darkVC ? M.darkVC : M.dark); add(T.canvas, M.canvas); add(T.seat, M.seat); add(T.cream, M.cream); add(T.plate, M.plate);
    if (T.rider) { add(T.rider, isPlayer ? new THREE.MeshStandardMaterial({ color: 0xe8742a }) : this.riderMats[col % 5]); add(T.helmet, isPlayer ? this.helmetMats[3] : this.helmetMats[col % 4]); }
    parts.head = add(T.head, M.head); parts.tail = add(T.tail, M.tail);
    if (type === 4) add(rb(0.6, 0.18, 0.28, 0.05, 0, 1.55, -0.2), M.taxiSign);
    parts.wheels = T.wheels.map(([x, y, z, front]) => { const w = new THREE.Group(); w.position.set(x, y, z); const t = new THREE.Mesh(T.wheel[0], M.rubber), h = new THREE.Mesh(T.wheel[1], M.rim); t.castShadow = true; w.add(t, h); g.add(w); w.userData.front = front; return w; });
    g.userData.parts = parts;
    this.scene.add(g);
    return g;
  }
  // sync with simulation state
  update(cars, CF, maxCars, pcar, cam, dt, night, hideCabin) {
    for (let i = 0; i < maxCars; i++) {
      const o = i * CF, mode = cars[o + 7];
      let rec = this.cars.get(i);
      const type = cars[o + 6] | 0, col = cars[o + 18] | 0;
      if (!mode) { if (rec) rec.g.visible = false; continue; }
      if (!rec || rec.type !== type || rec.col !== col || rec.isPlayer !== (i === pcar)) {
        if (rec) { this.scene.remove(rec.g); }
        rec = { g: this.make(type, col, i === pcar), type, col, isPlayer: i === pcar, spin: 0 };
        this.cars.set(i, rec);
      }
      const x = cars[o], z = cars[o + 1];
      const dx = x - cam.x, dz = z - cam.z;
      const d2 = dx * dx + dz * dz, R = this.range || 330, vis = d2 < R * R;
      rec.g.visible = vis; if (!vis) continue;
      // distant vehicles do not need to be drawn into the shadow map
      const sh = d2 < 70 * 70; if (sh !== rec.sh) { rec.sh = sh; rec.g.traverse(m => { if (m.isMesh) m.castShadow = sh; }); }
      rec.g.position.set(x, 0, z); rec.g.rotation.y = cars[o + 2];
      // body roll/pitch from yaw-rate and braking for weight transfer
      const spd = cars[o + 12], brake = cars[o + 21] > 0.5;
      rec.g.rotation.z = THREE.MathUtils.clamp(-(cars[o + 20] || 0) * spd * 0.004, -0.05, 0.05);
      rec.spin += spd * dt / (type === 2 ? 0.5 : type === 1 ? 0.24 : 0.32);
      const steer = cars[o + 5] || 0;
      for (const w of rec.g.userData.parts.wheels) { w.rotation.x = rec.spin; w.rotation.y = w.userData.front ? -steer * 0.8 : 0; w.rotation.order = 'YXZ'; }
      const p = rec.g.userData.parts;
      if (p.tail) p.tail.material = brake ? this.M.tailOn : this.M.tail;
      rec.g.traverse(m => { if (m.isMesh && (m.material === this.M.glass || m.material === this.M.glass2 || m.material === this.M.canvas)) m.visible = !(i === pcar && hideCabin); });
    }
    this.M.head.emissiveIntensity = 0.2 + night * 3;
    this.M.tail.emissiveIntensity = 0.15 + night * 0.8;
    this.M.taxiSign.emissiveIntensity = 0.2 + night * 1.5;
  }
}
