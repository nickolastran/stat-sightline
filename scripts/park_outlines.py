"""
Each MLB park's playing field — the outfield wall and the foul-ground fences
round to the backstop — as its distance from home plate at every whole degree,
from straight back (-180) through center field (0) to 179.

Traced from Gameday's park drawings by GeomMLBStadiums (MIT, Ben Dilday,
https://github.com/bdilday/GeomMLBStadiums). The shape is what's kept: the
spray chart rescales each to MLB's listed distances, so the trace's own scale
doesn't matter. The Rangers and Athletics have moved parks since the trace,
so they're left out and drawn from their listed distances alone.

    python scripts/park_outlines.py > frontend/lib/park-outlines.json
"""
import csv
import io
import json
import math
import urllib.request

import numpy as np

URL = "https://raw.githubusercontent.com/bdilday/GeomMLBStadiums/main/inst/extdata/mlb_stadia_paths.csv"

TEAM_IDS = {
    "angels": 108, "astros": 117, "blue_jays": 141, "braves": 144,
    "brewers": 158, "cardinals": 138, "cubs": 112, "diamondbacks": 109,
    "dodgers": 119, "giants": 137, "guardians": 114, "mariners": 136,
    "marlins": 146, "mets": 121, "nationals": 120, "orioles": 110,
    "padres": 135, "phillies": 143, "pirates": 134, "rays": 139,
    "red_sox": 111, "reds": 113, "rockies": 115, "royals": 118,
    "tigers": 116, "twins": 142, "white_sox": 145, "yankees": 147,
}

rows = csv.DictReader(io.TextIOWrapper(urllib.request.urlopen(URL)))
walls: dict[str, list[tuple[float, float]]] = {}
for r in rows:
    if r["segment"] == "outfield_outer" and r["team"] in TEAM_IDS:
        # Gameday units to feet off the plate, the same as lib/spray.ts.
        x = (float(r["x"]) - 125.42) * 2.5
        y = (198.27 - float(r["y"])) * 2.5
        deg = math.degrees(math.atan2(x, y))
        walls.setdefault(r["team"], []).append((deg, math.hypot(x, y)))

out = {}
for team, pts in sorted(walls.items()):
    pts.sort()
    deg, dist = zip(*pts)
    out[TEAM_IDS[team]] = [round(d) for d in np.interp(range(-180, 180), deg, dist, period=360)]
print(json.dumps(out, separators=(",", ":")))
