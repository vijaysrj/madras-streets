// Builds the three.js city (ground, roads, buildings, trees, lights) and the simulation data
// (road graph, collision boxes, road/water grid) from normalized city data.
import * as THREE from 'three';
import { mergeGeometries } from './merge.js';
import { addStreetLife } from './street.js';
import { classifyPlaces, makePlaces } from './places.js';
import { SegHash, segDist, pointInPoly, minRect, area, centroid, mulberry } from './geom.js';
import { pbr, photo, facadeTextures, groundFloorTextures, signAtlas, leafTexture, frondTexture, roadMarkTexture } from './textures.js';

export function buildCity(D, scene, opts = {}) {
  const rnd = mulberry(2026);
  const B = D.bounds;
  const group = new THREE.Group(); scene.add(group);
  const boxes = []; // collision OBBs [cx, cz, hx, hz, ux, uz]
  const addObb = (cx, cz, hx, hz, ux, uz) => boxes.push([cx, cz, hx, hz, ux, uz]);

  // ---------------- materials ----------------
  const M = {
    ground: pbr('Ground037', { color: 0xc4ae8a }),
    grass: pbr('Grass004', { color: 0xa8b890 }),
    sand: pbr('Ground054', { color: 0xf2e2c4, normal: 0.6 }),
    asphalt: pbr('Asphalt026A', { color: 0x9a9a9a }),
    paving: pbr('Concrete034', { color: 0xb5ab9a }),
    concrete: pbr('Concrete034', { color: 0xbfbab2 }),
    plaster: pbr('Plaster001'),
  };
  const setRep = (m, s) => { for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k]) m[k].repeat.set(s, s); };
  // world-space UVs are written in metres, so repeat = 1/tileSize
  setRep(M.ground, 1 / 6); setRep(M.grass, 1 / 4); setRep(M.sand, 1 / 5); setRep(M.asphalt, 1 / 7); setRep(M.paving, 1 / 2.5); setRep(M.concrete, 1 / 4);
  // a small slope factor only: a large one pushes close-up ground past the near depth limit on some phone GPUs, and the layer vanishes
  const flat = (m, order) => { m.polygonOffset = true; m.polygonOffsetFactor = -0.25 * order; m.polygonOffsetUnits = -order * 4; return m; };
  flat(M.grass, 1); flat(M.sand, 1); flat(M.paving, 2); flat(M.asphalt, 3); flat(M.concrete, 1);
  const markMat = flat(new THREE.MeshStandardMaterial({ color: 0xf0eee6, roughness: 0.7 }), 4);
  const yellowMat = flat(new THREE.MeshStandardMaterial({ color: 0xe0b23a, roughness: 0.7 }), 4);

  // ---------------- ground (land only: everything west of the coastline) ----------------
  const coast = joinCoast(D.coast);
  const coastX = z => { // x of the coastline at z (east boundary of land)
    if (!coast.length) return 1e9;
    for (let i = 0; i < coast.length - 1; i++) { const a = coast[i], b = coast[i + 1]; if ((z - a[1]) * (z - b[1]) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]); }
    return z < coast[0][1] ? coast[0][0] : coast[coast.length - 1][0];
  };
  D.coastX = coastX;
  {
    const W = 4000, poly = [];
    if (coast.length) {
      poly.push([B.x0 - W, coast[0][1] - W]);
      poly.push([coast[0][0], coast[0][1] - W]);
      for (const p of coast) poly.push(p);
      const l = coast[coast.length - 1]; poly.push([l[0], l[1] + W]); poly.push([B.x0 - W, l[1] + W]);
    } else poly.push([B.x0 - W, B.z0 - W], [B.x1 + W, B.z0 - W], [B.x1 + W, B.z1 + W], [B.x0 - W, B.z1 + W]);
    group.add(mesh(polyGeom([poly], 0), M.ground, { receive: true }));
  }
  // land-use patches
  const byKind = {};
  for (const a of D.areas) if (a.poly && a.poly.length >= 3) (byKind[a.kind] = byKind[a.kind] || []).push(a.poly);
  if (byKind.park) group.add(mesh(polyGeom(byKind.park, 0.02), M.grass, { receive: true }));
  if (byKind.pitch) group.add(mesh(polyGeom(byKind.pitch, 0.02), M.grass, { receive: true }));
  if (byKind.wood) group.add(mesh(polyGeom(byKind.wood, 0.02), M.grass, { receive: true }));
  if (byKind.compound) group.add(mesh(polyGeom(byKind.compound, 0.015), flat(pbr('Ground037', { color: 0xd8ccb2 }), 1), { receive: true }));
  if (byKind.paved) group.add(mesh(polyGeom(byKind.paved, 0.02), M.concrete, { receive: true }));
  // beach: OSM beach polygons, plus a strip along the coast so the sand meets the sea
  const beachPolys = (byKind.beach || []).slice();
  if (coast.length) { const strip = []; const rp = []; for (const r of D.roads) for (const q of r.pts) rp.push(q);
    const sandW = p => { let best = 260; for (const q of rp) { const dx = p[0] - q[0]; if (dx > 0 && dx < best && Math.abs(q[1] - p[1]) < 45) best = dx; } return Math.max(40, best - 5); };
    for (const p of coast) strip.push([p[0] - sandW(p), p[1]]); for (let i = coast.length - 1; i >= 0; i--) strip.push([coast[i][0] + 6, coast[i][1]]); beachPolys.push(strip); }
  if (beachPolys.length) group.add(mesh(polyGeom(beachPolys, 0.025), M.sand, { receive: true }));
  const waterPolys = byKind.water || [];
  const waterLines = D.areas.filter(a => a.kind === 'waterline');

  // ---------------- roads ----------------
  const roads = D.roads.filter(r => r.pts.length >= 2);
  const hash = new SegHash(50);
  roads.forEach((r, ri) => { for (let i = 0; i < r.pts.length - 1; i++) hash.add({ ax: r.pts[i][0], az: r.pts[i][1], bx: r.pts[i + 1][0], bz: r.pts[i + 1][1], hw: r.hw, major: r.major, ri, i }); });
  const pavGeo = [], asphGeo = [], markGeo = [], yelGeo = [];
  for (const r of roads) {
    if (r.cls !== 'service') pavGeo.push(ribbon(r.pts, r.hw + (r.major ? 2.6 : 1.6), 0.05));
    asphGeo.push(ribbon(r.pts, r.hw, 0.08));
    if (r.major && r.hw >= 5) {
      yelGeo.push(ribbon(r.pts, 0.08, 0.1, 0.17)); yelGeo.push(ribbon(r.pts, 0.08, 0.1, -0.17));
      markGeo.push(ribbon(r.pts, 0.08, 0.1, r.hw - 0.45)); markGeo.push(ribbon(r.pts, 0.08, 0.1, -(r.hw - 0.45)));
    }
  }
  const dash = flat(new THREE.MeshStandardMaterial({ color: 0xf0eee6, roughness: 0.7, alphaMap: roadMarkTexture(), transparent: true, alphaTest: 0.5 }), 4);
  const dashGeo = []; for (const r of roads) if (r.major && r.hw >= 6) { dashGeo.push(ribbon(r.pts, 0.08, 0.1, r.hw * 0.5, true)); dashGeo.push(ribbon(r.pts, 0.08, 0.1, -r.hw * 0.5, true)); }
  if (pavGeo.length) group.add(mesh(mergeGeometries(pavGeo), M.paving, { receive: true }));
  if (asphGeo.length) group.add(mesh(mergeGeometries(asphGeo), M.asphalt, { receive: true }));
  if (yelGeo.length) group.add(mesh(mergeGeometries(yelGeo), yellowMat, { receive: true }));
  if (markGeo.length) group.add(mesh(mergeGeometries(markGeo), markMat, { receive: true }));
  if (dashGeo.length) group.add(mesh(mergeGeometries(dashGeo), dash, { receive: true }));

  // ---------------- buildings ----------------
  const facades = facadeTextures(), shops = groundFloorTextures();
  const facadeMats = facades.map(t => new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.92, emissive: 0xffc88a, emissiveMap: t.userData.lit, emissiveIntensity: 0 }));
  D.windowMats = facadeMats;
  const shopMats = shops.map(t => new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.9 }));
  const roofMat = new THREE.MeshStandardMaterial({ map: M.concrete.map, roughnessMap: M.concrete.roughnessMap, color: 0xa9a49b, roughness: 1 });
  const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: photo('Plaster001_Color') }); plainMat.map.repeat.set(1 / 3, 1 / 3);
  // geometry is gathered per 250 m cell so that each neighbourhood is its own mesh and can be frustum-culled
  const cellMap = () => { const m = new Map(); m.at = c => { const k = Math.floor(c[0] / 250) + ',' + Math.floor(c[1] / 250); let a = m.get(k); if (!a) m.set(k, a = []); return a; }; return m; };
  const facGeo = facades.map(cellMap), shopGeo = shops.map(cellMap), roofGeo = cellMap(), plainGeo = cellMap();
  const signs = [], fronts = [], roofs = [];
  const tanks = [];
  const PAL = [0xf2eee4, 0xf3dfa8, 0xf0cf6a, 0xe9b3a6, 0x9cc6e0, 0xa9dbb4, 0xd98f6a, 0xcfcac0, 0xe7d6b4, 0xc9b3e0, 0xfaf7ef, 0xe6b46e, 0x8fcfc4, 0xf2a7b8, 0xb9e07a, 0x7fb3d9].map(h => new THREE.Color(h));
  const nearMajor = (x, z) => { const nb = hash.nearest(x, z, 40); return nb.s ? nb : null; };
  classifyPlaces(D);
  const places = makePlaces({ D, hash, roads, polyGeom, group });
  for (const b of D.buildings) {
    const poly = b.poly; if (poly.length < 3) continue;
    const ar = Math.abs(area(poly)); if (ar < 8) continue;
    const c = centroid(poly);
    const nb = nearMajor(c[0], c[1]);
    const busy = nb && nb.s.major && nb.e < 25;
    let h = b.h;
    if (!isFinite(h)) {
      const floors = ar > 1500 ? 3 + Math.floor(rnd() * 5) : ar > 500 ? 2 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * (busy ? 4 : 3));
      h = floors * 3.3 + 0.6;
    }
    h = Math.max(3, Math.min(h, 160));
    // a real place (church, temple, apartments, school...) is built to look like what it is
    const pl = b.place ? places.build(b, { poly, c, h, ar }) : null, rep = !!(pl && pl.replace);
    const rcol = PAL[Math.floor(rnd() * PAL.length)].clone().multiplyScalar(0.9 + rnd() * 0.12), col = pl && pl.col ? pl.col.clone() : rcol;
    const rstyle = Math.floor(rnd() * facGeo.length), style = pl && pl.style != null ? pl.style % facGeo.length : rstyle;
    const religious = b.amenity === 'place_of_worship' || b.kind === 'temple' || b.kind === 'church' || b.kind === 'mosque';
    const gf = h > 5 && !religious ? 3.6 : 0;
    const rshop = busy || (nb && nb.e < 8 && rnd() < 0.5), shop = pl && pl.shop != null ? pl.shop : rshop, uni = !!(pl && pl.uniform);
    const shopStyle = shop ? Math.floor(rnd() * 3) : 3;
    let plan = null;
    if (rep) { /* drawn by places.js */ } else if (gf) {
      // A long OSM block is really a row of separate narrow buildings: split every long wall into 6-9 m plots,
      // each with its own paint, window style, shop front and parapet height.
      plan = poly.map((p, i) => {
        const q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), out = [];
        const mk = (a, bb, own) => out.push({ a, b: bb, col: own && !uni && rnd() < 0.75 ? PAL[Math.floor(rnd() * PAL.length)].clone().multiplyScalar(0.88 + rnd() * 0.14) : col, style: own && !uni ? Math.floor(rnd() * facGeo.length) : style, shopStyle: shop ? Math.floor(rnd() * 3) : shopStyle, par: own && !uni ? 0.5 + rnd() * 1.3 : 0.9 });
        if (L < 11) mk(0, L, false); else { let d = 0; while (L - d > 13) { const w = rnd() < 0.6 ? 6 : 9; mk(d, d + w, true); d += w; } mk(d, L, true); }
        return out;
      });
      wallsPlan(poly, plan, b.minH || 0, () => gf, pc => shopGeo[pc.shopStyle].at(c), pc => pc.col, 6, 3.6, 0);
      wallsPlan(poly, plan, gf, () => h, pc => facGeo[pc.style].at(c), pc => pc.col, 6, 3.2, gf);
      wallsPlan(poly, plan, h, pc => h + pc.par, () => plainGeo.at(c), pc => pl && pl.par ? pl.par : pc.col.clone().multiplyScalar(0.93), 3, 3, 0);
    } else {
      walls(poly, b.minH || 0, h, plainGeo.at(c), col, 3, 3, 0);
      walls(poly, h, h + 0.9, plainGeo.at(c), pl && pl.par ? pl.par : col.clone().multiplyScalar(0.93), 3, 3, 0);
    }
    if (!rep) roofGeo.at(c).push(polyGeom([poly], h + 0.02));
    // collision: oriented rectangle around the footprint
    const r = minRect(poly);
    if (r && b.minH < 2) {
      if (r.hx * r.hz * 4 < ar * 1.6 || poly.length <= 5) addObb(r.cx, r.cz, r.hx, r.hz, r.ux, r.uz);
      else { // irregular: one thin box per wall
        for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.5) continue; addObb((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, L / 2, 0.4, (q[0] - p[0]) / L, (q[1] - p[1]) / L); }
      }
    }
    if (rep || (pl && pl.noFront)) continue;
    // roof water tank
    if (ar > 40 && rnd() < 0.6) tanks.push([c[0] + (rnd() - 0.5) * 3, h, c[1] + (rnd() - 0.5) * 3]);
    // shop sign on the wall that faces the nearest road
    roofs.push({ c, h, col, ar, poly });
    if (nb) {
      let best = null;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 3) continue;
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], d = Math.hypot(m[0] - nb.q.qx, m[1] - nb.q.qz);
        if (!best || d < best.d) best = { d, p, q, L, m, i };
      }
      if (best) { fronts.push({ ...best, h, gf, col, shop: shop && !!gf, poly }); if (shop && gf) for (const pc of plan[best.i]) { const len = pc.b - pc.a; if (len < 3.5) continue; const dx = (best.q[0] - best.p[0]) / best.L, dz = (best.q[1] - best.p[1]) / best.L; const pp = [best.p[0] + dx * pc.a, best.p[1] + dz * pc.a], qq = [best.p[0] + dx * pc.b, best.p[1] + dz * pc.b]; signs.push({ d: best.d, p: pp, q: qq, L: len, m: [(pp[0] + qq[0]) / 2, (pp[1] + qq[1]) / 2], poly, idx: Math.floor(rnd() * 32) }); } }
    }
  }
  D.placeStats = places.finish();
  const addCells = (m, mat) => { for (const a of m.values()) if (a.length) group.add(mesh(mergeGeometries(a), mat, { cast: true, receive: true })); };
  facGeo.forEach((m, i) => addCells(m, facadeMats[i])); shopGeo.forEach((m, i) => addCells(m, shopMats[i])); addCells(plainGeo, plainMat); addCells(roofGeo, roofMat);
  // signs
  // real shop and place names from the map data go on the nearest shop board, or on the nearest road-facing wall
  const SIGNK = /^(restaurant|fast_food|cafe|bank|atm|pharmacy|clinic|hospital|doctors|dentist|library|cinema|school|college|police|post_office|fuel|hotel|veterinary|public_building|ice_cream|bar|community_centre|theatre|kindergarten)$/;
  const realList = [], realIdx = new Map(); let realSigns = 0;
  for (const p of D.pois) {
    if (p.poly) continue; // campuses carry their name on a gate board instead
    const t = p.tags || {}; if (!(t.shop || t.office || SIGNK.test(t.amenity || '') || t.tourism === 'hotel')) continue;
    if (!realIdx.has(p.name) && realList.length >= 216) continue;
    let bs = null, bd = 45; for (const s of signs) { if (s.real != null) continue; const d = Math.hypot(s.m[0] - p.x, s.m[1] - p.z); if (d < bd) { bd = d; bs = s; } }
    if (!bs) { let bf = null; bd = 40; for (const f of fronts) { if (f.used || f.L < 3.5) continue; const d = Math.hypot(f.m[0] - p.x, f.m[1] - p.z); if (d < bd) { bd = d; bf = f; } }
      if (bf) { bf.used = 1; const L = Math.min(bf.L, 8), dx = (bf.q[0] - bf.p[0]) / bf.L, dz = (bf.q[1] - bf.p[1]) / bf.L; bs = { d: bf.d, p: [bf.m[0] - dx * L / 2, bf.m[1] - dz * L / 2], q: [bf.m[0] + dx * L / 2, bf.m[1] + dz * L / 2], L, m: bf.m, poly: bf.poly, idx: 0 }; signs.push(bs); } }
    if (!bs) continue;
    if (!realIdx.has(p.name)) { realIdx.set(p.name, realList.length); realList.push({ name: p.name, ta: t['name:ta'] || '', kind: t.shop || t.amenity || t.office || t.tourism }); }
    bs.real = realIdx.get(p.name); realSigns++; p.sign = bs;
  }
  D.realSigns = realSigns;
  if (signs.length) {
    const atlas = signAtlas(realList);
    const sm = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0 });
    D.signMat = sm;
    const gs = [];
    for (const s of signs) {
      const w = Math.min(s.L * 0.85, 7), dx = (s.q[0] - s.p[0]) / s.L, dz = (s.q[1] - s.p[1]) / s.L; let nx = dz, nz = -dx; if (pointInPoly(s.m[0] + nx * 0.4, s.m[1] + nz * 0.4, s.poly)) { nx = -nx; nz = -nz; } // outward normal for CCW (x east, z south)
      const g = new THREE.PlaneGeometry(w, w / 4.2);
      const uv = g.attributes.uv;
      if (s.real != null) { const u0 = (s.real % 6) / 6, vh = 3072 / 36 / 4096, v0 = 1 - 1024 / 4096 - (Math.floor(s.real / 6) + 1) * vh; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 6, v0 + uv.getY(i) * vh); }
      else { const u0 = (s.idx % 4) / 4, v0 = 1 - (Math.floor(s.idx / 4) + 1) / 32; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 32); }
      g.rotateY(Math.atan2(nx, nz)); g.translate(s.m[0] + nx * 0.25, 3.9, s.m[1] + nz * 0.25);
      gs.push(g);
      // awning
      const a = new THREE.BoxGeometry(w * 1.02, 0.08, 1.1); a.rotateY(Math.atan2(nx, nz)); a.translate(s.m[0] + nx * 0.6, 3.25, s.m[1] + nz * 0.6); gs.push(colorize(a, null));
    }
    const signGeo = mergeGeometries(gs.filter(g => !g.userData.box));
    group.add(mesh(signGeo, sm, { cast: true }));
    // tin/fabric awnings over the shop fronts, in a few faded colours
    const aw = gs.filter(g => g.userData.box), cols = [0x2f6b8a, 0x8a3a2f, 0x3d6b3a, 0x9a8a6a, 0x5a5f66];
    aw.forEach((g, i) => { const c = new THREE.Color(cols[i % cols.length]); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) a.set([c.r, c.g, c.b], k * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); });
    if (aw.length) group.add(mesh(mergeGeometries(aw), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }), { cast: true, receive: true }));
  }
  // roof tanks (the black Sintex tanks seen on every Chennai terrace)
  if (tanks.length) {
    const tg = new THREE.CylinderGeometry(0.75, 0.7, 1.4, 14); tg.translate(0, 0.7, 0);
    const im = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.55 }), tanks.length);
    const m4 = new THREE.Matrix4(); tanks.forEach((t, i) => { m4.makeTranslation(t[0], t[1], t[2]); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; im.name = 'tank'; group.add(im);
  }

  // ---------------- water ----------------
  const water = { polys: waterPolys, lines: waterLines };

  // ---------------- trees ----------------
  const treePts = D.trees.slice();
  const freeAt = (x, z) => { const nb = hash.nearest(x, z, 12); if (nb.s && nb.e < 1.5) return false; return true; };
  // avenue trees along roads
  for (const r of roads) {
    if (r.cls === 'service') continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2) continue;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (let d = 6 + rnd() * 10; d < L - 4; d += 14 + rnd() * 18) for (const side of [-1, 1]) {
        if (rnd() < 0.55) continue;
        const off = r.hw + (r.major ? 2.0 : 1.2);
        treePts.push([a[0] + tx * d + tz * off * side, a[1] + tz * d - tx * off * side, 1]);
      }
    }
  }
  for (const p of byKind.park || []) { const ar = Math.abs(area(p)); const n = Math.min(200, ar / 120); const bb = bbox(p); for (let i = 0; i < n; i++) { const x = bb[0] + rnd() * (bb[2] - bb[0]), z = bb[1] + rnd() * (bb[3] - bb[1]); if (pointInPoly(x, z, p)) treePts.push([x, z]); } }
  // remove trees inside buildings
  const bgrid = new Map(), BG = 20;
  D.buildings.forEach((b, i) => { const bb = bbox(b.poly); for (let x = Math.floor(bb[0] / BG); x <= Math.floor(bb[2] / BG); x++) for (let z = Math.floor(bb[1] / BG); z <= Math.floor(bb[3] / BG); z++) { const k = x * 100003 + z; let a = bgrid.get(k); if (!a) bgrid.set(k, a = []); a.push(i); } });
  const inBuilding = (x, z) => { const a = bgrid.get(Math.floor(x / BG) * 100003 + Math.floor(z / BG)); if (!a) return false; for (const i of a) if (pointInPoly(x, z, D.buildings[i].poly)) return true; return false; };
  const treesOk = treePts.filter(([x, z]) => x < coastX(z) - 30 && freeAt(x, z) && !inBuilding(x, z) && !waterPolys.some(p => pointInPoly(x, z, p)));
  addTrees(group, treesOk, rnd);
  for (const [x, z] of treesOk) addObb(x, z, 0.35, 0.35, 1, 0);
  // palms on the beach
  const palms = [];
  if (coast.length) for (let i = 0; i < coast.length - 1; i++) { const a = coast[i], b = coast[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d < L; d += 12) if (rnd() < 0.35) { const t = d / L; palms.push([a[0] + (b[0] - a[0]) * t - 50 - rnd() * 60, a[1] + (b[1] - a[1]) * t]); } }
  // coconut palms leaning out of house compounds all over the city
  for (const b of D.buildings) if (rnd() < 0.16) { const bb = bbox(b.poly); const k = Math.floor(rnd() * 4); palms.push([(k & 1 ? bb[2] + 1.5 + rnd() * 2 : bb[0] - 1.5 - rnd() * 2), (k & 2 ? bb[3] + 1.5 + rnd() * 2 : bb[1] - 1.5 - rnd() * 2)]); }
  const palmsOk = palms.filter(([x, z]) => freeAt(x, z) && !inBuilding(x, z));
  addPalms(group, palmsOk, rnd);
  for (const [x, z] of palmsOk) addObb(x, z, 0.3, 0.3, 1, 0);

  // ---------------- street lights ----------------
  const lamps = [];
  for (const r of roads) {
    if (!r.major) continue;
    let acc = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      for (let d = (35 - acc % 35) % 35; d < L; d += 35) {
        const side = Math.floor((acc + d) / 35) % 2 ? 1 : -1, off = r.hw + 1.0;
        const x = a[0] + tx * d + tz * off * side, z = a[1] + tz * d - tx * off * side;
        lamps.push({ x, z, ax: x - tz * side * 1.8, az: z + tx * side * 1.8, yaw: Math.atan2(-tz * side, tx * side) });
      }
      acc += L;
    }
  }
  if (lamps.length) {
    const pole = new THREE.CylinderGeometry(0.07, 0.11, 9, 8); pole.translate(0, 4.5, 0);
    const arm = new THREE.BoxGeometry(0.08, 0.08, 1.9); arm.translate(0, 8.9, 0.9);
    const head = new THREE.BoxGeometry(0.32, 0.14, 0.6); head.translate(0, 8.82, 1.8);
    const g = mergeGeometries([pole, arm]);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x80848a, roughness: 0.5, metalness: 0.6 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd28a, emissiveIntensity: 0 });
    D.lampHeadMat = headMat;
    const im = new THREE.InstancedMesh(g, lampMat, lamps.length), ih = new THREE.InstancedMesh(head, headMat, lamps.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    lamps.forEach((l, i) => { q.setFromAxisAngle(up, Math.atan2(l.ax - l.x, l.az - l.z)); m4.compose(new THREE.Vector3(l.x, 0, l.z), q, one); im.setMatrixAt(i, m4); ih.setMatrixAt(i, m4); });
    im.castShadow = true; im.name = ih.name = 'lamp'; group.add(im, ih);
    // sodium light pools on the road (cheap stand-in for hundreds of real lights)
    const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d');
    const rg = pg.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,200,120,1)'); rg.addColorStop(0.45, 'rgba(255,170,80,0.45)'); rg.addColorStop(1, 'rgba(255,150,60,0)');
    pg.fillStyle = rg; pg.fillRect(0, 0, 128, 128);
    const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
    const poolMat = new THREE.MeshBasicMaterial({ map: pt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
    D.poolMat = poolMat;
    const pgeo = new THREE.PlaneGeometry(16, 16); pgeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(pgeo, poolMat, lamps.length);
    lamps.forEach((l, i) => { m4.makeTranslation(l.x + (l.ax - l.x) * 1.3, 0.06, l.z + (l.az - l.z) * 1.3); pools.setMatrixAt(i, m4); });
    pools.renderOrder = 2; group.add(pools);
    for (const l of lamps) addObb(l.x, l.z, 0.15, 0.15, 1, 0);
  }

  // ---------------- simulation grid ----------------
  const GC = 4, gx0 = B.x0 - 50, gz0 = B.z0 - 50;
  let gw = Math.ceil((B.x1 - B.x0 + 100) / GC), gh = Math.ceil((B.z1 - B.z0 + 100) / GC);
  const grid = new Uint8Array(gw * gh);
  const rasterSeg = (ax, az, bx, bz, hw, bit) => {
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - gx0) / GC)), x1 = Math.min(gw - 1, Math.floor((Math.max(ax, bx) + hw - gx0) / GC));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz) - hw - gz0) / GC)), z1 = Math.min(gh - 1, Math.floor((Math.max(az, bz) + hw - gz0) / GC));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const cx = gx0 + (i + 0.5) * GC, cz = gz0 + (j + 0.5) * GC; if (segDist(cx, cz, ax, az, bx, bz).d < hw) grid[j * gw + i] |= bit; }
  };
  for (let j = 0; j < gh; j++) { const z = gz0 + (j + 0.5) * GC, cx = coastX(z) + 8; for (let i = 0; i < gw; i++) if (gx0 + (i + 0.5) * GC > cx) grid[j * gw + i] |= 2; }
  for (const p of waterPolys) { const bb = bbox(p); for (let j = Math.max(0, Math.floor((bb[1] - gz0) / GC)); j <= Math.min(gh - 1, Math.floor((bb[3] - gz0) / GC)); j++) for (let i = Math.max(0, Math.floor((bb[0] - gx0) / GC)); i <= Math.min(gw - 1, Math.floor((bb[2] - gx0) / GC)); i++) if (pointInPoly(gx0 + (i + 0.5) * GC, gz0 + (j + 0.5) * GC, p)) grid[j * gw + i] |= 2; }
  for (const l of waterLines) for (let i = 0; i < l.line.length - 1; i++) rasterSeg(l.line[i][0], l.line[i][1], l.line[i + 1][0], l.line[i + 1][1], l.w / 2, 2);
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) rasterSeg(r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1], r.hw + 1, 1);

  D.street = addStreetLife({ D, group, roads, hash, rnd, addObb, inBuilding, fronts, roofs, coastX });
  console.log('real signs', D.realSigns); console.log('places', JSON.stringify(D.placeStats)); console.log('street', JSON.stringify(D.street));
  // City-wide instanced meshes (trees, palms, lamps, roof tanks) are split into 250 m cells so the renderer can skip
  // the ones outside the view, and every detail mesh records its centre so far-away detail can be hidden.
  for (const im of group.children.slice()) {
    if (!im.isInstancedMesh || !/^(tree|palm|lamp|tank)$/.test(im.name) || im.count < 2) continue;
    const cells = new Map(), m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m4); const k = Math.floor(m4.elements[12] / 250) + ',' + Math.floor(m4.elements[14] / 250); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i); }
    for (const a of cells.values()) {
      const c = new THREE.InstancedMesh(im.geometry, im.material, a.length);
      a.forEach((src, i) => { im.getMatrixAt(src, m4); c.setMatrixAt(i, m4); if (im.instanceColor) { im.getColorAt(src, col); c.setColorAt(i, col); } });
      c.castShadow = im.castShadow; c.receiveShadow = im.receiveShadow; c.renderOrder = im.renderOrder; c.name = im.name; c.matrixAutoUpdate = false; c.computeBoundingSphere(); group.add(c);
    }
    group.remove(im); im.dispose();
  }
  const lod = [];
  for (const o of group.children) { if (!/^(tree|palm|lamp|tank|prop|wire|place)$/.test(o.name)) continue; let bs = o.boundingSphere; if (!bs) { if (o.isInstancedMesh) { o.computeBoundingSphere(); bs = o.boundingSphere; } else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); bs = o.geometry.boundingSphere; } } lod.push({ o, x: bs.center.x, z: bs.center.z, r: bs.radius, kind: o.name }); }
  return { lod, group, roads, hash, boxes, grid, gw, gh, GC, gx0, gz0, lamps, coastX, water, byKind };
}

