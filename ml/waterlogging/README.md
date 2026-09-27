# Waterlogging classifier

Answers one question per camera frame: is the road ahead waterlogged? It is a YOLOv8n image classifier with two
classes, `flooded` and `normal`. Waterlogging is an area of water, not an object, so it is classified, not boxed.

## Data (all free, no accounts)
- **Flooded:** 43 photos of flooded streets, picked by eye out of 115 collected from Wikimedia Commons. About 60% of
  the automatic search results were rice fields, rivers, ponds or unrelated, so hand-picking was necessary.
  Credits and licenses: `flooded_photo_credits.json`. 32 photos train (each repeated 3 times), 11 are held back.
- **Normal:** 73 Commons street scenes (kept only where a vehicle detector finds 2 or more vehicles) plus 180 dry
  road photos from the RDD2022 India dataset, which look like a bus camera view.

## Results (RTX 3050, 23 epochs, under a minute)
| Check | Result |
|---|---|
| Held-back flooded photos | 10 of 11 caught at threshold 0.7 |
| Held-back normal photos | 0 of 52 false alarms |
| 200 unseen dry roads | 0 false alarms |
| 7 rainy but not flooded streets | all scored 0.00 to 0.30 |
| 5 Indian flood photos never trained on | 4 of 5 caught (missed a flooded beach service road) |

## Limits, stated plainly
- Only 32 distinct flooded photos. This is a prototype, not a finished detector.
- The flooded photos are mostly taken at eye level, not from a bus. No test set of bus-camera flood footage exists
  here, so accuracy from a real bus camera is untested. Better data (for example a Roboflow or Kaggle road-flood
  dataset with dashcam views) is the main upgrade.
- The backend flags a frame when the flooded score is 0.7 or higher (`WATER_THRESHOLD` in `backend/detection.py`).

## Re-running
The scripts use a scratch folder path (`S = ...`) at the top of each file; point it at your own folder. Order:
`collect_flood.py`, review the photos and set `FLOODED_GOOD` in `build_water_ds.py`, then `build_water_ds.py`,
`train_water.py`, `eval_water.py`. Train in `ml/.venv` (CUDA PyTorch). Copy the result to
`backend/models/road_water.pt`.
