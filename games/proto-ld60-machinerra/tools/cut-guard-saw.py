"""Cut the Guard's saw arm off its painting (the saw stroke's look, `src/sawarm.ts`).

  PYTHON=C:/Python312/python.exe  (any Python with Pillow)
  python games/proto-ld60-machinerra/tools/cut-guard-saw.py [--debug FILE]

Reads art/crew/guard.png (the stored painting, never edited, facing right with the saw arm on its right) and writes beside it
art/crew/guard-body.png (the painting without the forearm and saw) and art/crew/guard-saw.png (that forearm and saw): both are the
whole canvas with only their pixels kept, so the saw drops back exactly onto the body. The saw piece takes 1 px of what lies round
it (a seam would show the ground through). The elbow it turns about is `ELBOW` here and in `src/sawarm.ts`. Then
`npm run assets -- proto-ld60-machinerra`. --debug FILE writes the painting magnified with the polygon and the elbow drawn.
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'crew')
# Pixels of art/crew/guard.png (82 x 100): the forearm and the saw, from the elbow out.
POLY = [(54, 48), (66, 48), (82, 50), (82, 77), (70, 77), (62, 71), (55, 63), (51, 55)]
ELBOW = (57, 51)

im = Image.open(os.path.join(ART, 'guard.png')).convert('RGBA')
assert im.size == (82, 100), f'the painting is {im.size}, this tool and sawarm.ts say 82 x 100'
m = Image.new('L', im.size, 0)
ImageDraw.Draw(m).polygon(POLY, fill=255)
saw = m.filter(ImageFilter.MaxFilter(3))
alpha = im.getchannel('A')
for name, mask in (('guard-saw', saw), ('guard-body', ImageChops.invert(m))):
    out = im.copy()
    out.putalpha(ImageChops.multiply(alpha, mask))
    out.save(os.path.join(ART, name + '.png'))
    print('wrote', name, out.getbbox())
if '--debug' in sys.argv:
    z = 8
    big = Image.new('RGBA', (im.width * z, im.height * z), (110, 110, 120, 255))
    big.alpha_composite(im.resize((im.width * z, im.height * z), Image.NEAREST))
    d = ImageDraw.Draw(big)
    d.line([(x * z, y * z) for x, y in POLY + [POLY[0]]], fill=(60, 220, 255, 255), width=2)
    d.ellipse((ELBOW[0] * z - 6, ELBOW[1] * z - 6, ELBOW[0] * z + 6, ELBOW[1] * z + 6), fill=(255, 0, 255, 255))
    big.save(sys.argv[sys.argv.index('--debug') + 1])
