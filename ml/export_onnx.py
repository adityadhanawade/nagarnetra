"""Converts the three trained models to ONNX for the deployed backend (which runs without PyTorch).

    backend/.venv/Scripts/python ml/export_onnx.py

Reads backend/models/*.pt and writes backend/models/*.onnx. The detectors take any input size (dynamic shapes) so the
backend can pad each frame only to a multiple of 32, exactly as the PyTorch predictor did. Needs ultralytics and onnx.
"""
import os
from pathlib import Path

os.environ["YOLO_AUTOINSTALL"] = "False"
from ultralytics import YOLO

MODELS = Path(__file__).resolve().parents[1] / "backend" / "models"

for name, size, dynamic in (("yolov8n", 640, True), ("road_damage", 640, True), ("road_water", 256, False)):
    path = YOLO(str(MODELS / f"{name}.pt")).export(format="onnx", imgsz=size, opset=12, simplify=False, dynamic=dynamic)
    print(name, "->", path)
