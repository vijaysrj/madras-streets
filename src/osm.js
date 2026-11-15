// Converts an OpenStreetMap Overpass JSON export into game city data (1:1 scale, metres).
// x = east, z = south, origin at the centre of the data.
import { simplify } from './geom.js';

const ROAD = {
  trunk: [8, 1, 'major'], primary: [7.5, 1, 'major'], secondary: [6.5, 1, 'major'], tertiary: [5.2, 0, 'minor'],
  trunk_link: [4.5, 1, 'major'], primary_link: [4.5, 1, 'major'], secondary_link: [4, 1, 'major'], tertiary_link: [3.8, 0, 'minor'],
  residential: [3.6, 0, 'minor'], unclassified: [3.6, 0, 'minor'], living_street: [3, 0, 'minor'], service: [2.8, 0, 'service'],
};

export function parseOSM(json, opts = {}) {
  const els = json.elements || [];
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const e of els) for (const g of e.geometry || []) { if (!g) continue; minLat = Math.min(minLat, g.lat); maxLat = Math.max(maxLat, g.lat); minLon = Math.min(minLon, g.lon); maxLon = Math.max(maxLon, g.lon); }
  if (json.bounds) ({ minlat: minLat, maxlat: maxLat, minlon: minLon, maxlon: maxLon } = json.bounds);
  const lat0 = (minLat + maxLat) / 2, lon0 = (minLon + maxLon) / 2;
  const KX = 111320 * Math.cos(lat0 * Math.PI / 180), KZ = 110574;
  const P = (lat, lon) => [(lon - lon0) * KX, -(lat - lat0) * KZ];
  const bounds = { x0: (minLon - lon0) * KX, x1: (maxLon - lon0) * KX, z0: -(maxLat - lat0) * KZ, z1: -(minLat - lat0) * KZ };

  const roads = [], buildings = [], areas = [], coast = [], pois = [], trees = [], footways = [];
  const ring = geo => geo.filter(Boolean).map(g => P(g.lat, g.lon));
  for (const e of els) {
    const t = e.tags || {};
    if (e.type === 'node') {
      const [x, z] = P(e.lat, e.lon);
      if (t.natural === 'tree') trees.push([x, z]);
      else if (t.name && (t.amenity || t.shop || t.tourism || t.historic || t.office)) pois.push({ x, z, name: t.name, kind: t.amenity || t.shop || t.tourism || t.historic || t.office, tags: t });
      continue;
    }
    if (e.type === 'way') {
      const pts = ring(e.geometry || []);
      if (pts.length < 2) continue;
      const closed = e.nodes && e.nodes[0] === e.nodes[e.nodes.length - 1];
      if (t.highway && ROAD[t.highway] && t.area !== 'yes') {
        const [hw, major, cls] = ROAD[t.highway];
        let w = hw;
        if (t.lanes) w = Math.max(2.8, Math.min(12, (+t.lanes || 2) * 1.75));
        if (t.width && !isNaN(+t.width)) w = Math.max(2.5, Math.min(14, +t.width / 2));
        roads.push({ id: e.id, name: t.name || t['name:en'] || '', hw: w, major, cls, oneway: t.oneway === 'yes' ? 1 : t.oneway === '-1' ? -1 : 0, pts, nodes: e.nodes.slice(), bridge: !!t.bridge, kind: t.highway });
        continue;
      }
      if (t.highway && ['footway', 'pedestrian', 'path', 'steps', 'footpath'].includes(t.highway)) { footways.push({ pts }); continue; }
      if (t.natural === 'coastline') { coast.push(pts); continue; }
      if (t.building || t['building:part']) {
        if (t.man_made === 'lighthouse' || t.man_made === 'tower') continue; // drawn as landmarks
        if (!closed || pts.length < 4) continue;
        buildings.push(makeBuilding(pts.slice(0, -1), t));
        // a named shop or restaurant drawn as a building is also a place for signboards and jobs
        if (t.name && (t.amenity || t.shop || t.tourism || t.office)) { const c = centroid(pts.slice(0, -1)); pois.push({ x: c[0], z: c[1], name: t.name, kind: t.amenity || t.shop || t.tourism || t.office, tags: t, bld: true }); }
        continue;
      }
      if (closed) {
        const kind = areaKind(t);
        if (kind) areas.push({ kind, poly: pts.slice(0, -1), name: t.name || '' });
        if (t.name && (t.amenity || t.shop || t.office || t.tourism || t.historic || t.leisure)) { const c = centroid(pts); pois.push({ x: c[0], z: c[1], name: t.name, kind: t.amenity || t.shop || t.office || t.tourism || t.historic || t.leisure, tags: t, poly: pts }); }
      } else if (t.waterway && ['river', 'canal', 'stream', 'drain'].includes(t.waterway)) areas.push({ kind: 'waterline', line: pts, w: t.waterway === 'river' ? 30 : t.waterway === 'canal' ? 14 : 4 });
    }
    if (e.type === 'relation') {
      // multipolygon buildings / water: use outer rings
      const outers = (e.members || []).filter(m => m.role === 'outer' && m.geometry).map(m => ring(m.geometry));
      const joined = joinRings(outers);
      for (const pts of joined) {
        if (pts.length < 4) continue;
        if (t.building) buildings.push(makeBuilding(pts.slice(0, -1), t));
        else { const kind = areaKind(t); if (kind) areas.push({ kind, poly: pts.slice(0, -1), name: t.name || '' }); }
      }
    }
  }
  return { bounds, lat0, lon0, KX, KZ, P, roads, buildings, areas, coast, pois, trees, footways };
}

