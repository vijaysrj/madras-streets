# Street objects for Madras Streets: the auto-rickshaw (one mesh per material, matching vehicles.js),
# a parked commuter motorcycle, a fruit pushcart with spoked wheels and the fittings of a petti kadai.
# Usage: python street_objects.py OUT.glb [PREVIEW.png]
# Coordinates are written in game space (x right, y up, z forward, metres, ground at y=0) and converted
# to Blender space (x, -z, y) so the glTF export lands back in game space.
import bpy, bmesh, sys, math
out = sys.argv[-2] if sys.argv[-1].endswith('.png') else sys.argv[-1]
prev = sys.argv[-1] if sys.argv[-1].endswith('.png') else None
bpy.ops.wm.read_factory_settings(use_empty=True)
B = lambda x, y, z: (x, -z, y)

class Part:
    def __init__(s, name, smooth=False): s.name, s.smooth, s.bm = name, smooth, bmesh.new(); s.col = s.bm.loops.layers.color.new('Color')
    def face(s, pts, c=(1, 1, 1), smooth=None):
        f = s.bm.faces.new([s.bm.verts.new(B(*p)) for p in pts])
        for l in f.loops: l[s.col] = (*c, 1)
        f.smooth = s.smooth if smooth is None else smooth
        return f
    def ring(s, f, hw, yb, yt, r, n=3, xc=0):
        # rounded rectangle cross-section at forward station f, counter-clockwise seen from the front
        r = min(r, hw * 0.99, (yt - yb) / 2 * 0.99); pts = []
        for cx, cy, a0 in ((xc + hw - r, yb + r, -90), (xc + hw - r, yt - r, 0), (xc - hw + r, yt - r, 90), (xc - hw + r, yb + r, 180)):
            for k in range(n + 1):
                a = math.radians(a0 + 90 * k / n); pts.append((cx + r * math.cos(a), cy + r * math.sin(a), f))
        return pts
    def loft(s, st, c=(1, 1, 1), caps=(True, True), n=3, xc=0):
        rings = [s.ring(*q, n=n, xc=xc) for q in st]
        for a, b in zip(rings, rings[1:]):
            m = len(a)
            for i in range(m): s.face([a[i], a[(i + 1) % m], b[(i + 1) % m], b[i]], c)
        if caps[0]: s.face(rings[0], c, smooth=False)
        if caps[1]: s.face(rings[-1][::-1], c, smooth=False)
    def box(s, x0, x1, y0, y1, z0, z1, c=None, skip=()):
        c = c or getattr(s, 'dc', (1, 1, 1))
        P = lambda i, j, k: ((x0, x1)[i], (y0, y1)[j], (z0, z1)[k])
        Q = {'bottom': [P(0,0,0), P(1,0,0), P(1,0,1), P(0,0,1)], 'top': [P(0,1,0), P(0,1,1), P(1,1,1), P(1,1,0)],
             'back': [P(0,0,0), P(0,1,0), P(1,1,0), P(1,0,0)], 'front': [P(0,0,1), P(1,0,1), P(1,1,1), P(0,1,1)],
             'left': [P(0,0,0), P(0,0,1), P(0,1,1), P(0,1,0)], 'right': [P(1,0,0), P(1,1,0), P(1,1,1), P(1,0,1)]}
        for k, q in Q.items():
            if k not in skip: s.face(q, c, smooth=False)
    def tube(s, a, b, r, c=None, n=6):
        c = c or getattr(s, 'dc', (1, 1, 1))
        # round tube between two points, no caps
        import mathutils
        A, Bv = mathutils.Vector(a), mathutils.Vector(b); d = (Bv - A).normalized()
        u = d.cross(mathutils.Vector((0, 1, 0)) if abs(d.y) < 0.9 else mathutils.Vector((1, 0, 0))).normalized(); v = d.cross(u)
        ra = [A + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r for k in range(n)]
        rb = [p + (Bv - A) for p in ra]
        for k in range(n): s.face([tuple(ra[k]), tuple(ra[(k + 1) % n]), tuple(rb[(k + 1) % n]), tuple(rb[k])], c, smooth=True)
    def disc(s, cx, cy, cz, r, axis, c, n=12):
        pts = []
        for k in range(n):
            a = 2 * math.pi * k / n; u, v = r * math.cos(a), r * math.sin(a)
            pts.append((cx, cy + u, cz + v) if axis == 'x' else (cx + u, cy + v, cz))
        s.face(pts, c, smooth=False)
    def wheel(s, x, y, z, r, w, tyre, rim, spokes=0, n=14):
        # tyre as a short tube with side walls, a rim disc or spokes
        ri = r * 0.78
        for side in (-1, 1):
            xs = x + side * w / 2
            for k in range(n):
                a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
                p = lambda rr, a: (xs, y + rr * math.cos(a), z + rr * math.sin(a))
                s.face([p(ri, a0), p(r, a0), p(r, a1), p(ri, a1)], tyre, smooth=False)
        for k in range(n):
            a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
            p = lambda xx, a: (xx, y + r * math.cos(a), z + r * math.sin(a))
            s.face([p(x - w / 2, a0), p(x - w / 2, a1), p(x + w / 2, a1), p(x + w / 2, a0)], tyre, smooth=True)
        if spokes:
            for k in range(spokes):
                a = math.pi * k / spokes
                s.face([(x, y + ri * math.cos(a) + 0.008 * math.sin(a), z + ri * math.sin(a) - 0.008 * math.cos(a)), (x, y - ri * math.cos(a) + 0.008 * math.sin(a), z - ri * math.sin(a) - 0.008 * math.cos(a)),
                        (x, y - ri * math.cos(a) - 0.008 * math.sin(a), z - ri * math.sin(a) + 0.008 * math.cos(a)), (x, y + ri * math.cos(a) - 0.008 * math.sin(a), z + ri * math.sin(a) + 0.008 * math.cos(a))], rim, smooth=False)
            s.disc(x, y, z, r * 0.12, 'x', rim, 8)
        else:
            s.disc(x - w / 2 - 0.002, y, z, ri, 'x', rim); s.disc(x + w / 2 + 0.002, y, z, ri, 'x', rim)
    def done(s):
        bmesh.ops.remove_doubles(s.bm, verts=s.bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(s.name); s.bm.to_mesh(me); s.bm.free()
        o = bpy.data.objects.new(s.name, me); bpy.context.scene.collection.objects.link(o)
        me.color_attributes.active_color = me.color_attributes[0]
        return o

W = (1, 1, 1)
# ================= auto-rickshaw =================
# yellow body: rear passenger tub with a raised back over the engine, narrow driver floor, tall rounded front fairing
p = Part('auto_body', smooth=True)
p.loft([(-1.32, 0.60, 0.40, 1.10, 0.2), (-1.22, 0.66, 0.36, 1.16, 0.22), (-1.0, 0.67, 0.35, 1.16, 0.22)])
p.loft([(-1.0, 0.67, 0.35, 0.80, 0.16), (-0.2, 0.67, 0.34, 0.80, 0.16), (0.08, 0.62, 0.34, 0.74, 0.14), (0.18, 0.5, 0.36, 0.56, 0.08)])
p.loft([(0.1, 0.42, 0.36, 0.50, 0.04), (0.66, 0.42, 0.36, 0.50, 0.04)])
p.loft([(0.6, 0.46, 0.48, 1.12, 0.12), (0.9, 0.45, 0.56, 1.14, 0.13), (1.14, 0.42, 0.58, 1.12, 0.12), (1.26, 0.37, 0.62, 1.06, 0.1), (1.32, 0.3, 0.66, 0.98, 0.07)])
# front mudguard over the wheel
for k in range(8):
    a0, a1 = math.pi * (0.1 + 0.8 * k / 8), math.pi * (0.1 + 0.8 * (k + 1) / 8); R = 0.3
    q = lambda xx, a: (xx, 0.24 + R * math.sin(a), 1.0 + R * math.cos(a))
    p.face([q(-0.1, a0), q(0.1, a0), q(0.1, a1), q(-0.1, a1)])
p.done()
# black canvas hood: arched roof from the windscreen top to the back, sides down to shoulder height
p = Part('auto_canvas', smooth=True)
p.loft([(0.98, 0.6, 1.36, 1.62, 0.24), (0.8, 0.68, 1.24, 1.70, 0.3), (-0.9, 0.7, 1.22, 1.71, 0.32), (-1.24, 0.68, 1.02, 1.66, 0.3), (-1.34, 0.62, 1.08, 1.58, 0.26)], n=4)
p.done()
# dark: chassis, bumpers, windscreen posts, grab bars, handlebar, rolled side curtains, floor mat
DK, CH, GR = (0.05, 0.05, 0.055), (0.75, 0.75, 0.76), (0.13, 0.13, 0.13)
p = Part('auto_dark'); p.dc = DK
p.box(-0.4, 0.4, 0.2, 0.36, -1.1, 0.55, GR)
W = DK
p.tube((-0.66, 0.42, -1.38), (0.66, 0.42, -1.38), 0.025, CH)
for x in (-0.6, 0.6): p.tube((x, 0.42, -1.38), (x, 0.42, -1.2), 0.02, CH)
for x in (-0.42, 0.42): p.tube((x, 1.1, 0.93), (x * 0.95, 1.66, 0.86), 0.022)
for x in (-0.66, 0.66): p.tube((x, 1.2, 0.75), (x, 1.2, -1.15), 0.045, W, 8)   # rolled curtains
p.tube((-0.66, 1.0, 0.2), (-0.66, 1.25, 0.25), 0.015, CH); p.tube((0.66, 1.0, 0.2), (0.66, 1.25, 0.25), 0.015, CH)
p.tube((-0.66, 0.95, -0.95), (-0.66, 1.2, -0.95), 0.015, CH); p.tube((0.66, 0.95, -0.95), (0.66, 1.2, -0.95), 0.015, CH)
p.tube((-0.36, 1.07, 0.6), (0.36, 1.07, 0.6), 0.02); p.tube((0, 1.07, 0.6), (0, 0.5, 0.95), 0.03)
for x in (-0.36, 0.36): p.tube((x, 1.07, 0.6), (x, 1.07, 0.5), 0.028)
p.tube((0, 0.24, 1.0), (0, 0.56, 0.98), 0.03, CH)
p.box(-0.08, 0.08, 1.08, 1.16, 0.88, 0.94)   # meter
p.done()
W = (1, 1, 1)
p = Part('auto_seat', smooth=True)
p.loft([(-0.98, 0.6, 0.80, 0.96, 0.05), (-0.42, 0.6, 0.80, 0.96, 0.06)])
p.loft([(-1.1, 0.6, 0.9, 1.4, 0.06), (-0.98, 0.6, 0.92, 1.4, 0.06)])
p.loft([(0.12, 0.22, 0.82, 0.94, 0.05), (0.5, 0.2, 0.82, 0.94, 0.05)])
p.loft([(0.18, 0.08, 0.5, 0.82, 0.03), (0.4, 0.08, 0.5, 0.82, 0.03)])
p.done()
p = Part('auto_glass')
p.face([(-0.4, 1.12, 0.94), (0.4, 1.12, 0.94), (0.38, 1.62, 0.86), (-0.38, 1.62, 0.86)])
p.face([(-0.25, 1.28, -1.345), (-0.25, 1.46, -1.345), (0.25, 1.46, -1.345), (0.25, 1.28, -1.345)])   # small rear window
p.done()
p = Part('auto_head'); p.disc(0, 0.8, 1.335, 0.085, 'z', W, 14)
for x in (-0.24, 0.24): p.disc(x, 0.92, 1.25, 0.03, 'z', W, 8)
p.done()
p = Part('auto_tail')
for x in (-0.5, 0.5): p.box(x - 0.08, x + 0.08, 0.6, 0.68, -1.335, -1.315)
p.done()
p = Part('auto_plate'); p.box(-0.18, 0.18, 0.47, 0.6, -1.36, -1.34); p.box(-0.12, 0.12, 0.6, 0.68, 1.27, 1.29); p.done()

# ================= parked motorcycle (tinted body + dark parts) =================
p = Part('bike_body', smooth=True)
p.loft([(-0.05, 0.11, 0.80, 0.92, 0.06), (0.15, 0.16, 0.78, 1.0, 0.09), (0.42, 0.12, 0.82, 0.98, 0.07)])   # tank
p.loft([(-0.48, 0.09, 0.55, 0.80, 0.05), (-0.08, 0.11, 0.55, 0.80, 0.05)])                          # side panels
p.loft([(-0.92, 0.06, 0.78, 0.84, 0.02), (-0.75, 0.1, 0.74, 0.86, 0.04), (-0.45, 0.11, 0.74, 0.84, 0.04)])  # tail cowl
p.loft([(0.62, 0.12, 0.92, 1.12, 0.05), (0.76, 0.1, 0.94, 1.1, 0.04)])                              # headlight cowl
for k in range(6):
    a0, a1 = math.pi * (0.15 + 0.6 * k / 6), math.pi * (0.15 + 0.6 * (k + 1) / 6); R = 0.33
    q = lambda xx, a: (xx, 0.28 + R * math.sin(a), 0.66 + R * math.cos(a))
    p.face([q(-0.06, a0), q(0.06, a0), q(0.06, a1), q(-0.06, a1)])
p.done()
p = Part('bike_dark'); p.dc = (0.06, 0.06, 0.065)
TY, RIM, ENG, CHR = (0.05, 0.05, 0.05), (0.6, 0.6, 0.62), (0.3, 0.3, 0.32), (0.8, 0.8, 0.8)
p.wheel(0, 0.28, 0.66, 0.28, 0.08, TY, RIM, spokes=6, n=10); p.wheel(0, 0.28, -0.64, 0.28, 0.09, TY, RIM, spokes=6, n=10)
p.loft([(-0.78, 0.1, 0.84, 0.9, 0.03), (-0.6, 0.13, 0.84, 0.93, 0.05), (-0.05, 0.13, 0.84, 0.93, 0.05)], (0.06, 0.05, 0.05))   # seat
p.box(-0.13, 0.13, 0.3, 0.6, -0.12, 0.3, ENG)
p.tube((0.15, 0.32, 0.15), (0.15, 0.36, -0.75), 0.045, CHR, 8)
for x in (-0.06, 0.06): p.tube((x, 0.28, 0.66), (x, 1.0, 0.5), 0.022, CHR)
p.tube((-0.36, 1.08, 0.48), (0.36, 1.08, 0.48), 0.014, CHR); p.tube((0, 1.0, 0.5), (0, 1.08, 0.48), 0.02)
for x in (-0.11, 0.11): p.tube((x, 0.3, -0.64), (x, 0.82, -0.45), 0.02, CHR)
p.tube((0, 0.42, 0.3), (0, 0.78, 0.5), 0.03)
p.tube((0.12, 0.3, -0.64), (0.12, 0.4, 0.15), 0.03, ENG)   # chain guard
p.disc(0, 1.03, 0.765, 0.065, 'z', CHR, 10)
p.tube((0.05, 0.25, -0.05), (0.2, 0.02, -0.15), 0.01, CHR)   # side stand
p.done()

# ================= fruit pushcart (built lengthwise along z; the game turns it to run along x) =================
p = Part('cart')
WD, WD2, ST = (0.55, 0.38, 0.22), (0.45, 0.3, 0.17), (0.13, 0.13, 0.14)
p.box(-0.5, 0.5, 0.8, 0.86, -0.88, 0.88, WD)
for x0, x1 in ((-0.5, -0.46), (0.46, 0.5)): p.box(x0, x1, 0.86, 0.95, -0.88, 0.88, WD2)
for z0, z1 in ((-0.88, -0.84), (0.84, 0.88)): p.box(-0.5, 0.5, 0.86, 0.95, z0, z1, WD2)
for x in (-0.35, 0, 0.35): p.box(x - 0.03, x + 0.03, 0.74, 0.8, -0.86, 0.86, WD2)
for z in (-0.55, 0.55):
    for x in (-0.47, 0.47): p.wheel(x, 0.34, z, 0.34, 0.035, ST, ST, spokes=8, n=16)
    p.tube((-0.5, 0.34, z), (0.5, 0.34, z), 0.015, ST)
    for x in (-0.4, 0.4): p.tube((x, 0.34, z), (x, 0.8, z), 0.015, ST)
for x in (-0.4, 0.4): p.tube((x, 0.88, -0.88), (x, 0.95, -1.35), 0.018, ST)
p.tube((-0.42, 0.95, -1.35), (0.42, 0.95, -1.35), 0.02, ST)
p.done()

# ================= petti kadai fittings =================
p = Part('kiosk_extra')
BL, WOOD, JAR, LID = (0.11, 0.37, 0.66), (0.48, 0.34, 0.22), (0.75, 0.85, 0.85), (0.85, 0.2, 0.15)
# front flap propped open as an awning, roof lip, counter, legs, bench, jars
hz, ht = 0.75, 2.3
fl = [(-1.15, ht - 0.02, hz), (1.15, ht - 0.02, hz), (1.15, ht + 0.32, hz + 0.95), (-1.15, ht + 0.32, hz + 0.95)]
p.face(fl, BL, smooth=False); p.face([(x, y - 0.03, z) for x, y, z in fl[::-1]], BL, smooth=False)
for x in (-1.05, 1.05): p.tube((x, 1.2, hz + 0.02), (x, ht + 0.31, hz + 0.92), 0.015, (0.2, 0.2, 0.2))
p.box(-1.2, 1.2, ht, ht + 0.06, -0.85, 0.85, (0.5, 0.52, 0.55))
p.box(-1.1, 1.1, 1.0, 1.05, hz, hz + 0.3, WOOD)
for x in (-1.0, 1.0):
    for z in (-0.65, 0.65): p.box(x - 0.04, x + 0.04, -0.01, 0.02, z - 0.04, z + 0.04, (0.2, 0.2, 0.2))
for k in range(5):
    x = -0.8 + k * 0.4
    p.loft([(hz + 0.08, 0.09, 1.05, 1.3, 0.04, ), (hz + 0.24, 0.09, 1.05, 1.3, 0.04)], JAR, n=2, xc=x)
    p.box(x - 0.08, x + 0.08, 1.3, 1.34, hz + 0.08, hz + 0.24, LID)
p.box(1.3, 2.6, 0.42, 0.47, 0.5, 0.82, WOOD)
for x in (1.4, 2.5): p.box(x - 0.03, x + 0.03, 0, 0.42, 0.55, 0.77, WOOD)
# banana bunch hanging at the corner
p.loft([(hz + 0.05, 0.1, 1.55, 1.95, 0.08), (hz + 0.25, 0.12, 1.5, 2.0, 0.1), (hz + 0.4, 0.08, 1.6, 1.9, 0.06)], (0.85, 0.75, 0.2), n=2, xc=0.95)
p.done()

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=False, export_vertex_color='ACTIVE', export_materials='NONE', export_normals=True, export_texcoords=False)
print('exported', out)

