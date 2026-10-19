"""Cut elbow arms out of painted foes (P50, on by default; ?v.paintedArms=plain shows the uncut painting).

  PYTHON=C:/Python312/python.exe  (any Python with Pillow)
  python games/proto-ld60-machinerra/tools/cut-painted-arms.py [kind ...] [--debug DIR]

Reads src/armscut.json (the cuts, in pixels of the painting) and art/foe/<src>.png (the stored painting, never edited) and writes,
beside it, <src>-body.png (the painting without its arms) and <src>-arm-<id>-upper.png / -lower.png (the pieces): every piece is the
whole canvas of the painting with only its pixels kept, so the pieces drop back exactly onto the body. Then add the sizes.json rule
(foe/<src>-*, the painting's own) and run `npm run assets -- proto-ld60-machinerra`. --debug DIR also writes DIR/<kind>-cut.png:
the painting with each piece's polygon outlined (red upper, cyan lower, green keep) and the shoulder, elbow and hand marked.
"""
import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
ART = os.path.join(ROOT, 'art', 'foe')
CUTS = json.load(open(os.path.join(ROOT, 'src', 'armscut.json'), encoding='utf8'))


def mask(size, polys):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon([tuple(q) for q in p], fill=255)
    return m


def cut(kind, row, debug):
    base = row.get('src', kind)
    im = Image.open(os.path.join(ART, base + '.png')).convert('RGBA')
    assert list(im.size) == row['size'], f'{kind}: the painting is {im.size}, armscut.json says {row["size"]}'
    taken = Image.new('L', im.size, 0)
    pieces = []
    arms = row['arms']
    # A pixel goes to one piece: the lower of its arm over the upper, and a later arm (nearer the viewer) over an earlier.
    whole = [ImageChops.lighter(mask(im.size, [a['upper']]), mask(im.size, [a['lower']])) for a in arms]
    for i, a in enumerate(arms):
        above = Image.new('L', im.size, 0)
        for w in whole[i + 1:]:
            above = ImageChops.lighter(above, w)
        lower = ImageChops.subtract(mask(im.size, [a['lower']]), above)
        upper = ImageChops.subtract(ImageChops.subtract(mask(im.size, [a['upper']]), mask(im.size, [a['lower']])), above)
        # Each piece takes 2 px of what lies round it too (the painting under it is the body's or its neighbour's, the same pixels):
        # drawn between whole pixels, a piece edge would show the ground through a seam.
        # (`grow` in the kind's row: 0 for a see-through foe, where the overlap would show as a darker line.)
        n = row.get('grow', 2)
        grow = lambda m: m.filter(ImageFilter.MaxFilter(2 * n + 1)) if n else m
        pieces += [(f'{base}-arm-{a["id"]}-upper', grow(upper)), (f'{base}-arm-{a["id"]}-lower', grow(lower))]
        taken = ImageChops.lighter(taken, ImageChops.lighter(upper, lower))
    keep = mask(im.size, row['keep'])
    body = ImageChops.lighter(ImageChops.invert(taken), keep)
    pieces.append((f'{base}-body', body))
    alpha = im.getchannel('A')
    for name, m in pieces:
        out = im.copy()
        out.putalpha(ImageChops.multiply(alpha, m))
        out.save(os.path.join(ART, name + '.png'))
        print('  wrote', name, out.getbbox())
    if debug:
        z = 6
        big = Image.new('RGBA', (im.width * z, im.height * z), (120, 120, 130, 255))
        big.alpha_composite(im.resize((im.width * z, im.height * z), Image.NEAREST))
        d = ImageDraw.Draw(big)
        s = lambda p: [(q[0] * z, q[1] * z) for q in p]
        for p in row['keep']:
            d.line(s(p + [p[0]]), fill=(60, 220, 60, 255), width=2)
        for a in row['arms']:
            d.line(s(a['upper'] + [a['upper'][0]]), fill=(255, 60, 60, 255), width=2)
            d.line(s(a['lower'] + [a['lower'][0]]), fill=(60, 220, 255, 255), width=2)
            for q, c in zip(a['pts'], [(255, 255, 0, 255), (255, 0, 255, 255), (255, 255, 255, 255)]):
                d.ellipse((q[0] * z - 5, q[1] * z - 5, q[0] * z + 5, q[1] * z + 5), fill=c, outline=(0, 0, 0, 255))
        os.makedirs(debug, exist_ok=True)
        big.save(os.path.join(debug, kind + '-cut.png'))


def main():
    args = sys.argv[1:]
    debug = None
    if '--debug' in args:
        i = args.index('--debug')
        debug = args[i + 1]
        del args[i:i + 2]
    for kind, row in CUTS.items():
        if kind == '_' or (args and kind not in args):
            continue
        print(kind)
        cut(kind, row, debug)


main()
