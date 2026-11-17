# Adds a "female" shape key to the shared head (softer, narrower jaw and chin, smaller nose and brow,
# fuller lips, slimmer neck) and renders before/after for checking. Usage: python female_head.py OUT.glb RENDER_PREFIX
import bpy, sys, math
from mathutils import Vector
out, pre = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/home/user/ms2/assets/readyplayer.me.glb')
sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(min(1, max(0, (x - a) / (b - a))))
g = lambda d: math.exp(-d * d)

def morph(p):
    x, y, z = p
    f = sm(-0.03, -0.11, y)                       # how far towards the face front
    j = sm(1.705, 1.585, z)                       # jaw and chin zone
    x *= 1 - 0.17 * j * sm(0.0, 0.055, abs(x))    # narrower, rounder jaw
    jc = sm(1.64, 1.585, z); y += 0.011 * jc * f; z += 0.006 * jc * f   # chin less prominent and a little shorter (kept below the lips)
    b = g((z - 1.755) / 0.014) * f; y += 0.006 * b   # softer brow ridge
    n = g((z - 1.695) / 0.02) * g(x / 0.018) * f; y += 0.011 * n; x *= 1 - 0.24 * n   # smaller, narrower nose
    l = g((z - 1.656) / 0.007) * g(x / 0.02) * f; y -= 0.0012 * l                    # fuller lips
    c = g((z - 1.705) / 0.02) * sm(0.03, 0.06, abs(x)) * f; x *= 1 + 0.03 * c        # rounder cheeks
    k = sm(1.6, 1.53, z); x *= 1 - 0.14 * k; y = (y - 0.02) * (1 - 0.1 * k) + 0.02  # slimmer neck
    return Vector((x, y, z))

for name in ('Wolf3D_Head', 'EyeLeft', 'EyeRight', 'Wolf3D_Teeth', 'Wolf3D_Beard'):
    o = bpy.data.objects.get(name)
    if not o: continue
    me = o.data
    if not me.shape_keys: o.shape_key_add(name='Basis')
    kb = o.shape_key_add(name='female', from_mix=False)
    mw, mi = o.matrix_world, o.matrix_world.inverted()
    for i, v in enumerate(me.vertices):
        kb.data[i].co = mi @ morph(mw @ me.shape_keys.key_blocks['Basis'].data[i].co)

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_morph=True, export_skins=True, export_animations=False, export_yup=True, export_apply=False)

# renders: front and side, male then female
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
sc.render.resolution_x, sc.render.resolution_y = 360, 420
for o in bpy.data.objects:
    if o.name in ('Wolf3D_Headwear', 'Wolf3D_Outfit_Top', 'Wolf3D_Beard', 'Icosphere'): o.hide_render = True
w = bpy.data.worlds.new('w'); w.color = (0.6, 0.6, 0.62); sc.world = w
L = bpy.data.objects.new('L', bpy.data.lights.new('L', 'SUN')); L.data.energy = 3; L.rotation_euler = (0.9, 0.2, -0.6); sc.collection.objects.link(L)
cam = bpy.data.objects.new('C', bpy.data.cameras.new('C')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 85
def shot(fn, ang):
    cam.location = Vector((math.sin(ang) * -0.9, -math.cos(ang) * 0.9, 1.69))
    d = Vector((0, -0.02, 1.69)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = fn; bpy.ops.render.render(write_still=True)
for wv, tag in ((0, 'm'), (1, 'f')):
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.data.shape_keys and 'female' in o.data.shape_keys.key_blocks: o.data.shape_keys.key_blocks['female'].value = wv
    shot(f'{pre}_{tag}_front.png', 0); shot(f'{pre}_{tag}_side.png', math.pi / 2.4)
