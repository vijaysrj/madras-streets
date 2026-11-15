// Procedural canvas textures (facades, shop signs, leaves) + loading of the CC0 photo textures.
import * as THREE from 'three';
import { mulberry } from './geom.js';
import { ASSETS } from './assets.js';

const loader = new THREE.TextureLoader();
export function photo(name, repeat = 1, srgb = true) {
  const t = loader.load(ASSETS[name]);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repeat, repeat);
  return t;
}
export function pbr(base, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: photo(base + '_Color'), normalMap: photo(base + '_NormalGL', 1, false), roughnessMap: photo(base + '_Roughness', 1, false),
    roughness: opts.roughness ?? 1, metalness: 0, color: opts.color ?? 0xffffff,
  });
  m.normalScale = new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1);
  return m;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
function noiseFill(g, w, h, base, amt, rnd) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
// streaks of monsoon grime running down from sills
function grime(g, w, h, rnd, k = 1) {
  for (let i = 0; i < 26 * k; i++) {
    const x = rnd() * w, y = rnd() * h * 0.6, L = 30 + rnd() * h * 0.5;
    const gr = g.createLinearGradient(0, y, 0, y + L); gr.addColorStop(0, `rgba(40,35,30,${0.05 + rnd() * 0.12})`); gr.addColorStop(1, 'rgba(40,35,30,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 10, L);
  }
}

// Upper-floor facade: one tile = 2 bays (6 m) x 1 floor (3.2 m). Grey-scale-ish so vertex colour tints the plaster.
export function facadeTextures() {
  const styles = [];
  for (let s = 0; s < 6; s++) {
    const rnd = mulberry(100 + s);
    const [c, g] = canvas(512, 272); // 6 m x 3.2 m → 85 px / m
    const [mc, mg] = canvas(512, 272); mg.fillStyle = '#000'; mg.fillRect(0, 0, 512, 272); // lit-window mask for night
    noiseFill(g, 512, 272, '#e8e4dc', 18, rnd);
    const winW = 120 + rnd() * 40, winH = 120 + rnd() * 30, sill = 70;
    for (let b = 0; b < 2; b++) {
      const cx = 128 + b * 256, x0 = cx - winW / 2, y0 = 272 - sill - winH;
      // sunshade (chajja) shadow and slab
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0 - 24, y0 - 14, winW + 48, 26);
      g.fillStyle = '#d9d4ca'; g.fillRect(x0 - 26, y0 - 22, winW + 52, 10);
      // window recess and glass
      g.fillStyle = '#3b3f42'; g.fillRect(x0 - 6, y0 - 4, winW + 12, winH + 10);
      const glass = g.createLinearGradient(0, y0, 0, y0 + winH); glass.addColorStop(0, '#6f8796'); glass.addColorStop(1, '#2c3a43');
      g.fillStyle = glass; g.fillRect(x0, y0, winW, winH);
      if (rnd() < 0.6) { mg.fillStyle = ['#ffd9a0', '#fff2d8', '#cfe6ff'][Math.floor(rnd() * 3)]; mg.fillRect(x0, y0, winW, winH); }
      // wooden/aluminium frame
      g.strokeStyle = s % 2 ? '#5b3b22' : '#9aa0a3'; g.lineWidth = 6; g.strokeRect(x0, y0, winW, winH);
      g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, y0 + winH); g.stroke();
      // grill bars (very common in Chennai)
      g.strokeStyle = 'rgba(30,30,30,0.85)'; g.lineWidth = 3;
      for (let k = 1; k < 7; k++) { const x = x0 + k * winW / 7; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + winH); g.stroke(); }
      for (let k = 1; k < 3; k++) { const y = y0 + k * winH / 3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + winW, y); g.stroke(); }
      // curtains in some windows
      if (rnd() < 0.5) { g.fillStyle = ['rgba(200,80,60,0.6)', 'rgba(60,110,170,0.6)', 'rgba(220,190,90,0.6)'][Math.floor(rnd() * 3)]; g.fillRect(x0 + 3, y0 + 3, winW * 0.35, winH - 6); }
      // AC unit on some
      if (rnd() < 0.35) { g.fillStyle = '#e9e9e6'; g.fillRect(cx + winW / 2 + 12, y0 + winH - 50, 58, 42); g.fillStyle = '#9a9a96'; for (let k = 0; k < 6; k++) g.fillRect(cx + winW / 2 + 16, y0 + winH - 45 + k * 6, 50, 2); }
    }
    // floor band, faded patches where paint has peeled, black monsoon mould under the slab edge
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, 266, 512, 6);
    for (let k = 0; k < 7; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,80,70'},${0.05 + rnd() * 0.08})`; g.beginPath(); g.ellipse(rnd() * 512, rnd() * 272, 20 + rnd() * 60, 10 + rnd() * 40, rnd() * 3, 0, 7); g.fill(); }
    const mould = g.createLinearGradient(0, 0, 0, 40); mould.addColorStop(0, 'rgba(35,35,30,0.35)'); mould.addColorStop(1, 'rgba(35,35,30,0)'); g.fillStyle = mould; g.fillRect(0, 0, 512, 40);
    grime(g, 512, 272, rnd, 1.5);
    const t = tex(c); t.userData.lit = tex(mc); styles.push(t);
  }
  return styles;
}

