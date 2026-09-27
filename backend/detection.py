"""Runs the three models with ONNX Runtime and NumPy, with no PyTorch. That keeps the deployed backend small
enough for a serverless function. Results are checked against the original PyTorch code in tests/test_parity.py.
"""
import threading
from pathlib import Path

import numpy as np
from PIL import Image

MODELS = Path(__file__).parent / "models"
CONFIDENCE = 0.30
OVERLAP_LIMIT = 0.5  # boxes overlapping more than this are merged, which removes double boxes on motorcycles
IMAGE_SIZE = 640
STRIDE = 32
PAD_GREY = 114
MAX_DETECTIONS = 300

# COCO class ids for road vehicles. Three-wheelers are not a COCO class;
# the model usually files them under car, truck or motorcycle.
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

DAMAGE_CONFIDENCE = 0.40
DAMAGE_OVERLAP_LIMIT = 0.7
DAMAGE_NAMES = {0: "pothole", 1: "damaged_road"}

WATER_THRESHOLD = 0.7
WATER_IMAGE_SIZE = 256
WATER_FLOODED_INDEX = 0  # road_water classes: 0 flooded, 1 normal

_sessions: dict = {}
_load_lock = threading.Lock()


def _session(name: str):
    """Returns the ONNX session for a model, or None if its file has not been added yet."""
    if name not in _sessions:
        with _load_lock:
            if name not in _sessions:
                path = MODELS / f"{name}.onnx"
                if not path.exists():
                    _sessions[name] = None
                else:
                    import onnxruntime as ort

                    options = ort.SessionOptions()
                    options.log_severity_level = 3
                    _sessions[name] = ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
    return _sessions[name]


def load_model():
    return _session("yolov8n")


def load_damage_model():
    return _session("road_damage")


def load_water_model():
    return _session("road_water")


def _run(session, batch: np.ndarray) -> np.ndarray:
    return session.run(None, {session.get_inputs()[0].name: batch})[0]


def _resize_like_opencv(frame: Image.Image, new_w: int, new_h: int) -> Image.Image:
    """Plain bilinear sampling with no smoothing, which is what the original pipeline (OpenCV) does.
    Pillow's own resize smooths when shrinking, which nudges scores slightly."""
    width, height = frame.size
    sx, sy = width / new_w, height / new_h
    return frame.transform((new_w, new_h), Image.AFFINE, (sx, 0, 0, 0, sy, 0), resample=Image.BILINEAR)


def _letterbox(frame: Image.Image, size: int):
    """Scales the frame to fit inside size x size and pads only up to the next multiple of 32 (the same 'rectangular
    inference' the original used). Returns (NCHW float batch, scale, pad_x, pad_y)."""
    width, height = frame.size
    scale = min(size / height, size / width)
    new_w, new_h = round(width * scale), round(height * scale)
    resized = _resize_like_opencv(frame, new_w, new_h) if (new_w, new_h) != (width, height) else frame
    pad_w, pad_h = ((size - new_w) % STRIDE) / 2, ((size - new_h) % STRIDE) / 2
    top, bottom = round(pad_h - 0.1), round(pad_h + 0.1)
    left, right = round(pad_w - 0.1), round(pad_w + 0.1)
    canvas = np.full((new_h + top + bottom, new_w + left + right, 3), PAD_GREY, dtype=np.uint8)
    canvas[top : top + new_h, left : left + new_w] = np.asarray(resized)
    batch = canvas.transpose(2, 0, 1)[None].astype(np.float32) / 255.0
    return batch, scale, left, top


