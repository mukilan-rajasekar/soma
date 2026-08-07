#!/usr/bin/env python3
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from tools.readout.windows import find_windows  # noqa: E402


def test_flat_lane_has_no_windows():
    lane = np.ones(20)

    assert find_windows(lane) == []


def test_deep_dip_yields_one_window():
    lane = 0.6 + 0.08 * np.sin(np.linspace(0, 4 * np.pi, 24))
    lane[8:12] = -0.4
    visual = 0.2 + 0.05 * np.cos(np.linspace(0, 4 * np.pi, 24))

    windows = find_windows(lane, visual_lane=visual, lane_name="salventattn")

    assert len(windows) == 1
    assert windows[0]["lane"] == "salventattn"
    assert windows[0]["start_s"] == 8
    assert windows[0]["end_s"] == 12
    assert windows[0]["secs"] == 4
    assert windows[0]["depth"] > 1.25
    assert isinstance(windows[0]["vis_partial"], float)


def test_edges_snap_to_nearby_shot_bounds():
    lane = 0.6 + 0.08 * np.sin(np.linspace(0, 4 * np.pi, 24))
    lane[6:10] = -0.5
    shots = [(0.0, 6.4), (6.4, 10.2), (10.2, 24.0)]

    windows = find_windows(lane, shot_bounds=shots)

    assert len(windows) == 1
    assert windows[0]["start_s"] == 6.4
    assert windows[0]["end_s"] == 10.2
    assert windows[0]["shot_index"] == 2