function areaKind(t) {
  if (t.natural === 'water' || t.water || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') return 'water';
  if (t.natural === 'beach' || t.natural === 'sand') return 'beach';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'recreation_ground' || t.leisure === 'playground') return 'park';
  if (t.leisure === 'pitch' || t.leisure === 'stadium' || t.leisure === 'sports_centre') return 'pitch';
  if (t.natural === 'wood' || t.landuse === 'forest' || t.natural === 'scrub') return 'wood';
  if (t.amenity === 'parking' || t.landuse === 'railway') return 'paved';
  if (t.amenity === 'place_of_worship' || t.amenity === 'school' || t.amenity === 'college' || t.amenity === 'university' || t.amenity === 'hospital') return 'compound';
  return null;
}

function makeBuilding(poly, t) {
  // ensure counter-clockwise in x/z (so outward normals are consistent)
  let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  if (a > 0) poly = poly.slice().reverse();
  poly = simplify(poly, 0.4);
  let levels = parseFloat(t['building:levels']);
  let h = parseFloat(t.height);
  const kind = t.building;
  if (!isFinite(h)) h = isFinite(levels) ? levels * 3.3 + 0.6 : NaN;
  return { poly, h, levels: isFinite(levels) ? levels : NaN, kind, name: t.name || '', nameTa: t['name:ta'] || '', religion: t.religion || '', amenity: t.amenity || '', minH: parseFloat(t.min_height) || 0, part: !!t['building:part'], roofShape: t['roof:shape'] || '', colour: t['building:colour'] || '' };
}

function centroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }

function joinRings(parts) {
  const rings = [], open = parts.map(p => p.slice());
  const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
  while (open.length) {
    let cur = open.shift();
    let guard = 0;
    while (!eq(cur[0], cur[cur.length - 1]) && guard++ < 1000) {
      const i = open.findIndex(p => eq(p[0], cur[cur.length - 1]) || eq(p[p.length - 1], cur[cur.length - 1]));
      if (i < 0) break;
      let p = open.splice(i, 1)[0]; if (!eq(p[0], cur[cur.length - 1])) p = p.reverse();
      cur = cur.concat(p.slice(1));
    }
    if (eq(cur[0], cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}
