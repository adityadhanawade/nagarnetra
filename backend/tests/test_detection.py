"""Checks for the ONNX detection code. Skipped when the .onnx model files are not present."""
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent))

import detection  # noqa: E402

needs_models = pytest.mark.skipif(
    not all((detection.MODELS / f"{n}.onnx").exists() for n in ("yolov8n", "road_damage", "road_water")),
    reason="ONNX models not exported",
)


def test_letterbox_pads_only_to_a_multiple_of_32():
    batch, scale, left, top = detection._letterbox(Image.new("RGB", (1280, 720)), 640)
    assert batch.shape == (1, 3, 384, 640)  # 640x360 scaled, padded up to 384 high
    assert scale == 0.5 and left == 0 and top == 12


def test_letterbox_square_needs_no_padding():
    batch, *_ = detection._letterbox(Image.new("RGB", (500, 500)), 640)
    assert batch.shape == (1, 3, 640, 640)


def test_nms_merges_overlaps_within_a_class_only():
    boxes = np.array([[0, 0, 100, 100], [5, 5, 105, 105], [0, 0, 100, 100]], dtype=np.float32)
    scores = np.array([0.9, 0.8, 0.7], dtype=np.float32)
    classes = np.array([1, 1, 2])
    keep = detection._nms(boxes, scores, classes, 0.5)
    assert sorted(keep) == [0, 2]  # the second box is a duplicate of the first; the third is another class


@needs_models
def test_blank_road_finds_nothing():
    grey = Image.new("RGB", (1280, 720), (110, 110, 110))
    assert detection.count_vehicles(grey)["count"] == 0
    assert detection.detect_road_damage(grey) == []
    result = detection.classify_waterlogging(grey)
    assert result["flooded"] is False and 0 <= result["probability"] <= 1


@needs_models
def test_count_result_shape():
    result = detection.count_vehicles(Image.new("RGB", (640, 480)))
    assert set(result) == {"count", "breakdown", "detections"}
    assert set(result["breakdown"]) == {"car", "motorcycle", "bus", "truck"}
