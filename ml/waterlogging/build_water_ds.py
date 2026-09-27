import glob, os, random, shutil
from ultralytics import YOLO

S = "C:/Users/sanji/AppData/Local/Temp/claude/D--Claude-code/f7e02157-53cf-4779-9064-ea41f9e4547c/scratchpad"
OUT = S + "/water_cls"
FLOODED_GOOD = [6, 7, 8, 9, 13, 16, 29, 32, 33, 34, 35, 36, 37, 38, 39, 40, 46, 56, 60, 61, 75, 79, 80, 81, 82, 83, 84,
                85, 86, 88, 89, 90, 91, 98, 99, 100, 101, 102, 103, 104, 106, 111, 114]
FLOODED_VAL = {16, 29, 40, 56, 60, 88, 89, 90, 91, 111, 114}
POS_REPEAT = 3

if __name__ == "__main__":
    random.seed(0)
    shutil.rmtree(OUT, ignore_errors=True)
    for split in ("train", "val"):
        for cls in ("flooded", "normal"):
            os.makedirs(f"{OUT}/{split}/{cls}")

    for i in FLOODED_GOOD:
        src = f"{S}/flood_ds/raw/flooded/flooded_{i:04d}.jpg"
        if i in FLOODED_VAL:
            shutil.copy(src, f"{OUT}/val/flooded/f{i:04d}.jpg")
        else:
            for r in range(POS_REPEAT):
                shutil.copy(src, f"{OUT}/train/flooded/f{i:04d}_{r}.jpg")

    detector = YOLO("D:/Claude code/nagarnetra/backend/models/yolov8n.pt")
    street = []
    for p in sorted(glob.glob(S + "/flood_ds/raw/normal/*.jpg")):
        r = detector.predict(p, classes=[2, 3, 5, 7], conf=0.4, verbose=False, device=0)[0]
        if len(r.boxes) >= 2:
            street.append(p)
    random.shuffle(street)
    n_val_street = max(8, len(street) // 6)
    for k, p in enumerate(street):
        split = "val" if k < n_val_street else "train"
        shutil.copy(p, f"{OUT}/{split}/normal/c{k:04d}.jpg")

    rdd = sorted(glob.glob(S + "/work/rdd_raw/India/train/images/*.jpg"))
    random.shuffle(rdd)
    for k, p in enumerate(rdd[:180]):
        split = "val" if k < 40 else "train"
        shutil.copy(p, f"{OUT}/{split}/normal/r{k:04d}.jpg")
    with open(S + "/water_fp_test.txt", "w") as f:
        f.write("\n".join(rdd[180:380]))

    for split in ("train", "val"):
        print(split, {cls: len(os.listdir(f"{OUT}/{split}/{cls}")) for cls in ("flooded", "normal")})
    print("commons street-scene negatives kept:", len(street), "of 220")
