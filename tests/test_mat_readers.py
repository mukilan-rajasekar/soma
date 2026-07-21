#!/usr/bin/env python3
"""test_mat_readers.py — guard BOTH .mat readers in tvsum_prep.

The synthetic fixtures are MATLAB v7 (scipy path); the REAL TVSum release is v7.3/HDF5
(h5py path). dry_run.py only exercises v7, so this test builds a tiny v7.3-style HDF5 .mat
by hand — struct-array fields stored as (N,1) object-reference arrays, exactly like MATLAB
writes them — and asserts load_tvsum_mat parses it to (id, anno[nframes,n_annot], length,
nframes). This is the regression guard for the real-data v7.3 bug that the v7 fixture hid.
"""
import os
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import tvsum_prep  # noqa: E402


def _write_v73_mat(path, videos):
    """Write a minimal MATLAB v7.3-style HDF5 .mat (struct array `tvsum50`)."""
    import h5py
    n = len(videos)
    with h5py.File(path, "w") as f:
        refs = f.create_group("#refs#")
        g = f.create_group("tvsum50")
        cols = {k: [] for k in ("video", "user_anno", "nframes", "length")}
        for i, v in enumerate(videos):
            dv = refs.create_dataset(f"v{i}", data=np.array([ord(c) for c in v["id"]], "uint16"))
            da = refs.create_dataset(f"a{i}", data=np.asarray(v["anno"], float))  # (n_annot, nframes)
            dn = refs.create_dataset(f"n{i}", data=np.array([[float(v["nframes"])]]))
            dl = refs.create_dataset(f"l{i}", data=np.array([[float(v["length"])]]))
            cols["video"].append(dv.ref); cols["user_anno"].append(da.ref)
            cols["nframes"].append(dn.ref); cols["length"].append(dl.ref)
        for k, rs in cols.items():
            g.create_dataset(k, data=np.array(rs, dtype=h5py.ref_dtype).reshape(n, 1))


def main():
    rng = np.random.default_rng(0)
    vids = [
        dict(id="AbC_123", nframes=240, length=8.0, anno=rng.random((5, 240))),
        dict(id="xyz-999", nframes=180, length=6.0, anno=rng.random((5, 180))),
    ]
    fails = []
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "v73.mat")
        _write_v73_mat(p, vids)
        got = list(tvsum_prep.load_tvsum_mat(p))
        if len(got) != len(vids):
            fails.append(f"expected {len(vids)} videos, got {len(got)}")
        for (vid, anno, length, nframes), exp in zip(got, vids):
            if vid != exp["id"]:
                fails.append(f"id {vid!r} != {exp['id']!r}")
            if nframes != exp["nframes"]:
                fails.append(f"nframes {nframes} != {exp['nframes']}")
            if abs(length - exp["length"]) > 1e-6:
                fails.append(f"length {length} != {exp['length']}")
            if anno.shape != (exp["nframes"], 5):   # _orient -> (nframes, n_annot)
                fails.append(f"anno shape {anno.shape} != {(exp['nframes'], 5)}")

    if fails:
        print("[test_mat_readers] FAIL:")
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("[test_mat_readers] PASS — v7.3 (HDF5) struct-array-of-refs reader works")


if __name__ == "__main__":
    main()
