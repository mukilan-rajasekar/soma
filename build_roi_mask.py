#!/usr/bin/env python3
"""
build_roi_mask.py — build the a-priori ROI vertex mask on fsaverage5 (20484
vertices) that batch_extract.py uses for the `roi` feature.

WHY AN ROI (and why a-priori):
  A published result finds a GLOBAL TRIBE drive signal does NOT predict YouTube
  most-replayed. So whole-cortex activation is the documented likely-null
  baseline. The distinct, still-open test is whether a specific higher-order
  region tracks human interest. Pre-registering ONE region BEFORE seeing results
  is what keeps this from becoming "try every atlas, keep the best" — the cardinal
  honesty violation.

DEFAULT ROI = Default Mode Network (DMN). Rationale, fixed in advance:
  In naturalistic viewing, the DMN and higher-order association cortex carry the
  strongest, most reliable across-subject responses (the ISC literature), and DMN
  engagement tracks narrative/semantic involvement — the thing an ad's "story"
  drives. It is a principled a-priori choice distinct from the global signal. If
  the team prefers a different a-priori region (e.g. dorsal attention network),
  change --network ONCE, record it in PREREGISTRATION.md, and never switch after
  seeing r.

METHOD (fully reproducible, only needs nilearn):
  Uses the Destrieux surface atlas on fsaverage5 (ships with nilearn) and selects
  the canonical DMN nodes by anatomical label. Vertex order is [left; right],
  matching TRIBE's fsaverage5 output (10242 + 10242 = 20484).

TWO OUTPUT SPACES (--n-units):
  The encoder can emit predictions in EITHER space, and the mask must match:
    --n-units 20484  (default) fsaverage5 cortical SURFACE  -> Destrieux path above.
    --n-units 1000              Schaefer-1000 MNI VOLUME parcels -> Yeo-7 network
                                membership path (documented placeholder, see
                                build_mask_schaefer1000 below).
  Run check_preds_space.py on your preds_*.npy first; it prints which to use. You
  can also pass --from-preds <preds.npy> to auto-detect n_units from the array.

USAGE:
  pip install nilearn
  # fsaverage5 surface (default):
  python build_roi_mask.py --network dmn --out ./data/roi_mask_dmn.npy
  # Schaefer-1000 parcels (auto-detect the unit count from cached preds):
  python build_roi_mask.py --network dmn --from-preds ./data/arcs/preds_foo.npy \
      --out ./data/roi_mask_dmn_schaefer.npy
"""
import argparse

import numpy as np

# Recognized output spaces (last-dim unit counts). See check_preds_space.py.
FSAVERAGE5_N = 20484   # cortical surface vertices ([lh; rh], 10242/hemi)
SCHAEFER1000_N = 1000  # MNI-volume parcels (Schaefer 2018, 1000 rois)

# Canonical DMN nodes expressed as Destrieux region-name substrings (matched
# case-insensitively against both hemispheres). Pre-registered set:
DMN_REGIONS = [
    "G_front_sup",              # medial prefrontal (superior frontal, medial part)
    "G_cingul-Post-dorsal",     # posterior cingulate
    "G_cingul-Post-ventral",    # posterior cingulate (ventral)
    "G_precuneus",              # precuneus
    "G_pariet_inf-Angular",     # angular gyrus (inferior parietal, angular)
    "G_temporal_middle",        # lateral temporal (middle temporal gyrus)
    "S_temporal_sup",           # superior temporal sulcus (lateral temporal)
    "G_front_inf-Orbital",      # ventromedial / orbital prefrontal contribution
]

DORSAL_ATTN_REGIONS = [
    "S_intrapariet_and_P_trans",  # intraparietal sulcus
    "G_precentral",               # frontal eye fields vicinity (precentral)
    "S_precentral-sup-part",
    "G_parietal_sup",
]

# Affect-proxy networks (a-priori, CORTICAL only — see affect_extract.py).
# These are crude a-priori proxies, NOT a trained decoder. Valence lives partly in
# OFC/vmPFC (Chikazoe 2014); arousal is read through cortical proxies (anterior
# insula + ACC) since the subcortical arousal hubs are off the fsaverage5 surface.
VALENCE_REGIONS = [
    "G_orbital",                  # orbitofrontal gyri
    "S_orbital",                  # orbital sulci
    "G_rectus",                   # gyrus rectus (vmPFC)
    "G_front_inf-Orbital",        # ventral/orbital PFC
    "S_suborbital",
]
AROUSAL_REGIONS = [
    "G_insular_short",            # anterior insula
    "S_circular_insula_ant",      # anterior insular sulcus
    "G_and_S_cingul-Ant",         # anterior cingulate
    "G_and_S_cingul-Mid-Ant",     # mid-anterior cingulate
]

