#!/usr/bin/env python3
"""Render the matverse card video: generative materials design.

Atoms start as noise in a cell and are denoised into a crystal (the way
diffusion models for crystal generation work), hold, dissolve, and come back
as a second candidate. Two candidates, one seamless loop:
  1. a halide-perovskite ABX3 supercell (solar absorber)
  2. a layered oxide, O3 stacking (battery cathode)

Usage: python3 materials.py <frames_dir> [n_frames] [only_frame|-1] [part 0-3]
"""
import sys, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

W, H, SS = 806, 560, 2
BG = (26, 26, 26)
hexrgb = lambda s: np.array([int(s[i:i + 2], 16) for i in (1, 3, 5)], float)
# accretion-disk palette, shared with the embryo video and the black-hole background
BLUE, PURPLE, WARM, GREEN, RED = map(hexrgb, ('#efe6d8', '#ffb454', '#dd5f1e', '#ffc673', '#d2521a'))


def perovskite():
    pos, col, rad, kind = [], [], [], []
    def add(p, c, r, k): pos.append(p); col.append(c); rad.append(r); kind.append(k)
    for i in range(3):
        for j in range(3):
            for k in range(3): add((i, j, k), BLUE, .17, 'A')
    seen = set()
    for i in range(2):
        for j in range(2):
            for k in range(2):
                add((i + .5, j + .5, k + .5), PURPLE, .21, 'M')
                for o in ((.5, .5, 0), (.5, .5, 1), (.5, 0, .5), (.5, 1, .5), (0, .5, .5), (1, .5, .5)):
                    q = (i + o[0], j + o[1], k + o[2])
                    if q not in seen: seen.add(q); add(q, WARM, .11, 'X')
    pos = np.array(pos, float) - 1.0
    box = np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], float)
    return pos * .82, np.array(col), np.array(rad), kind, box * .82, .62


def layered():
    a1, a2 = np.array([1, 0, 0.]), np.array([.5, .8660254, 0.])
    off = {'A': 0., 'B': 1 / 3, 'C': 2 / 3}
    seq = [('O', 'A'), ('M', 'B'), ('O', 'C'), ('Li', 'A'), ('O', 'B'), ('M', 'C'), ('O', 'A'), ('Li', 'B')]
    zs = np.cumsum([0, .38, .38, .52, .52, .38, .38, .52])
    style = {'O': (RED, .085), 'M': (BLUE, .16), 'Li': (GREEN, .11)}
    pos, col, rad, kind = [], [], [], []
    for (sp, st), z in zip(seq, zs):
        for i in range(3):
            for j in range(3):
                p = (i + off[st]) * a1 + (j + off[st]) * a2 + np.array([0, 0, z])
                pos.append(p); col.append(style[sp][0]); rad.append(style[sp][1]); kind.append('X' if sp == 'O' else sp)
    pos = np.array(pos)
    pos -= (pos.max(0) + pos.min(0)) / 2
    pos = pos[:, [0, 2, 1]] * .58                       # stacking axis vertical
    lo, hi = pos.min(0) - .1, pos.max(0) + .1
    box = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    return pos, np.array(col), np.array(rad), kind, box, .44


def bonds_of(pos, kind, thr):
    out = []
    for i, ki in enumerate(kind):
        if ki != 'M': continue
        for j, kj in enumerate(kind):
            if kj == 'X' and np.linalg.norm(pos[i] - pos[j]) < thr: out.append((i, j))
    return out


CANDS = [perovskite(), layered()]
N = max(len(c[0]) for c in CANDS)
BONDS = [bonds_of(c[0], c[3], c[5]) for c in CANDS]
EDGES = [(a, b) for a in range(8) for b in range(a + 1, 8) if bin(a ^ b).count('1') == 1]
rs = np.random.RandomState(5)
NOISE = rs.uniform(-1.15, 1.15, (N, 3))
PH = rs.uniform(0, 6.283, (N, 3))


def pad(c):
    pos, col, rad = c[0], c[1], c[2]
    k = N - len(pos)
    if k: pos = np.vstack([pos, np.zeros((k, 3))]); col = np.vstack([col, np.tile(BLUE, (k, 1))]); rad = np.concatenate([rad, np.zeros(k)])
    return pos, col, rad
PADDED = [pad(c) for c in CANDS]

_sprite = {}
def sprite(r):
    r = max(2, int(round(r)))
    if r not in _sprite:
        d = 2 * r + 3
        v, u = np.mgrid[0:d, 0:d]; u = (u - d / 2 + .5) / r; v = (v - d / 2 + .5) / r
        rr = u * u + v * v; nz = np.sqrt(np.clip(1 - rr, 0, 1))
        L = np.array([-.48, -.6, .64]); Hh = (L + [0, 0, 1]); Hh /= np.linalg.norm(Hh)
        diff = np.clip(u * L[0] + v * L[1] + nz * L[2], 0, 1)
        spec = np.clip(u * Hh[0] + v * Hh[1] + nz * Hh[2], 0, 1) ** 46
        alpha = np.clip((1 - np.sqrt(rr)) * r, 0, 1)
        _sprite[r] = (.2 + .8 * diff, spec * .7, alpha, d)
    return _sprite[r]