// ---------- helpers ----------
function bbox(p) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const q of p) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); } return [a, b, c, d]; }
function mesh(g, m, o = {}) { g.computeBoundingSphere(); g.computeBoundingBox(); const x = new THREE.Mesh(g, m); x.castShadow = !!o.cast; x.receiveShadow = !!o.receive; x.matrixAutoUpdate = false; x.updateMatrix(); return x; }
function colorize(g) { g.userData.box = true; return g; }
function joinCoast(lines) {
  if (!lines || !lines.length) return [];
  const pts = lines.flat();
  // keep only the main N-S line: sort by z and drop points that jump far east/west
  pts.sort((a, b) => a[1] - b[1]);
  const out = []; for (const p of pts) if (!out.length || p[1] - out[out.length - 1][1] > 3) out.push(p);
  return out;
}
// flat polygon(s) at height y with world-space UVs (metres)
export function polyGeom(polys, y) {
  const pos = [], uv = [], idx = [];
  for (const poly of polys) {
    const pts = poly.map(p => new THREE.Vector2(p[0], p[1]));
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { continue; }
    const base = pos.length / 3;
    for (const p of poly) { pos.push(p[0], y, p[1]); uv.push(p[0], p[1]); }
    for (const t of tris) idx.push(base + t[0], base + t[2], base + t[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // force up normals
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
// road ribbon with mitred joints; uv in metres (world-aligned) or along-road when along=true
function ribbon(pts, hw, y, off = 0, along = false) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let nx = dz, nz = -dx;
    // mitre length
    let k = 1;
    if (i > 0 && i < pts.length - 1) { const d1x = p[0] - a[0], d1z = p[1] - a[1], l1 = Math.hypot(d1x, d1z) || 1; const c = (d1x / l1) * dx + (d1z / l1) * dz; k = 1 / Math.max(0.5, Math.sqrt((1 + c) / 2)); }
    if (i > 0) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const L = [p[0] + nx * (off + hw * k), p[1] + nz * (off + hw * k)], R = [p[0] + nx * (off - hw * k), p[1] + nz * (off - hw * k)];
    pos.push(L[0], y, L[1], R[0], y, R[1]);
    if (along) uv.push(0, acc / 9, 1, acc / 9); else uv.push(L[0], L[1], R[0], R[1]);
    if (i > 0) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  // round caps at the ends so junctions are filled
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const normals = new Float32Array(pos.length); for (let i = 1; i < normals.length; i += 3) normals[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (!along && off === 0) {
    const caps = [];
    for (const p of [pts[0], pts[pts.length - 1]]) { const c = new THREE.CircleGeometry(hw, 16); c.rotateX(-Math.PI / 2); c.translate(p[0], y, p[1]); const u = c.attributes.uv, ps = c.attributes.position; for (let i = 0; i < u.count; i++) u.setXY(i, ps.getX(i), ps.getZ(i)); caps.push(c.toNonIndexed()); }
    return mergeGeometries([g.toNonIndexed(), ...caps]);
  }
  return g.toNonIndexed();
}
// extruded walls for a footprint between y0 and y1; uv: u = perimeter / tileW, v = (y - vBase) / tileH
// walls built plot by plot (see the plan in the building loop); each plot may go to a different material bucket
function wallsPlan(poly, plan, y0, y1Fn, outFn, colFn, tileW, tileH, vBase) {
  const acc = new Map();
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 1e-3) return;
    const dx = (q[0] - p[0]) / L, dz = (q[1] - p[1]) / L;
    for (const pc of plan[i]) {
      const out = outFn(pc); let A = acc.get(out); if (!A) acc.set(out, A = { pos: [], uv: [], col: [] });
      const ax = p[0] + dx * pc.a, az = p[1] + dz * pc.a, bx = p[0] + dx * pc.b, bz = p[1] + dz * pc.b, y1 = y1Fn(pc), col = colFn(pc);
      const u1 = (pc.b - pc.a) / tileW, v0 = (y0 - vBase) / tileH, v1 = (y1 - vBase) / tileH;
      A.pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      A.uv.push(0, v0, u1, v0, u1, v1, 0, v0, u1, v1, 0, v1);
      for (const yy of [y0, y0, y1, y0, y1, y1]) { const k = yy === y0 && y0 < 1 ? 0.82 : 1; A.col.push(col.r * k, col.g * k, col.b * k); }
    }
  });
  for (const [out, A] of acc) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3)); g.computeVertexNormals(); out.push(g); }
}
function walls(poly, y0, y1, out, col, tileW, tileH, vBase) {
  const pos = [], uv = [], colr = [];
  let per = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    // snap tile count so windows are not cut at corners
    const u0 = per / tileW, u1 = (per + L) / tileW;
    const v0 = (y0 - vBase) / tileH, v1 = (y1 - vBase) / tileH;
    pos.push(p[0], y0, p[1], q[0], y0, q[1], q[0], y1, q[1], p[0], y0, p[1], q[0], y1, q[1], p[0], y1, p[1]);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    const dark = 0.82; // grime toward the ground
    for (const yy of [y0, y0, y1, y0, y1, y1]) { const k = yy === y0 && y0 < 1 ? dark : 1; colr.push(col.r * k, col.g * k, col.b * k); }
    per += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();
  out.push(g);
}

