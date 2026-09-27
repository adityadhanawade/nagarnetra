"""Builds frontend/src/data/routes.json: road-following paths for the demo routes, from the free OSRM demo server.

    python scripts/build_routes.py

The route numbers and end points come from PMPML's published route lists. The paths are NOT PMPML's official
stop-by-stop alignment: they are the fastest driving road between the waypoints below, which is close enough
for a demo. Waypoints are (lat, lng), approximate landmark positions.
"""
import json
import math
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "routes.json"
MIN_SPACING_M = 120  # thin dense bends, but never drop the points on long straights

ROUTES = [
    {
        "id": "R2A", "label": "Route 2A", "name": "Katraj to Shivaji Nagar", "pins": [0.22, 0.5, 0.78],
        "waypoints": [(18.4575, 73.8670), (18.4720, 73.8590), (18.5018, 73.8636), (18.5308, 73.8475)],
    },
    {
        "id": "R100", "label": "Route 100", "name": "Manapa Bhavan to Hinjewadi Phase 3", "pins": [0.4],
        "waypoints": [(18.5222, 73.8547), (18.5580, 73.8075), (18.5800, 73.8100), (18.5993, 73.7640), (18.5860, 73.6880)],
    },
    {
        "id": "R175", "label": "Route 175", "name": "Shaniwar Wada to Hadapsar", "pins": [0.55],
        "waypoints": [(18.5195, 73.8553), (18.5289, 73.8744), (18.5197, 73.9050), (18.5089, 73.9259)],
    },
]


def metres(a, b):
    return math.hypot((a[0] - b[0]) * 111000, (a[1] - b[1]) * 105000)


def road_path(waypoints):
    coords = ";".join(f"{lng},{lat}" for lat, lng in waypoints)
    url = f"https://router.project-osrm.org/route/v1/driving/{coords}"
    data = httpx.get(url, params={"overview": "full", "geometries": "geojson"}, timeout=60).json()
    if data.get("code") != "Ok":
        raise SystemExit(f"OSRM failed: {data}")
    line = [(lat, lng) for lng, lat in data["routes"][0]["geometry"]["coordinates"]]
    thinned = [line[0]]
    for point in line[1:-1]:
        if metres(thinned[-1], point) >= MIN_SPACING_M:
            thinned.append(point)
    thinned.append(line[-1])
    return [[round(lat, 5), round(lng, 5)] for lat, lng in thinned], data["routes"][0]["distance"] / 1000


if __name__ == "__main__":
    out = []
    for route in ROUTES:
        points, km = road_path(route["waypoints"])
        print(f'{route["label"]}: {km:.1f} km, {len(points)} points')
        out.append({"id": route["id"], "label": route["label"], "name": route["name"], "pins": route["pins"], "points": points})
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print("wrote", OUT)