def frame(t):
    """t in [0, 1): one full loop."""
    half = (t * 2) % 1; which = int(t * 2) % 2; other = 1 - which
    sm = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
    # noise level s: 1 -> 0 (denoise), hold, 0 -> 1 (dissolve)
    s = 1 - sm(half / .40) if half < .40 else (0 if half < .80 else sm((half - .80) / .20))
    pos_t, col_t, rad_t = PADDED[which]
    # in the first/last 8% the species blend to/from the neighbouring candidate, so the loop has no pop
    pos_o, col_o, rad_o = PADDED[other]
    mix = .5 * (1 - sm(half / .08)) if half < .08 else (.5 * sm((half - .92) / .08) if half > .92 else 0)
    col = col_t * (1 - mix) + col_o * mix; rad = rad_t * (1 - mix) + rad_o * mix
    wig = .10 * np.sin(PH + t * 6.283 * 6) * s
    pos = pos_t * (1 - s) + (NOISE + wig) * s
    ang = t * 6.283 + .6; tilt = .36
    ca, sa, ct, st = np.cos(ang), np.sin(ang), np.cos(tilt), np.sin(tilt)
    def proj(p):
        x = p[:, 0] * ca - p[:, 2] * sa; z = p[:, 0] * sa + p[:, 2] * ca
        y = p[:, 1] * ct - z * st; z2 = p[:, 1] * st + z * ct
        f = 4.6 / (4.6 + z2); sc = H * SS * .215
        return W * SS / 2 + x * sc * f, H * SS * .42 + y * sc * f, z2, f * sc
    X, Y, Z, F = proj(pos)
    img = Image.new('RGB', (W * SS, H * SS), BG)
    over = Image.new('RGBA', img.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(over)
    order_a = 1 - s
    bx, by, bz, _ = proj(CANDS[which][4])
    for a, b in EDGES:
        dr.line([(bx[a], by[a]), (bx[b], by[b])], fill=(255, 255, 255, int(34 * order_a ** 3)), width=SS)
    img.paste(over, (0, 0), over)
    items = [(Z[i], 'a', i) for i in range(N) if rad[i] > .01]
    if order_a > .35:
        items += [((Z[i] + Z[j]) / 2 + .02, 'b', (i, j)) for i, j in BONDS[which]]
    arr = np.array(img, float)
    for z, typ, ref in sorted(items, key=lambda q: -q[0]):
        fog = float(np.clip(.42 + .58 * (1.6 - z) / 3.2, .3, 1))
        if typ == 'b':
            i, j = ref
            a = ((order_a - .35) / .65) ** 2 * .75 * fog
            layer = Image.new('L', img.size, 0)
            ImageDraw.Draw(layer).line([(X[i], Y[i]), (X[j], Y[j])], fill=int(255 * a), width=3 * SS)
            box = layer.getbbox()
            if not box: continue
            m = np.array(layer.crop(box), float)[..., None] / 255
            sl = arr[box[1]:box[3], box[0]:box[2]]
            sl[:] = sl * (1 - m) + np.array([196, 160, 124.]) * m
            continue
        r = rad[ref] * F[ref]
        shade, spec, alpha, d = sprite(r)
        x0, y0 = int(round(X[ref] - d / 2)), int(round(Y[ref] - d / 2))
        xa, ya, xb, yb = max(x0, 0), max(y0, 0), min(x0 + d, W * SS), min(y0 + d, H * SS)
        if xa >= xb or ya >= yb: continue
        sx, sy = slice(xa - x0, xb - x0), slice(ya - y0, yb - y0)
        c = (col[ref][None, None] * shade[sy, sx, None] + 255 * spec[sy, sx, None]) * fog
        al = alpha[sy, sx, None]
        arr[ya:yb, xa:xb] = arr[ya:yb, xa:xb] * (1 - al) + np.clip(c, 0, 255) * al
    glow = gaussian_filter(np.clip(arr - np.array(BG, float), 0, None), sigma=(14, 14, 0))
    arr = np.clip(arr + glow * .35, 0, 255)
    return Image.fromarray(arr.astype(np.uint8)).resize((W, H), Image.LANCZOS)


if __name__ == '__main__':
    outdir = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 480
    only = int(sys.argv[3]) if len(sys.argv) > 3 and int(sys.argv[3]) >= 0 else None
    part = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    for i in ([only] if only is not None else range(part, n, 4)):
        frame(i / n).save(f'{outdir}/m_{i:04d}.png')
    print('atoms', N, 'done')
