#!/usr/bin/env python3
"""detectable_r's parameters must reach the arithmetic.

The function documented `alpha` and `power` and then hardcoded both z-scores to the
.05/.80 pair. Both in-repo call sites use the defaults, so nothing it has printed was
wrong — but the moment someone sizes a corpus at power .90 (the natural thing to do when
scoping a bigger run) it silently answered the .80 question instead.

Run: .venv/bin/python -m pytest -q test_corpus_audit.py
"""

import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.corpus.audit import detectable_r  # noqa: E402


def test_defaults_reproduce_the_previously_hardcoded_pair():
    # The old constants were z_alpha=1.96, z_beta=0.8416. Anything that moved the default
    # answer would invalidate the detectable-effect figures already quoted in
    # tools/corpus/subset.py's docstring and in the pilot write-ups.
    assert detectable_r(50) == pytest.approx(math.tanh(2.8016 / math.sqrt(47)), abs=1e-4)
    assert detectable_r(50) == pytest.approx(0.388, abs=1e-3)


def test_raising_power_raises_the_detectable_effect():
    # More power at fixed n means only a LARGER effect is detectable. When z_beta was
    # hardcoded these three were identical.
    at80 = detectable_r(50, power=0.80)
    at90 = detectable_r(50, power=0.90)
    at95 = detectable_r(50, power=0.95)

    assert at80 < at90 < at95
    assert at90 == pytest.approx(math.tanh((1.9600 + 1.2816) / math.sqrt(47)), abs=1e-4)


def test_tightening_alpha_raises_the_detectable_effect():
    assert detectable_r(50, alpha=0.05) < detectable_r(50, alpha=0.01)


def test_more_samples_lower_the_detectable_effect():
    assert detectable_r(200) < detectable_r(100) < detectable_r(50)


def test_degenerate_inputs():
    assert math.isnan(detectable_r(5))
    for bad in (0.0, 1.0, -0.1, 1.5):
        with pytest.raises(ValueError, match="alpha"):
            detectable_r(50, alpha=bad)
        with pytest.raises(ValueError, match="power"):
            detectable_r(50, power=bad)


def test_bad_probabilities_raise_at_every_n():
    # A caller error must not be reported as "too few rows". Validation runs before the
    # n < 6 early return, so an invalid alpha raises at n=3 exactly as it does at n=50.
    with pytest.raises(ValueError, match="alpha"):
        detectable_r(3, alpha=5.0)
    with pytest.raises(ValueError, match="power"):
        detectable_r(3, power=0.0)
    # A valid call below the floor still returns NaN rather than raising.
    assert math.isnan(detectable_r(3, alpha=0.05, power=0.90))
