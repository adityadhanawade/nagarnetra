"""Backend tests. They never touch the real database or load the AI models."""
import io
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent))

import main  # noqa: E402
from detection import classify_congestion  # noqa: E402


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.delenv("DEVICE_KEY", raising=False)
    main._hits.clear()
    monkeypatch.setattr(main, "load_model", lambda: None)
    monkeypatch.setattr(main, "load_damage_model", lambda: None)
    monkeypatch.setattr(main, "load_water_model", lambda: None)
    return TestClient(main.app)


def jpeg(size=(64, 64)):
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 120, 120)).save(buf, "JPEG")
    return buf.getvalue()


def frame_form(**over):
    return {"bus_id": "R07-B01", "lat": "18.5", "lng": "73.8", **over}


# congestion rating
@pytest.mark.parametrize(
    "count,speed,expected",
    [(0, None, "free"), (5, None, "moderate"), (10, None, "heavy"), (16, None, "gridlock"),
     (8, 3, "gridlock"), (12, 40, "moderate"), (3, 60, "free")],
)
def test_congestion(count, speed, expected):
    assert classify_congestion(count, speed) == expected


# input validation
@pytest.mark.parametrize("lat", ["nan", "inf", "1e400", "-91", "abc"])
def test_frame_rejects_bad_latitude(client, lat):
    r = client.post("/api/detect-frame", data=frame_form(lat=lat), files={"image": ("f.jpg", jpeg(), "image/jpeg")})
    assert r.status_code == 422


@pytest.mark.parametrize("bus_id", ["x" * 100, "a,b", "' OR 1=1 --", ""])
def test_frame_rejects_bad_bus_id(client, bus_id):
    r = client.post("/api/detect-frame", data=frame_form(bus_id=bus_id), files={"image": ("f.jpg", jpeg(), "image/jpeg")})
    assert r.status_code == 422


def test_location_rejects_impossible_speed(client):
    r = client.post("/api/location", json={"bus_id": "R07-B01", "lat": 18.5, "lng": 73.8, "speed_kmh": 500})
    assert r.status_code == 422


def test_frame_rejects_non_image(client):
    r = client.post("/api/detect-frame", data=frame_form(), files={"image": ("f.jpg", b"GIF89a" + b"x" * 200, "image/jpeg")})
    assert r.status_code == 400


def test_frame_rejects_oversize_upload(client):
    big = b"\0" * (main.MAX_FRAME_BYTES + 10)
    r = client.post("/api/detect-frame", data=frame_form(), files={"image": ("f.jpg", big, "image/jpeg")})
    assert r.status_code == 413


def test_decode_rejects_huge_resolution():
    buf = io.BytesIO()
    Image.new("1", (6000, 4000)).save(buf, "PNG")  # 24 MP, over the 20 MP cap, tiny file
    with pytest.raises(main.HTTPException) as e:
        main.decode_frame(buf.getvalue())
    assert e.value.status_code == 413


def test_decode_applies_exif_rotation():
    img = Image.new("RGB", (80, 40))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 clockwise when displayed
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    assert main.decode_frame(buf.getvalue()).size == (40, 80)


# removed endpoints stay removed
@pytest.mark.parametrize("path", ["/api/events", "/api/traffic"])
def test_forgery_endpoints_are_gone(client, path):
    assert client.post(path, json={}).status_code == 404


# device key
def test_device_key_required_when_set(client, monkeypatch):
    monkeypatch.setenv("DEVICE_KEY", "s3cret")
    body = {"bus_id": "R07-B01", "lat": 18.5, "lng": 73.8}
    assert client.post("/api/location", json=body).status_code == 401
    assert client.post("/api/location", json=body, headers={"X-Device-Key": "wrong"}).status_code == 401
    frame = client.post("/api/detect-frame", data=frame_form(), files={"image": ("f.jpg", jpeg(), "image/jpeg")})
    assert frame.status_code == 401


def test_health_needs_no_key(client, monkeypatch):
    monkeypatch.setenv("DEVICE_KEY", "s3cret")
    assert client.get("/api/health").json()["device_key_required"] is True


# rate limit
def test_rate_limit_blocks_after_quota(monkeypatch):
    main._hits.clear()
    for _ in range(3):
        main.rate_limit("t", "bus", (3, 60.0))
    with pytest.raises(main.HTTPException) as e:
        main.rate_limit("t", "bus", (3, 60.0))
    assert e.value.status_code == 429
    main.rate_limit("t", "other-bus", (3, 60.0))  # another bus is unaffected


def test_best_per_class_keeps_highest():
    found = [{"class": "pothole", "confidence": 0.5}, {"class": "pothole", "confidence": 0.9},
             {"class": "damaged_road", "confidence": 0.6}]
    best = main.best_per_class(found)
    assert best["pothole"]["confidence"] == 0.9 and set(best) == {"pothole", "damaged_road"}
