#!/usr/bin/env python3
"""
test_build_roi_mask.py — the mask-shaping logic in build_roi_mask.py, offline.

Why this module and why it can be tested at all: build_roi_mask is the file that
turns a PRE-REGISTERED list of anatomical region names into the boolean vector
every downstream feature is pooled over. If that vector is built wrong — wrong
hemisphere order, a label substring that quietly matches nothing, a parcel list
off by one — every arc the pipeline reports is computed over the wrong cortex and
nothing downstream can tell. The shaping logic is pure; only the ATLAS FETCH is
heavy, and both builders do `from nilearn import datasets` at CALL time, so
patching the module attribute intercepts the download. Nothing here touches the
network.

Fixtures are built inline (a fresh clone has no tests/ — it is gitignored and
local-only), so these are tiny fake atlases, not cached nilearn data.

Run: .venv/bin/python -m pytest -q
"""
import numpy as np
import pytest
from nilearn import datasets

import build_roi_mask as B

PER_HEMI = 10242            # fsaverage5 vertices per hemisphere
N_VERTS = B.FSAVERAGE5_N    # 20484 == 2 * PER_HEMI


def _surf_atlas(labels, left_pairs=(), right_pairs=(), n_per_hemi=PER_HEMI):
    """A fake Destrieux return value.

    `labels` is the atlas label list; `left_pairs`/`right_pairs` are
    (label_index, slice_stop) runs written into the per-hemisphere annotation
    array starting at vertex 0. Everything else stays at label 0.
    """
    def annot(pairs, n):
        a = np.zeros(n, int)
        start = 0
        for idx, count in pairs:
            a[start:start + count] = idx
            start += count
        return a

    return {"labels": labels,
            "map_left": annot(left_pairs, n_per_hemi),
            "map_right": annot(right_pairs, n_per_hemi)}


def _patch_destrieux(monkeypatch, atlas):
    monkeypatch.setattr(datasets, "fetch_atlas_surf_destrieux",
                        lambda *a, **k: atlas)


def _patch_schaefer(monkeypatch, labels, record=None):
    def fake(**kwargs):
        if record is not None:
            record.update(kwargs)
        return {"labels": labels}
    monkeypatch.setattr(datasets, "fetch_atlas_schaefer_2018", fake)


# --------------------------------------------------------------------------
# build_mask_surface — vertex order and shape
# --------------------------------------------------------------------------

def test_surface_mask_is_left_then_right(monkeypatch):
    """Vertex order is [lh; rh] concatenated in THAT order.

    The docstring says this matches TRIBE's fsaverage5 output. A swap would keep
    the shape and the count identical and silently mirror every ROI, so the
    fixture gives the two hemispheres different counts AND different positions.
    """
    _patch_destrieux(monkeypatch, _surf_atlas(
        ["Unknown", "G_precuneus"],
        left_pairs=[(1, 100)],   # lh vertices 0..99 are in the ROI
        right_pairs=[(1, 50)]))  # rh vertices 0..49 are in the ROI

    mask = B.build_mask_surface("dmn")

    assert mask.shape == (N_VERTS,)
    assert mask.dtype == bool          # np.save'd and consumed as a boolean mask
    assert mask[:PER_HEMI].sum() == 100
    assert mask[PER_HEMI:].sum() == 50
    # positional, not just count-wise: under a [rh; lh] swap the 50 would land first
    assert np.array_equal(np.flatnonzero(mask[:PER_HEMI]), np.arange(100))
    assert np.array_equal(np.flatnonzero(mask[PER_HEMI:]), np.arange(50))


def test_surface_mask_selects_by_label_index(monkeypatch):
    """A vertex is in the ROI iff its annotation value is the INDEX of a matched
    label. Decoy labels sit either side of the match so an off-by-one in the
    enumerate() would pick up the wrong anatomy rather than nothing."""
    _patch_destrieux(monkeypatch, _surf_atlas(
        ["Unknown", "S_central", "G_postcentral", "G_precuneus", "S_front_sup"],
        #   0          1            2               3 (match)     4
        left_pairs=[(1, 10), (2, 10), (3, 13), (4, 7)],
        right_pairs=[(3, 5)]))

    mask = B.build_mask_surface("dmn")

    # only the run written with label index 3 — lh vertices 20..32 — is selected
    assert np.array_equal(np.flatnonzero(mask[:PER_HEMI]), np.arange(20, 33))
    assert np.array_equal(np.flatnonzero(mask[PER_HEMI:]), np.arange(5))
    assert mask.sum() == 18


# --------------------------------------------------------------------------
# build_mask_surface — region-name matching
# --------------------------------------------------------------------------

def test_region_match_is_case_insensitive(monkeypatch):
    """`g_precuneus` in the atlas matches the `G_precuneus` entry in DMN_REGIONS.

    Destrieux label casing has moved across nilearn versions; the builder lowers
    both sides so a re-cased atlas does not silently yield an empty ROI.
    """
    _patch_destrieux(monkeypatch, _surf_atlas(
        ["Unknown", "g_precuneus"], left_pairs=[(1, 40)]))

    assert B.build_mask_surface("dmn").sum() == 40