if prev:
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = 1000, 560
    def mat(rgb, rough=0.5, metal=0.0, vc=True):
        m = bpy.data.materials.new('m'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
        b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
        if vc:
            a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Color'; mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
            mx.inputs['B'].default_value = (*rgb, 1); nt.links.new(a.outputs['Color'], mx.inputs['A']); nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
        else: b.inputs['Base Color'].default_value = (*rgb, 1)
        return m
    M = {'auto_body': mat((0.9, 0.62, 0.02), 0.35), 'auto_canvas': mat((0.02, 0.02, 0.02), 0.9), 'auto_dark': mat((1, 1, 1), 0.5), 'auto_seat': mat((0.12, 0.06, 0.04), 0.7),
         'auto_glass': mat((0.05, 0.08, 0.1), 0.05), 'auto_head': mat((0.9, 0.9, 0.85), 0.1), 'auto_tail': mat((0.6, 0.02, 0.02), 0.2), 'auto_plate': mat((0.9, 0.9, 0.85), 0.5),
         'bike_body': mat((0.5, 0.03, 0.04), 0.3, 0.2), 'bike_dark': mat((1, 1, 1), 0.6), 'cart': mat((1, 1, 1), 0.8), 'kiosk_extra': mat((1, 1, 1), 0.7)}
    for o in bpy.data.objects:
        o.data.materials.append(M[o.name])
        for f in o.data.polygons: pass
    bpy.data.objects['bike_body'].location = bpy.data.objects['bike_dark'].location = (2.2, 0, 0)
    bpy.data.objects['cart'].location = (-2.6, 0.5, 0); bpy.data.objects['cart'].rotation_euler = (0, 0, math.pi / 2)
    bpy.data.objects['kiosk_extra'].location = (0.5, 4.0, 0)
    bpy.ops.mesh.primitive_plane_add(size=40); bpy.context.object.data.materials.append(mat((0.35, 0.33, 0.3), 0.9, vc=False))
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(45), 0, math.radians(-40))); bpy.context.object.data.energy = 4
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.7, 0.9, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    bpy.ops.object.camera_add(location=(4.5, -6.5, 2.6), rotation=(math.radians(74), 0, math.radians(36))); sc.camera = bpy.context.object
    sc.render.filepath = prev; bpy.ops.render.render(write_still=True)
