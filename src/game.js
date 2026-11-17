// Madras Streets v2 — real Chennai (OpenStreetMap), three.js/WebGL2 rendering, WebAssembly simulation, canvas HUD.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { parseOSM } from './osm.js';
import { buildCity, polyGeom } from './city.js';
import { Fleet } from './vehicles.js';
import { loadPeople, Crowd } from './people.js';
import { ASSETS, loadOSM } from './assets.js';
import { mulberry } from './geom.js';

const $ = id => document.getElementById(id);
const loading = $('loading'), setLoad = t => { loading.querySelector('.msg').textContent = t; };
const tick = () => new Promise(r => setTimeout(r, 0));

// The two playable pieces of Chennai. Each is a separate OpenStreetMap extract.
const MAPS = {
  bn: {
    title: 'Besant Nagar and Adyar', load: "Reading the OpenStreetMap data for Besant Nagar, Elliot's Beach and Adyar…",
    lmq: [['ashta', /ashtalakshmi/i, 'Ashtalakshmi Temple'], ['velankanni', /velankanni church/i, 'Annai Velankanni Church'], ['kalakshetra', /kalakshetra foundation/i, 'Kalakshetra'], ['arupadai', /arupadai/i, 'Arupadai Veedu Temple'], ['ratna', /ratnagirishwarar/i, 'Ratnagirishwarar Temple'], ['vinayakar', /varasiddhi/i, 'Varasiddhi Vinayakar Koil'], ['maruda', /marudeeswarar|marundeeswarar/i, 'Marundeeswarar Temple'], ['theos', /theosophical high/i, 'Besant Theosophical School'], ['indira', /indira nagar park/i, 'Indira Nagar Park'], ['padmanabha', /padmanaba|padmanabha/i, 'Anantha Padmanabha Swamy Temple'], ['skate', /skate park/i, "Elliot's Beach Skate Park"]],
    fixed: [['elliots', 12.9990, 80.2722, "Elliot's Beach"], ['terminus', 13.0003, 80.2665, 'Besant Nagar Bus Terminus'], ['adyar', 13.0064, 80.2575, 'Adyar Signal'], ['shastri', 12.9975, 80.2580, 'Shastri Nagar'], ['thiruvanmiyur', 12.9870, 80.2600, 'Thiruvanmiyur'], ['ururkuppam', 13.0035, 80.2735, 'Urur Olcott Kuppam']],
    areas: [['Besant Nagar', 12.9995, 80.2670], ["Elliot's Beach", 12.9990, 80.2725], ['Adyar', 13.0060, 80.2570], ['Shastri Nagar', 12.9970, 80.2580], ['Kalakshetra Colony', 12.9900, 80.2680], ['Indira Nagar', 12.9950, 80.2520], ['Thiruvanmiyur', 12.9870, 80.2620], ['Urur Kuppam', 13.0040, 80.2740]],
    start: 'elliots', owned: [[5, 'ashta', 3], [3, 'terminus', 2], [4, 'adyar', 1]],
  },
};
const MAP_ID = (() => { try { const m = localStorage.getItem('madras-streets-map'); return MAPS[m] ? m : 'bn'; } catch (e) { return 'bn'; } })();
const MAP = MAPS[MAP_ID];

