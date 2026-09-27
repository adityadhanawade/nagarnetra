# NagarNetra (SIH26124)

GitHub: https://github.com/adityadhanawade/nagarnetra 
Live site: https://nagarnetra-dun.vercel.app 
Backend API: https://nagarnetra-api.vercel.app

NagarNetra ("the city's eye") is an AI-powered platform that turns public transport buses into mobile urban sensing units.

## Structure
- `frontend/` React + Vite + Tailwind. Routes: `/` (home), `/capture` (bus-mounted phone), `/dashboard` (authority fleet dashboard)
- `backend/` FastAPI (Python) with YOLOv8 detection. `scripts/simulate_fleet.py` creates demo data
- `ml/` Colab notebook that trains the road-damage model
- `design-system/` the design decisions and palette (source of truth)

## Run locally
Backend (port 8000):

    cd backend
    .venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000

Frontend (port 5173, proxies `/api` to the backend):

    cd frontend
    npm run dev

Copy `.env.example` to `.env` in both folders and fill in the Supabase keys.

## Demo data for the dashboard
The dashboard reads from the database. With no real buses running, create a simulated fleet on the real Pune routes:

    cd backend
    .venv\Scripts\python.exe scripts\simulate_fleet.py --seed     # last 6 hours of history
    .venv\Scripts\python.exe scripts\simulate_fleet.py --live     # buses report every 3 seconds; Ctrl+C to stop
    .venv\Scripts\python.exe scripts\simulate_fleet.py --clear    # remove all positions, traffic readings and issues

Leave `--live` running while demoing, or "Buses Reporting" drops to zero after 2 minutes. Route 100 is given a
slowdown in live mode so the route chart shows a delay. The dashboard shows a "Demo data" label unless the build sets
`VITE_DEMO_DATA=false`.

The demo routes use real PMPML route numbers (2A Katraj to Shivaji Nagar, 100 Manapa Bhavan to Hinjewadi Phase 3, 175
Shaniwar Wada to Hadapsar). The buses are simulated and the paths are the fastest road between each route's end points
and a few waypoints, not PMPML's official stop-by-stop alignment. Rebuild them with `scripts/build_routes.py`.

## Road-damage model
Run `ml/train_road_damage.ipynb` on Google Colab (T4 GPU), then put the downloaded `road_damage.pt` in
`backend/models/`. The backend uses it automatically when the file exists.

## Security and Robustness (audit, 2026-09-26)
- Write endpoints (`/api/location`, `/api/detect-frame`) require an `X-Device-Key` header when `DEVICE_KEY` is set in `backend/.env`. Bus phones enter it once in the Device Code box on `/capture`. Leave it unset on localhost only; the backend logs a warning.
- Removed the unauthenticated `/api/events` and `/api/traffic` endpoints. Issues and traffic rows are created only by the server from real detections.
- Limits: 3 MB upload, 20 megapixel decode cap, bus ids `[A-Za-z0-9_-]{1,32}`, NaN/inf coordinates refused, rate limit per bus, at most 2 frames processed at once (extra frames get a 429 and are dropped).
- The database also enforces sane values (speed, breakdown size), a nightly purge (`purge_old_data`, pg_cron), and least-privilege grants (anon is read-only).
- Set `CORS_ORIGINS` (comma list) for the deployed frontend origin.
- Tests: `backend/.venv/Scripts/python -m pytest backend/tests` and `npm test` in `frontend/`.

## Deployment
Both parts run on Vercel (team `aditya-dhanawade`), free tier.
- **Website:** project `nagarnetra`, live at https://nagarnetra-dun.vercel.app. Deploy from `frontend/` with `npx vercel deploy --prod`. `frontend/vercel.json` forwards `/api/*` to the backend and sends every other path to the app. Site settings: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (both public by design).
- **Backend:** project `nagarnetra-api`, at https://nagarnetra-api.vercel.app. Deploy from `backend/` the same way. It runs the models with ONNX Runtime (no PyTorch, which does not fit a serverless function); `ml/export_onnx.py` converts the trained `.pt` files to `.onnx`. Settings on the project: `SUPABASE_URL`, `CORS_ORIGINS`, and two secrets, `SUPABASE_SERVICE_KEY` and `DEVICE_KEY`. Add secrets with `npx vercel env add NAME production` (the value is typed into the terminal prompt, never into chat), then redeploy.
- Hugging Face Docker Spaces need a paid plan, so they were not used.
- Serverless trade-offs: the per-bus rate limit is kept in memory, so it is per copy of the function, not global; the first request after a quiet spell is slower while the models load.
