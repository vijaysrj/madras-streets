# Chennai building details, modelled for instancing on the game's facades.
# Usage: python building_parts.py OUT.glb [PREVIEW.png]
# Blender axes: X along the wall, -Y out of the wall, Z up (exports as glTF +Z out, +Y up).
# Every part has its origin on the wall face. Vertex colour 1.0 = paint (tinted per building in game),
# dark values = steel, tin and glass that keep their own colour.
import bpy, bmesh, sys, math
out = sys.argv[-2] if sys.argv[-1].endswith('.png') else sys.argv[-1]
prev = sys.argv[-1] if sys.argv[-1].endswith('.png') else None
bpy.ops.wm.read_factory_settings(use_empty=True)

PAINT, STEEL, TIN, DOOR, AC, FAN, GLASS = (1, 1, 1), (0.11, 0.12, 0.12), (0.42, 0.44, 0.45), (0.36, 0.22, 0.12), (0.93, 0.93, 0.91), (0.2, 0.2, 0.21), (0.16, 0.2, 0.23)

class Part:
    def __init__(s, name): s.name, s.bm = name, bmesh.new(); s.col = s.bm.loops.layers.color.new('Color')
    def face(s, pts, c):
        vs = [s.bm.verts.new(p) for p in pts]; f = s.bm.faces.new(vs)
        for l in f.loops: l[s.col] = (*c, 1)
        return f
    def box(s, x0, x1, y0, y1, z0, z1, c, skip=()):
        P = lambda x, y, z: ((x0, x1)[x], (y0, y1)[y], (z0, z1)[z])
        quads = {'bottom': [P(0,0,0), P(0,1,0), P(1,1,0), P(1,0,0)], 'top': [P(0,0,1), P(1,0,1), P(1,1,1), P(0,1,1)],
                 'front': [P(0,0,0), P(1,0,0), P(1,0,1), P(0,0,1)], 'back': [P(1,1,0), P(0,1,0), P(0,1,1), P(1,1,1)],
                 'left': [P(0,1,0), P(0,0,0), P(0,0,1), P(0,1,1)], 'right': [P(1,0,0), P(1,1,0), P(1,1,1), P(1,0,1)]}
        for k, q in quads.items():
            if k not in skip: s.face(q, c)
    def bar(s, a, b, r, c, flat=None):
        # square bar from a to b (axis aligned), no end caps: 8 triangles. Thin bars are a single
        # double-sided strip facing `flat` ('x' or 'y'): 2 triangles, which reads the same from the street.
        ax = max(range(3), key=lambda i: abs(b[i] - a[i])); lo = [min(a[i], b[i]) for i in range(3)]; hi = [max(a[i], b[i]) for i in range(3)]
        if flat and r <= 0.012:
            n = 0 if flat == 'x' else 1; w = 3 - ax - n   # the axis the strip is wide in
            lo[w] -= r; hi[w] += r
            P = lambda i, j: tuple((lo[k] if k == ax and not i or k == w and not j else hi[k] if k in (ax, w) else lo[k]) for k in range(3))
            s.face([P(0, 0), P(1, 0), P(1, 1), P(0, 1)], c); return
        for i in range(3):
            if i != ax: lo[i] -= r; hi[i] += r
        s.box(lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], c, skip={0: ('left', 'right'), 1: ('front', 'back'), 2: ('top', 'bottom')}[ax])
    def done(s):
        bmesh.ops.remove_doubles(s.bm, verts=s.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(s.bm, faces=s.bm.faces)
        me = bpy.data.meshes.new(s.name); s.bm.to_mesh(me); s.bm.free()
        for p in me.polygons: p.use_smooth = False
        o = bpy.data.objects.new(s.name, me); bpy.context.scene.collection.objects.link(o)
        me.color_attributes.active_color = me.color_attributes[0]
        return o

# --- chajja: the thin concrete sunshade over every Chennai window. 1 m wide (scaled to the window),
# sloping top, drip lip under the front edge, small end returns.
p = Part('chajja')
D, T0, T1 = 0.55, 0.11, 0.065
prof = [(0, 0), (-D + 0.04, 0), (-D + 0.04, -0.035), (-D, -0.035), (-D, T1), (0, T0)]
L = [(-0.5, y, z) for y, z in prof]; R = [(0.5, y, z) for y, z in prof]
p.face(L[::-1], PAINT); p.face(R, PAINT)
for i in range(len(prof)):
    j = (i + 1) % len(prof)
    if i == len(prof) - 1: continue   # wall side is hidden
    p.face([L[i], L[j], R[j], R[i]], PAINT)
p.done()

# --- box grille: the welded steel cage that sticks out of most ground and first floor windows,
# with a sloping tin hood. 1 x 1 m (scaled to the window), 0.2 m deep. Bars line up with the painted ones.
p = Part('grille')
r, dp = 0.007, -0.2   # frame bars 0.011 still count as thin
for k in range(8):   # front verticals incl. frame
    x = -0.5 + k / 7; p.bar((x, dp, 0), (x, dp, 1), r * (1.6 if k in (0, 7) else 1), STEEL, 'y')
for z in (0, 1 / 3, 2 / 3, 1): p.bar((-0.5, dp, z), (0.5, dp, z), r * (1.6 if z in (0, 1) else 1), STEEL, 'y')
for x in (-0.5, 0.5):
    for z in (0, 1): p.bar((x, 0, z), (x, dp, z), r * 1.5, STEEL, 'x')
    p.bar((x, dp / 2, 0), (x, dp / 2, 1), r, STEEL, 'x')
    for z in (1 / 3, 2 / 3): p.bar((x, 0, z), (x, dp, z), r, STEEL, 'x')
# tin hood
h0, h1, o = 1.12, 1.02, 0.06
p.face([(-0.5 - o, 0, h0), (-0.5 - o, dp - o, h1), (0.5 + o, dp - o, h1), (0.5 + o, 0, h0)], TIN)
p.face([(0.5 + o, 0, h0 - 0.01), (0.5 + o, dp - o, h1 - 0.01), (-0.5 - o, dp - o, h1 - 0.01), (-0.5 - o, 0, h0 - 0.01)], TIN)
p.done()

# --- split AC outdoor unit on two angle brackets
p = Part('ac')
W, H, Dd, z0 = 0.8, 0.55, 0.28, 0.04
p.box(-W / 2, W / 2, -0.06 - Dd, -0.06, z0, z0 + H, AC)
n = 14; cx, cz, rr = -0.1, z0 + H / 2, 0.2
fan = [(cx + rr * math.cos(2 * math.pi * i / n), -0.06 - Dd - 0.004, cz + rr * math.sin(2 * math.pi * i / n)) for i in range(n)]
p.face(fan, FAN)
for x in (-0.3, 0.3):
    p.bar((x, 0, 0.02), (x, -0.4, 0.02), 0.018, STEEL)
    p.bar((x, -0.01, -0.3), (x, -0.01, 0.02), 0.018, STEEL)
p.done()

# --- balcony module, 1.5 m of a balcony 1 m deep: slab with a thick front edge and a steel railing
def slab(p):
    p.box(-0.75, 0.75, -1.0, 0, -0.14, 0, PAINT, skip=('back',))
    p.box(-0.75, 0.75, -1.06, -0.94, -0.2, 0.02, PAINT, skip=('back',))
p = Part('balc')
slab(p)
p.bar((-0.75, -1.0, 0.02), (-0.75, -1.0, 1.0), 0.022, STEEL)
p.bar((-0.75, -1.0, 1.0), (0.75, -1.0, 1.0), 0.025, STEEL)
p.bar((-0.75, -1.0, 0.12), (0.75, -1.0, 0.12), 0.012, STEEL, 'y')
p.bar((-0.75, -1.0, 0.82), (0.75, -1.0, 0.82), 0.01, STEEL, 'y')
for k in range(1, 12): x = -0.75 + k * 0.125; p.bar((x, -1.0, 0.12), (x, -1.0, 0.82), 0.007, STEEL, 'y')
p.done()
# the same with a half-height painted parapet wall and a single rail on top (older flats)
p = Part('balcw')
slab(p)
p.box(-0.75, 0.75, -1.0, -0.9, 0.0, 0.9, PAINT)
p.bar((-0.75, -0.95, 1.0), (0.75, -0.95, 1.0), 0.018, STEEL)
p.bar((-0.7, -0.95, 0.9), (-0.7, -0.95, 1.0), 0.012, STEEL, 'y')
p.done()
# side return for both balcony kinds (placed at each end)
p = Part('balcside')
p.bar((0, 0, 1.0), (0, -1.0, 1.0), 0.022, STEEL)
p.bar((0, 0, 0.12), (0, -1.0, 0.12), 0.012, STEEL, 'x')
for k in range(1, 8): y = -k * 0.125; p.bar((0, y, 0.12), (0, y, 1.0), 0.007, STEEL, 'x')
p.done()

# --- mumty: the stair head room on a flat roof, with a door, a small window and an overhanging slab
p = Part('mumty')
S, Hm = 1.3, 2.6
p.box(-S, S, -S, S, 0, Hm, PAINT, skip=('bottom',))
p.box(-S - 0.25, S + 0.25, -S - 0.25, S + 0.25, Hm, Hm + 0.12, PAINT)
p.box(-0.45, 0.45, -S - 0.03, -S, 0, 2.05, DOOR, skip=('bottom', 'back'))
p.box(-0.6, 0.6, -S - 0.3, -S, 2.15, 2.22, PAINT)   # small chajja over the door
p.box(S, S + 0.02, -0.35, 0.35, 1.3, 1.9, GLASS, skip=('left',))
p.done()

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=False, export_vertex_color='ACTIVE', export_materials='NONE', export_normals=True, export_texcoords=False)
print('exported', out)

