"""
Measures the screen angle of straight edges, to check art against the game's
isometric projection (ground edges at 30° = true isometric).

    python tools/measure_iso_angles.py props           # every prop source on the sheets
    python tools/measure_iso_angles.py render shot.png # a game screenshot (grid on)

`props`  : runs edge detection on each prop's source box (alpha-masked) and
           prints the dominant non-vertical edge angle, folded to 0–90°.
`render` : separates the cyan debug grid from the wooden bench pixels and
           reports the dominant angle of each, so they can be compared directly.

Angles are length-weighted from a probabilistic Hough transform.
Requires opencv-python, numpy.
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def edge_angles(gray: np.ndarray, min_len: int, gap: int = 3, canny: bool = True) -> Counter:
    edges = cv2.Canny(gray, 60, 160) if canny else gray
    lines = cv2.HoughLinesP(edges, 1, np.pi / 720, 30, minLineLength=min_len, maxLineGap=gap)
    out: Counter = Counter()
    if lines is None:
        return out
    for x0, y0, x1, y1 in lines.reshape(-1, 4).astype(int):
        a = math.degrees(math.atan2(-(y1 - y0), x1 - x0)) % 180
        folded = a if a <= 90 else 180 - a
        if folded < 10 or folded > 75:  # horizontals / vertical posts
            continue
        out[round(folded, 1)] += int(math.hypot(x1 - x0, y1 - y0))
    return out


def weighted_mean(c: Counter, lo: float, hi: float) -> float | None:
    items = [(a, w) for a, w in c.items() if lo <= a <= hi]
    tot = sum(w for _, w in items)
    return sum(a * w for a, w in items) / tot if tot else None


def measure_props() -> None:
    s = (ROOT / "src/assets/conceptProps.generated.ts").read_text(encoding="utf-8")
    entries = json.loads(s[s.index("= [") + 2 : s.rindex(";")])
    sheets = {
        "v2": cv2.imread(str(ROOT / "concept/blockout-props-sheet-v2.png"), cv2.IMREAD_UNCHANGED),
        "bench": cv2.imread(str(ROOT / "concept/bench-angles.png"), cv2.IMREAD_UNCHANGED),
    }
    total: Counter = Counter()
    for e in entries:
        sheet = sheets["bench"] if e["key"].startswith("bench-r") else sheets["v2"]
        x0, y0, x1, y1 = e["sourceBox"]
        crop = sheet[y0:y1, x0:x1]
        gray = cv2.cvtColor(crop[..., :3], cv2.COLOR_BGR2GRAY)
        gray[crop[..., 3] <= 110] = 0
        c = edge_angles(gray, 40)
        total.update(c)
        m = weighted_mean(c, 20, 40)
        print(f"{e['key']:18s} {'-' if m is None else f'{m:5.1f}°'}")
    print(f"\nALL PROPS (20–40° band): {weighted_mean(total, 20, 40):.2f}°   (true iso 30.00°, 2:1 = 26.57°)")


def measure_render(path: str) -> None:
    img = cv2.imread(path)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Debug grid lines are bright cyan; bench wood is saturated orange.
    grid = cv2.inRange(hsv, (80, 120, 150), (100, 255, 255))
    wood = cv2.inRange(hsv, (5, 120, 120), (22, 255, 255))
    # Grid lines are 1-px stair-stepped lines: fit them directly (no edge detector).
    g = weighted_mean(edge_angles(grid, 40, gap=8, canny=False), 20, 40)
    w = weighted_mean(edge_angles(wood, 30), 20, 40)
    if g is None or w is None:
        print("could not find grid or bench edges in", path)
        return
    print(f"floor grid edges : {g:.2f}°")
    print(f"bench wood edges : {w:.2f}°  (all benches; plank and shading edges make this noisy —\n                   use `props` mode for per-view angles of the art itself)")
    print(f"difference       : {abs(g - w):.2f}°")

if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "props":
        measure_props()
    elif len(sys.argv) >= 3 and sys.argv[1] == "render":
        measure_render(sys.argv[2])
    else:
        print(__doc__)