# The MESSAGE lane — the a-priori LANGUAGE / semantic-association system (the
# fronto-temporo-parietal language network, the cortex TRIBE's TEXT branch drives).
# Pre-registered a-priori set, expressed as Destrieux region-name substrings
# (matched case-insensitively against both hemispheres), mirroring the DMN/DAN
# pattern exactly. HONESTY: the arc read out of this ROI is "predicted SEMANTIC-
# INTEGRATION LOAD" — a HYPOTHESIS. It is NEVER "the viewer understood the
# message" (no comprehension validation exists yet — see message_extract.py). This
# system partially OVERLAPS the DMN (STS / pMTG / angular are in both); that is
# expected — language and DMN share association cortex — and is not double-dipping
# because the mask is fixed a-priori, before seeing any result.
LANGUAGE_REGIONS = [
    "G_front_inf-Triangul",       # inferior frontal gyrus, pars triangularis (Broca)
    "G_front_inf-Opercular",      # inferior frontal gyrus, pars opercularis (Broca)
    "Pole_temporal",              # temporal pole / anterior temporal lobe (ATL)
    "S_temporal_sup",             # superior temporal sulcus (lexico-semantic)
    "G_temporal_middle",          # posterior middle temporal gyrus (pMTG)
    "G_pariet_inf-Angular",       # angular gyrus (inferior parietal semantic hub)
]

NETWORKS = {"dmn": DMN_REGIONS, "dan": DORSAL_ATTN_REGIONS,
            "valence": VALENCE_REGIONS, "arousal": AROUSAL_REGIONS,
            "language": LANGUAGE_REGIONS}

# --- Schaefer-1000 / Yeo-7 placeholder mapping (for the --n-units 1000 case) ---
# The Schaefer 2018 1000-parcel atlas ships with a Yeo-7 network label baked into
# each parcel name (tokens: Vis, SomMot, DorsAttn, SalVentAttn, Limbic, Cont,
# Default). We select our a-priori networks by that token. This is a DELIBERATELY
# CRUDE proxy, and coarser than the Destrieux surface path:
#   dmn      -> Default        (canonical DMN)
#   dan      -> DorsAttn       (dorsal attention)
#   valence  -> Limbic         (OFC + temporal pole live here; NOT vmPFC-specific)
#   arousal  -> SalVentAttn    (anterior insula + ACC salience ~ arousal proxy)
#   language -> Default+Cont   (Yeo-7 has NO language network; the fronto-temporo-
#                               parietal language system splits across Default
#                               (temporal/angular) + Cont (frontal control) — the
#                               LOOSEST proxy in this file, use the surface path)
# HONESTY: the valence/arousal->Yeo mappings are looser than the surface ROIs
# (a whole Yeo network, not hand-picked OFC/insula labels). Treat any 1000-parcel
# affect arc as EVEN MORE hypothesis-grade than the surface one. The language->Yeo
# mapping is looser STILL (a union of TWO whole networks, because Yeo-7 has no
# dedicated language parcellation) — strongly prefer the surface Destrieux path for
# the message lane. This whole path is a documented PLACEHOLDER: it is NOT yet
# smoke-tested against real 1000-parcel preds (our synthetic fixtures are all
# fsaverage5/20484), so verify the parcel order and label tokens on a real Schaefer
# preds batch before trusting it.
YEO7_FOR_NETWORK = {
    "dmn": ["Default"],
    "dan": ["DorsAttn"],
    "valence": ["Limbic"],
    "arousal": ["SalVentAttn"],
    "language": ["Default", "Cont"],
}


def build_mask_surface(network="dmn"):
    """fsaverage5 SURFACE (20484) mask via the Destrieux atlas. Unchanged path."""
    from nilearn import datasets

    regions = NETWORKS[network]
    atlas = datasets.fetch_atlas_surf_destrieux()
    labels = [l.decode() if isinstance(l, bytes) else str(l) for l in atlas["labels"]]

    def hemi_mask(map_arr):
        m = np.zeros(len(map_arr), bool)
        for i, name in enumerate(labels):
            if any(r.lower() in name.lower() for r in regions):
                m |= (np.asarray(map_arr) == i)
        return m

    left = hemi_mask(atlas["map_left"])
    right = hemi_mask(atlas["map_right"])
    mask = np.concatenate([left, right])  # [lh; rh] to match TRIBE fsaverage5 order

    if mask.shape[0] != FSAVERAGE5_N:
        raise SystemExit(
            f"Mask length {mask.shape[0]} != {FSAVERAGE5_N}. Destrieux fsaverage5 "
            f"should be 10242/hemi; check the nilearn version/atlas resolution before "
            f"trusting this ROI.")
    if mask.sum() == 0:
        raise SystemExit(
            "ROI selected 0 vertices - the Destrieux label names did not match. "
            "Print `atlas['labels']` and adjust the region substrings.")
    return mask


