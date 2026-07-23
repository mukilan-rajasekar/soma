#!/usr/bin/env python3
"""
export_brain.py — BUILD-TIME ONLY (not part of the demo runtime).

Dumps the fsaverage pial cortical surface — at fsaverage5 the exact ~20,484-vertex
surface TRIBE v2 predicts on — to three compact little-endian binaries that the
Next.js brain components (src/components/BrainField.tsx, brainlab/*) fetch directly
from /brain/ (no GLTFLoader needed). Filenames carry the resolution (fs5/fs6/fs7);
the default mesh is fsaverage6, i.e. the fs6_* files the site ships:

  public/brain/fs6_pos.bin   Float32  [nVerts*3]   vertex positions, centered + unit-scaled
  public/brain/fs6_idx.bin   Uint32   [nTris*3]    triangle indices (both hemispheres)
  public/brain/fs6_sulc.bin  Float32  [nVerts]     sulcal depth in [0,1] (1 = deep sulcus)

The SAME vertex set is used for BOTH the translucent glass shell (Layer A, as an
indexed mesh) and the neon "signal" point overlay (Layer B, as points) — so the
points sit exactly on the cortex and the copy can honestly say "fsaverage5 · 20,484 vtx".

This is DECORATION for the marketing hero. It never carries a real prediction value.

Run:  <venv>/bin/python tools/export_brain.py
Re-run to regenerate. To swap in a CC-BY artist mesh later, replace the load with a
GLB import and re-emit the same three .bin files.
"""
import os
import sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "public", "brain"))
os.makedirs(OUT, exist_ok=True)


def load_surface(mesh):
    """Return (coords[n,3] float64, faces[m,3] int64, sulc[n] float64) for L+R pial of
    the given fsaverage resolution, trying the modern nilearn (>=0.11) API first, then
    the legacy API. `mesh` is e.g. "fsaverage5" (20,484 vtx, the prediction surface) or
    "fsaverage6" (81,924 vtx — a crisper DECORATIVE surface for the marketing hero)."""
    # --- modern API (nilearn >= 0.11) ---
    try:
        from nilearn.datasets import load_fsaverage, load_fsaverage_data
        fs = load_fsaverage(mesh)
        pial = fs["pial"]
        parts = pial.parts  # {'left': mesh, 'right': mesh}
        lc = np.asarray(parts["left"].coordinates, dtype=np.float64)
        lf = np.asarray(parts["left"].faces, dtype=np.int64)
        rc = np.asarray(parts["right"].coordinates, dtype=np.float64)
        rf = np.asarray(parts["right"].faces, dtype=np.int64)
        sulc = load_fsaverage_data(mesh=mesh, mesh_type="pial", data_type="sulcal")
        ls = np.asarray(sulc.data.parts["left"], dtype=np.float64).ravel()
        rs = np.asarray(sulc.data.parts["right"], dtype=np.float64).ravel()
        print(f"[export] loaded {mesh} via modern nilearn API (load_fsaverage)")
        return _stitch(lc, lf, rc, rf, ls, rs)
    except Exception as e:  # noqa: BLE001
        print(f"[export] modern API unavailable ({e!r}); trying legacy API")

    # --- legacy API (older nilearn) ---
    from nilearn import datasets, surface
    fs = datasets.fetch_surf_fsaverage(mesh)
    lc, lf = surface.load_surf_mesh(fs["pial_left"])
    rc, rf = surface.load_surf_mesh(fs["pial_right"])
    ls = surface.load_surf_data(fs["sulc_left"]).ravel()
    rs = surface.load_surf_data(fs["sulc_right"]).ravel()
    print(f"[export] loaded {mesh} via legacy nilearn API (fetch_surf_fsaverage)")
    return _stitch(np.asarray(lc, float), np.asarray(lf, np.int64),
                   np.asarray(rc, float), np.asarray(rf, np.int64),
                   np.asarray(ls, float), np.asarray(rs, float))


def _stitch(lc, lf, rc, rf, ls, rs):
    n_left = lc.shape[0]
    coords = np.vstack([lc, rc])
    faces = np.vstack([lf, rf + n_left])  # offset right-hemi indices
    sulc = np.concatenate([ls, rs])
    return coords, faces, sulc


def main():
    # mesh resolution: fsaverage5 = honest prediction surface; fsaverage6/7 = crisper
    # DECORATIVE hero. Pass as argv[1]. Output filenames carry the resolution (fs5/fs6/fs7).
    mesh = sys.argv[1] if len(sys.argv) > 1 else "fsaverage6"
    digit = mesh[-1] if mesh[-1].isdigit() else "7"
    prefix = "fs" + digit
    coords, faces, sulc = load_surface(mesh)
    n = coords.shape[0]
    m = faces.shape[0]

    # --- orient to a clean anatomical frame ---
    # FreeSurfer RAS: x=Left->Right, y=Posterior->Anterior, z=Inferior->Superior.
    # We keep that; BrainField.tsx frames a coronal (front-facing) hero by orbiting.
    centroid = coords.mean(axis=0)
    coords = coords - centroid
    radius = np.linalg.norm(coords, axis=1).max()
    coords = coords / radius  # fit inside a unit sphere; JS scales up for the scene

    # --- sulcal depth -> [0,1], 1 = deep sulcus (darken), 0 = gyral crown (brighten) ---
    # FreeSurfer sulc: positive in sulci. Robustly normalize by percentiles.
    lo, hi = np.percentile(sulc, [2, 98])
    sd = np.clip((sulc - lo) / (hi - lo + 1e-9), 0.0, 1.0)

    pos = coords.astype("<f4").ravel()
    idx = faces.astype("<u4").ravel()
    sdf = sd.astype("<f4").ravel()

    with open(os.path.join(OUT, f"{prefix}_pos.bin"), "wb") as f:
        f.write(pos.tobytes())
    with open(os.path.join(OUT, f"{prefix}_idx.bin"), "wb") as f:
        f.write(idx.tobytes())
    with open(os.path.join(OUT, f"{prefix}_sulc.bin"), "wb") as f:
        f.write(sdf.tobytes())

    bb = coords.max(axis=0) - coords.min(axis=0)
    print(f"[export] vertices : {n}")
    print(f"[export] triangles: {m}")
    print(f"[export] bbox (unit): x={bb[0]:.3f} y={bb[1]:.3f} z={bb[2]:.3f}")
    print(f"[export] wrote {prefix}_pos.bin  ({pos.nbytes/1024:.1f} KB)")
    print(f"[export] wrote {prefix}_idx.bin  ({idx.nbytes/1024:.1f} KB)")
    print(f"[export] wrote {prefix}_sulc.bin ({sdf.nbytes/1024:.1f} KB)")
    print(f"[export] -> {OUT}")
    # sanity: index range must be within [0, n)
    assert idx.max() < n and idx.min() >= 0, "index out of range"
    print("[export] OK")


if __name__ == "__main__":
    sys.exit(main())