async function main() {
  // ---------------- data ----------------
  setLoad(MAP.load); await tick();
  const D = parseOSM(await loadOSM(MAP_ID));
  // ---------------- renderer ----------------
  const canvas = $('gl'), hud = $('hud'), ctx = hud.getContext('2d');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 6000);
  scene.fog = new THREE.FogExp2(0xbfc6c8, 0.0016);

  // sky + sun + environment
  const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
  const su = sky.material.uniforms; su.turbidity.value = 7; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.82;
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 900; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7a5e, 1.0); scene.add(hemi);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, envHour = -10;
  const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);

  setLoad('Building 9,000 real buildings and the street network…'); await tick();
  const city = buildCity(D, scene);
  // sea and other water
  const waterNormals = new THREE.TextureLoader().load(ASSETS.waternormals, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  // The sea reflects the sky environment instead of re-rendering the whole city in a mirror pass (a third of the frame cost).
  waterNormals.repeat.set(130, 260);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ color: 0x1d4a5c, roughness: 0.14, metalness: 0.55, normalMap: waterNormals, normalScale: new THREE.Vector2(0.9, 0.9) }));
  sea.material.userData.envK = 2.2; sea.material.envMapIntensity = 2.2; sea.receiveShadow = true;
  // the sea lies only east of the shoreline, never under the city, so it cannot show through the ground
  { let xw = 1e9; for (let z = D.bounds.z0 - 400; z <= D.bounds.z1 + 400; z += 20) xw = Math.min(xw, city.coastX(z)); const g = new THREE.PlaneGeometry(80000, 80000, 32, 32), P = g.attributes.position, UV = g.attributes.uv;
    // small cells near the shore and the map, large ones far out: giant triangles lose depth precision close to the camera
    for (let i = 0; i < P.count; i++) { const tx = P.getX(i) / 80000 + 0.5, uy = P.getY(i) / 40000, X = 80000 * tx ** 3 - 40000, Y = 40000 * uy ** 3; P.setXY(i, X, Y); UV.setXY(i, X / 80000 + 0.5, Y / 80000 + 0.5); }
    g.computeBoundingSphere(); sea.geometry = g; sea.position.x = xw - 40 + 40000; waterNormals.repeat.set(1733, 1733); }
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.3; scene.add(sea);
  for (const p of city.water.polys) { const g = polyGeom([p], 0.04); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x35514a, roughness: 0.15, metalness: 0.1 })); m.receiveShadow = true; scene.add(m); }
  // surf line
  {
    const pts = []; for (let z = D.bounds.z0 - 300; z < D.bounds.z1 + 300; z += 6) pts.push(new THREE.Vector3(city.coastX(z) + 2, 0.03, z));
    const foamGeo = new THREE.BufferGeometry().setFromPoints(pts.flatMap((p, i) => i ? [pts[i - 1], p] : []));
    const foam = new THREE.Mesh(ribbonFromLine(pts, 1.6), new THREE.MeshStandardMaterial({ color: 0xf4f6f4, transparent: true, opacity: 0.75, roughness: 0.6 })); foam.receiveShadow = true; scene.add(foam); foamGeo.dispose();
    scene.userData.foam = foam;
  }
  addLandmarks(D, scene, city, MAP_ID);

  // ---------------- WebAssembly simulation ----------------
  setLoad('Starting the traffic simulation (WebAssembly)…'); await tick();
  const bytes = await (await fetch(ASSETS.sim)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const S = instance.exports, mem = S.memory.buffer;
  const CF = 24, PF = 12, MAXCARS = S.max_cars(), MAXPEDS = S.max_peds();
  const F32 = (p, n) => new Float32Array(mem, p, n), I32 = (p, n) => new Int32Array(mem, p, n);
  const cars = F32(S.p_cars(), MAXCARS * CF), peds = F32(S.p_peds(), MAXPEDS * PF), pl = F32(S.p_player(), 8), inp = F32(S.p_inp(), 8), evs = I32(S.p_evs(), 8);
  const roads = city.roads.slice(0, S.max_roads());
  {
    const rp = F32(S.p_roadPts(), S.max_pts() * 3), ri = F32(S.p_roadInfo(), S.max_roads() * 4);
    const ls = I32(S.p_linkStart(), S.max_pts()), lc = I32(S.p_linkCount(), S.max_pts()), lk = I32(S.p_links(), S.max_links() * 2);
    const byNode = new Map();
    roads.forEach((r, i) => r.nodes.forEach((n, k) => { let a = byNode.get(n); if (!a) byNode.set(n, a = []); a.push([i, k]); }));
    let g = 0, nl = 0;
    roads.forEach((r, i) => {
      r.start = g; r.s = [0]; for (let k = 1; k < r.pts.length; k++) r.s.push(r.s[k - 1] + Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]));
      ri[i * 4] = g; ri[i * 4 + 1] = r.pts.length; ri[i * 4 + 2] = r.hw; ri[i * 4 + 3] = r.major;
      r.pts.forEach((p, k) => {
        rp[g * 3] = p[0]; rp[g * 3 + 1] = p[1]; rp[g * 3 + 2] = r.s[k] + k * 1e-4;
        ls[g] = nl; lc[g] = 0;
        for (const [oi, ok] of byNode.get(r.nodes[k]) || []) { if (oi === i && ok === k) continue; if (nl >= S.max_links()) break; lk[nl * 2] = oi; lk[nl * 2 + 1] = ok; nl++; lc[g]++; }
        g++;
      });
    });
    const bl = F32(S.p_bld(), S.max_b() * 6), nb = Math.min(city.boxes.length, S.max_b());
    for (let i = 0; i < nb; i++) bl.set(city.boxes[i], i * 6);
    new Uint8Array(mem, S.p_grid(), city.gw * city.gh).set(city.grid);
    S.setup(roads.length, nb, city.gw, city.gh, city.gx0, city.gz0, city.GC, 2026);
    console.log('roads', roads.length, 'points', g, 'links', nl, 'boxes', nb);
  }

  // ---------------- landmarks & jobs ----------------
  const LMQ = MAP.lmq || [
    ['kapali', /kapaleeswarar|kapaleeshwarar|kapali/i, 'Kapaleeshwarar Temple'],
    ['santhome', /santhome|san thome|st\.? thomas/i, 'Santhome Basilica'],
    ['chepauk', /chidambaram|chepauk/i, 'Chepauk Stadium'],
    ['parthasarathy', /parthasarathy/i, 'Parthasarathy Temple'],
    ['icehouse', /vivekanand/i, 'Vivekanandar Illam'],
    ['clock', /clock tower/i, 'Royapettah Clock Tower'],
    ['wesley', /wesley church/i, 'Wesley Church'],
    ['ranade', /ranade library/i, 'Ranade Library'],
    ['presidency', /presidency college/i, 'Presidency College'],
    ['luz', /luz church|our lady of light/i, 'Luz Church'],
    ['nageswara', /nageswara rao park|nageshwara rao/i, 'Nageswara Rao Park'],
    ['music', /music academy/i, 'Music Academy'],
    ['queen', /queen mary/i, "Queen Mary's College"],
    ['ice', /amir mahal/i, 'Amir Mahal'],
  ];
  const named = [...D.pois, ...D.buildings.filter(b => b.name).map(b => { const c = b.poly.reduce((a, p) => [a[0] + p[0] / b.poly.length, a[1] + p[1] / b.poly.length], [0, 0]); return { x: c[0], z: c[1], name: b.name }; })];
  const LM = {};
  for (const [id, re, title] of LMQ) { const p = named.find(n => re.test(n.name)); if (p) LM[id] = { id, name: title, x: p.x, z: p.z }; }
  // fixed real-world points not always tagged with names
  const fixed = MAP.fixed;
  for (const [id, la, lo, name] of fixed) if (!LM[id]) { const [x, z] = D.P(la, lo); LM[id] = { id, name, x, z }; }
  // ---------------- GPS graph ----------------
  const NV = roads.reduce((a, r) => a + r.pts.length, 0);
  const vx = new Float32Array(NV), vz = new Float32Array(NV), adjDir = Array.from({ length: NV }, () => []), adjU = Array.from({ length: NV }, () => []);
  roads.forEach(r => r.pts.forEach((p, k) => { const g = r.start + k; vx[g] = p[0]; vz[g] = p[1]; if (k > 0) { const w = r.s[k] - r.s[k - 1]; adjU[g].push(g - 1, w); adjU[g - 1].push(g, w); if (r.oneway !== -1) adjDir[g].push(g - 1, w); if (r.oneway !== 1) adjDir[g - 1].push(g, w); } })); // adjDir is reversed (searched outward from the destination), so one-ways are obeyed
  { const byNode = new Map(); roads.forEach(r => r.nodes.forEach((n, k) => { let a = byNode.get(n); if (!a) byNode.set(n, a = []); a.push(r.start + k); })); for (const a of byNode.values()) for (const u of a) for (const v of a) if (u !== v) { adjDir[u].push(v, 0.01); adjU[u].push(v, 0.01); } }
  // roads that are not joined to the main network (clipped stubs at the map edge) are never used for routes or job stops
  { const comp = new Int32Array(NV).fill(-1); let best = -1, bestN = 0, nc = 0;
    for (let v0 = 0; v0 < NV; v0++) { if (comp[v0] >= 0) continue; const st = [v0]; comp[v0] = nc; let n = 0; while (st.length) { const u = st.pop(); n++; const a = adjU[u]; for (let i = 0; i < a.length; i += 2) if (comp[a[i]] < 0) { comp[a[i]] = nc; st.push(a[i]); } } if (n > bestN) { bestN = n; best = nc; } nc++; }
    let off = 0; roads.forEach(r => { r.main = comp[r.start] === best; if (!r.main) off++; }); console.log('road network parts', nc, 'roads off the main network', off); }
  const onMain = s => roads[s.ri] && roads[s.ri].main;
  const stopFor = (l, R) => {
    const nb = city.hash.nearest(l.x, l.z, R, s => roads[s.ri] && roads[s.ri].cls !== 'service' && roads[s.ri].main !== false);
    if (!nb.s) return false;
    const s = nb.s, sx = s.bx - s.ax, sz = s.bz - s.az, sl = Math.hypot(sx, sz) || 1;
    // stop on the left (kerb) side of the road for a vehicle heading along +s
    const lx = sz / sl, lz = -sx / sl, k = nb.s.hw * 0.62;
    l.stop = { x: nb.q.qx + lx * k, z: nb.q.qz + lz * k, yaw: Math.atan2(sx / sl, sz / sl) }; return true;
  };
  for (const l of Object.values(LM)) if (!stopFor(l, 400)) delete LM[l.id];
  const LMS = Object.values(LM);
  // real named places from the map (restaurants, hospitals, schools, shops...) as extra job pickups and drops
  const PLACES = LMS.slice();
  { const seen = new Set(LMS.map(l => l.name.toLowerCase())); const B = D.bounds;
    for (const q of D.pois) { const k = q.name.toLowerCase(); if (seen.has(k) || q.name.length < 4 || q.name.length > 34 || q.kind === 'atm') continue; if (q.x < B.x0 + 60 || q.x > B.x1 - 60 || q.z < B.z0 + 60 || q.z > B.z1 - 60) continue;
      const l = { id: 'poi' + PLACES.length, name: q.name, x: q.x, z: q.z, poi: 1, kind: q.kind || '' }; if (stopFor(l, 120)) { seen.add(k); PLACES.push(l); } }
    for (const b of D.buildings) { if (!b.place || !/^(apartments|hotel)$/.test(b.place.type) || !b.name || b.name.length < 4 || b.name.length > 34 || seen.has(b.name.toLowerCase())) continue; if (b.c[0] < B.x0 + 60 || b.c[0] > B.x1 - 60 || b.c[1] < B.z0 + 60 || b.c[1] > B.z1 - 60) continue;
      const l = { id: 'home' + PLACES.length, name: b.name, x: b.c[0], z: b.c[1], poi: 1, kind: 'home' }; if (stopFor(l, 120)) { seen.add(b.name.toLowerCase()); PLACES.push(l); } } }
  console.log('job places', PLACES.length);
  console.log('landmarks', LMS.map(l => l.name).join(', '));

  function dijkstra(src, adj = adjDir) {
    const dist = new Float64Array(NV).fill(Infinity) /* 64-bit: with 32-bit storage the "stale entry" check below wrongly drops most of the search */, prev = new Int32Array(NV).fill(-1), heap = [];
    const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
    dist[src] = 0; push(0, src);
    while (heap.length) { const [d, u] = pop(); if (d > dist[u]) continue; const a = adj[u]; for (let i = 0; i < a.length; i += 2) { const v = a[i], nd = d + a[i + 1]; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(nd, v); } } }
    return { dist, prev };
  }
  const nearestVertex = (x, z) => { const nb = city.hash.nearest(x, z, 300, onMain); if (!nb.s || nb.s.ri >= roads.length) return -1; const r = roads[nb.s.ri]; return r.start + nb.s.i + (nb.q.t < 0.5 ? 0 : 1); };
  const roadNameAt = (x, z) => { const nb = city.hash.nearest(x, z, 30); if (!nb.s || nb.e > 4) return ''; return roads[nb.s.ri]?.name || ''; };
  const AREAS = MAP.areas.map(a => { const [x, z] = D.P(a[1], a[2]); return { name: a[0], x, z }; });

  // ---------------- people, vehicles ----------------
  setLoad('Bringing people onto the streets…'); await tick();
  const rig = await loadPeople();
  const crowd = new Crowd(scene, rig, 40);
  const me = crowd.makePlayer(scene);
  const fleet = new Fleet(scene);

  // ---------------- game state ----------------
  const store = (() => { try { return JSON.parse(localStorage.getItem('madras-streets-2') || '{}'); } catch (e) { return {}; } })();
  const G = { day: store.day || '', gv: store.gv || {}, claimed: store.claimed || {}, licence: !!store.licence, money: store.money ?? 500, trips: store.trips ?? 0, ratingSum: store.ratingSum ?? 0, hour: (() => { const d = new Date(), h = (d.getUTCHours() + d.getUTCMinutes() / 60 + 5.5) % 24; return h >= 7 && h <= 15.5 ? h : 10; })(), rain: 0, rainTarget: 0, view: 0, bigMap: false, help: false, paused: true, job: null, offers: null, msg: [], area: '', areaT: 0, route: null, routeT: 0, owned: [], camYaw: 0, camPitch: 0.28, camDist: 8, sky: false, skyH: 260, skyYaw: 0, skyTilt: 0.95, orbit: 0, orbitT: 0, time: 0, night: 0 };
  const save = () => { try { localStorage.setItem('madras-streets-2', JSON.stringify({ money: G.money, trips: G.trips, ratingSum: G.ratingSum, day: G.day, gv: G.gv, claimed: G.claimed, licence: G.licence })); } catch (e) {} };
  const toast = (t, dur = 4) => { G.msg.push({ t, until: G.time + dur }); if (G.msg.length > 2) G.msg.shift(); };
  S.set_counts(124, 170);
  const startLM = LM[MAP.start] || LMS[0], start = startLM.stop;
  const own = (t, l, col, off = 0) => { const st = l.stop, fx = Math.sin(st.yaw), fz = Math.cos(st.yaw); const i = S.spawn_parked(t, st.x + fx * off, st.z + fz * off, st.yaw, col); S.mark_owned(i); G.owned.push({ i, name: ['car', 'auto-rickshaw', 'bus', 'hatchback', 'taxi', 'scooter'][t], at: l.name }); return i; };
  { const ai = own(1, startLM, 0, 4); const o = ai * CF, y = start.yaw; S.set_player_foot(cars[o] + Math.cos(y) * 1.9 - Math.sin(y) * 1.2, cars[o + 1] - Math.sin(y) * 1.9 - Math.cos(y) * 1.2, y + Math.PI / 2); G.camYaw = y; }
  for (const [t, id, col] of MAP.owned) if (LM[id]) own(t, LM[id], col);
  S.populate();

  const JOB_TEXT = {
    ride: ['A family wants to reach {to} for darshan.', 'A college student needs to get to {to} before class.', 'A tourist wants to see {to}.', 'An office-goer is late for a meeting near {to}.', 'A grandmother with shopping bags is heading home near {to}.', 'A cricket fan wants to get to {to} quickly.'],
    delivery: ['Deliver jasmine garlands to a stall near {to}.', 'Deliver a tiffin carrier of idli and sambar near {to}.', 'Deliver a box of filter-coffee powder to a shop near {to}.', 'Deliver a parcel of books to a house near {to}.'],
  };
  function routeLen(a, b) { const s = nearestVertex(a.x, a.z), t = nearestVertex(b.x, b.z), air = Math.hypot(a.x - b.x, a.z - b.z); if (s < 0 || t < 0) return air; let d = dijkstra(t).dist[s]; if (!isFinite(d)) d = dijkstra(t, adjU).dist[s]; return isFinite(d) ? Math.max(d, air) : air * 1.4; }
  // ---- jobs: every job is a list of stops; the first is the pickup or start ----
  const KIND = {
    ride: ['Ride', '#f2cc60'], delivery: ['Delivery', '#79c0ff'], school: ['School run', '#ffb86b'], hospital: ['Hospital trip', '#ff8a8a'], food: ['Hot food', '#ff9d5c'],
    share: ['Share auto', '#d2a8ff'], tour: ['City tour', '#7ee7c8'], fragile: ['Fragile cargo', '#f778ba'], cans: ['Water can round', '#6cc6ff'], test: ['Challenge: driving test', '#ffffff'], clean: ['Challenge: no-scratch run', '#ffffff'],
  };
  const pk = a => a[Math.floor(Math.random() * a.length)];
  const byKind = re => PLACES.filter(p => re.test(p.kind || ''));
  const HOMES = byKind(/^home$/), SCHOOLS = byKind(/^(school|college|kindergarten)$/), HOSP = byKind(/^(hospital|clinic|doctors|dentist)$/), FOOD = byKind(/^(restaurant|cafe|fast_food|ice_cream)$/);
  const SHOPS = byKind(/^(bakery|confectionery|supermarket|clothes|electronics|greengrocer|department_store|books|jewelry|gift|florist|furniture|convenience|general)$/);
  const dist2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const nearOf = (list, x, z, skip = []) => { const c = list.filter(p => !skip.includes(p)); if (!c.length) return null; return c.sort((a, b) => dist2(a, x, z) * (0.6 + Math.random()) - dist2(b, x, z) * (0.6 + Math.random()))[0]; };
  const closest = (list, x, z, skip = []) => { let b = null; for (const p of list) if (!skip.includes(p) && (!b || dist2(p, x, z) < dist2(b, x, z))) b = p; return b; };
  const awayOf = (list, a, lo, hi, skip = []) => { const c = list.filter(p => !skip.includes(p) && dist2(p, a.x, a.z) > lo && dist2(p, a.x, a.z) < hi); return c.length ? pk(c) : null; };
  function mkJob(kind, stops, text, o = {}) {
    if (stops.some(q => !q) || new Set(stops.map(q => q.id)).size < Math.min(2, stops.length)) return null;
    let m = 0; for (let i = 0; i < stops.length - 1; i++) m += routeLen(stops[i].stop, stops[i + 1].stop);
    const km = m / 1000;
    return { kind, label: KIND[kind][0], col: KIND[kind][1], stops, from: stops[0], to: stops[stops.length - 1], text, km, fare: Math.round((o.base ?? 50) + km * (o.perKm ?? 18)), limit: Math.round((o.t0 ?? 60) + m / (o.pace ?? 7) + (stops.length - 2) * 14), challenge: !!o.challenge };
  }
  const GEN = {
    ride: (x, z) => { const A = nearOf(PLACES, x, z), B = A && pk(PLACES); return A && mkJob('ride', [A, B], pk(JOB_TEXT.ride).replace('{to}', B.name), { base: 45 }); },
    delivery: (x, z) => { const A = nearOf(PLACES, x, z), B = A && pk(PLACES); return A && mkJob('delivery', [A, B], pk(JOB_TEXT.delivery).replace('{to}', B.name), { base: 40, perKm: 12 }); },
    school: (x, z) => { const A = nearOf(HOMES.length ? HOMES : PLACES, x, z), B = A && awayOf(SCHOOLS, A, 200, 2500); return B && mkJob('school', [A, B], `Two children in uniform at ${A.name} must reach ${B.name} before the bell. Drive smoothly.`, { base: 60, perKm: 22, t0: 50, pace: 7.5 }); },
    hospital: (x, z) => { const A = nearOf(PLACES, x, z), B = A && closest(HOSP, A.x, A.z, [A]); return B && mkJob('hospital', [A, B], `A grandfather at ${A.name} has an appointment at ${B.name}. No jerks, no bumps.`, { base: 90, perKm: 26, t0: 55, pace: 7.5 }); },
    food: (x, z) => { const A = nearOf(FOOD, x, z), B = A && awayOf(HOMES.length ? HOMES : PLACES, A, 250, 2500); return B && mkJob('food', [A, B], `Hot biryani parcel from ${A.name} for a family at ${B.name}. It must arrive hot.`, { base: 55, perKm: 20, t0: 40, pace: 8 }); },
    share: (x, z) => { const A = nearOf(PLACES, x, z), B = A && awayOf(PLACES, A, 150, 700), C = B && awayOf(PLACES, B, 150, 700, [A]), E = C && (LM.terminus && ![A, B, C].includes(LM.terminus) ? LM.terminus : awayOf(LMS, C, 300, 3000, [A, B])); return E && mkJob('share', [A, B, C, E], `Share auto: pick up at ${A.name}, ${B.name} and ${C.name}, then drop everyone at ${E.name}.`, { base: 90, perKm: 24 }); },
    tour: (x, z) => { const A = nearOf(PLACES, x, z), L1 = A && nearOf(LMS, A.x, A.z, [A]), L2 = L1 && nearOf(LMS, L1.x, L1.z, [A, L1]), L3 = L2 && nearOf(LMS, L2.x, L2.z, [A, L1, L2]); return L3 && mkJob('tour', [A, L1, L2, L3], `A visiting couple at ${A.name} wants a tour: ${L1.name}, ${L2.name} and ${L3.name}.`, { base: 150, perKm: 30, t0: 200, pace: 4 }); },
    fragile: (x, z) => { const A = nearOf(SHOPS.length ? SHOPS : PLACES, x, z), B = A && awayOf(HOMES.length ? HOMES : PLACES, A, 300, 2500), it = pk(['A three-tier wedding cake', 'A stack of clay Pongal pots', 'A glass aquarium', 'A veena for tonight\'s concert']); return B && mkJob('fragile', [A, B], `${it} from ${A.name} to ${B.name}. Every bump damages it.`, { base: 120, perKm: 30, t0: 90, pace: 5 }); },
    cans: (x, z) => { const A = nearOf(SHOPS.length ? SHOPS : PLACES, x, z), H = HOMES.length > 3 ? HOMES : PLACES, B = A && nearOf(H, A.x, A.z, [A]), C = B && nearOf(H, B.x, B.z, [A, B]), E = C && nearOf(H, C.x, C.z, [A, B, C]); return E && mkJob('cans', [A, B, C, E], `Water can round: load at ${A.name}, then deliver to ${B.name}, ${C.name} and ${E.name}.`, { base: 80, perKm: 22 }); },
    test: (x, z) => { const A = closest(PLACES, x, z), c1 = A && awayOf(PLACES, A, 250, 700), c2 = c1 && awayOf(PLACES, c1, 250, 700, [A]), c3 = c2 && awayOf(PLACES, c2, 250, 700, [A, c1]); const j = c3 && mkJob('test', [A, c1, c2, c3, A], `Driving test from ${A.name}: pass 3 checkpoints and return. Stay under 40 km/h, touch nothing. More than 2 faults fails.`, { base: 250, perKm: 0, t0: 120, pace: 4.5, challenge: true }); return j; },
    clean: (x, z) => { const A = closest(PLACES, x, z), B = A && awayOf(LMS, A, 900, 4000); return B && mkJob('clean', [A, B, A], `No-scratch run: from ${A.name} to ${B.name} and back without touching anything.`, { base: 200, perKm: 15, t0: 150, pace: 5, challenge: true }); },
  };
  function makeOffers() {
    const x = G.px, z = G.pz, out = [];
    const add = k => { for (let i = 0; i < 4; i++) { const j = GEN[k](x, z); if (j && j.km > 0.15) { out.push(j); return true; } } return false; };
    add(Math.random() < 0.7 ? 'ride' : 'delivery') || add('ride');
    const sp = ['school', 'hospital', 'food', 'share', 'tour', 'fragile', 'cans'].sort(() => Math.random() - 0.5);
    for (const k of sp) { if (out.length >= 3) break; add(k); }
    while (out.length < 3 && add('ride')) { /* fill */ }
    add(Math.random() < 0.5 ? 'test' : 'clean') || add('clean');
    G.offers = out;
  }
  function acceptOffer(k) { const o = G.offers && G.offers[k]; if (!o) return; G.job = { ...o, si: 0, stage: 'pickup', t: 0, rating: 5, crashes: 0, cargo: 100, faults: 0, over: 0 }; G.offers = null; setRoute(o.from.stop); toast(o.challenge ? `Drive to ${o.from.name} to start. Follow the blue GPS line.` : `${o.kind === 'ride' || o.kind === 'share' || o.kind === 'school' || o.kind === 'hospital' || o.kind === 'tour' ? 'Passenger' : 'Pickup'} waiting at ${o.from.name}. Follow the blue GPS line.`, 5); }
  // daily targets: small goals for today with a cash reward each
  const GOALS = [['trips', 3, 'Complete 3 jobs', 150], ['earned', 600, 'Earn ₹600 from jobs', 200], ['five', 1, 'Finish a job with a 5.0★ rating', 100], ['chal', 1, 'Pass a challenge', 150], ['kinds', 3, 'Do 3 different kinds of job', 200]];
  { const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); if (G.day !== today) { G.day = today; G.gv = {}; G.claimed = {}; } }
  function goalAdd(k, v) { if (k === 'kinds') { G.gv.kindList = G.gv.kindList || []; if (!G.gv.kindList.includes(v)) G.gv.kindList.push(v); G.gv.kinds = G.gv.kindList.length; } else G.gv[k] = (G.gv[k] || 0) + v;
    for (const [id, need, text, reward] of GOALS) if ((G.gv[id] || 0) >= need && !G.claimed[id]) { G.claimed[id] = 1; G.money += reward; sfx('cash'); toast(`Today's target done: ${text}. Bonus ₹${reward}.`, 6); } }
  function endJob(msg, dur = 6) { toast(msg, dur); G.job = null; G.routeTree = null; save(); }
  function setRoute(p) { G.routeTarget = p; const t = nearestVertex(p.x, p.z); G.routeTree = t >= 0 ? dijkstra(t) : null; G.routeTreeU = null; G.routeSrc = t; G.routeT = 0; }
  function tracePath(x, z) {
    if (!G.routeTree) return null;
    const nb = city.hash.nearest(x, z, 400, onMain); if (!nb.s || nb.s.ri >= roads.length) return null;
    const r = roads[nb.s.ri], a = r.start + nb.s.i, b = a + 1, q = [nb.q.qx, nb.q.qz];
    const pick = tree => { const da = tree.dist[a] + Math.hypot(vx[a] - q[0], vz[a] - q[1]), db = tree.dist[b] + Math.hypot(vx[b] - q[0], vz[b] - q[1]); return isFinite(da) || isFinite(db) ? [tree, da <= db ? a : b] : null; };
    // one-ways first; if the spot cannot be reached legally, fall back to the plain road network
    let c = pick(G.routeTree); if (!c) { if (!G.routeTreeU) G.routeTreeU = dijkstra(G.routeSrc, adjU); c = pick(G.routeTreeU); } if (!c) return null;
    const out = [q]; let v = c[1], n = 0; while (v >= 0 && n++ < 6000) { out.push([vx[v], vz[v]]); v = c[0].prev[v]; }
    // finish at the point on the road beside the stop, not across the block
    const e = city.hash.nearest(G.routeTarget.x, G.routeTarget.z, 60, onMain); if (e.s) { const l = out[out.length - 1]; if (Math.hypot(l[0] - e.q.qx, l[1] - e.q.qz) > 0.5) out.push([e.q.qx, e.q.qz]); }
    return out;
  }

  G.dbg = { setRoute, tracePath, nearestVertex, dijkstra, onMain, roads, adjU, adjDir, vx, vz };
  // ---------------- input ----------------
  const keys = {}, pressed = {};
  addEventListener('keydown', e => { if (!e.repeat) pressed[e.code] = true; keys[e.code] = true; // not gated on the held state: a missed key-up (common with Shift or Cmd on a Mac) must not block the next press
    if (e.code === 'F1' || e.code === 'Slash') e.preventDefault(); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    // tap or click a job in the list to accept it
    if (G.offers && G.offerRects) { const hx = e.clientX * hud.width / innerWidth, hy = e.clientY * hud.height / innerHeight; const k = G.offerRects.findIndex(r => hx >= r[0] && hx <= r[2] && hy >= r[1] && hy <= r[3]); if (k >= 0) { acceptOffer(k); return; } }
    if (G.help) { G.help = false; return; } // any click or tap closes the controls panel
    if (e.pointerType !== 'mouse' && (G.offers || G.bigMap)) { G.offers = null; G.bigMap = false; return; }
    if (e.isPrimary) pts.clear(); // drop any finger whose lift was missed
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; pinch0 = 0;
    drag = pts.size === 1 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  });
  const pts = new Map(); let pinch = 0, pinch0 = 0;
  const ptUp = e => { pts.delete(e.pointerId); pinch = 0; pinch0 = 0; drag = null; };
  addEventListener('pointerup', ptUp); addEventListener('pointercancel', ptUp);
  // zoom: wheel or pinch. Zooming out past the chase camera lifts into the view from above; zooming in comes back down.
  function zoomBy(f) {
    if (G.sky) G.skyH = Math.max(3, Math.min(12000, G.skyH * f));
    else G.camDist = Math.max(2.2, Math.min(30, G.camDist * f)); // the view from above is entered only with Z or the SKY button, never by zooming
  }
  addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      // pinch zoom works only in the view from above, and only after a clear pinch, so two thumbs on the screen while driving never change the zoom
      if (!G.sky || pts.size > 2) return; const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (!pinch0) pinch0 = d;
      if (pinch > 0 && d > 0) zoomBy(Math.max(0.8, Math.min(1.25, pinch / d))); if (pinch > 0 || Math.abs(d - pinch0) > 24) pinch = d; return; }
    if (drag && drag.id === e.pointerId) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (G.sky) { G.skyYaw += dx * 0.006; G.skyTilt = Math.max(0.12, Math.min(1.45, G.skyTilt + dy * 0.004)); }
      else { G.orbit += dx * 0.006; G.camPitch = Math.max(0.03, Math.min(1.2, G.camPitch + dy * 0.004)); G.orbitT = 3; }
      drag.x = e.clientX; drag.y = e.clientY; } });
  canvas.addEventListener('wheel', e => { zoomBy(e.deltaY > 0 ? 1.1 : 0.9); e.preventDefault(); }, { passive: false });
  addEventListener('contextmenu', e => e.preventDefault());
  // Phones: stop the browser's own page zoom (double tap, pinch) from firing on fast taps of GO, BRAKE or the arrows while riding.
  // The game reads pointer events, which still arrive.
  { const stop = e => { if (document.body.classList.contains('playing')) e.preventDefault(); }, o = { passive: false };
    for (const t of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(t, stop, o);
    if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (visualViewport.scale > 1.01) { const m = document.querySelector('meta[name=viewport]'); if (m) { const c = m.content; m.content = c + ', minimum-scale=1'; m.content = c; } } }); }
  document.querySelectorAll('[data-key]').forEach(b => { const k = b.dataset.key; b.addEventListener('pointerdown', e => { e.preventDefault(); if (!keys[k]) pressed[k] = true; keys[k] = true; b.classList.add('on'); }); const up = () => { keys[k] = false; b.classList.remove('on'); }; b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up); });
  { const mb = $('menuB'), tb = $('tbar'); if (mb) { mb.addEventListener('pointerdown', e => { e.preventDefault(); document.body.classList.toggle('menu'); }); tb.addEventListener('pointerup', () => document.body.classList.remove('menu')); canvas.addEventListener('pointerdown', () => document.body.classList.remove('menu')); } }
  const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches; if (TOUCH) document.body.classList.add('touch');
  let steerS = 0;

  // ---------------- audio ----------------
  const A = { ctx: null };
  function initAudio() {
    if (A.ctx) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(); A.ctx = ac;
      const master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); A.master = master;
      const eg = ac.createGain(); eg.gain.value = 0; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o1.connect(lp); o2.connect(lp); lp.connect(eg); eg.connect(master); o1.start(); o2.start(); A.eng = { g: eg, o1, o2, lp };
      const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; A.nb = nb;
      const mk = (type, f, q) => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(master); s.start(); return g; };
      A.city = mk('bandpass', 400, 0.6); A.rainG = mk('highpass', 2500, 0.3); A.sea = mk('lowpass', 500, 0.5);
      const hg = ac.createGain(); hg.gain.value = 0; const h1 = ac.createOscillator(), h2 = ac.createOscillator(); h1.type = h2.type = 'square'; h1.frequency.value = 415; h2.frequency.value = 520; const hf = ac.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2000; h1.connect(hf); h2.connect(hf); hf.connect(hg); hg.connect(master); h1.start(); h2.start(); A.horn = hg;
    } catch (e) { A.ctx = null; }
  }
  function sfx(kind, vol = 1) {
    if (!A.ctx) return; const ac = A.ctx, t = ac.currentTime;
    const tone = (f, f2, dur, type = 'sine', v = 0.25) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.setValueAtTime(f2, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.05); };
    if (kind === 'crash') { const s = ac.createBufferSource(); s.buffer = A.nb; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = ac.createGain(); g.gain.setValueAtTime(0.6 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); s.connect(f); f.connect(g); g.connect(A.master); s.start(t); s.stop(t + 0.6); }
    if (kind === 'ding') tone(660, 0, 0.5); if (kind === 'cash') tone(880, 1320, 0.55); if (kind === 'door') tone(120, 0, 0.15, 'triangle', 0.4);
    if (kind === 'farhorn') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = 380 + Math.random() * 240; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025 * vol, t + 0.02); g.gain.setValueAtTime(0.025 * vol, t + 0.25 + Math.random() * 0.3); g.gain.linearRampToValueAtTime(0, t + 0.6); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.7); }
  }

  // ---------------- markers ----------------
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.35, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 24, 1, true), markerMat); beam.position.y = 20; beam.visible = false; scene.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4, 40), new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.8, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  const chevMat = new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.75, depthWrite: false });
  const chevGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.7, 0, -0.4), new THREE.Vector3(0, 0, 0.6), new THREE.Vector3(0.7, 0, -0.4), new THREE.Vector3(0, 0, 0)]); chevGeo.setIndex([0, 1, 3, 3, 1, 2]);
  const GPSN = 600, gpsGeo = new THREE.BufferGeometry(); gpsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GPSN * 6), 3));
  { const ix = []; for (let i = 0; i < GPSN - 1; i++) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } gpsGeo.setIndex(ix); gpsGeo.setDrawRange(0, 0); }
  const gpsLine = new THREE.Mesh(gpsGeo, new THREE.MeshBasicMaterial({ color: 0x2f8fff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -8, fog: false }));
  gpsLine.frustumCulled = false; gpsLine.renderOrder = 2; gpsLine.visible = false; scene.add(gpsLine); let gpsDrawn = null;
  const chevs = new THREE.InstancedMesh(chevGeo, chevMat, 40); chevs.frustumCulled = false; scene.add(chevs);
  const ownedMarks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0x39d0ff }), 12); ownedMarks.frustumCulled = false; scene.add(ownedMarks);
  // rain
  const rainN = 4000, rainGeo = new THREE.BufferGeometry(), rainPos = new Float32Array(rainN * 6);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaab4bf, transparent: true, opacity: 0.35 })); rain.frustumCulled = false; scene.add(rain);
  const rainSeed = new Float32Array(rainN * 3); for (let i = 0; i < rainN * 3; i++) rainSeed[i] = Math.random();

  // ---------------- HUD minimap ----------------
  const B = D.bounds, MAPK = 0.35;
  const mapCv = document.createElement('canvas'); mapCv.width = Math.ceil((B.x1 - B.x0 + 200) * MAPK); mapCv.height = Math.ceil((B.z1 - B.z0 + 200) * MAPK);
  const MX = x => (x - B.x0 + 100) * MAPK, MZ = z => (z - B.z0 + 100) * MAPK;
  {
    const m = mapCv.getContext('2d');
    m.fillStyle = '#2b2f2a'; m.fillRect(0, 0, mapCv.width, mapCv.height);
    m.fillStyle = '#1f4a63'; m.beginPath(); m.moveTo(mapCv.width, 0); for (let z = B.z0 - 100; z <= B.z1 + 100; z += 10) m.lineTo(MX(city.coastX(z)), MZ(z)); m.lineTo(mapCv.width, mapCv.height); m.fill();
    const fillPolys = (list, c) => { m.fillStyle = c; for (const p of list || []) { m.beginPath(); p.forEach((q, i) => i ? m.lineTo(MX(q[0]), MZ(q[1])) : m.moveTo(MX(q[0]), MZ(q[1]))); m.fill(); } };
    fillPolys(city.byKind.park, '#3d5a35'); fillPolys(city.byKind.pitch, '#3d5a35'); fillPolys(city.byKind.beach, '#8c7f5f'); fillPolys(city.water.polys, '#1f4a63');
    fillPolys(D.buildings.map(b => b.poly), '#45473f');
    m.lineCap = 'round'; m.lineJoin = 'round';
    for (const pass of [0, 1]) for (const r of roads) { if (!!r.major !== !!pass) continue; m.strokeStyle = r.major ? '#e2d6aa' : '#9a9a94'; m.lineWidth = Math.max(1.5, r.hw * 2 * MAPK); m.beginPath(); r.pts.forEach((p, i) => i ? m.lineTo(MX(p[0]), MZ(p[1])) : m.moveTo(MX(p[0]), MZ(p[1]))); m.stroke(); }
  }

  // ---------------- loop ----------------
  const clock = new THREE.Clock();
  let fps = 60, frames = 0, fpsT = 0, crashCool = 0, farHornT = 3, pcarIdx = -1;
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); const dpr = Math.min(devicePixelRatio || 1, 2); hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr); }
  addEventListener('resize', resize); resize();
  loading.style.display = 'none'; $('title').style.display = 'flex';
  $('mapName').textContent = MAP.title; $('switchBtn').style.display = 'none';
  $('startBtn').onclick = () => { $('title').style.display = 'none'; G.paused = false; document.body.classList.add('playing'); if (TOUCH) { try { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch (e) {} } initAudio(); if (A.ctx) A.ctx.resume(); toast(TOUCH ? 'Your yellow auto is beside you. Tap IN/OUT to get in.' : 'Your yellow auto is parked beside you.', 5); };
  window.__game = { G, S, cars, pl, keys, pressed, D, city, scene, camera, renderer, LM, crowd, fleet };
  const clockStr = () => { const h = Math.floor(G.hour), m = Math.floor((G.hour - h) * 60); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sunV = new THREE.Vector3();
  G.px = start.x; G.pz = start.z; G.ph = start.yaw; G.pspd = 0;

  function lighting() {
    const ang = (G.hour - 6) / 12 * Math.PI;
    sunV.set(Math.cos(ang), Math.sin(ang), 0.25).normalize();
    const elev = sunV.y, night = clamp((0.05 - elev) / 0.18, 0, 1), dusk = clamp((0.3 - elev) / 0.3, 0, 1) * (1 - night);
    G.night = night;
    su.sunPosition.value.copy(sunV); su.rayleigh.value = lerp(2.2, 3.0, dusk) * (1 - G.rain * 0.5); su.turbidity.value = 3.5 + G.rain * 9;
    const sunCol = new THREE.Color(0xfff1dc).lerp(new THREE.Color(0xffa060), dusk);
    sun.color.copy(sunCol); sun.intensity = (elev > 0 ? 2.6 : 0) * (1 - night) * (1 - G.rain * 0.7);
    if (night > 0.5) { sun.color.set(0x8fa6ff); sun.intensity = 0.25; }
    hemi.intensity = lerp(0.45, 0.34, night) * (1 - G.rain * 0.2) + G.rain * 0.25;
    hemi.color.set(0xcfe3ff).lerp(new THREE.Color(0x30406a), night);
    const fogDay = new THREE.Color(0xb9c5cf), fogDusk = new THREE.Color(0xd09a78), fogNight = new THREE.Color(0x0b0f18), fogRain = new THREE.Color(0x8d969c);
    scene.fog.color.copy(fogDay).lerp(fogDusk, dusk).lerp(fogNight, night).lerp(fogRain.clone().multiplyScalar(1 - night * 0.85), G.rain);
    scene.fog.density = ((G.fogBase || 0.00065) + G.rain * 0.0035 + night * 0.0006) * (G.sky ? Math.min(1, 110 / Math.max(G.skyH, 1)) : 1);
    renderer.toneMappingExposure = lerp(0.72, 1.2, night);
    sea.material.color.set(night > 0.5 ? 0x050c12 : 0x1d4a5c);
    // sky-based environment for reflections, refreshed when the light changes
    if (Math.abs(G.hour - envHour) > 0.25 || G._envRain !== Math.round(G.rain * 4)) {
      envHour = G.hour; G._envRain = Math.round(G.rain * 4);
      const eu = envSky.material.uniforms; for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) eu[k].value = su[k].value; eu.sunPosition.value.copy(sunV.y > -0.05 ? sunV : new THREE.Vector3(0, -0.05, 1));
      if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture;
      scene.environment.intensity = 1;
    }
    for (const m of [D.lampHeadMat]) if (m) m.emissiveIntensity = night * 6;
    if (D.signMat) D.signMat.emissiveIntensity = night * 0.6;
    if (D.poolMat) D.poolMat.opacity = night * 0.85;
    if (D.windowMats) for (const m of D.windowMats) m.emissiveIntensity = night * 0.55;
    // three r160 has no scene.environmentIntensity: scale each material's envMapIntensity instead
    const envI = Math.round(lerp(0.55, 0.04, night) * (1 - G.rain * 0.3) * 50) / 50;
    if (envI !== G._envI || (G._envN | 0) < 3) {
      G._envI = envI; G._envN = (G._envN | 0) + 1;
      scene.traverse(o => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if ('envMapIntensity' in m) { if (m.userData.envK === undefined) m.userData.envK = m.envMapIntensity; m.envMapIntensity = m.userData.envK * envI; } });
    }
  }

  function update(dt) {
    G.time += dt; G.hour = (G.hour + dt / 300) % 24; // one game hour lasts five real minutes
    if (pressed.KeyT) { G.hour = (G.hour + 1) % 24; toast(`Time skipped to ${clockStr()}`, 2); }
    if (pressed.KeyR) { G.rainTarget = G.rainTarget > 0 ? 0 : 1; toast(G.rainTarget ? 'Northeast monsoon shower rolling in…' : 'Rain clearing up.', 3); }
    G.rain += (G.rainTarget - G.rain) * Math.min(1, dt * 0.4);
    if (pressed.KeyM) G.bigMap = !G.bigMap;
    if (pressed.KeyV) { G.view = (G.view + 1) % 2; G.sky = false; }
    if (pressed.KeyZ) { G.sky = !G.sky; if (G.sky) { G.view = 0; G.skyYaw = G.camYaw + G.orbit; toast(TOUCH ? 'View from above. Pinch to zoom, drag to turn, SKY to come back.' : 'View from above. Wheel to zoom, drag to turn, Z to come back.', 5); } }
    if (pressed.KeyP) G.cycleQuality();
    // roadside mechanic: stop the vehicle and press G to have it repaired for a fee
    if (pressed.KeyG) {
      if (pcarIdx < 0) toast('Get in the vehicle you want repaired first.', 3);
      else { const o = pcarIdx * CF, dmg = cars[o + 13];
        if (dmg < 1) toast('This vehicle has no damage.', 2);
        else if (Math.abs(cars[o + 12]) > 1.5) toast('Stop the vehicle first, then press G for the mechanic.', 3);
        else { const cost = Math.min(G.money, Math.round(dmg * 3)); G.money -= cost; S.repair(pcarIdx); sfx('ding'); toast(`Mechanic repaired your vehicle for ₹${cost}.`, 4); } } }
    if (pressed.F1 || pressed.Slash) G.help = !G.help;
    if (pressed.Escape) { G.help = false; G.bigMap = false; G.offers = null; }
    if (pressed.KeyJ) { if (G.job) toast('Finish or cancel (X) your current job first.', 3); else if (G.offers) G.offers = null; else makeOffers(); }
    if (G.offers) for (let k = 0; k < G.offers.length; k++) if (pressed['Digit' + (k + 1)]) { acceptOffer(k); break; }
    if (pressed.KeyX && G.job) { toast('Job cancelled.', 3); G.job = null; G.routeTree = null; }
    pcarIdx = S.get_pcar();
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g) : null;
    const gpSteer = gp ? (Math.abs(gp.axes[0]) > 0.12 ? gp.axes[0] : 0) : 0, gpThr = gp ? (gp.buttons[7]?.value || 0) : 0, gpBrk = gp ? (gp.buttons[6]?.value || 0) : 0;
    if (gp && gp.buttons[3]?.pressed && !G._gpY) pressed.KeyF = true; G._gpY = gp && gp.buttons[3]?.pressed;
    if (pressed.KeyF || pressed.Enter) {
      if (pcarIdx >= 0) { if (S.exit_car()) sfx('door'); else toast('Slow down before getting out.', 2); }
      else { const i = S.try_enter(); if (i >= 0) { sfx('door'); const t = cars[i * CF + 6] | 0; toast(`Driving your ${['car', 'auto-rickshaw', 'bus', 'hatchback', 'taxi', 'scooter'][t]}. Keep left, like real Chennai traffic.`, 4); } else toast('No vehicle of yours nearby. Yours are the cyan markers.', 3); }
      pcarIdx = S.get_pcar();
    }
    const thr = Math.max(keys.KeyW || keys.ArrowUp ? 1 : 0, gpThr), brk = Math.max(keys.KeyS || keys.ArrowDown ? 1 : 0, gpBrk);
    const st = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    steerS += clamp((gp && gpSteer ? gpSteer : st) - steerS, -dt * 3.2, dt * 3.2);
    if (pcarIdx >= 0) { inp[0] = thr; inp[1] = brk; inp[2] = steerS; inp[3] = keys.Space ? 1 : 0; inp[4] = 0; inp[5] = 0; }
    else {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), s = TOUCH ? 0 : (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const cy = G.camYaw + G.orbit, fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
      let mx = fx * f + rx * s, mz = fz * f + rz * s; const ml = Math.hypot(mx, mz), spd = keys.ShiftLeft || keys.ShiftRight || TOUCH ? 4.6 : 1.5;
      if (ml > 0) { mx = mx / ml * spd; mz = mz / ml * spd; }
      inp[0] = inp[1] = inp[2] = inp[3] = 0; inp[4] = mx; inp[5] = mz;
    }
    S.step(dt / 2); S.step(dt / 2);
    if (evs[0] + evs[3] > 0 && crashCool <= 0) {
      const imp = evs[1] / 10; sfx('crash', clamp(imp / 10, 0.2, 1)); crashCool = 0.5;
      const Jc = G.job;
      if (Jc && Jc.stage === 'carry' && imp > 3) {
        const k = Jc.kind;
        if (k === 'fragile') { Jc.cargo = Math.max(0, Jc.cargo - imp * 6); if (Jc.cargo <= 0) endJob('The cargo is broken beyond use. No pay for this job.'); else toast(`Careful! Cargo ${Math.round(Jc.cargo)}% intact.`, 2.5); }
        else if (k === 'clean') endJob('You touched something. No-scratch run failed. Try again from the job list.');
        else if (k === 'test') { Jc.faults++; if (Jc.faults > 2) endJob('Driving test failed: 3 faults. Try again from the job list.'); else toast(`Fault ${Jc.faults} of 2 allowed: collision.`, 3); }
        else { Jc.rating = Math.max(1, Jc.rating - (imp > 8 ? 1 : 0.5) * (k === 'hospital' || k === 'school' ? 1.5 : 1)); toast(k === 'delivery' || k === 'food' || k === 'cans' ? 'Careful with the load!' : k === 'hospital' ? 'Patient: "Slowly, please, my back!"' : 'Passenger: "Aiyo! Careful, please!"', 2.5); }
      }
    }
    if (evs[2] > 0 && G.job && G.job.stage === 'carry' && /^(ride|share|school|hospital|tour)$/.test(G.job.kind)) { G.job.rating = Math.max(1, G.job.rating - 0.25); toast('Passenger: "Slow down near people!"', 2); }
    crashCool -= dt; evs.fill(0);
    let px, pz, ph, pspd;
    if (pcarIdx >= 0) { const o = pcarIdx * CF; px = cars[o]; pz = cars[o + 1]; ph = cars[o + 2]; pspd = cars[o + 12]; } else { px = pl[0]; pz = pl[1]; ph = pl[2]; pspd = pl[3]; }
    G.px = px; G.pz = pz; G.ph = ph; G.pspd = pspd;
    let best = null, bd = 1e9; for (const a of AREAS) { const d = Math.hypot(a.x - px, a.z - pz); if (d < bd) { bd = d; best = a; } }
    if (best && best.name !== G.area) { G.area = best.name; G.areaT = 4; } G.areaT -= dt;
    G.road = roadNameAt(px, pz) || G.road;
    const J = G.job;
    if (J) {
      J.t += dt;
      const tgt = J.stage === 'pickup' ? J.from.stop : J.to.stop, d = Math.hypot(tgt.x - px, tgt.z - pz), inCar = pcarIdx >= 0, ptype = inCar ? cars[pcarIdx * CF + 6] | 0 : -1;
      if (J.kind === 'test' && J.stage === 'carry' && inCar) { if (Math.abs(pspd) * 3.6 > 43) { J.over += dt; if (J.over > 2) { J.over = 0; J.faults++; if (J.faults > 2) endJob('Driving test failed: 3 faults. Try again from the job list.'); else toast(`Fault ${J.faults} of 2 allowed: over 40 km/h.`, 3); } } else J.over = 0; }
      if (G.job === J && d < 9 && Math.abs(pspd) < 2.2) {
        const pax = /^(ride|share|school|hospital|tour)$/.test(J.kind), last = J.si === J.stops.length - 1;
        if (!inCar) { if (!J.warned) { toast('You need a vehicle for this job.', 3); J.warned = 1; } }
        else if (pax && ptype === 5) { if (!J.warned2) { toast('A scooter cannot carry these passengers. Use your auto, car or taxi.', 3); J.warned2 = 1; } }
        else if (!last) {
          const first = J.si === 0; J.si++; const nx = J.stops[J.si]; J.to = nx; J.stage = 'carry'; if (first) J.t = 0; setRoute(nx.stop); sfx('ding');
          const k = J.kind, n = J.si;
          toast(k === 'share' ? (n < 3 ? `Passenger ${n} of 3 on board. Next pickup: ${nx.name}.` : `All 3 on board. Drop everyone at ${nx.name}.`)
            : k === 'tour' ? (first ? `Tourists on board. First stop: ${nx.name}.` : `They took their photos. Next: ${nx.name}.`)
            : k === 'cans' ? (first ? `Cans loaded. First delivery: ${nx.name}.` : `Can delivered. Next: ${nx.name}.`)
            : k === 'test' ? (first ? `Test started. Checkpoint 1: ${nx.name}. Keep under 40 km/h.` : n === J.stops.length - 1 ? `Last leg: return to ${nx.name}.` : `Checkpoint cleared. Next: ${nx.name}.`)
            : k === 'clean' ? (first ? `Run started. Reach ${nx.name} without a scratch.` : `Halfway. Now back to ${nx.name}.`)
            : pax ? `Passenger on board. Drop at ${nx.name}, ${J.km.toFixed(1)} km.` : `Collected. Deliver to ${nx.name}.`, 4);
        } else {
          const late = J.t > J.limit, k = J.kind;
          if (J.challenge) {
            if (late) endJob(`${J.label.replace('Challenge: ', '')} finished, but over the time allowed. No reward. Try again.`);
            else { const pay = J.fare; G.money += pay; sfx('cash'); if (k === 'test') G.licence = true; goalAdd('chal', 1); endJob(k === 'test' ? `Driving test passed with ${J.faults} fault${J.faults === 1 ? '' : 's'}. Reward ₹${pay}.` : `No-scratch run complete. Reward ₹${pay}.`); }
          } else {
            const tip = (!late && J.rating >= 4.5) ? Math.round(J.fare * 0.15) : 0;
            const pay = Math.round(J.fare * (late ? (k === 'food' ? 0.5 : 0.7) : 1) * (0.6 + J.rating * 0.08) * (k === 'fragile' ? J.cargo / 100 : 1)) + tip;
            G.money += pay; G.trips++; G.ratingSum += J.rating; sfx('cash');
            const msg = `${J.label} complete: ₹${pay}${tip ? ` (incl. ₹${tip} tip)` : ''}. Rating ${J.rating.toFixed(1)}★${late ? (k === 'food' ? ', the food went cold' : ', a bit late') : ''}${k === 'fragile' ? `, cargo ${Math.round(J.cargo)}% intact` : ''}`;
            const r5 = J.rating >= 5 && !late; endJob(msg); goalAdd('trips', 1); goalAdd('earned', pay); goalAdd('kinds', k); if (r5) goalAdd('five', 1); save();
          }
        }
      }
    }
    G.routeT -= dt; if (G.routeTree && G.routeT <= 0) { G.route = tracePath(px, pz); G.routeT = 0.7; } if (!G.routeTree) G.route = null;
    if (A.ctx) {
      const ac = A.ctx.currentTime, s = Math.abs(pspd), drv = pcarIdx >= 0, t = drv ? cars[pcarIdx * CF + 6] | 0 : -1;
      const base = t === 1 ? 32 : t === 5 ? 55 : t === 2 ? 28 : 40, mul = t === 1 ? 1.6 : t === 5 ? 3 : 2.4, gear = s * 3.6, rpm = base + ((gear % 28) / 28) * mul * 30 + gear * 0.8;
      A.eng.o1.frequency.setTargetAtTime(rpm, ac, 0.05); A.eng.o2.frequency.setTargetAtTime(rpm * 0.501, ac, 0.05); A.eng.lp.frequency.setTargetAtTime(300 + thr * 900 + s * 15, ac, 0.1); A.eng.g.gain.setTargetAtTime(drv ? 0.05 + thr * 0.05 : 0, ac, 0.1);
      A.horn.gain.setTargetAtTime(keys.KeyH ? 0.12 : 0, ac, 0.01); A.city.gain.setTargetAtTime(0.05 * (1 - G.night * 0.6), ac, 0.5); A.rainG.gain.setTargetAtTime(G.rain * 0.12, ac, 0.5);
      A.sea.gain.setTargetAtTime(clamp(1 - (city.coastX(pz) - px) / 300, 0, 1) * (0.08 + Math.sin(G.time * 0.6) * 0.04), ac, 0.3);
      farHornT -= dt; if (farHornT <= 0) { sfx('farhorn', 1 - G.night * 0.5); farHornT = 0.5 + Math.random() * (3 + G.night * 6); }
    }
  }

  const tmpV = new THREE.Vector3();
  const camFwd = new THREE.Vector3(), LODR = { tree: 650, palm: 800, lamp: 420, tank: 450, prop: 330, wire: 200, place: 900 };
  const P = G.prof = { upd: 0, pre: 0, gl: 0, hud: 0, n: 0, t0: 0 };
  function render(dt) {
    P.t0 = performance.now();
    lighting();
    const inCar = pcarIdx >= 0, ptype = inCar ? cars[pcarIdx * CF + 6] | 0 : -1, px = G.px, pz = G.pz, ph = G.ph;
    G.orbitT -= dt; if (G.orbitT <= 0) G.orbit *= Math.pow(0.15, dt);
    const cockpit = inCar && G.view === 1 && !G.sky;
    if (inCar) G.camYaw += (((ph - G.camYaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 3);
    else { const turn = (keys.KeyQ || TOUCH && keys.KeyA ? 1 : 0) - (keys.KeyE || TOUCH && keys.KeyD ? 1 : 0); G.camYaw += turn * dt * 1.8; }
    const yaw = G.camYaw + G.orbit;
    if (cockpit) {
      const rx = -Math.cos(ph), rz = Math.sin(ph), fx = Math.sin(ph), fz = Math.cos(ph);
      const side = ptype === 1 || ptype === 5 ? 0 : 0.36, hgt = ptype === 2 ? 2.4 : ptype === 5 ? 1.8 : ptype === 1 ? 1.42 : 1.18, fo = ptype === 2 ? 4.5 : ptype === 1 ? 0.3 : ptype === 5 ? -0.15 : -0.1;
      camera.position.set(px + rx * side + fx * fo, hgt, pz + rz * side + fz * fo);
      camera.lookAt(camera.position.x + fx * 10, hgt - 0.5, camera.position.z + fz * 10);
      camera.fov = 70;
    } else if (!G.sky) {
      const big = ptype === 2 ? 1.8 : 1, dist = inCar ? G.camDist * big : Math.min(G.camDist * 0.6, 5), hgt = inCar ? 1.6 * big : 1.5;
      const fx = Math.sin(yaw), fz = Math.cos(yaw), cp = G.camPitch;
      tmpV.set(px - fx * dist * Math.cos(cp), hgt + dist * Math.sin(cp), pz - fz * dist * Math.cos(cp));
      camera.position.lerp(tmpV, Math.min(1, dt * 10)); camera.position.y = Math.max(0.5, camera.position.y);
      camera.lookAt(px + fx * 2, hgt, pz + fz * 2);
      // the view widens gently with speed; eased so a sudden stop or bump does not snap the picture closer
      { const want = 60 + Math.min(8, Math.abs(G.pspd) * 0.3); camera.fov += (want - camera.fov) * Math.min(1, dt * 0.8); }
    }
    if (G.sky) {
      const H = G.skyH, back = H / Math.tan(G.skyTilt), fx = Math.sin(G.skyYaw), fz = Math.cos(G.skyYaw);
      tmpV.set(px - fx * back, H, pz - fz * back); camera.position.lerp(tmpV, Math.min(1, dt * 5)); camera.lookAt(px, Math.min(1.3, H * 0.25), pz); camera.fov = 50;
    }
    { const far = G.sky ? Math.max(G.baseFar || 2500, G.skyH * 5 + 800) : (G.baseFar || 2500); if (camera.far !== far) camera.far = far;
      // from high up the ground layers are too close together for the depth buffer unless the near limit moves out with the height
      camera.near = G.sky ? Math.max(0.3, camera.position.y * 0.12) : 0.3; }
    if (G.camOverride) G.camOverride(camera);
    camera.updateProjectionMatrix(); camera.getWorldDirection(camFwd);
    // shadows follow the player
    const sx = Math.round(px / 4) * 4, sz = Math.round(pz / 4) * 4;
    sun.position.set(sx + sunV.x * 400, Math.max(30, sunV.y * 400), sz + sunV.z * 400); sun.target.position.set(sx, 0, sz); sun.target.updateMatrixWorld();
    sky.position.copy(camera.position);
    waterNormals.offset.set(G.time * 0.004, G.time * 0.0025);
    // vehicles, people
    const focus = G.sky ? tmpV.set(px, 2, pz) : camera.position;
    fleet.update(cars, CF, MAXCARS, pcarIdx, focus, dt, G.night, cockpit);
    crowd.fwd = G.sky ? null : [camFwd.x, camFwd.z]; crowd.update(peds, PF, MAXPEDS, focus, dt);
    me.obj.visible = !inCar; if (!inCar) { me.obj.position.set(pl[0], 0, pl[1]); me.obj.rotation.y = pl[2]; Crowd.blend(me, pl[3], dt); }
    // owned vehicle markers
    let n = 0; const m4 = new THREE.Matrix4();
    for (const o of G.owned) { const c = o.i * CF; if (o.i === pcarIdx || !cars[c + 7]) continue; m4.makeRotationY(G.time * 2).setPosition(cars[c], 3.2 + Math.sin(G.time * 3) * 0.15, cars[c + 1]); ownedMarks.setMatrixAt(n++, m4); }
    ownedMarks.count = n; ownedMarks.instanceMatrix.needsUpdate = true;
    // job marker
    const J = G.job;
    if (J) { const t = J.stage === 'pickup' ? J.from.stop : J.to.stop, col = J.stage === 'pickup' ? 0xffd23d : 0x4ee06a; beam.visible = ring.visible = true; beam.position.set(t.x, 20, t.z); ring.position.set(t.x, 0.15, t.z); markerMat.color.set(col); ring.material.color.set(col); ring.rotation.z = G.time; }
    else beam.visible = ring.visible = false;
    // GPS chevrons
    let cn = 0;
    if (G.route && !G.bigMap) {
      let acc = 0;
      for (let i = 1; i < G.route.length && cn < 40 && acc < 120; i++) {
        const a = G.route[i - 1], b = G.route[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.1) continue;
        const yw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        for (let d = (8 - acc % 8) % 8; d < L && cn < 40; d += 8) { if (acc + d < 8) continue; m4.makeRotationY(yw).setPosition(a[0] + (b[0] - a[0]) * d / L, 0.2, a[1] + (b[1] - a[1]) * d / L); chevs.setMatrixAt(cn++, m4); }
        acc += L;
      }
    }
    chevs.count = cn; chevs.instanceMatrix.needsUpdate = true;
    // GPS line: a blue ribbon on the road along the route
    if (G.route && G.route !== gpsDrawn) {
      gpsDrawn = G.route; const pa = gpsGeo.attributes.position.array; let n = 0, acc = 0, rem = 0;
      for (let i = 1; i < G.route.length; i++) rem += Math.hypot(G.route[i][0] - G.route[i - 1][0], G.route[i][1] - G.route[i - 1][1]);
      G.routeLeft = rem;
      const R = G.route, HW = G.sky ? Math.max(0.9, G.skyH * 0.012) : 0.9, RY = G.sky ? Math.min(3, 0.14 + G.skyH * 0.002) : 0.14; // wider from above so it stays visible
      const i0 = 0;
      for (let i = i0; i < R.length && n < GPSN && acc < 9000; i++) {
        const a = R[Math.max(i0, i - 1)], b = R[Math.min(R.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        if (i > i0 && i < R.length - 1 && Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]) < 0.3) continue;
        if (i > i0) acc += Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]);
        pa[n * 6] = R[i][0] + dz * HW; pa[n * 6 + 1] = RY; pa[n * 6 + 2] = R[i][1] - dx * HW; pa[n * 6 + 3] = R[i][0] - dz * HW; pa[n * 6 + 4] = RY; pa[n * 6 + 5] = R[i][1] + dx * HW; n++;
      }
      gpsGeo.setDrawRange(0, Math.max(0, n - 1) * 6); gpsGeo.attributes.position.needsUpdate = true;
    }
    gpsLine.visible = !!G.route; if (!G.route) { gpsDrawn = null; G.routeLeft = 0; }
    // rain streaks around the camera
    rain.visible = G.rain > 0.05;
    if (rain.visible) {
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, R = 30;
      for (let i = 0; i < rainN; i++) {
        const x = cx + (rainSeed[i * 3] - 0.5) * 2 * R, z = cz + (rainSeed[i * 3 + 1] - 0.5) * 2 * R, y = ((rainSeed[i * 3 + 2] * 25 - G.time * 16) % 25 + 25) % 25 + cy - 10;
        rainPos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
      }
      rainGeo.attributes.position.needsUpdate = true; rain.material.opacity = 0.35 * G.rain;
    }
    G.frameN = (G.frameN | 0) + 1;
    // hide far-away detail (parked bikes, poles, wires, trees, roof tanks): at a distance it is a few pixels of work for nothing
    if (G.frameN % 8 === 1) { const cx = G.sky ? G.px : camera.position.x, cz = G.sky ? G.pz : camera.position.z, k = Q.lod * (G.sky ? Math.max(1, Math.min(2.5, G.skyH / 250)) : 1); for (const l of city.lod) l.o.visible = Math.hypot(l.x - cx, l.z - cz) - l.r < LODR[l.kind] * k; } if (Q.shadow) renderer.shadowMap.needsUpdate = G.frameN % Q.shadow === 0;
    const tA = performance.now(); P.pre += tA - P.t0;
    renderer.render(scene, camera); const tB = performance.now(); P.gl += tB - tA;
    drawHud(); P.hud += performance.now() - tB; P.n++;
  }

  // ---------------- HUD ----------------
  let D2 = 1;
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function panel(x, y, w, h) { rrect(x, y, w, h, 10 * D2); ctx.fillStyle = 'rgba(12,14,18,0.62)'; ctx.fill(); }
  function wrap(text, maxW) { const words = text.split(' '), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
  function drawHud() {
    const w = hud.width, h = hud.height; const U = Math.min(devicePixelRatio || 1, 2), narrow = innerWidth < 560; D2 = U * (TOUCH ? (innerWidth < 350 ? 0.76 : 0.86) : Math.min(1, Math.max(0.7, innerWidth / 1100))); const D = D2;
    { const st = (G.paused ? 0 : 1) | (G.offers || G.bigMap || G.help ? 2 : 0) | (G.job ? 4 : 0); if (st !== G._bodySt) { G._bodySt = st; const c = document.body.classList; c.toggle('modal', !!(st & 2)); c.toggle('job', !!(st & 4)); } }
    ctx.clearRect(0, 0, w, h); if (G.paused) return;
    const font = (s, b = 600) => `${b} ${Math.round(s * D)}px "Segoe UI", system-ui, sans-serif`;
    const px = G.px, pz = G.pz;
    ctx.textBaseline = 'top';
    if (TOUCH) {
      const sx = 102 * U, sw = w - sx - 96 * U; ctx.globalAlpha = 0.85; panel(sx, 8 * U, sw, 30 * U); ctx.globalAlpha = 1;
      ctx.font = font(15, 700); ctx.fillStyle = '#7ee787'; const mt = '₹ ' + G.money.toLocaleString('en-IN'); ctx.fillText(mt, sx + 10 * U, 15 * U); const mw = ctx.measureText(mt).width;
      ctx.font = font(12, 600); ctx.fillStyle = '#e6edf3'; ctx.fillText(clockStr() + (G.trips ? ` · ${(G.ratingSum / G.trips).toFixed(1)}★ · ${G.trips} trips` : ''), sx + 20 * U + mw, 17 * U, sw - mw - 30 * U);
    } else {
    panel(14 * D, 14 * D, 210 * D, 78 * D);
    ctx.fillStyle = '#fff'; ctx.font = font(22, 700); ctx.fillText(clockStr(), 26 * D, 22 * D);
    ctx.font = font(13, 500); ctx.fillStyle = '#c9d1d9'; ctx.textAlign = 'right'; ctx.fillText(G.rain > 0.5 ? 'Rain 26°C' : G.night > 0.5 ? 'Night 25°C' : 'Humid 31°C', 212 * D, 28 * D); ctx.textAlign = 'left';
    ctx.font = font(18, 700); ctx.fillStyle = '#7ee787'; ctx.fillText('₹ ' + G.money.toLocaleString('en-IN'), 26 * D, 54 * D);
    ctx.fillStyle = '#f2cc60'; ctx.font = font(14, 600); ctx.fillText(G.trips ? `${(G.ratingSum / G.trips).toFixed(1)}★ · ${G.trips} trips` : 'No trips yet', 120 * D, 57 * D);
    }
    const J = G.job;
    if (G.offers) {
      let pw = Math.min(600 * D, w - 40 * D), x0 = (w - pw) / 2, y = 70 * D; if (TOUCH && narrow) { y = 104 * U; x0 = 10 * D; pw = w - 20 * D; } else if (TOUCH) { y = 44 * U; x0 = Math.max(x0, 102 * U); pw = Math.min(pw, w - x0 - 10 * D); }
      const small = h < 560 * D; ctx.font = font(14, 500); const blocks = G.offers.map(o => small ? [] : wrap(o.text, pw - 40 * D).slice(0, 2));
      const rowH = b => (b.length * 18 + (small ? 30 : 36)) * D, goalsH = small ? 26 * D : (GOALS.length * 18 + 30) * D, ph = 50 * D + blocks.reduce((a, b) => a + rowH(b), 0) + goalsH;
      panel(x0, y, pw, ph); ctx.fillStyle = '#fff'; ctx.font = font(18, 700); ctx.fillText(document.body.classList.contains('touch') ? 'Jobs near you: tap one to accept' : `Jobs near you: press 1 to ${G.offers.length}, or click one`, x0 + 20 * D, y + 14 * D); y += 46 * D; G.offerRects = [];
      G.offers.forEach((o, k) => { const ry = y - 8 * D; G.offerRects.push([x0, ry, x0 + pw, ry + rowH(blocks[k])]); ctx.fillStyle = o.challenge ? 'rgba(255,214,90,0.10)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(x0 + 8 * D, ry, pw - 16 * D, rowH(blocks[k]) - 6 * D); ctx.font = font(15, 700); ctx.fillStyle = o.col;
        ctx.fillText(o.challenge ? `${k + 1}. ${o.label} · ${o.km.toFixed(1)} km · reward ₹${o.fare}` : `${k + 1}. ${o.label}: ${o.from.name} → ${o.to.name} · ${o.km.toFixed(1)} km · ~₹${o.fare}`, x0 + 20 * D, y, pw - 40 * D); y += 20 * D; ctx.font = font(14, 500); ctx.fillStyle = '#c9d1d9'; for (const l of blocks[k]) { ctx.fillText(l, x0 + 20 * D, y, pw - 40 * D); y += 18 * D; } y += (small ? 10 : 16) * D; });
      // today's targets
      const doneN = GOALS.filter(g => G.claimed[g[0]]).length;
      if (small) { ctx.font = font(13, 600); ctx.fillStyle = '#f2cc60'; ctx.fillText(`Today's targets: ${doneN} of ${GOALS.length} done` + (G.licence ? ' · Licence earned' : ''), x0 + 20 * D, y - 2 * D, pw - 40 * D); }
      else { ctx.font = font(13, 700); ctx.fillStyle = '#f2cc60'; ctx.fillText(`Today's targets` + (G.licence ? ' · Driving licence earned' : ''), x0 + 20 * D, y, pw - 40 * D); y += 20 * D; ctx.font = font(13, 500);
        for (const [id, need, text, reward] of GOALS) { const v = Math.min(need, Math.round(G.gv[id] || 0)), ok = !!G.claimed[id]; ctx.fillStyle = ok ? '#7ee787' : '#c9d1d9'; ctx.fillText(`${ok ? '✓' : '○'} ${text} (${id === 'earned' ? '₹' + v : v}/${id === 'earned' ? '₹' + need : need}) · bonus ₹${reward}`, x0 + 20 * D, y, pw - 40 * D); y += 18 * D; } }
    } else if (J) {
      const tgt = J.stage === 'pickup' ? J.from : J.to; let pw = Math.min(540 * D, w - 40 * D), x0 = (w - pw) / 2; if (x0 < 236 * D) { x0 = 236 * D; pw = Math.max(200 * D, w - 250 * D); }
      const jy = TOUCH ? 42 * U - 14 * D : 0; if (TOUCH) { x0 = 102 * U; pw = w - 112 * U; ctx.globalAlpha = 0.9; } ctx.save(); ctx.translate(0, jy);
      panel(x0, 14 * D, pw, 60 * D); ctx.fillStyle = '#fff'; ctx.font = font(15, 700);
      { const lastS = J.si === J.stops.length - 1, k = J.kind, verb = J.stage === 'pickup' ? (J.challenge ? 'Start at' : 'Pick up at') : J.challenge ? (lastS ? 'Finish at' : 'Checkpoint:') : k === 'share' ? (lastS ? 'Drop everyone at' : 'Next pickup:') : k === 'tour' ? 'Tour stop:' : /^(ride|school|hospital)$/.test(k) ? 'Drop passenger at' : 'Deliver to'; ctx.fillStyle = J.col; ctx.fillText(`${J.label.replace('Challenge: ', '')} · ${verb} ${tgt.name}`, x0 + 16 * D, 24 * D, pw - 32 * D); }
      ctx.font = font(13, 500); ctx.fillStyle = '#c9d1d9'; const d = (G.routeLeft > 0 ? G.routeLeft : Math.hypot(tgt.stop.x - px, tgt.stop.z - pz)) / 1000, left = J.limit - J.t;
      ctx.fillText(`${d < 1 ? Math.round(d * 100) * 10 + ' m' : d.toFixed(1) + ' km'} by road${J.stage === 'carry' ? ` · ${left > 0 ? Math.ceil(left) + 's left' : 'running late'} · ${J.kind === 'test' ? 'faults ' + J.faults + '/2' : J.kind === 'fragile' ? 'cargo ' + Math.round(J.cargo) + '%' : J.kind === 'clean' ? 'no scratches so far' : J.rating.toFixed(1) + '★'}${J.stops.length > 2 ? ' · stop ' + J.si + ' of ' + (J.stops.length - 1) : ''}` : ''} ${TOUCH ? '' : ' · X to cancel'}`, x0 + 16 * D, 48 * D, pw - 32 * D); ctx.restore(); ctx.globalAlpha = 1;
    } else if (!TOUCH) { // shortcut row on a dark strip so it stays readable against a bright sky
      const t = 'J jobs · M map · V driver view · Z from above · P graphics · G repair · T skip hour · R rain · ? help'; ctx.font = font(14, 600);
      const x0 = 236 * D, room = w - x0 - 14 * D, tw = Math.min(ctx.measureText(t).width, room - 28 * D), pw = tw + 28 * D, px0 = Math.max(x0, Math.min(w / 2 - pw / 2, w - 14 * D - pw));
      panel(px0, 14 * D, pw, 32 * D); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(t, px0 + pw / 2, 22 * D, tw); ctx.textAlign = 'left'; }
    G.msg = G.msg.filter(m => m.until > G.time);
    let my = TOUCH && !narrow ? 104 * U : (TOUCH ? h - 236 * U : h - (pcarIdx >= 0 ? 200 : 110) * D) - G.msg.length * 36 * D; ctx.textAlign = 'center';
    for (const m of G.msg) { ctx.font = font(15, 600); const tw = Math.min(ctx.measureText(m.t).width + 28 * D, w - 12 * D); panel(w / 2 - tw / 2, my, tw, 30 * D); ctx.fillStyle = '#fff'; ctx.fillText(m.t, w / 2, my + 7 * D, tw - 16 * D); my += 36 * D; }
    if (G.areaT > 0 && !G.offers && !G.help && !G.bigMap) { ctx.globalAlpha = Math.min(1, G.areaT); ctx.font = font(34, 800); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 8 * D; ctx.fillText(G.area, w / 2, h * (TOUCH ? 0.4 : 0.16)); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
    ctx.textAlign = 'left';
    // minimap
    const ms = TOUCH ? 86 * U : Math.min(230 * D, w * 0.32), mx = TOUCH ? 8 * U : 16 * D, my2 = TOUCH ? 8 * U : h - ms - 16 * D;
    ctx.save(); rrect(mx, my2, ms, ms, 14 * D); ctx.clip(); ctx.fillStyle = '#2b2f2a'; ctx.fillRect(mx, my2, ms, ms);
    const zoom = (Math.abs(G.pspd) > 12 ? 1.5 : 2.1) * (TOUCH ? 0.62 * U : D); const rotA = G.camYaw + G.orbit + Math.PI;
    ctx.translate(mx + ms / 2, my2 + ms / 2); ctx.rotate(rotA); ctx.scale(zoom, zoom); ctx.translate(-MX(px), -MZ(pz)); ctx.drawImage(mapCv, 0, 0);
    if (G.route) { ctx.strokeStyle = '#3aa0ff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); G.route.forEach((p, i) => i ? ctx.lineTo(MX(p[0]), MZ(p[1])) : ctx.moveTo(MX(p[0]), MZ(p[1]))); ctx.stroke(); }
    for (const l of LMS) { ctx.fillStyle = '#e3b341'; ctx.beginPath(); ctx.arc(MX(l.x), MZ(l.z), 3, 0, 7); ctx.fill(); }
    for (const o of G.owned) { if (o.i === pcarIdx) continue; const c = o.i * CF; ctx.fillStyle = '#39d0ff'; ctx.fillRect(MX(cars[c]) - 3, MZ(cars[c + 1]) - 3, 6, 6); }
    ctx.restore();
    if (J) { // destination: a large pin, held at the edge of the minimap with an arrow while it is off the map
      const t = J.stage === 'pickup' ? J.from.stop : J.to.stop, col = J.stage === 'pickup' ? '#ffd33d' : '#3ddc6a';
      const ddx = (MX(t.x) - MX(px)) * zoom, ddz = (MZ(t.z) - MZ(pz)) * zoom, ca = Math.cos(rotA), sa = Math.sin(rotA);
      let sx = ddx * ca - ddz * sa, sy = ddx * sa + ddz * ca; const lim = ms / 2 - 14 * D, k = Math.max(Math.abs(sx), Math.abs(sy)) / lim, off = k > 1; if (off) { sx /= k; sy /= k; }
      const cx = mx + ms / 2 + sx, cy = my2 + ms / 2 + sy, pr = (9 + 2 * Math.sin(G.time * 5)) * D;
      ctx.fillStyle = col; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(cx, cy, pr * 1.9, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 8 * D, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * D; ctx.stroke();
      if (off) { const an = Math.atan2(sy, sx); ctx.save(); ctx.translate(cx, cy); ctx.rotate(an); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(6 * D, 0); ctx.lineTo(-3 * D, -4.5 * D); ctx.lineTo(-3 * D, 4.5 * D); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else { ctx.fillStyle = '#10151c'; ctx.beginPath(); ctx.arc(cx, cy, 3 * D, 0, 7); ctx.fill(); }
    }
    ctx.save(); ctx.translate(mx + ms / 2, my2 + ms / 2); ctx.rotate(-(G.ph - (G.camYaw + G.orbit))); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 * D; ctx.beginPath(); ctx.moveTo(0, -9 * D); ctx.lineTo(6 * D, 7 * D); ctx.lineTo(0, 3 * D); ctx.lineTo(-6 * D, 7 * D); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    { const r = ms / 2 - 12 * D, rx = Math.sin(rotA), ry = -Math.cos(rotA), cx = mx + ms / 2 + rx * r, cy = my2 + ms / 2 + ry * r; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(cx, cy, 9 * D, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = font(11, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', cx, cy + 0.5); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; }
    ctx.font = font(13, 700); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4 * D; if (TOUCH) { ctx.textAlign = 'center'; ctx.fillText(`${G.road ? G.road + ', ' : ''}${G.area}`, w / 2, h - 24 * U, w - 20 * U); ctx.textAlign = 'left'; } else ctx.fillText(`${G.road ? G.road + ', ' : ''}${G.area}`, mx + ms + 12 * D, h - 30 * D); ctx.shadowBlur = 0;
    if (pcarIdx >= 0) {
      const o = pcarIdx * CF, kmh = Math.abs(cars[o + 12]) * 3.6, dmg = cars[o + 13], cx = TOUCH ? w - 64 * U : w - 92 * D, cy = TOUCH ? h - 68 * U : h - 92 * D, r = TOUCH ? 46 * U : 70 * D;
      ctx.beginPath(); ctx.arc(cx, cy, r + 10 * D, 0, 7); ctx.fillStyle = 'rgba(12,14,18,0.6)'; ctx.fill();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25; ctx.lineWidth = 6 * D; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(cx, cy, r - 4 * D, a0, a1); ctx.stroke();
      ctx.strokeStyle = kmh > 50 ? '#ff7b72' : '#58a6ff'; ctx.beginPath(); ctx.arc(cx, cy, r - 4 * D, a0, a0 + (a1 - a0) * Math.min(1, kmh / 120)); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = font(32, 800); ctx.fillText(Math.round(kmh), cx, cy - 22 * D); ctx.font = font(12, 600); ctx.fillStyle = '#c9d1d9'; ctx.fillText('km/h', cx, cy + 14 * D); if (!TOUCH) ctx.fillText(kmh > 50 ? 'Limit 50' : '', cx, cy + 30 * D);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; const by = TOUCH ? cy + 34 * D : cy + 48 * D; ctx.fillRect(cx - 40 * D, by, 80 * D, 6 * D); ctx.fillStyle = dmg > 70 ? '#ff7b72' : dmg > 35 ? '#f2cc60' : '#56d364'; ctx.fillRect(cx - 40 * D, by, 80 * D * (1 - dmg / 100), 6 * D); ctx.textAlign = 'left';
      if (dmg > 35) { const m = dmg >= 100 ? (TOUCH ? 'Vehicle badly damaged. Stop and tap FIX.' : 'Vehicle badly damaged and crawling. Stop and press G (FIX) to repair it.') : TOUCH ? 'Vehicle damaged. Stop and tap FIX.' : 'Vehicle damaged. Stop and press G (FIX) for a mechanic.'; ctx.font = font(14, 700); ctx.textAlign = 'center'; const tw = Math.min(ctx.measureText(m).width + 28 * D, w - 12 * D), wy = TOUCH ? h * 0.42 : 82 * D; panel(w / 2 - tw / 2, wy, tw, 30 * D); ctx.fillStyle = dmg >= 100 ? '#ff7b72' : '#f2cc60'; ctx.fillText(m, w / 2, wy + 7 * D, tw - 16 * D); ctx.textAlign = 'left'; }
    } else for (const ov of G.owned) { const c = ov.i * CF; if (cars[c + 7] && Math.hypot(cars[c] - px, cars[c + 1] - pz) < cars[c + 14] + 2) { ctx.font = font(15, 700); ctx.textAlign = 'center'; panel(w / 2 - 150 * D, h * 0.64, 300 * D, 34 * D); ctx.fillStyle = '#fff'; ctx.fillText(TOUCH ? `Tap IN/OUT to get in your ${ov.name}` : `Press F to get in your ${ov.name}`, w / 2, h * 0.64 + 9 * D); ctx.textAlign = 'left'; } }
    if (G.help) {
      const lines = ['W/S or ↑/↓ accelerate and brake/reverse, A/D steer, Space handbrake, H horn', 'F get in or out of your vehicle. Traffic keeps LEFT, as in Chennai', 'On foot: WASD walk, Shift to jog, Q/E turn the camera', 'J job list · X cancel job · M city map · V driver view', 'P graphics: Battery saver, Balanced or High. Lower settings keep a laptop cool', 'G mechanic: stop and press G to repair a damaged vehicle (costs money)', 'T skip one hour (try night) · R monsoon rain · drag to look around, wheel to zoom', 'Z view from above in 3D: wheel or pinch to zoom from street level to 12 km up, drag to turn and tilt', 'Cyan markers are your vehicles: auto, scooter, hatchback and taxi', 'Map data © OpenStreetMap contributors (ODbL)'];
      ctx.font = font(14, 500); const pw = Math.min(720 * D, w - 40 * D), ph = (lines.length * 22 + 50) * D, x0 = (w - pw) / 2, y0 = h * 0.22;
      panel(x0, y0, pw, ph); ctx.fillStyle = '#fff'; ctx.font = font(17, 700); ctx.fillText('Controls', x0 + 18 * D, y0 + 14 * D); ctx.font = font(13, 600); ctx.fillStyle = '#f2cc60'; ctx.textAlign = 'right'; ctx.fillText('Press ? or Esc, or click anywhere, to close', x0 + pw - 18 * D, y0 + 17 * D); ctx.textAlign = 'left'; ctx.font = font(14, 500); ctx.fillStyle = '#d0d7de'; lines.forEach((l, i) => ctx.fillText(l, x0 + 18 * D, y0 + (44 + i * 22) * D));
    }
    if (G.bigMap) {
      const s = Math.min((w - 60 * D) / mapCv.width, (h - 60 * D) / mapCv.height), mw = mapCv.width * s, mh = mapCv.height * s, x0 = (w - mw) / 2, y0 = (h - mh) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, w, h); ctx.drawImage(mapCv, x0, y0, mw, mh);
      const bx = x => x0 + MX(x) * s, bz = z => y0 + MZ(z) * s;
      if (G.route) { ctx.strokeStyle = '#3aa0ff'; ctx.lineWidth = 4 * D; ctx.lineJoin = 'round'; ctx.beginPath(); G.route.forEach((p, i) => i ? ctx.lineTo(bx(p[0]), bz(p[1])) : ctx.moveTo(bx(p[0]), bz(p[1]))); ctx.stroke(); }
      ctx.font = font(11, 700); ctx.textAlign = 'center';
      for (const a of AREAS) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText(a.name.toUpperCase(), bx(a.x), bz(a.z)); }
      ctx.globalAlpha = J ? 0.45 : 1;
      for (const l of LMS) { ctx.fillStyle = '#e3b341'; ctx.beginPath(); ctx.arc(bx(l.x), bz(l.z), 4 * D, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(l.name, bx(l.x), bz(l.z) + 6 * D); }
      ctx.globalAlpha = 1;
      if (J) { // destination pin with its name, drawn above everything else
        const tg = J.stage === 'pickup' ? J.from : J.to, col = J.stage === 'pickup' ? '#ffd33d' : '#3ddc6a', cx = bx(tg.stop.x), cy = bz(tg.stop.z), pr = (14 + 4 * Math.sin(G.time * 5)) * D;
        ctx.fillStyle = col; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(cx, cy, pr * 1.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.bezierCurveTo(cx - 16 * D, cy - 18 * D, cx - 12 * D, cy - 36 * D, cx, cy - 36 * D); ctx.bezierCurveTo(cx + 12 * D, cy - 36 * D, cx + 16 * D, cy - 18 * D, cx, cy); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * D; ctx.stroke();
        ctx.fillStyle = '#10151c'; ctx.beginPath(); ctx.arc(cx, cy - 24 * D, 4.5 * D, 0, 7); ctx.fill();
        ctx.font = font(15, 800); const label = (J.stage === 'pickup' ? (J.challenge ? 'START: ' : 'PICK UP: ') : J.si < J.stops.length - 1 ? 'NEXT STOP: ' : J.challenge ? 'FINISH: ' : 'DROP: ') + tg.name, tw = ctx.measureText(label).width + 20 * D, lx = Math.max(x0 + tw / 2, Math.min(x0 + mw - tw / 2, cx)), ly = cy - 66 * D < y0 ? cy + 12 * D : cy - 66 * D;
        ctx.fillStyle = 'rgba(10,14,20,0.92)'; rrect(lx - tw / 2, ly, tw, 26 * D, 8 * D); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * D; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillText(label, lx, ly + 5 * D); ctx.font = font(11, 700);
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx(px), bz(pz), 6 * D, 0, 7); ctx.fill(); ctx.strokeStyle = '#f00'; ctx.lineWidth = 2 * D; ctx.stroke();
      ctx.font = font(13, 600); ctx.fillStyle = '#ddd'; ctx.fillText(TOUCH ? 'Real street map (OpenStreetMap). Tap to close.' : `Real street map of ${MAP.title} (OpenStreetMap). Press ` + 'M to close.', w / 2, Math.max(8 * D, y0 - 22 * D), w - 16 * D); ctx.textAlign = 'left';
    }
    ctx.font = font(10, 500); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textAlign = 'right'; ctx.fillText(`${fps.toFixed(0)} fps · © OpenStreetMap contributors`, w - 8 * D, 8 * D); ctx.textAlign = 'left';
  }

  // ---- graphics quality: three presets, switched with P; "Balanced" is the default and keeps a laptop cool ----
  const QUAL = [
    { name: 'Battery saver', pr: 0.8, fps: 30, shadow: 0, far: 1500, fog: 0.0011, ppl: 14, pplR: 60, pplSh: 0, veh: 220, lod: 0.6 },
    { name: 'Balanced', pr: 1.1, fps: 30, shadow: 2, far: 2500, fog: 0.00065, ppl: 24, pplR: 90, pplSh: 6, veh: 300, lod: 1 },
    { name: 'High', pr: 1.5, fps: 60, shadow: 1, far: 6000, fog: 0.00065, ppl: 40, pplR: 140, pplSh: 12, veh: 330, lod: 2 },
  ];
  let Q = QUAL[1], qIdx = 1, slowT = 0, qLevel = 0, lastT = performance.now();
  function applyQuality(i, quiet) {
    qIdx = i; Q = QUAL[i]; qLevel = 0; slowT = 0; G.quality = Q.name;
    renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr)); resize();
    sun.castShadow = Q.shadow > 0; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    camera.far = Q.far; camera.updateProjectionMatrix(); if (scene.fog) scene.fog.density = Q.fog; G.fogBase = Q.fog; G.baseFar = Q.far;
    crowd.maxShow = Q.ppl; crowd.range = Q.pplR; crowd.shadowN = Q.pplSh; fleet.range = Q.veh;
    try { localStorage.setItem('madras-streets-quality', String(i)); } catch (e) {}
    if (!quiet) toast(`Graphics: ${Q.name} (${Q.fps} frames a second). Press P to change.`, 4);
  }
  { let i = TOUCH ? 0 : 1; try { const v = localStorage.getItem('madras-streets-quality'); if (v !== null && QUAL[+v]) i = +v; } catch (e) {} applyQuality(i, true); }
  G.cycleQuality = () => applyQuality((qIdx + 1) % QUAL.length);
  renderer.setAnimationLoop(() => {
    // frame cap: 30 a second on Balanced, 60 on High. Drawing faster only makes heat.
    const now = performance.now(), raw = (now - lastT) / 1000; if (raw < (Q.fps >= 60 ? 0.013 : 0.030)) return; lastT = now;
    frames++; fpsT += raw; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    // if the machine still cannot keep up, step down further on its own
    if (!G.paused && !G.noAdapt) { slowT = fps < Math.min(24, Q.fps * 0.8) ? slowT + raw : 0; if (slowT > 2.5 && qLevel < 3) { qLevel++; slowT = 0; G.qLevel = qLevel;
      if (qLevel === 1) { sun.castShadow = false; renderer.shadowMap.needsUpdate = true; Q = { ...Q, shadow: 0 }; }
      if (qLevel === 2) { renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr * 0.75)); resize(); }
      if (qLevel === 3) { G.baseFar = Math.min(G.baseFar, 1500); crowd.maxShow = 12; }
      } }
    // game time keeps real speed on a slow machine: up to 0.15 s per frame, simulated in steps of 0.05 s
    let rem = Math.min(0.15, raw);
    // one bad frame must never stop the game
    try {
      const tU = performance.now();
      if (!G.paused) while (rem > 1e-4) { const st = Math.min(0.05, rem); update(st); rem -= st; for (const k in pressed) delete pressed[k]; }
      P.upd += performance.now() - tU;
      render(Math.min(0.05, raw));
    } catch (e) { if (!G.errShown) { G.errShown = 1; console.error(e); } }
    for (const k in pressed) delete pressed[k];
  });
}

function ribbonFromLine(pts, hw) {
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; pos.push(a.x - hw, a.y, a.z, a.x + hw, a.y, a.z, b.x + hw, b.y, b.z, a.x - hw, a.y, a.z, b.x + hw, b.y, b.z, b.x - hw, b.y, b.z); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return g;
}

// Hand-modelled landmark details placed at their real coordinates.
function addLandmarks(D, scene, city, mapId) {
  const P = D.P;
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.8, metalness: o.m ?? 0, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 0 });
  const put = (g, m, x, y, z, ry = 0) => { const k = new THREE.Mesh(g, m); k.position.set(x, y, z); k.rotation.y = ry; k.castShadow = k.receiveShadow = true; scene.add(k); return k; };
  if (mapId === 'bn') {
    // Karl Schmidt Memorial on Elliot's Beach: a white arched pavilion on the sand
    { const [x, z] = P(12.9997, 80.2734), w = std(0xf3f1ea, { r: 0.7 }); put(new THREE.BoxGeometry(7, 0.7, 5), w, x, 0.35, z); for (const dx of [-2.9, -1, 1, 2.9]) for (const dz of [-1.9, 1.9]) put(new THREE.BoxGeometry(0.55, 4.2, 0.55), w, x + dx, 2.8, z + dz); put(new THREE.BoxGeometry(7, 0.9, 5), w, x, 5.3, z); const arch = new THREE.CylinderGeometry(2.2, 2.2, 5, 16, 1, false, 0, Math.PI); arch.rotateZ(Math.PI / 2); arch.rotateY(Math.PI / 2); put(arch, w, x, 5.7, z); }
    return;
  }
  // Marina lighthouse: tapered red/white banded tower
  { const [x, z] = P(13.03965, 80.27935); for (let k = 0; k < 8; k++) put(new THREE.CylinderGeometry(4.2 - (k + 1) * 0.22, 4.2 - k * 0.22, 5.5, 20), std(k % 2 ? 0xf2efe8 : 0xb8352a), x, 2.75 + k * 5.5, z); put(new THREE.CylinderGeometry(2, 2, 3.5, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.6, roughness: 0.1, emissive: 0xfff2c0, emissiveIntensity: 0.4 }), x, 46.5, z); put(new THREE.ConeGeometry(2.4, 2, 16), std(0xb8352a), x, 49.2, z); }
  // Kapaleeshwarar Temple: east gopuram (~37 m), stepped tiers of painted sculpture
  {
    const [x, z] = P(13.03375, 80.26965), ry = 0; const tiers = 9, cols = [0xf6dc96, 0xf0b090, 0xa8d0ec, 0xf2bcd0, 0xbfe0b0, 0xfaf0d0, 0xeea0a0];
    // a band of carved niches with painted deities and pilasters, repeated round each tier
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g2 = cv.getContext('2d'), rr = mulberry(77);
    g2.fillStyle = '#efe6d2'; g2.fillRect(0, 0, 512, 128);
    for (let k = 0; k < 8; k++) {
      const x0 = k * 64; g2.fillStyle = '#7a5a3a'; g2.fillRect(x0 + 6, 30, 52, 92); // niche recess
      g2.fillStyle = '#d8c39a'; g2.beginPath(); g2.arc(x0 + 32, 30, 26, Math.PI, 0); g2.fill(); // arch
      g2.fillStyle = '#c94f3d'; g2.beginPath(); g2.arc(x0 + 32, 30, 14, Math.PI, 0); g2.fill();
      const body = ['#2f6fb0', '#2e8b57', '#d4a017', '#b03a48', '#6a4c93', '#e07a2f'][Math.floor(rr() * 6)];
      g2.fillStyle = body; g2.fillRect(x0 + 20, 58, 24, 52); g2.fillRect(x0 + 12, 64, 40, 8); // figure with arms
      g2.fillStyle = '#e0b07a'; g2.beginPath(); g2.arc(x0 + 32, 50, 8, 0, 7); g2.fill();
      g2.fillStyle = '#e8b830'; g2.fillRect(x0 + 26, 36, 12, 8); // crown
      g2.fillStyle = '#f5ecd8'; g2.fillRect(x0, 0, 6, 128); g2.fillRect(x0 + 58, 0, 6, 128); // pilasters
    }
    g2.fillStyle = '#c9a66b'; g2.fillRect(0, 0, 512, 8); g2.fillRect(0, 120, 512, 8);
    const gt = new THREE.CanvasTexture(cv); gt.colorSpace = THREE.SRGBColorSpace; gt.wrapS = THREE.RepeatWrapping; gt.repeat.set(4, 1); gt.anisotropy = 8;
    const tierMat = c => new THREE.MeshStandardMaterial({ color: c, map: gt, roughness: 0.75 });
    put(new THREE.BoxGeometry(24, 8, 14), std(0xe8dcc0), x, 4, z, ry);
    for (let t = 0; t < tiers; t++) { const k0 = t / tiers, k1 = (t + 1) / tiers, w0 = 22 - k0 * 14, d0 = 12 - k0 * 7, w1 = 22 - k1 * 14, d1 = 12 - k1 * 7; const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * (w0 / w1 > 0 ? 1 : 1), 3.2, 4, 1); g.rotateY(Math.PI / 4); g.scale(w1, 1, d1); const bottom = g.attributes.position; for (let i = 0; i < bottom.count; i++) if (bottom.getY(i) < 0) { bottom.setX(i, bottom.getX(i) * w0 / w1); bottom.setZ(i, bottom.getZ(i) * d0 / d1); } g.computeVertexNormals(); put(g, tierMat(cols[t % cols.length]), x, 9.6 + t * 3.2, z, ry); put(new THREE.BoxGeometry(w1 + 0.6, 0.35, d1 + 0.6), std(0xf3e9cf), x, 11.2 + t * 3.2, z, ry); }
    const top = 8 + tiers * 3.2 + 1.6; const vault = new THREE.CylinderGeometry(2.2, 2.2, 7, 16, 1, false, 0, Math.PI); vault.rotateZ(Math.PI / 2); vault.rotateX(Math.PI / 2); put(vault, std(0xe6b45c), x, top, z, ry);
    for (let k = -2; k <= 2; k++) put(new THREE.ConeGeometry(0.35, 1.6, 10), std(0xd4a017, { m: 0.8, r: 0.3 }), x + k * 1.4, top + 2.6, z);
  }
  // Mylapore tank: stone steps and parapet round the water, and the pillared mandapam in the middle
  {
    const [tx, tz] = P(13.0335, 80.2685); let tank = null, bd = 400;
    for (const poly of city.water.polys) { let cx = 0, cz = 0; for (const q of poly) { cx += q[0]; cz += q[1]; } cx /= poly.length; cz /= poly.length; const d = Math.hypot(cx - tx, cz - tz); if (d < bd) { bd = d; tank = { poly, cx, cz }; } }
    if (tank) {
      const stone = std(0xb9ad98, { r: 0.95 }), dark = std(0x8f8676, { r: 0.95 });
      tank.poly.forEach((a, i) => {
        const b = tank.poly[(i + 1) % tank.poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2) return;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ry = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        let nx = tank.cx - mx, nz = tank.cz - mz; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl; // towards the water
        put(new THREE.BoxGeometry(L + 0.6, 1.0, 0.45), stone, mx - nx * 0.3, 0.5, mz - nz * 0.3, ry);
        for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(L, 0.22, 0.9), k % 2 ? dark : stone, mx + nx * (0.5 + k * 0.9), 0.5 - k * 0.12, mz + nz * (0.5 + k * 0.9), ry);
      });
      const { cx, cz } = tank;
      put(new THREE.BoxGeometry(9, 1.6, 9), stone, cx, 0.8, cz);
      for (const dx of [-3.4, -1.15, 1.15, 3.4]) for (const dz of [-3.4, -1.15, 1.15, 3.4]) if (Math.abs(dx) > 3 || Math.abs(dz) > 3) put(new THREE.BoxGeometry(0.45, 3.4, 0.45), dark, cx + dx, 3.3, cz + dz);
      put(new THREE.BoxGeometry(8.6, 0.5, 8.6), stone, cx, 5.2, cz);
      for (let k = 0; k < 3; k++) put(new THREE.BoxGeometry(5.6 - k * 1.6, 1.3, 5.6 - k * 1.6), std([0xf0e2b0, 0xe8c56a, 0xd9764a][k], { r: 0.8 }), cx, 6.1 + k * 1.3, cz);
      put(new THREE.ConeGeometry(0.5, 1.4, 10), std(0xd4a017, { m: 0.8, r: 0.3 }), cx, 10.4, cz);
    }
  }
  // Santhome Basilica spire
  { const [x, z] = P(13.0337, 80.2779); put(new THREE.BoxGeometry(7, 34, 7), std(0xf4f2ec), x, 17, z); put(new THREE.ConeGeometry(4.6, 22, 4, 1), std(0xf4f2ec), x, 45, z, Math.PI / 4); put(new THREE.BoxGeometry(0.3, 3, 0.3), std(0x888888), x, 57, z); }
}

main().catch(e => { console.error(e); const l = document.getElementById('loading'); if (l) { l.style.display = 'flex'; l.querySelector('.msg').textContent = 'Could not start: ' + e.message; } });
