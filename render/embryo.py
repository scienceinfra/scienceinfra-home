#!/usr/bin/env python3
"""Render the omicverse card video: a turntable of a real 3D spatial
transcriptomics embryo (one dot per cell, coloured by cell type).

Usage: python3 embryo.py <adata.h5ad> <frames_dir> [n_frames] [only_frame|-1] [part 0-3]
The h5ad needs obsm['Spateo_aligned_spatial'] (n x 3) and obs['celltype'].
Only positions and cell-type labels are read; no expression values.
"""
import sys, numpy as np, h5py
from PIL import Image
from scipy.ndimage import gaussian_filter

W, H, SS = 806, 560, 2            # output size (2x the 403x280 card), supersampling
BG = np.array([26, 26, 26], float)
# Accretion-disk palette (ember -> gold -> white-hot) plus dust greys, to sit on the
# black-hole page. The heart field is the hot core; neural tissue is cool dust.
PAL = {
    'CM': '#fff3dc', 'JCF': '#ffdca0', 'Endocardium/Intra-Embryonic Endothelium': '#ffc673',
    'Pharyngeal Mesoderm/SHF': '#ffa24f', 'Foregut': '#f57f2c', 'Paraxial Mesoderm': '#cf5a1e',
    'Mesenchyme': '#a04a22', 'Blood Progenitors': '#ffe9c4', 'ExE Endoderm': '#b8622f',
    'NCC': '#b5aba0', 'Spinal Cord': '#8d857d', 'Brain': '#d6cdc2', 'Surface Ectoderm': '#e9e2d8',
}
hexrgb = lambda s: np.array([int(s[i:i + 2], 16) for i in (1, 3, 5)], float)

def load(path):
    h = h5py.File(path, 'r')
    xyz = h['obsm']['Spateo_aligned_spatial'][:].astype(float)
    ct = h['obs']['celltype']
    cats = [c.decode() for c in ct['categories'][:]]
    codes = ct['codes'][:]
    col = np.stack([hexrgb(PAL.get(cats[c], '#6f6861')) for c in codes])
    xyz -= (xyz.max(0) + xyz.min(0)) / 2
    xyz /= np.abs(xyz).max()
    return xyz, col

def frame(xyz, col, ang, tilt=0.30):
    w, h = W * SS, H * SS
    ca, sa, ct, st = np.cos(ang), np.sin(ang), np.cos(tilt), np.sin(tilt)
    # data y is the long axis: keep it vertical, spin around it
    x = xyz[:, 0] * ca - xyz[:, 2] * sa
    z = xyz[:, 0] * sa + xyz[:, 2] * ca
    y = xyz[:, 1] * ct - z * st
    z2 = xyz[:, 1] * st + z * ct
    persp = 3.4 / (3.4 + z2)
    sc = h * 0.36
    px = (w / 2 + x * sc * persp).astype(int)
    py = (h * 0.44 - y * sc * persp).astype(int)
    depth = np.clip((1 - z2) / 2, 0, 1)                 # 1 = near
    order = np.argsort(z2)[::-1]                        # far first, near last
    px, py, c = px[order], py[order], col[order] * (0.38 + 0.62 * depth[order, None])
    # additive light, like stars: each cell deposits its colour, then two blurs (core + halo)
    acc = np.zeros((h, w, 3))
    np.add.at(acc, (np.clip(py, 0, h - 1), np.clip(px, 0, w - 1)), c)
    core = gaussian_filter(acc, sigma=(1.5, 1.5, 0))
    halo = gaussian_filter(acc, sigma=(11, 11, 0))
    light = core * 6.4 + halo * 8.5
    img = BG + (255 - BG) * (1 - np.exp(-light / 255 * 1.35))
    out = Image.fromarray(img.astype(np.uint8)).resize((W, H), Image.LANCZOS)
    return out

if __name__ == '__main__':
    path, outdir = sys.argv[1], sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 420
    only = int(sys.argv[4]) if len(sys.argv) > 4 and int(sys.argv[4]) >= 0 else None
    xyz, col = load(path)
    part = int(sys.argv[5]) if len(sys.argv) > 5 else 0      # render frames i % 4 == part (run 4 in parallel)
    for i in ([only] if only is not None else range(part, n, 4)):
        # swing instead of a full turn: the stack of sections is never seen edge-on, and it loops
        frame(xyz, col, 1.15 * np.sin(2 * np.pi * i / n)).save(f'{outdir}/e_{i:04d}.png')
    print('cells', len(xyz), 'frames', 1 if only is not None else n)