if prev:
    # quick check render: a two-storey wall with every part on it
    import random
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = 900, 600
    mat = bpy.data.materials.new('vc'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Color'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    mix.inputs['B'].default_value = (0.95, 0.83, 0.45, 1)
    nt.links.new(attr.outputs['Color'], mix.inputs['A']); nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    parts = {o.name: o for o in bpy.data.objects}
    for o in parts.values(): o.data.materials.append(mat); o.hide_render = True
    bpy.ops.mesh.primitive_plane_add(size=1); wall = bpy.context.object; wall.scale = (12, 9, 1); wall.rotation_euler = (math.pi / 2, 0, 0); wall.location = (0, 0, 4.5)
    wm = bpy.data.materials.new('wall'); wm.diffuse_color = (0.95, 0.83, 0.45, 1); wm.use_nodes = True; wm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.95, 0.83, 0.45, 1); wall.data.materials.append(wm)
    def put(name, x, z, sx=1, sz=1):
        o = parts[name].copy(); o.hide_render = False; sc.collection.objects.link(o); o.location = (x, -0.001, z); o.scale = (sx, 1, sz)
    for fl in range(2):
        zb = 3.6 + fl * 3.2
        for x in (-4.5, -1.5, 1.5, 4.5):
            put('chajja', x, zb + 2.6, 2.1)
            if fl == 0: put('grille', x, zb + 0.82, 1.6, 1.6)
        put('ac', 3.0, zb + 0.9)
    for x in (-5.25, -3.75, -2.25):
        put('balc', x, 3.6 + 3.2 * 2)
    for x in (2.25, 3.75, 5.25): put('balcw', x, 3.6 + 3.2 * 2)
    put('balcside', -6.0, 3.6 + 6.4)
    o = parts['mumty'].copy(); o.hide_render = False; sc.collection.objects.link(o); o.location = (2, 3, 9)
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(-35))); bpy.context.object.data.energy = 4
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.7, 0.9, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
    bpy.ops.object.camera_add(location=(7, -17, 6), rotation=(math.radians(86), 0, math.radians(22))); sc.camera = bpy.context.object
    sc.render.filepath = prev; bpy.ops.render.render(write_still=True)
