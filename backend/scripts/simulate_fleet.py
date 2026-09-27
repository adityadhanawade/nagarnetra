"""Fills the database with a simulated bus fleet on the real Pune routes, for demos and dashboard work.

    python scripts/simulate_fleet.py --seed    # last 6 hours of history
    python scripts/simulate_fleet.py --live    # keep sending positions every few seconds (Ctrl+C to stop)
    python scripts/simulate_fleet.py --clear   # remove all positions, traffic readings and issues

This is demo data. The dashboard labels it as such.
"""
import argparse
import json
import math
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import get_db  # noqa: E402
from detection import classify_congestion  # noqa: E402

ROUTES_FILE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "routes.json"
IST = timezone(timedelta(hours=5, minutes=30))

# route numbers are real PMPML routes (see build_routes.py); the buses on them are simulated
BUSES = {"R2A-B01": "R2A", "R2A-B02": "R2A", "R100-B01": "R100", "R175-B01": "R175"}
FREE_FLOW_KMH = {"R2A": 24, "R100": 32, "R175": 28}
# (start, end, speed factor): stretches of each route where traffic reliably bunches up
BOTTLENECKS = {"R2A": [(0.35, 0.55, 0.35)], "R100": [(0.1, 0.3, 0.4)], "R175": [(0.5, 0.7, 0.45)]}
ISSUE_SPOTS = {"R2A": [0.15, 0.4, 0.62, 0.85], "R100": [0.2, 0.5, 0.75], "R175": [0.3, 0.6, 0.88]}
FORCED_TYPE = {("R2A", 0.4): "waterlogging", ("R175", 0.6): "waterlogging"}
LIVE_STEP_SECONDS = 3
# live mode only: an ongoing incident that holds a route well below its usual speed
LIVE_SLOWDOWN = {"R100": 0.5}
EARTH_RADIUS_M = 6371000


def distance_m(a, b):
    d_lat = math.radians(b[0] - a[0])
    d_lng = math.radians(b[1] - a[1])
    h = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(d_lng / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def load_routes():
    routes = {}
    for r in json.loads(ROUTES_FILE.read_text()):
        cumulative = [0.0]
        for i in range(1, len(r["points"])):
            cumulative.append(cumulative[-1] + distance_m(r["points"][i - 1], r["points"][i]))
        routes[r["id"]] = {"points": r["points"], "cumulative": cumulative, "length": cumulative[-1]}
    return routes


def point_at(route, progress):
    target = progress * route["length"]
    cum = route["cumulative"]
    lo, hi = 0, len(cum) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if cum[mid] <= target:
            lo = mid
        else:
            hi = mid
    span = (cum[hi] - cum[lo]) or 1
    f = (target - cum[lo]) / span
    a, b = route["points"][lo], route["points"][hi]
    return round(a[0] + (b[0] - a[0]) * f, 6), round(a[1] + (b[1] - a[1]) * f, 6)


def speed_kmh(route_id, progress, when):
    hour = when.astimezone(IST).hour
    rush = 0.55 if hour in (8, 9, 10, 17, 18, 19, 20) else 0.9
    factor = rush
    for start, end, slow in BOTTLENECKS[route_id]:
        if start <= progress <= end:
            factor *= slow
    return max(2.0, round(FREE_FLOW_KMH[route_id] * factor * random.uniform(0.85, 1.15), 1))


def vehicle_reading(speed, route_id):
    slowdown = max(0.0, 1 - speed / FREE_FLOW_KMH[route_id])
    count = max(0, min(24, round(2 + slowdown * 16 + random.uniform(-2, 2))))
    mix = {"motorcycle": 0.45, "car": 0.4, "truck": 0.1, "bus": 0.05}
    breakdown = {name: 0 for name in mix}
    for _ in range(count):
        breakdown[random.choices(list(mix), weights=list(mix.values()))[0]] += 1
    return count, breakdown


def ensure_buses(db):
    db.table("buses").upsert(
        [{"id": bus_id, "route_code": route, "label": f"Route {route[1:]}, Bus {bus_id[-2:].lstrip('0')}"} for bus_id, route in BUSES.items()]
    ).execute()


def insert_batches(db, table, rows, size=400):
    for i in range(0, len(rows), size):
        db.table(table).insert(rows[i : i + size]).execute()


def seed(db, routes, hours=6):
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)
    positions, traffic = [], []
    progress = {bus_id: random.random() for bus_id in BUSES}
    step = timedelta(seconds=60)
    t = start
    tick = 0
    while t <= now:
        for bus_id, route_id in BUSES.items():
            route = routes[route_id]
            speed = speed_kmh(route_id, progress[bus_id], t)
            progress[bus_id] = (progress[bus_id] + speed / 3.6 * step.total_seconds() / route["length"]) % 1
            lat, lng = point_at(route, progress[bus_id])
            positions.append({"bus_id": bus_id, "lat": lat, "lng": lng, "speed_kmh": speed, "recorded_at": t.isoformat()})
            if tick % 2 == 0:
                count, breakdown = vehicle_reading(speed, route_id)
                traffic.append(
                    {
                        "bus_id": bus_id, "lat": lat, "lng": lng, "vehicle_count": count, "vehicle_breakdown": breakdown,
                        "avg_speed_kmh": speed, "congestion": classify_congestion(count, speed), "recorded_at": t.isoformat(),
                    }
                )
        t += step
        tick += 1

    issues = []
    for route_id, spots in ISSUE_SPOTS.items():
        bus_id = next(b for b, r in BUSES.items() if r == route_id)
        for at in spots:
            lat, lng = point_at(routes[route_id], at)
            passes = random.choice([1, 1, 2, 3, 4, 6, 9, 12, 15])
            issues.append(
                {
                    "type": FORCED_TYPE.get((route_id, at)) or random.choice(["pothole", "pothole", "damaged_road"]),
                    "lat": lat, "lng": lng,
                    "confidence": round(random.uniform(0.45, 0.95), 2),
                    "detection_count": passes,
                    "status": "open",
                    "first_seen": (now - timedelta(hours=random.uniform(hours, hours + 60))).isoformat(),
                    "last_seen": (now - timedelta(minutes=random.uniform(2, 240))).isoformat(),
                    "last_bus_id": bus_id,
                }
            )
    insert_batches(db, "bus_positions", positions)
    insert_batches(db, "traffic_observations", traffic)
    insert_batches(db, "detected_issues", issues)
    print(f"seeded {len(positions)} positions, {len(traffic)} traffic readings, {len(issues)} issues")