def _nms(boxes: np.ndarray, scores: np.ndarray, classes: np.ndarray, overlap: float) -> list[int]:
    """Greedy non-maximum suppression, run separately for each class."""
    keep: list[int] = []
    for cls in np.unique(classes):
        idx = np.where(classes == cls)[0]
        idx = idx[np.argsort(-scores[idx])]
        while len(idx):
            i = idx[0]
            keep.append(int(i))
            if len(idx) == 1:
                break
            rest = idx[1:]
            x1 = np.maximum(boxes[i, 0], boxes[rest, 0])
            y1 = np.maximum(boxes[i, 1], boxes[rest, 1])
            x2 = np.minimum(boxes[i, 2], boxes[rest, 2])
            y2 = np.minimum(boxes[i, 3], boxes[rest, 3])
            inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
            area_i = (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1])
            area_r = (boxes[rest, 2] - boxes[rest, 0]) * (boxes[rest, 3] - boxes[rest, 1])
            idx = rest[inter / (area_i + area_r - inter + 1e-9) <= overlap]
    keep.sort(key=lambda k: -scores[k])
    return keep[:MAX_DETECTIONS]


def _detect(session, frame: Image.Image, confidence: float, overlap: float, allowed: set | None):
    """Runs a YOLOv8 detector. Returns a list of (class_id, confidence, [x1, y1, x2, y2]) in frame pixels."""
    batch, scale, pad_x, pad_y = _letterbox(frame, IMAGE_SIZE)
    out = _run(session, batch)[0].T  # (8400, 4 + classes)
    class_scores = out[:, 4:]
    classes = class_scores.argmax(axis=1)
    scores = class_scores.max(axis=1)
    keep = scores > confidence
    if allowed is not None:  # like the original: pick each box's best class first, then filter
        keep &= np.isin(classes, list(allowed))
    if not keep.any():
        return []
    out, classes, scores = out[keep], classes[keep], scores[keep]

    cx, cy, w, h = out[:, 0], out[:, 1], out[:, 2], out[:, 3]
    boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
    boxes[:, [0, 2]] = (boxes[:, [0, 2]] - pad_x) / scale
    boxes[:, [1, 3]] = (boxes[:, [1, 3]] - pad_y) / scale
    width, height = frame.size
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, width)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, height)

    return [(int(classes[k]), float(scores[k]), boxes[k]) for k in _nms(boxes, scores, classes, overlap)]


def _box(values) -> list[int]:
    return [round(float(v)) for v in values]


def count_vehicles(frame: Image.Image) -> dict:
    found = _detect(load_model(), frame, CONFIDENCE, OVERLAP_LIMIT, set(VEHICLE_CLASSES))
    breakdown = {name: 0 for name in VEHICLE_CLASSES.values()}
    detections = []
    for class_id, score, box in found:
        name = VEHICLE_CLASSES[class_id]
        breakdown[name] += 1
        detections.append({"class": name, "confidence": round(score, 2), "box": _box(box)})
    return {"count": len(detections), "breakdown": breakdown, "detections": detections}


def detect_road_damage(frame: Image.Image) -> list[dict]:
    session = load_damage_model()
    if session is None:
        return []
    found = _detect(session, frame, DAMAGE_CONFIDENCE, DAMAGE_OVERLAP_LIMIT, None)
    return [{"class": DAMAGE_NAMES[c], "confidence": round(s, 2), "box": _box(b)} for c, s, b in found]


def classify_waterlogging(frame: Image.Image) -> dict | None:
    """Judges the whole frame: is the road ahead waterlogged? Returns None if the model is not installed."""
    session = load_water_model()
    if session is None:
        return None
    # same steps as the original classifier: shorter side to 256, centre crop, RGB in 0..1
    width, height = frame.size
    ratio = WATER_IMAGE_SIZE / min(width, height)
    new_size = (max(WATER_IMAGE_SIZE, round(width * ratio)), max(WATER_IMAGE_SIZE, round(height * ratio)))
    resized = frame.resize(new_size, Image.BILINEAR)
    left = (resized.width - WATER_IMAGE_SIZE) // 2
    top = (resized.height - WATER_IMAGE_SIZE) // 2
    crop = resized.crop((left, top, left + WATER_IMAGE_SIZE, top + WATER_IMAGE_SIZE))
    batch = np.asarray(crop, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    probs = _run(session, batch)[0]
    if not np.isclose(probs.sum(), 1.0, atol=1e-3):  # some exports return raw scores
        exp = np.exp(probs - probs.max())
        probs = exp / exp.sum()
    probability = round(float(probs[WATER_FLOODED_INDEX]), 2)
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