function addTrees(group, pts, rnd) {
  if (!pts.length) return;
  const leaf = leafTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0xffffff });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 1 });
  const variants = [0, 1, 2].map(v => {
    const r = mulberry(40 + v);
    const trunk = [], leaves = [];
    const H = 4 + v * 1.2, R = 3 + v * 0.6;
    const t = new THREE.CylinderGeometry(0.16, 0.3, H, 7); t.translate(0, H / 2, 0); trunk.push(t);
    for (let k = 0; k < 4; k++) { const br = new THREE.CylinderGeometry(0.05, 0.12, R * 0.9, 5); br.translate(0, R * 0.45, 0); br.rotateZ(0.9); br.rotateY(k * 1.57 + r()); br.translate(0, H - 0.6, 0); trunk.push(br); }
    for (let k = 0; k < 70; k++) {
      const q = new THREE.PlaneGeometry(1.6 + r(), 1.6 + r());
      q.rotateX(r() * 3.14); q.rotateY(r() * 3.14); q.rotateZ(r() * 3.14);
      const a = r() * 6.28, rr = Math.sqrt(r()) * R, y = H - 0.5 + (r() - 0.3) * 2.4 * (1 - rr / R * 0.5);
      q.translate(Math.cos(a) * rr, y, Math.sin(a) * rr); leaves.push(q);
    }
    return { trunk: mergeGeometries(trunk), leaves: mergeGeometries(leaves) };
  });
  const per = variants.map(() => []); pts.forEach(p => per[Math.floor(rnd() * 3)].push(p));
  variants.forEach((v, i) => {
    const list = per[i]; if (!list.length) return;
    const a = new THREE.InstancedMesh(v.trunk, barkMat, list.length), b = new THREE.InstancedMesh(v.leaves, leafMat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    list.forEach((p, k) => { const s = 0.8 + rnd() * 0.6; q.setFromAxisAngle(up, rnd() * 6.28); m4.compose(new THREE.Vector3(p[0], 0, p[1]), q, new THREE.Vector3(s, s * (0.85 + rnd() * 0.3), s)); a.setMatrixAt(k, m4); b.setMatrixAt(k, m4); c.setHSL(0.24 + rnd() * 0.06, 0.25 + rnd() * 0.2, 0.55 + rnd() * 0.3); b.setColorAt(k, c); });
    a.castShadow = b.castShadow = true; b.receiveShadow = true; a.name = b.name = 'tree'; group.add(a, b);
  });
}
function addPalms(group, pts, rnd) {
  if (!pts.length) return;
  const fr = frondTexture();
  const frMat = new THREE.MeshStandardMaterial({ map: fr, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: 1 });
  const H = 9;
  const trunkParts = []; for (let k = 0; k < 6; k++) { const c = new THREE.CylinderGeometry(0.17, 0.2, H / 6, 8); c.translate(Math.pow(k / 6, 2) * 1.2, H / 12 + k * H / 6, 0); trunkParts.push(c); }
  const fronds = [];
  for (let k = 0; k < 11; k++) {
    const len = 4.2, g = new THREE.PlaneGeometry(1.0, len, 1, 6);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + len / 2; p.setY(i, y); p.setZ(i, -0.06 * y * y); }
    g.rotateX(-Math.PI / 2 + 0.35); g.rotateY(k / 11 * Math.PI * 2); g.translate(1.2, H, 0); fronds.push(g);
  }
  const tg = mergeGeometries(trunkParts), fg = mergeGeometries(fronds);
  const a = new THREE.InstancedMesh(tg, barkMat, pts.length), b = new THREE.InstancedMesh(fg, frMat, pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  pts.forEach((p, k) => { const s = 0.85 + rnd() * 0.35; q.setFromAxisAngle(up, rnd() * 6.28); m4.compose(new THREE.Vector3(p[0], 0, p[1]), q, new THREE.Vector3(s, s, s)); a.setMatrixAt(k, m4); b.setMatrixAt(k, m4); });
  a.castShadow = b.castShadow = true; a.name = b.name = 'palm'; group.add(a, b);
}
