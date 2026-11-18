// Build: C -> WASM, compact the OSM export, bundle JS with esbuild, inline every asset into dist/index.html
import { execSync } from 'node:child_process';
import fs from 'node:fs'; import zlib from 'node:zlib';
import * as esbuild from 'esbuild';
fs.mkdirSync('build', { recursive: true }); fs.mkdirSync('dist', { recursive: true });
execSync('clang --target=wasm32 -O2 -nostdlib -mbulk-memory -Wl,--no-entry -Wl,--initial-memory=67108864 -o assets/sim.wasm src/sim.c', { stdio: 'inherit' });

// --- compact OSM: drop tags and elements the game never reads, round coordinates (~1 cm)
const KEEP = new Set(['highway', 'name', 'name:en', 'name:ta', 'office', 'lanes', 'width', 'oneway', 'bridge', 'area', 'natural', 'building', 'building:part', 'building:levels', 'building:min_level', 'height', 'min_height', 'roof:shape', 'building:colour', 'roof:colour', 'amenity', 'shop', 'tourism', 'historic', 'leisure', 'landuse', 'water', 'waterway', 'religion', 'type', 'man_made', 'tower:type']);
function compact(id, file, BB) {
const src = JSON.parse(fs.readFileSync(file, 'utf8'));
const r7 = v => Math.round(v * 1e7) / 1e7;
const geo = g => (g || []).map(p => p ? { lat: r7(p.lat), lon: r7(p.lon) } : null);
// the query box; long rivers and expressways stretch far beyond it
const M = 0.004;
const inside = p => p && p.lat > BB.minlat - M && p.lat < BB.maxlat + M && p.lon > BB.minlon - M && p.lon < BB.maxlon + M;
const els = [];
for (const e of src.elements) {
  const t = {}; for (const k in e.tags || {}) if (KEEP.has(k)) t[k] = e.tags[k];
  if (e.type === 'node') { if (t.natural === 'tree' || (t.name && (t.amenity || t.shop || t.tourism || t.historic))) els.push({ type: 'node', id: e.id, lat: r7(e.lat), lon: r7(e.lon), tags: t }); continue; }
  if (!Object.keys(t).length) continue;
  if (e.type === 'way') { const n = e.nodes || []; if (!(e.geometry || []).some(inside)) continue; if (t.waterway) e.geometry = e.geometry.filter(inside); els.push({ type: 'way', id: e.id, nodes: t.highway ? n : [n[0], n[n.length - 1]], tags: t, geometry: geo(e.geometry) }); }
  else if (e.type === 'relation') els.push({ type: 'relation', id: e.id, tags: t, members: (e.members || []).filter(m => m.type === 'way' && m.geometry).map(m => ({ role: m.role, geometry: geo(m.geometry) })) });
}
// current places found on the web (data/places_web.json) go first so they get the shop boards
if (id === 'bn' && fs.existsSync('data/places_web.json')) { const extra = JSON.parse(fs.readFileSync('data/places_web.json', 'utf8')).elements; const seen = new Set(extra.map(e => e.tags.name.toLowerCase())); for (let i = els.length - 1; i >= 0; i--) if (els[i].type === 'node' && els[i].tags.name && seen.has(els[i].tags.name.toLowerCase())) els.splice(i, 1); els.unshift(...extra); }
const osm = JSON.stringify({ bounds: BB, elements: els });
  fs.writeFileSync(`data/osm.${id}.json`, osm);
  console.log('osm', id, (osm.length / 1e6).toFixed(2), 'MB raw');
  return osm;
}
const MAPS = { bn: compact('bn', 'data/bn/besantnagar.json', { minlat: 12.985, maxlat: 13.012, minlon: 80.248, maxlon: 80.277 }) };

await esbuild.build({ entryPoints: ['src/game.js'], bundle: true, format: 'esm', minify: true, outfile: 'build/game.js', target: 'es2020', legalComments: 'none' });
if (process.argv.includes('--dev')) process.exit(0);

// --- pack assets
const list = { anims: 'assets/anims.glb', man: 'assets/person.glb', sim: 'assets/sim.wasm', waternormals: 'assets/waternormals.jpg', skinF: 'assets/skin_f.jpg', skinFB: 'assets/skin_f_bindi.jpg', parts: 'assets/buildparts.glb', street: 'assets/street.glb' };
for (const t of ['Asphalt026A', 'Ground037', 'Ground054', 'PavingStones092', 'Plaster001', 'Grass004', 'Concrete034', 'Bricks076C']) for (const m of ['Color', 'NormalGL', 'Roughness']) list[`${t}_${m}`] = `assets/${t}_${m}.jpg`;
const mime = f => f.endsWith('.glb') ? 'model/gltf-binary' : f.endsWith('.wasm') ? 'application/wasm' : 'image/jpeg';
const pack = {};
for (const [k, f] of Object.entries(list)) { const b = fs.readFileSync(f); const gz = !f.endsWith('.jpg'); pack[k] = [mime(f), gz ? 1 : 0, (gz ? zlib.gzipSync(b, { level: 9 }) : b).toString('base64')]; }
for (const id in MAPS) pack['osm_' + id] = ['application/json', 1, zlib.gzipSync(Buffer.from(MAPS[id]), { level: 9 }).toString('base64')];
const js = fs.readFileSync('build/game.js', 'utf8').replace(/<\/script/g, '<\\/script');
let html = fs.readFileSync('index.html', 'utf8');
const scripts = `<script>window.__PACK=${JSON.stringify(pack)};</script>\n<script type="module">${js}</script>`;
html = html.replace(/<!--SCRIPTS-->[\s\S]*<!--\/SCRIPTS-->/, () => scripts);
fs.writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1e6).toFixed(2), 'MB');
