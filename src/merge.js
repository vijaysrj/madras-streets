import * as THREE from 'three';
import { mergeGeometries as mergeRaw } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// merge that tolerates mixed indexed/non-indexed parts and differing attribute sets
export function mergeGeometries(list) {
  const mixed = list.some(g => g.index) && list.some(g => !g.index);
  let gs = mixed ? list.map(g => g.index ? g.toNonIndexed() : g) : list;
  const names = Object.keys(gs[0].attributes).filter(n => gs.every(g => g.attributes[n]));
  gs = gs.map(g => { for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n); return g; });
  return mergeRaw(gs) || new THREE.BufferGeometry();
}
