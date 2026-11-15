// Asset locations. In development these are files next to index.html; in the single-file build
// the bundle defines window.__PACK = { name: [mime, gzip?, base64] } and we turn them into blob URLs.
const TEX = ['Asphalt026A', 'Ground037', 'Ground054', 'PavingStones092', 'Plaster001', 'Grass004', 'Concrete034', 'Bricks076C'];
export const ASSETS = { anims: 'assets/anims.glb', man: 'assets/readyplayer.me.glb', sim: 'assets/sim.wasm', waternormals: 'assets/waternormals.jpg' };
for (const t of TEX) for (const m of ['Color', 'NormalGL', 'Roughness']) ASSETS[`${t}_${m}`] = `assets/${t}_${m}.jpg`;

const b64bytes = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const gunzip = async u => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
const osmGz = {};
async function unpack() {
  const P = window.__PACK; if (!P) return; window.__PACK = null;
  for (const [name, [mime, gz, data]] of Object.entries(P)) {
    if (name.startsWith('osm_')) { osmGz[name.slice(4)] = data; continue; } // decoded only for the map that is played
    let u = b64bytes(data); if (gz) u = await gunzip(u);
    ASSETS[name] = URL.createObjectURL(new Blob([u], { type: mime }));
  }
}
export async function loadOSM(id) {
  await unpack();
  if (osmGz[id]) { const t = new TextDecoder().decode(await gunzip(b64bytes(osmGz[id]))); delete osmGz[id]; return JSON.parse(t); }
  return (await fetch(`data/osm.${id}.json`)).json();
}
