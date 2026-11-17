# Female face texture from the shared skin: thin arched brows instead of heavy male ones, kajal wings,
# a little more colour in the lips; a second copy with a red bindi.
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, sys
src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(float)
H, W, _ = im.shape
lum = im @ [0.3, 0.59, 0.11]
# 1. remove the brows: mask the dark brown brow strokes (keeping clear of the black lash line) and fill them from the skin around
def nb_mean(f):
    p = np.pad(f, ((1, 1), (1, 1), (0, 0)), mode='edge')
    return np.nanmean(np.stack([p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]]), axis=0)
for x0, x1 in ((352, 494), (532, 672)):
    y0, y1 = 256, 314
    box = im[y0:y1, x0:x1].copy(); bl = lum[y0:y1, x0:x1]
    lash = np.asarray(Image.fromarray(((bl < 22) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    brow = (bl < 112) & ~lash
    m = (np.asarray(Image.fromarray((brow * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0) & ~lash
    f = box.copy(); f[m] = np.nan
    for it in range(300):
        if not np.isnan(f).any(): break
        av = nb_mean(f); hole = np.isnan(f[..., 0]) & ~np.isnan(av[..., 0]); f[hole] = av[hole]
    for it in range(30):
        av = nb_mean(f); f[m] = av[m]
    soft = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(float)[..., None] / 255
    im[y0:y1, x0:x1] = box * (1 - soft) + f * soft
# 4. lips a little deeper in colour
L = im[466:514, 420:600]; red = np.clip((L[..., 0] - L[..., 1] - 62) / 18, 0, 1)
red = (np.asarray(Image.fromarray((red * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(float) / 255)[..., None]
im[466:514, 420:600] = L * (1 - 0.4 * red) + np.array([140, 62, 72]) * 0.4 * red
img = Image.fromarray(np.clip(im, 0, 255).astype(np.uint8))
# 2. thin arched brows and 3. kajal wings, drawn on a layer and softened
lay = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
def brow(p0, p1, p2, w0, w1):
    pts = [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / 40 for i in range(41)]]
    for i in range(40):
        w = w0 + (w1 - w0) * i / 40
        d.line([pts[i], pts[i + 1]], fill=(38, 27, 22, 235), width=max(2, round(w)))
brow((474, 300), (424, 274), (370, 293), 8, 3)
brow((550, 300), (600, 274), (654, 293), 8, 3)
for a, b in (((376, 312), (360, 305)), ((646, 312), (662, 305))): d.line([a, b], fill=(12, 10, 10, 230), width=4)
lay = lay.filter(ImageFilter.GaussianBlur(1.1))
img = Image.alpha_composite(img.convert('RGBA'), lay).convert('RGB')
img.save(out + '.jpg', quality=90)
b = img.copy(); bd = ImageDraw.Draw(b); bd.ellipse((505, 283, 519, 297), fill=(150, 18, 32)); b = Image.blend(img, b, 1.0)
b.save(out + '_bindi.jpg', quality=90)
img.crop((330, 220, 700, 560)).resize((740, 680)).save(out + '_crop.png')
