import os
import threading
from pathlib import Path

from PIL import Image

os.environ.setdefault("YOLO_AUTOINSTALL", "False")  # never let a request trigger pip installs

MODEL_PATH = Path(__file__).parent / "models" / "yolov8n.pt"
CONFIDENCE = 0.30
OVERLAP_LIMIT = 0.5  # boxes overlapping more than this are merged, which removes double boxes on motorcycles
IMAGE_SIZE = 640

# COCO class ids for road vehicles. Three-wheelers are not a COCO class;
# the model usually files them under car, truck or motorcycle.
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

_model = None
_lock = threading.Lock()


def load_model():
    global _model
    if _model is None:
        from ultralytics import YOLO

        MODEL_PATH.parent.mkdir(exist_ok=True)
        _model = YOLO(str(MODEL_PATH))
    return _model


def count_vehicles(frame: Image.Image) -> dict:
    model = load_model()

    with _lock:
        result = model.predict(
            frame,
            imgsz=IMAGE_SIZE,
            conf=CONFIDENCE,
            iou=OVERLAP_LIMIT,
            classes=list(VEHICLE_CLASSES),
            verbose=False,
        )[0]

    breakdown = {name: 0 for name in VEHICLE_CLASSES.values()}
    detections = []
    for box in result.boxes:
        name = VEHICLE_CLASSES[int(box.cls)]
        breakdown[name] += 1
        x1, y1, x2, y2 = (round(float(v)) for v in box.xyxy[0])
        detections.append({"class": name, "confidence": round(float(box.conf), 2), "box": [x1, y1, x2, y2]})

    return {"count": len(detections), "breakdown": breakdown, "detections": detections}


DAMAGE_MODEL_PATH = Path(__file__).parent / "models" / "road_damage.pt"
DAMAGE_CONFIDENCE = 0.40

_damage_model = None
_damage_lock = threading.Lock()


def load_damage_model():
    """Returns the trained road-damage model, or None if models/road_damage.pt has not been added yet."""
    global _damage_model
    if _damage_model is None and DAMAGE_MODEL_PATH.exists():
        from ultralytics import YOLO

        _damage_model = YOLO(str(DAMAGE_MODEL_PATH))
    return _damage_model


def detect_road_damage(frame: Image.Image) -> list[dict]:
    model = load_damage_model()
    if model is None:
        return []
    with _damage_lock:
        result = model.predict(frame, imgsz=IMAGE_SIZE, conf=DAMAGE_CONFIDENCE, verbose=False)[0]

    found = []
    for box in result.boxes:
        x1, y1, x2, y2 = (round(float(v)) for v in box.xyxy[0])
        found.append(
            {"class": model.names[int(box.cls)], "confidence": round(float(box.conf), 2), "box": [x1, y1, x2, y2]}
        )
    return found


WATER_MODEL_PATH = Path(__file__).parent / "models" / "road_water.pt"
WATER_THRESHOLD = 0.7
WATER_IMAGE_SIZE = 256

_water_model = None
_water_lock = threading.Lock()


def load_water_model():
    """Returns the waterlogging classifier, or None if models/road_water.pt has not been added yet."""
    global _water_model
    if _water_model is None and WATER_MODEL_PATH.exists():
        from ultralytics import YOLO

        _water_model = YOLO(str(WATER_MODEL_PATH))
    return _water_model


def classify_waterlogging(frame: Image.Image) -> dict | None:
    """Judges the whole frame: is the road ahead waterlogged? Returns None if the model is not installed."""
    model = load_water_model()
    if model is None:
        return None
    with _water_lock:
        probs = model.predict(frame, imgsz=WATER_IMAGE_SIZE, verbose=False)[0].probs.data
    flooded_index = next(i for i, name in model.names.items() if name == "flooded")
    probability = round(float(probs[flooded_index]), 2)
    return {"flooded": probability >= WATER_THRESHOLD, "probability": probability}


def classify_congestion(vehicle_count: int, speed_kmh: float | None) -> str:
    """Rate traffic from vehicles in view and the bus's own speed.

    Many vehicles in frame means dense traffic. A slow bus among many vehicles
    means dense traffic that is barely moving. A fast bus is never worse than moderate.
    """
    if vehicle_count >= 16 or (speed_kmh is not None and speed_kmh < 5 and vehicle_count >= 8):
        level = "gridlock"
    elif vehicle_count >= 10 or (speed_kmh is not None and speed_kmh < 15 and vehicle_count >= 6):
        level = "heavy"
    elif vehicle_count >= 5:
        level = "moderate"
    else:
        level = "free"

    if speed_kmh is not None and speed_kmh >= 30 and level in ("heavy", "gridlock"):
        level = "moderate"
    return level
