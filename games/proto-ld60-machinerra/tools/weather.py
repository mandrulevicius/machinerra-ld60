# python tools/weather.py <clean.png> <out.png> [amount=1]  (needs numpy, scipy, pillow; amount < 1 weathers less: the small foes)
# Used for npc/kicker and crew/marksman: art-src/npc/kicker.svg, art-src/crew/marksman.svg rendered by sharp, weathered here, then tools/brushed-flat.cjs.
# Weather a clean drawing into a painting like Laimonas's sheets: mottled light, rust patches, specks, grime in the creases and at the edges.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
src, out = sys.argv[1], sys.argv[2]
amt = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
im = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
rgb, a = im[..., :3], im[..., 3] / 255
h, w = a.shape
rng = np.random.default_rng(7)
def noise(scale):
    n = rng.random((h // scale + 2, w // scale + 2))
    return np.array(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
mott = 0.78 + 0.4 * (0.6 * noise(24) + 0.4 * noise(8))
rust = np.clip((noise(40) * 0.7 + noise(10) * 0.3 - 0.52) * 4, 0, 1)
rust_col = np.array([120, 60, 30], np.float32)
specks = (rng.random((h, w)) < 0.02).astype(np.float32) * rng.uniform(-60, 40, (h, w))
inner = nd.distance_transform_edt(a > 0.5)
edge = np.clip(1 - inner / 18, 0, 1) * 0.35
lum = rgb.mean(axis=2)
crease = np.clip((nd.uniform_filter(lum, 9) - lum) / 40, 0, 1) * 0.5
mott = 1 + (mott - 1) * amt
rust = rust * amt
rgb = rgb * mott[..., None]
rgb = rgb * (1 - rust[..., None] * 0.55) + rust_col * rust[..., None] * 0.55
rgb = rgb + specks[..., None] * amt
rgb = rgb * (1 - (edge + crease) * (0.5 + 0.5 * amt))[..., None]
im[..., :3] = np.clip(rgb, 0, 255)
Image.fromarray(im.astype(np.uint8)).save(out)