def test_region_match_decodes_bytes_labels(monkeypatch):
    """Older nilearn returns labels as bytes; the builder decodes before matching."""
    _patch_destrieux(monkeypatch, _surf_atlas(
        [b"Unknown", b"G_precuneus"], left_pairs=[(1, 40)]))

    assert B.build_mask_surface("dmn").sum() == 40


def test_region_substring_is_needle_in_atlas_label(monkeypatch):
    """Matching is `region.lower() in atlas_label.lower()`, in that direction.

    So an atlas label LONGER than the pre-registered substring matches (the
    Destrieux names carry hemisphere/parcel suffixes) — but a SHORTER atlas label
    does not, even though it looks like a prefix of the region we asked for.
    Getting this backwards would make short atlas names match many ROIs at once.
    """
    _patch_destrieux(monkeypatch, _surf_atlas(
        ["Unknown", "G_precuneus_and_more"], left_pairs=[(1, 7)]))
    assert B.build_mask_surface("dmn").sum() == 7

    _patch_destrieux(monkeypatch, _surf_atlas(
        ["Unknown", "G_prec"], left_pairs=[(1, 7)]))
    with pytest.raises(SystemExit):
        B.build_mask_surface("dmn")


def test_surface_no_match_raises_rather_than_all_false(monkeypatch):
    """A region set that matches nothing must fail loudly.

    An all-False mask of the right length is the dangerous outcome: it saves,
    loads and pools without error, and every feature computed over it is a
    constant. The builder raises instead.
    """
    _patch_destrieux(monkeypatch, _surf_atlas(
        ["Unknown", "ZZZ_not_a_destrieux_name"], left_pairs=[(1, 100)]))

    with pytest.raises(SystemExit) as exc:
        B.build_mask_surface("dmn")
    assert "0 vertices" in str(exc.value)


# --------------------------------------------------------------------------
# build_mask_surface — length guard
# --------------------------------------------------------------------------

def test_surface_wrong_total_length_raises_naming_fsaverage5(monkeypatch):
    """A non-fsaverage5 atlas resolution must not produce a usable mask.

    The mask's length IS the contract with the encoder's prediction array; a
    mismatch means the ROI is indexing a different cortex entirely.
    """
    _patch_destrieux(monkeypatch, _surf_atlas(
        ["Unknown", "G_precuneus"], left_pairs=[(1, 3)], right_pairs=[(1, 2)],
        n_per_hemi=3))

    with pytest.raises(SystemExit) as exc:
        B.build_mask_surface("dmn")
    msg = str(exc.value)
    assert "6" in msg and str(N_VERTS) in msg   # got 6, expected 20484


def test_surface_length_error_wins_over_empty_error(monkeypatch):
    """When the atlas is both the wrong size and matches nothing, the reported
    error is the length one — the more diagnostic of the two, since a wrong-sized
    atlas explains the empty match rather than the other way round."""
    _patch_destrieux(monkeypatch, _surf_atlas(
        ["ZZZ_not_a_destrieux_name"], n_per_hemi=3))

    with pytest.raises(SystemExit) as exc:
        B.build_mask_surface("dmn")
    assert "Mask length" in str(exc.value)


# --------------------------------------------------------------------------
# build_mask_schaefer1000 — Yeo-7 token membership
# --------------------------------------------------------------------------

# Eight parcels in real Schaefer-2018 7Networks label shape, one per Yeo network
# plus a second Default and a second Limbic, so unions are distinguishable.
SCHAEFER8 = [b"7Networks_LH_Default_pCunPCC_1",
             b"7Networks_LH_Vis_1",
             b"7Networks_LH_Cont_Par_1",
             b"7Networks_LH_Limbic_OFC_1",
             b"7Networks_RH_Default_Temp_1",
             b"7Networks_RH_SomMot_1",
             b"7Networks_RH_DorsAttn_Post_1",
             b"7Networks_RH_SalVentAttn_Med_1"]


def test_schaefer_selects_parcels_by_yeo_token(monkeypatch):
    """Parcel i <-> labels[i], and True means "belongs to the mapped network"."""
    got = {}
    _patch_schaefer(monkeypatch, SCHAEFER8, record=got)

    mask = B.build_mask_schaefer1000("dmn", n_rois=8)

    assert mask.dtype == bool
    assert mask.tolist() == [True, False, False, False, True, False, False, False]
    # the requested atlas is the 7-network parcellation at the asked-for size
    assert got == {"n_rois": 8, "yeo_networks": 7}


def test_schaefer_language_is_a_union_of_two_networks(monkeypatch):
    """language -> Default+Cont. This is the loosest mapping in the file and the
    only one that unions two whole Yeo networks; pin that it really does."""
    _patch_schaefer(monkeypatch, SCHAEFER8)

    lang = B.build_mask_schaefer1000("language", n_rois=8)
    dmn = B.build_mask_schaefer1000("dmn", n_rois=8)

    assert lang.tolist() == [True, False, True, False, True, False, False, False]
    assert lang.sum() > dmn.sum()          # strictly looser than DMN alone
    assert np.all(lang[dmn])               # and a superset of it