// Ground floor: rolling shutters, shop openings, compound walls with gates.
export function groundFloorTextures() {
  const out = [];
  for (let s = 0; s < 4; s++) {
    const rnd = mulberry(300 + s);
    const [c, g] = canvas(512, 304); // 6 m x 3.6 m
    noiseFill(g, 512, 304, '#d8d2c6', 20, rnd);
    if (s < 3) {
      for (let b = 0; b < 2; b++) {
        const x0 = 16 + b * 256, w = 224, y0 = 52, h = 252;
        const open = rnd() < 0.55;
        if (open) {
          const gr = g.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, '#1a1a1a'); gr.addColorStop(1, '#3a342c'); g.fillStyle = gr; g.fillRect(x0, y0, w, h);
          // shelves with goods
          for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) { g.fillStyle = `hsl(${Math.floor(rnd() * 360)},${40 + rnd() * 40}%,${35 + rnd() * 30}%)`; g.fillRect(x0 + 8 + k * 23, y0 + 40 + r * 48, 18, 30); }
          g.fillStyle = 'rgba(255,240,200,0.25)'; g.fillRect(x0, y0, w, 14);
        } else {
          g.fillStyle = '#8f9296'; g.fillRect(x0, y0, w, h);
          for (let y = y0; y < y0 + h; y += 7) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, y, w, 2); }
          g.fillStyle = 'rgba(120,70,40,0.25)'; g.fillRect(x0, y0 + h - 60, w, 60);
        }
      }
    } else {
      // compound wall + iron gate (residential)
      g.fillStyle = '#cfc8b8'; g.fillRect(0, 150, 512, 154);
      g.fillStyle = '#5a4a3a'; g.fillRect(180, 120, 150, 184);
      g.strokeStyle = '#2b2b2b'; g.lineWidth = 4; for (let x = 186; x < 330; x += 12) { g.beginPath(); g.moveTo(x, 124); g.lineTo(x, 300); g.stroke(); }
    }
    const damp = g.createLinearGradient(0, 304, 0, 230); damp.addColorStop(0, 'rgba(60,50,40,0.45)'); damp.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = damp; g.fillRect(0, 230, 512, 74);
    grime(g, 512, 304, rnd, 1.4);
    out.push(tex(c));
  }
  return out;
}

