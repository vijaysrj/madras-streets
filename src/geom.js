// Small 2D geometry helpers (x/z plane).
export function simplify(poly, tol) {
  if (poly.length <= 4) return poly;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = out.length ? out[out.length - 1] : poly[poly.length - 1], b = poly[i], c = poly[(i + 1) % poly.length];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    if (Math.hypot(abx, abz) < tol) continue;
    const cross = Math.abs((c[0] - a[0]) * abz - (c[1] - a[1]) * abx) / (Math.hypot(c[0] - a[0], c[1] - a[1]) || 1);
    if (cross < tol * 0.25) continue;
    out.push(b);
  }
  return out.length >= 3 ? out : poly;
}
export function area(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
export function centroid(poly) { let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length]; }
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t, qz = az + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t, qx, qz };
}
// minimum-area oriented rectangle (rotating calipers over hull edges)
export function minRect(poly) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez); if (l < 1e-6) continue;
    const ux = ex / l, uz = ez / l;
    let mnU = 1e9, mxU = -1e9, mnV = 1e9, mxV = -1e9;
    for (const p of poly) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; mnU = Math.min(mnU, u); mxU = Math.max(mxU, u); mnV = Math.min(mnV, v); mxV = Math.max(mxV, v); }
    const ar = (mxU - mnU) * (mxV - mnV);
    if (!best || ar < best.ar) {
      const cu = (mnU + mxU) / 2, cv = (mnV + mxV) / 2;
      best = { ar, cx: cu * ux - cv * uz, cz: cu * uz + cv * ux, hx: (mxU - mnU) / 2, hz: (mxV - mnV) / 2, ux, uz };
    }
  }
  return best;
}
export class SegHash {
  constructor(cell) { this.cell = cell; this.m = new Map(); this.segs = []; }
  key(cx, cz) { return cx * 100003 + cz; }
  add(s) {
    const id = this.segs.length; this.segs.push(s);
    const c = this.cell, pad = (s.hw || 0) + 2;
    const x0 = Math.floor((Math.min(s.ax, s.bx) - pad) / c), x1 = Math.floor((Math.max(s.ax, s.bx) + pad) / c);
    const z0 = Math.floor((Math.min(s.az, s.bz) - pad) / c), z1 = Math.floor((Math.max(s.az, s.bz) + pad) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = this.key(i, j); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(id); }
  }
  nearest(x, z, rad, filter) {
    const c = this.cell, r = Math.ceil(rad / c), cx = Math.floor(x / c), cz = Math.floor(z / c);
    let best = { e: 1e9, s: null, q: null };
    const seen = new Set();
    for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
      const a = this.m.get(this.key(i, j)); if (!a) continue;
      for (const id of a) {
        if (seen.has(id)) continue; seen.add(id);
        const s = this.segs[id]; if (filter && !filter(s)) continue;
        const q = segDist(x, z, s.ax, s.az, s.bx, s.bz), e = q.d - (s.hw || 0);
        if (e < best.e) best = { e, s, q };
      }
    }
    return best;
  }
}
export function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
