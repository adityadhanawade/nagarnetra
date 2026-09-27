from ultralytics import YOLO

S = "C:/Users/sanji/AppData/Local/Temp/claude/D--Claude-code/f7e02157-53cf-4779-9064-ea41f9e4547c/scratchpad"

if __name__ == "__main__":
    model = YOLO("yolov8n-cls.pt")
    model.train(
        data=S + "/water_cls", epochs=60, imgsz=256, batch=32, device=0, workers=2, patience=20,
        project="D:/Claude code/nagarnetra/ml/runs", name="water_cls", exist_ok=True, seed=0, plots=False,
        degrees=8, scale=0.4, translate=0.15, hsv_h=0.02, hsv_s=0.5, hsv_v=0.4, erasing=0.3,
    )
