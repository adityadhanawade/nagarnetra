import asyncio
import hmac
import io
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from db import get_db
from detection import (
    classify_congestion,
    classify_waterlogging,
    count_vehicles,
    detect_road_damage,
    load_damage_model,
    load_model,
    load_water_model,
)

log = logging.getLogger("nagarnetra")

BUS_ID_PATTERN = r"^[A-Za-z0-9_-]{1,32}$"
MAX_FRAME_BYTES = 3_000_000
MAX_FRAME_PIXELS = 20_000_000  # a 4K frame is 8 million; anything past this is a decompression bomb
MAX_CONCURRENT_FRAMES = 2
SPEED_MAX_AGE = timedelta(seconds=60)

# Devices send a position about every 2 s and a frame about every 3 s; these limits leave 4x headroom.
LOCATION_LIMIT = (120, 60.0)  # requests, per seconds, per bus
FRAME_LIMIT = (40, 60.0)

Image.MAX_IMAGE_PIXELS = MAX_FRAME_PIXELS

_frame_slots = asyncio.Semaphore(MAX_CONCURRENT_FRAMES)


@asynccontextmanager
async def lifespan(_app):
    await run_in_threadpool(load_model)
    await run_in_threadpool(load_damage_model)
    await run_in_threadpool(load_water_model)
    if not os.getenv("DEVICE_KEY"):
        log.warning("DEVICE_KEY is not set: write endpoints are open. Fine on localhost, never in production.")
    yield


app = FastAPI(title="NagarNetra API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Device-Key"],
)

IssueType = Literal["pothole", "damaged_road", "waterlogging"]


def require_device_key(x_device_key: str | None = Header(default=None)):
    """Write endpoints need the shared device key when DEVICE_KEY is set in backend/.env."""
    expected = os.getenv("DEVICE_KEY")
    if expected and not hmac.compare_digest(x_device_key or "", expected):
        raise HTTPException(status_code=401, detail="Missing or wrong device key")


_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(scope: str, bus_id: str, limit: tuple[int, float]):
    count, window = limit
    now = time.monotonic()
    hits = _hits[f"{scope}:{bus_id}"]
    while hits and now - hits[0] > window:
        hits.popleft()
    if len(hits) >= count:
        raise HTTPException(status_code=429, detail="Too many requests from this bus, slow down")
    hits.append(now)
    if len(_hits) > 5000:  # forget buses that have gone quiet
        for key in [k for k, v in _hits.items() if not v or now - v[-1] > window]:
            del _hits[key]


class LocationIn(BaseModel):
    bus_id: str = Field(pattern=BUS_ID_PATTERN)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)
    speed_kmh: float | None = Field(default=None, ge=0, le=200, allow_inf_nan=False)
    heading: float | None = Field(default=None, ge=0, le=360, allow_inf_nan=False)


def run(query):
    """Runs a Supabase query. Database detail goes to the log, never to the caller."""
    try:
        return query.execute().data
    except APIError as e:
        if e.code == "23503":
            raise HTTPException(status_code=404, detail="Unknown bus_id")
        log.error("database rejected a query: %s %s", e.code, e.message)
        raise HTTPException(status_code=400, detail="The database rejected this request")
    except httpx.HTTPError as e:
        log.error("database unreachable: %r", e)
        raise HTTPException(status_code=503, detail="Database temporarily unreachable")


def arun(query):
    return run_in_threadpool(run, query)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "models": {
            "vehicles": load_model() is not None,
            "road_damage": load_damage_model() is not None,
            "waterlogging": load_water_model() is not None,
        },
        "device_key_required": bool(os.getenv("DEVICE_KEY")),
    }


@app.get("/api/buses")
def list_buses():
    return run(get_db().table("buses").select("*").order("id"))


@app.post("/api/location", status_code=201, dependencies=[Depends(require_device_key)])
def post_location(body: LocationIn):
    rate_limit("location", body.bus_id, LOCATION_LIMIT)
    return run(get_db().table("bus_positions").insert(body.model_dump(exclude_none=True)))[0]