const SHOPS = [
  ['ஸ்ரீ லட்சுமி ஸ்டோர்ஸ்', 'SRI LAKSHMI STORES'], ['ஆனந்த் டிபன் சென்டர்', 'ANAND TIFFIN CENTRE'], ['முருகன் மெடிக்கல்ஸ்', 'MURUGAN MEDICALS'],
  ['கணேஷ் மொபைல்ஸ்', 'GANESH MOBILES'], ['அன்னபூர்ணா மெஸ்', 'ANNAPOORNA MESS'], ['மீனாட்சி டெக்ஸ்டைல்ஸ்', 'MEENAKSHI TEXTILES'],
  ['வேலு ஹார்ட்வேர்ஸ்', 'VELU HARDWARES'], ['காவேரி பேக்கரி', 'KAVERI BAKERY'], ['ஸ்ரீ பாலாஜி ஜெராக்ஸ்', 'SRI BALAJI XEROX'],
  ['ராமு டீ ஸ்டால்', 'RAMU TEA STALL'], ['வெங்கடேஸ்வரா ஸ்வீட்ஸ்', 'VENKATESWARA SWEETS'], ['அருண் எலெக்ட்ரிக்கல்ஸ்', 'ARUN ELECTRICALS'],
  ['செல்வி பூக்கடை', 'SELVI FLOWER STALL'], ['ராயல் ஆப்டிகல்ஸ்', 'ROYAL OPTICALS'], ['கிருஷ்ணா ஃபேன்சி ஸ்டோர்', 'KRISHNA FANCY STORE'],
  ['சங்கீதா காபி பார்', 'SANGEETHA COFFEE BAR'], ['தமிழ் புத்தக நிலையம்', 'TAMIL BOOK HOUSE'], ['பாரதி சலூன்', 'BHARATHI SALOON'],
  ['மயிலை சில்க்ஸ்', 'MYLAI SILKS'], ['கடற்கரை கஃபே', 'BEACH CAFE'], ['அம்மா மெஸ்', 'AMMA MESS'], ['ஜெயா பார்மசி', 'JAYA PHARMACY'],
  ['சுந்தரம் சைக்கிள் மார்ட்', 'SUNDARAM CYCLE MART'], ['ஃபில்டர் காபி ஹவுஸ்', 'FILTER COFFEE HOUSE'],
];
// 4 x 8 atlas of shop sign boards (each 512 x 128 → 4 m x 1 m)
export function signAtlas(real = []) {
  const [c, g] = canvas(2048, 4096);
  const rnd = mulberry(77);
  const bgs = ['#c62828', '#1565c0', '#f9a825', '#2e7d32', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#fafafa', '#263238'];
  const tamil = document.fonts && document.fonts.check('20px "Noto Sans Tamil"') ? '"Noto Sans Tamil", ' : '';
  for (let i = 0; i < 32; i++) {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 128, [ta, en] = SHOPS[i % SHOPS.length];
    const bg = bgs[Math.floor(rnd() * bgs.length)], light = bg === '#fafafa' || bg === '#f9a825';
    g.fillStyle = bg; g.fillRect(x, y, 512, 128);
    const gr = g.createLinearGradient(0, y, 0, y + 128); gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.15)'); g.fillStyle = gr; g.fillRect(x, y, 512, 128);
    g.fillStyle = light ? '#b71c1c' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 40px ${tamil}"Segoe UI", sans-serif`; g.fillText(tamil ? ta : en, x + 256, y + 46, 480);
    g.font = `800 30px "Segoe UI", Arial, sans-serif`; g.fillStyle = light ? '#222' : '#ffeb3b'; g.fillText(en, x + 256, y + 96, 480);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, 506, 122);
    // rust/dirt
    grime(g, 512, 128, rnd, 0.2);
  }
  // real places from the map data: 6 x 36 boards below the generic ones
  const CW = 2048 / 6, CH = 3072 / 36;
  const KIND = { restaurant: 'RESTAURANT', fast_food: 'FAST FOOD', cafe: 'CAFE', bank: 'BANK', atm: 'ATM', pharmacy: 'PHARMACY', clinic: 'CLINIC', hospital: 'HOSPITAL', doctors: 'CLINIC', dentist: 'DENTAL CLINIC', supermarket: 'SUPERMARKET', clothes: 'TEXTILES', bakery: 'BAKERY', confectionery: 'SWEETS', electronics: 'ELECTRONICS', greengrocer: 'VEGETABLES', car_repair: 'CAR SERVICE', motorcycle: 'TWO WHEELERS', library: 'LIBRARY', cinema: 'CINEMA', school: 'SCHOOL', college: 'COLLEGE', police: 'POLICE', post_office: 'POST OFFICE', jewelry: 'JEWELLERS', mobile_phone: 'MOBILES', books: 'BOOKS', hotel: 'HOTEL', fuel: 'PETROL BUNK' };
  const KBG = { restaurant: '#b71c1c', fast_food: '#e65100', cafe: '#4e342e', bank: '#0d47a1', atm: '#0d47a1', pharmacy: '#1b5e20', clinic: '#00695c', hospital: '#fafafa', doctors: '#00695c', dentist: '#00695c', school: '#fafafa', college: '#fafafa', police: '#fafafa', library: '#fafafa', post_office: '#c62828' };
  real.slice(0, 216).forEach((r, i) => {
    const x = (i % 6) * CW, y = 1024 + Math.floor(i / 6) * CH;
    const bg = KBG[r.kind] || bgs[Math.floor(rnd() * bgs.length)], light = bg === '#fafafa' || bg === '#f9a825';
    g.fillStyle = bg; g.fillRect(x, y, CW, CH);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const sub = r.ta && tamil ? r.name.toUpperCase() : (KIND[r.kind] || '');
    const top = r.ta && tamil ? r.ta : r.name;
    g.fillStyle = light ? '#b71c1c' : '#fff'; g.font = '700 ' + (sub ? 30 : 34) + 'px ' + tamil + '"Segoe UI", Arial, sans-serif'; g.fillText(top, x + CW / 2, y + (sub ? 30 : CH / 2), CW - 20);
    if (sub) { g.font = '800 19px "Segoe UI", Arial, sans-serif'; g.fillStyle = light ? '#222' : '#ffeb3b'; g.fillText(sub, x + CW / 2, y + 64, CW - 20); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, CW - 4, CH - 4);
  });
  return tex(c);
}

// leaf cluster with alpha for trees, frond for palms
export function leafTexture() {
  const [c, g] = canvas(256, 256); const rnd = mulberry(5);
  for (let i = 0; i < 240; i++) {
    const x = 128 + (rnd() - 0.5) * 210, y = 128 + (rnd() - 0.5) * 210; if (Math.hypot(x - 128, y - 128) > 112) continue;
    g.save(); g.translate(x, y); g.rotate(rnd() * 6.28); const s = 7 + rnd() * 9;
    g.fillStyle = `hsl(${85 + rnd() * 30},${35 + rnd() * 25}%,${16 + rnd() * 22}%)`;
    g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, 7); g.fill(); g.restore();
  }
  return tex(c);
}
export function frondTexture() {
  const [c, g] = canvas(128, 512); const rnd = mulberry(9);
  g.strokeStyle = '#6b5a32'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  for (let y = 10; y < 500; y += 7) {
    const L = 60 * Math.sin((y / 512) * Math.PI) + 6;
    for (const s of [-1, 1]) { g.strokeStyle = `hsl(${78 + rnd() * 20},${40 + rnd() * 20}%,${22 + rnd() * 14}%)`; g.lineWidth = 3; g.beginPath(); g.moveTo(64, y); g.lineTo(64 + s * L, y + 22); g.stroke(); }
  }
  return tex(c);
}
export function roadMarkTexture() { // dashed white line, 1 tile = 9 m
  const [c, g] = canvas(16, 256); g.clearRect(0, 0, 16, 256); g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, 16, 90); return tex(c);
}
