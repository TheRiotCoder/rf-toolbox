# Generates RF Toolbox icons (adapted from /workspace/make_icons.py). Run from repo root: python3 tools/make_icons.py
from PIL import Image, ImageDraw
import math
S = 1024
def gradient(size):
    im = Image.new("RGB", (size, size)); px = im.load()
    c1 = (8, 15, 30); c2 = (8, 90, 120)
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return im
def art(scale):
    L = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    cx, cy = S / 2, S / 2 + 40 * scale
    # radiating arcs
    for i, r in enumerate((90, 160, 230)):
        rr = r * scale; w = int(26 * scale)
        d.arc([cx - rr, cy - 120 * scale - rr, cx + rr, cy - 120 * scale + rr], 210, 330, fill=(34, 211, 238, 255 - i * 40), width=w)
    # mast
    d.polygon([(cx - 70 * scale, cy + 230 * scale), (cx, cy - 120 * scale), (cx + 70 * scale, cy + 230 * scale)], outline=(226, 232, 240, 255), width=int(20 * scale))
    d.line([(cx - 45 * scale, cy + 100 * scale), (cx + 45 * scale, cy + 100 * scale)], fill=(226, 232, 240, 255), width=int(16 * scale))
    r = 34 * scale; d.ellipse([cx - r, cy - 120 * scale - r, cx + r, cy - 120 * scale + r], fill=(250, 204, 21, 255))
    # sine wave
    pts = [(cx - 260 * scale + t * 520 * scale / 200, cy + 300 * scale + math.sin(t / 200 * 4 * math.pi) * 28 * scale) for t in range(201)]
    d.line(pts, fill=(34, 211, 238, 255), width=int(14 * scale))
    return L
def make(size, maskable=False, rounded=True, fname=None):
    bg = gradient(512).resize((S, S), Image.BICUBIC).convert("RGBA")
    bg.alpha_composite(art(0.72 if maskable else 0.95))
    if rounded and not maskable:
        m = Image.new("L", (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
        out = Image.new("RGBA", (S, S), (0, 0, 0, 0)); out.paste(bg, (0, 0), m); bg = out
    else:
        bg = bg.convert("RGB")
    bg.resize((size, size), Image.LANCZOS).save(fname, optimize=True)
make(192, fname="icons/icon-192.png")
make(512, fname="icons/icon-512.png")
make(512, maskable=True, fname="icons/maskable-512.png")
make(180, rounded=False, fname="icons/apple-touch-icon.png")
make(32, fname="icons/favicon-32.png")