def log_issue(bus_id: str, lat: float, lng: float, issue_type: str, confidence: float):
    run(
        get_db().rpc(
            "report_issue",
            {"p_type": issue_type, "p_lat": lat, "p_lng": lng, "p_confidence": confidence, "p_bus_id": bus_id},
        )
    )


def recent_speed_kmh(bus_id: str):
    rows = run(
        get_db()
        .table("bus_positions")
        .select("speed_kmh,recorded_at")
        .eq("bus_id", bus_id)
        .order("recorded_at", desc=True)
        .limit(1)
    )
    if not rows or rows[0]["speed_kmh"] is None:
        return None
    if datetime.now(timezone.utc) - datetime.fromisoformat(rows[0]["recorded_at"]) > SPEED_MAX_AGE:
        return None
    return rows[0]["speed_kmh"]


def decode_frame(data: bytes) -> Image.Image:
    """Decodes once, applies the phone's rotation flag, and returns an RGB image every model can share."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.width * img.height > MAX_FRAME_PIXELS:
                raise HTTPException(status_code=413, detail="Image resolution too large")
            img.load()
            return ImageOps.exif_transpose(img).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise HTTPException(status_code=400, detail="Not a valid image")


def best_per_class(damage: list[dict]) -> dict:
    best: dict = {}
    for found in damage:
        if found["class"] not in best or found["confidence"] > best[found["class"]]["confidence"]:
            best[found["class"]] = found
    return best


@app.post("/api/detect-frame", dependencies=[Depends(require_device_key)])
async def detect_frame(
    bus_id: str = Form(pattern=BUS_ID_PATTERN),
    lat: float = Form(ge=-90, le=90, allow_inf_nan=False),
    lng: float = Form(ge=-180, le=180, allow_inf_nan=False),
    image: UploadFile = File(),
):
    rate_limit("frame", bus_id, FRAME_LIMIT)
    data = await image.read(MAX_FRAME_BYTES + 1)  # never buffers more than the cap
    if len(data) > MAX_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="Frame too large")
    if _frame_slots.locked():
        raise HTTPException(status_code=429, detail="Server is busy with other frames, try again shortly")

    async with _frame_slots:
        frame = await run_in_threadpool(decode_frame, data)
        width, height = frame.size
        if not await arun(get_db().table("buses").select("id").eq("id", bus_id)):
            raise HTTPException(status_code=404, detail="Unknown bus_id")

        vehicles, damage, waterlogging, speed = await asyncio.gather(
            run_in_threadpool(count_vehicles, frame),
            run_in_threadpool(detect_road_damage, frame),
            run_in_threadpool(classify_waterlogging, frame),
            run_in_threadpool(recent_speed_kmh, bus_id),
        )

    congestion = classify_congestion(vehicles["count"], speed)
    issues = [(f["class"], f["confidence"]) for f in best_per_class(damage).values()]
    if waterlogging and waterlogging["flooded"]:
        issues.append(("waterlogging", waterlogging["probability"]))

    await asyncio.gather(
        *(run_in_threadpool(log_issue, bus_id, lat, lng, kind, conf) for kind, conf in issues),
        arun(
            get_db().table("traffic_observations").insert(
                {
                    "bus_id": bus_id,
                    "lat": lat,
                    "lng": lng,
                    "vehicle_count": vehicles["count"],
                    "vehicle_breakdown": vehicles["breakdown"],
                    "avg_speed_kmh": speed,
                    "congestion": congestion,
                }
            )
        ),
    )
    return {
        "received": True,
        "width": width,
        "height": height,
        "vehicles": {"count": vehicles["count"], "breakdown": vehicles["breakdown"]},
        "congestion": congestion,
        "speed_kmh": speed,
        "detections": vehicles["detections"],
        "road_damage": sorted(damage, key=lambda d: d["confidence"], reverse=True)[:20],
        "waterlogging": waterlogging,
    }


@app.get("/api/issues")
def ranked_issues(limit: int = Query(50, ge=1, le=500), status: Literal["open", "resolved"] = "open"):
    return run(
        get_db()
        .table("detected_issues")
        .select("*")
        .eq("status", status)
        .order("detection_count", desc=True)
        .order("last_seen", desc=True)
        .limit(limit)
    )
