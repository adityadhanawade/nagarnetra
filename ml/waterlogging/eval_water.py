import glob, os
from ultralytics import YOLO

S = "C:/Users/sanji/AppData/Local/Temp/claude/D--Claude-code/f7e02157-53cf-4779-9064-ea41f9e4547c/scratchpad"

def flooded_prob(model, paths):
    out = []
    idx = [k for k, v in model.names.items() if v == "flooded"][0]
    for i in range(0, len(paths), 32):
        for r in model.predict(paths[i:i + 32], imgsz=256, verbose=False, device=0):
            out.append(float(r.probs.data[idx]))
    return out

if __name__ == "__main__":
    m = YOLO("D:/Claude code/nagarnetra/ml/runs/water_cls/weights/best.pt")
    val_pos = sorted(glob.glob(S + "/water_cls/val/flooded/*.jpg"))
    val_neg = sorted(glob.glob(S + "/water_cls/val/normal/*.jpg"))
    fp_paths = [p.strip() for p in open(S + "/water_fp_test.txt") if p.strip()]
    pp, pn, pf = flooded_prob(m, val_pos), flooded_prob(m, val_neg), flooded_prob(m, fp_paths)
    print("RES held-back photos:", len(pp), "flooded,", len(pn), "normal")
    for t in (0.5, 0.7, 0.85):
        tp = sum(p >= t for p in pp); fp = sum(p >= t for p in pn)
        print(f"RES  threshold {t}: caught {tp}/{len(pp)} flooded | false alarms on held-back normal {fp}/{len(pn)}")
    print("RES unseen dry roads:", len(pf))
    for t in (0.5, 0.7, 0.85):
        print(f"RES  threshold {t}: false alarms {sum(p >= t for p in pf)}/{len(pf)} ({100*sum(p >= t for p in pf)/len(pf):.1f}%)")
    print("RES external Indian flood photos (never trained on):")
    for name in ["chennai", "kolkata", "ambala", "kerala", "marina"]:
        p = flooded_prob(m, [f"{S}/flood/{name}.jpg"])[0]
        print(f"RES   {name:8} flooded probability {p:.2f}")
    print("RES dry bus-view photos:")
    for name in ["nagar_road", "university_sq"]:
        p = flooded_prob(m, [f"{S}/testimgs/{name}.jpg"])[0]
        print(f"RES   {name:14} flooded probability {p:.2f}")
