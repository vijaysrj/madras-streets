import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
const io = new NodeIO();
const doc = await io.read('assets/Xbot.glb');
const root = doc.getRoot();
for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const m of root.listMeshes()) m.dispose();
for (const s of root.listSkins()) s.dispose();
for (const a of root.listAnimations()) if (!['idle','walk','run'].includes(a.getName())) a.dispose();
await doc.transform(prune());
await io.write('assets/anims.glb', doc);
