#!/usr/bin/env python3
"""Export a subsample of the embryo cells for the homepage's particle morph.
Writes src/embryo_points.b64: N x 4 bytes (x, y, z as int8 in [-127, 127], palette index).
Usage: python3 export_points.py <adata.h5ad> <out.b64> [n]
"""
import sys, base64, numpy as np, h5py
ORDER = ['CM', 'JCF', 'Endocardium/Intra-Embryonic Endothelium', 'Pharyngeal Mesoderm/SHF', 'Foregut',
         'Paraxial Mesoderm', 'Mesenchyme', 'NCC', 'Spinal Cord', 'Brain']   # index = colour slot; others -> 10
h = h5py.File(sys.argv[1], 'r'); n = int(sys.argv[3]) if len(sys.argv) > 3 else 2600
xyz = h['obsm']['Spateo_aligned_spatial'][:].astype(float)
ct = h['obs']['celltype']; cats = [c.decode() for c in ct['categories'][:]]; codes = ct['codes'][:]
xyz -= (xyz.max(0) + xyz.min(0)) / 2; xyz /= np.abs(xyz).max()
idx = np.random.RandomState(3).choice(len(xyz), n, replace=False)
slot = np.array([ORDER.index(cats[c]) if cats[c] in ORDER else 10 for c in codes[idx]], np.uint8)
buf = np.concatenate([np.round(xyz[idx] * 127).astype(np.int8).view(np.uint8), slot[:, None]], 1)
open(sys.argv[2], 'w').write(base64.b64encode(buf.tobytes()).decode())
print(n, 'points', len(buf.tobytes()), 'bytes')