def live(db, routes):
    latest = db.table("bus_positions").select("bus_id,lat,lng").order("recorded_at", desc=True).limit(50).execute().data
    progress = {bus_id: random.random() for bus_id in BUSES}
    seen = {r["bus_id"] for r in latest}
    print(f"live mode for {len(BUSES)} buses, one update every {LIVE_STEP_SECONDS}s. Ctrl+C to stop. (positions already stored for {len(seen)} buses)")
    tick = 0
    while True:
        now = datetime.now(timezone.utc)
        rows, traffic = [], []
        for bus_id, route_id in BUSES.items():
            route = routes[route_id]
            speed = max(2.0, round(speed_kmh(route_id, progress[bus_id], now) * LIVE_SLOWDOWN.get(route_id, 1), 1))
            before = progress[bus_id]
            progress[bus_id] = (before + speed / 3.6 * LIVE_STEP_SECONDS / route["length"]) % 1
            lat, lng = point_at(route, progress[bus_id])
            rows.append({"bus_id": bus_id, "lat": lat, "lng": lng, "speed_kmh": speed, "recorded_at": now.isoformat()})
            if tick % 4 == 0:
                count, breakdown = vehicle_reading(speed, route_id)
                traffic.append(
                    {"bus_id": bus_id, "lat": lat, "lng": lng, "vehicle_count": count, "vehicle_breakdown": breakdown,
                     "avg_speed_kmh": speed, "congestion": classify_congestion(count, speed)}
                )
            for at in ISSUE_SPOTS[route_id]:
                crossed = before < at <= progress[bus_id] or (progress[bus_id] < before and (at > before or at <= progress[bus_id]))
                if crossed:
                    ilat, ilng = point_at(route, at)
                    db.rpc("report_issue", {"p_type": "pothole", "p_lat": ilat, "p_lng": ilng, "p_confidence": round(random.uniform(0.5, 0.9), 2), "p_bus_id": bus_id}).execute()
                    print(f"{bus_id} passed a known road-damage spot on {route_id}")
        db.table("bus_positions").insert(rows).execute()
        if traffic:
            db.table("traffic_observations").insert(traffic).execute()
        tick += 1
        time.sleep(LIVE_STEP_SECONDS)


def clear(db):
    for table in ("bus_positions", "traffic_observations", "detected_issues"):
        db.table(table).delete().neq("id", 0).execute()
    print("cleared bus_positions, traffic_observations, detected_issues")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", action="store_true")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--clear", action="store_true")
    args = parser.parse_args()
    if not (args.seed or args.live or args.clear):
        parser.error("choose --seed, --live or --clear")

    database = get_db()
    route_data = load_routes()
    if args.clear:
        clear(database)
    if args.seed:
        ensure_buses(database)
        seed(database, route_data)
    if args.live:
        ensure_buses(database)
        try:
            live(database, route_data)
        except KeyboardInterrupt:
            print("stopped")