def test_schaefer_label_count_mismatch_raises(monkeypatch):
    """A leading "Background" entry must fail rather than shift every parcel.

    nilearn has varied on whether the label list includes a background row. If it
    does and nothing checks, parcel i maps to labels[i+1] and the entire 1000-dim
    mask is off by one — a silent whole-brain misalignment.
    """
    _patch_schaefer(monkeypatch, [b"Background"] + SCHAEFER8)

    with pytest.raises(SystemExit) as exc:
        B.build_mask_schaefer1000("dmn", n_rois=8)
    assert "9 labels" in str(exc.value)


def test_schaefer_no_match_raises_rather_than_all_false(monkeypatch):
    """Same fail-closed rule as the surface path: a token spelling that matches
    nothing raises instead of returning an empty parcel mask."""
    _patch_schaefer(monkeypatch, [b"7Networks_LH_Vis_1"] * 8)

    with pytest.raises(SystemExit) as exc:
        B.build_mask_schaefer1000("dmn", n_rois=8)
    assert "0 parcels" in str(exc.value)


def test_every_network_has_a_yeo_mapping():
    """NETWORKS and YEO7_FOR_NETWORK must carry the same keys.

    main() builds --network's choices from NETWORKS alone, so a network added to
    one dict and not the other is reachable from the CLI and dies on a raw
    KeyError at --n-units 1000 instead of any of this file's guided SystemExits.
    """
    assert set(B.NETWORKS) == set(B.YEO7_FOR_NETWORK)
    assert all(B.NETWORKS[k] for k in B.NETWORKS)          # no empty region list
    assert all(B.YEO7_FOR_NETWORK[k] for k in B.YEO7_FOR_NETWORK)


# --------------------------------------------------------------------------
# build_mask — dispatch
# --------------------------------------------------------------------------

def test_build_mask_dispatches_by_n_units(monkeypatch):
    _patch_destrieux(monkeypatch, _surf_atlas(
        ["Unknown", "G_precuneus"], left_pairs=[(1, 9)]))
    _patch_schaefer(monkeypatch, SCHAEFER8)

    assert B.build_mask("dmn").shape == (N_VERTS,)          # default is the surface
    assert B.build_mask("dmn", n_units=N_VERTS).shape == (N_VERTS,)

    # the Schaefer branch is reached with n_rois defaulted to 1000, so the 8-label
    # fake trips the count guard — which is itself the proof it routed there
    with pytest.raises(SystemExit) as exc:
        B.build_mask("dmn", n_units=B.SCHAEFER1000_N)
    assert "Schaefer atlas returned 8 labels" in str(exc.value)


def test_build_mask_unknown_space_names_both_valid_ones():
    with pytest.raises(SystemExit) as exc:
        B.build_mask("dmn", n_units=999)
    msg = str(exc.value)
    assert str(N_VERTS) in msg and str(B.SCHAEFER1000_N) in msg


# --------------------------------------------------------------------------
# detect_n_units
# --------------------------------------------------------------------------

def test_detect_n_units_reads_the_last_dim(tmp_path):
    surf = tmp_path / "preds_surface.npy"
    np.save(surf, np.zeros((3, N_VERTS), np.float32))
    assert B.detect_n_units(surf) == N_VERTS

    parcels = tmp_path / "preds_parcels.npy"
    np.save(parcels, np.zeros((4, B.SCHAEFER1000_N), np.float32))
    assert B.detect_n_units(parcels) == B.SCHAEFER1000_N

    # last dim, not "the big one": a 1-D array reports its own length
    flat = tmp_path / "preds_flat.npy"
    np.save(flat, np.zeros(N_VERTS, np.float32))
    assert B.detect_n_units(flat) == N_VERTS


def test_detect_n_units_mmaps_instead_of_loading(tmp_path, monkeypatch):
    """The point of this helper is that it reads a header, not a preds array.

    Real preds_*.npy run to gigabytes and are only being asked their shape, so a
    plain np.load here would pull the whole batch into memory. Assert the mmap is
    actually requested — the returned int alone cannot distinguish the two.
    """
    path = tmp_path / "preds.npy"
    np.save(path, np.zeros((2, B.SCHAEFER1000_N), np.float32))

    seen = []
    real_load = np.load

    def spy(*args, **kwargs):
        seen.append(kwargs)
        return real_load(*args, **kwargs)

    monkeypatch.setattr(B.np, "load", spy)
    assert B.detect_n_units(path) == B.SCHAEFER1000_N

    assert len(seen) == 1
    assert seen[0].get("mmap_mode") == "r"
    # and that mode really does yield a memmap rather than a materialized array
    assert isinstance(real_load(path, mmap_mode="r"), np.memmap)