def build_mask_schaefer1000(network="dmn", n_rois=SCHAEFER1000_N, yeo_networks=7):
    """
    Schaefer-1000 MNI-VOLUME (1000) mask via Yeo-7 network membership.

    DOCUMENTED PLACEHOLDER (see YEO7_FOR_NETWORK): builds a boolean mask of length
    n_rois where True == the parcel belongs to the mapped Yeo-7 network. Parcel
    order follows the Schaefer atlas label order (parcel i <-> labels[i]), which is
    the same order the encoder emits its 1000-dim vector in. This is coarser than
    the surface Destrieux path; keep the honesty caveats above in mind.
    """
    from nilearn import datasets

    keys = YEO7_FOR_NETWORK[network]
    atlas = datasets.fetch_atlas_schaefer_2018(n_rois=n_rois, yeo_networks=yeo_networks)
    labels = [l.decode() if isinstance(l, bytes) else str(l) for l in atlas["labels"]]

    mask = np.array(
        [any(k.lower() in name.lower() for k in keys) for name in labels], bool)

    if mask.shape[0] != n_rois:
        raise SystemExit(
            f"Schaefer atlas returned {mask.shape[0]} labels != n_rois {n_rois}. "
            f"Check the nilearn fetch_atlas_schaefer_2018 version/args before trusting "
            f"this parcel mask.")
    if mask.sum() == 0:
        raise SystemExit(
            f"Network {network!r} matched 0 parcels via Yeo-7 tokens {keys}. Print "
            f"`atlas['labels']` and adjust YEO7_FOR_NETWORK (the label token spelling "
            f"can vary across nilearn versions).")
    return mask


def build_mask(network="dmn", n_units=FSAVERAGE5_N):
    """Dispatch to the surface (20484) or Schaefer-1000 (1000) builder."""
    if n_units == FSAVERAGE5_N:
        return build_mask_surface(network)
    if n_units == SCHAEFER1000_N:
        return build_mask_schaefer1000(network)
    raise SystemExit(
        f"--n-units {n_units} unrecognized: expected {FSAVERAGE5_N} (fsaverage5 "
        f"surface) or {SCHAEFER1000_N} (Schaefer-1000). Run check_preds_space.py on "
        f"your preds to see which space they are in.")


def detect_n_units(preds_path):
    """Read a preds_*.npy header (mmap, no full load) -> last-dim unit count."""
    arr = np.load(preds_path, mmap_mode="r")
    n = int(arr.shape[-1])
    del arr
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--network", choices=list(NETWORKS), default="dmn")
    ap.add_argument("--out", default="./data/roi_mask_dmn.npy")
    ap.add_argument("--n-units", type=int, choices=[FSAVERAGE5_N, SCHAEFER1000_N],
                    default=FSAVERAGE5_N,
                    help=f"output space: {FSAVERAGE5_N}=fsaverage5 surface (default), "
                         f"{SCHAEFER1000_N}=Schaefer-1000 parcels. Ignored if "
                         f"--from-preds is given.")
    ap.add_argument("--from-preds", default=None,
                    help="auto-detect --n-units from this preds_*.npy (overrides "
                         "--n-units). Same detection check_preds_space.py uses.")
    args = ap.parse_args()

    n_units = args.n_units
    if args.from_preds:
        n_units = detect_n_units(args.from_preds)
        print(f"[auto] detected n_units={n_units} from {args.from_preds}")

    mask = build_mask(args.network, n_units=n_units)
    np.save(args.out, mask)
    space = "fsaverage5-surface" if n_units == FSAVERAGE5_N else "schaefer1000-mni"
    unit_word = "vertices" if n_units == FSAVERAGE5_N else "parcels"
    print(f"[wrote] {args.out}  network={args.network}  space={space}  "
          f"{int(mask.sum())}/{mask.shape[0]} {unit_word} "
          f"({mask.mean():.1%} of cortex)")
    if n_units == SCHAEFER1000_N:
        print("[note] Schaefer-1000 Yeo-7 path is a DOCUMENTED PLACEHOLDER "
              "(coarser than the surface ROI, untested on real 1000-parcel preds) "
              "- see YEO7_FOR_NETWORK caveats.")
    print("Record this ROI choice in PREREGISTRATION.md and do NOT change it after "
          "seeing results.")


if __name__ == "__main__":
    main()
