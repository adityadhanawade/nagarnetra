# NagarNetra Design System (source of truth)

Rejected along the way: neon terminal green, Inter + Playfair Display, an illustrated bus video background ("not nice"), the pale steel blue and deeper sky blue themes (colors did not match the stars), and the dark Night Sky theme (Aditya wants a light site).

**Decision (2026-09-26, from Aditya): theme "Twilight" (option B).** Light only, no dark mode, never plain white. A soft blue-to-lavender sky with an indigo accent, built to sit with the animated Stars Background. Do not add `prefers-color-scheme: dark` styles anywhere, including the dashboard.

**Dials:** Variance 3, Motion 3, Density 5. Style: Minimalism / Swiss, geometric.

## Colors (defined in `frontend/src/index.css`, use the Tailwind names)

| Token | Hex | Use |
|---|---|---|
| bg | #D6D3F6 | solid page color and header. The page itself shows `--bg-sky` |
| bg-sky | 165deg, #C4D0F7 to #D6D3F6 to #E4D9F4 | fixed gradient behind everything |
| surface | #F4F2FF | cards, inputs (lavender tinted, not white) |
| fg | #15173D | text (deep indigo-black) |
| fg-muted | #444A75 | secondary text |
| line | #B9B7E6 | dividers, card borders, skeletons, disabled fill |
| line-strong | #6A6EA8 | input and outline-button borders |
| accent | #3F3CBB | the one accent: buttons, icons, routes, focus ring |
| on-accent | #FFFFFF | text on accent |
| ok / ok-bg | #166534 / #DCF1E3 | status |
| warn / warn-bg | #92400E / #FAE9CC | status |
| err / err-bg | #B91C1C / #F9DADA | status, road-damage pins |

Verified contrast: body text 11.2:1, muted text 5.5:1 or better on the darkest part of the gradient, button text 8.2:1, accent icons 5.3:1, status text 4.95:1 or better, input borders 3.1:1 or better (UI needs 3:1). Recheck any new color pair before using it. The gradient's darkest stop is #C4D0F7; do not go darker or muted text falls under 4.5:1.

## Stars background
`frontend/src/components/StarsBackground.jsx`, adapted from Animate UI. Three drifting layers: 1500 small indigo dots, 650 medium white, 280 large white, twinkling on 5, 7 and 9 second cycles, with mouse parallax. Stars are placed only inside the scrolling layer (the original scattered about three quarters off screen). Static under reduced motion. Mounted once in `App.jsx` so it shows on every page (Home, Dashboard, 404) and stays alive across navigation. On `/capture` it shows on the start screen only and is removed while a shift runs (battery on a bus phone). Page content must sit in a `relative z-10` container above it.

## Map card
`MapPreview.jsx` on the Home hero: real OpenStreetMap tiles desaturated with a CSS filter, indigo routes and bus dots, red road-damage pins. Labelled "Sample data".

## Dashboard (`/dashboard`)
Chart rules came from the dataviz skill and the palette was checked with its validator (all checks pass).
- **Map categories:** bus = indigo `#3F3CBB` circle, pothole = amber `#D97706` circle, damaged road = cyan `#0891B2` diamond. Shape is the second cue so color is never alone. Marker size grows with the number of bus passes (14px plus 1.2px per pass, capped at 15).
- **Congestion heat:** one hue, light to deep indigo (`#D9D8F5`, `#A5A3E8`, `#5E5BD0`, `#2A2790`), weighted free 0.15, moderate 0.4, heavy 0.75, gridlock 1. A legend bar always shows "Free to gridlock".
- **Route chart:** one series (current speed as % of usual), indigo, with a dashed "Usual pace" line at 100% and ticks every 25%. A table under the chart is the accessible view.
- **Status words:** On time (90% or more of usual), Slower (70 to 89%), Delayed (under 70%). Status colors are reserved for these and for traffic level, and always come with an icon and a word.
- **Stat tiles:** Buses Reporting (position in last 2 minutes), Open Road Issues, Traffic Now (mean of camera readings in last 10 minutes), Average Speed.
- **Data:** read-only through Supabase views `bus_latest` and `route_speed_summary`, refreshed every 10 seconds, plus a realtime subscription so buses move instantly.
- **Demo data:** `backend/scripts/simulate_fleet.py`; the page shows a "Demo data" chip while `DEMO_DATA` is true.

## Type
Fira Sans (labels, body) and Fira Code (numbers, timers, status values), self-hosted through @fontsource. Numbers use tabular figures.

## Shape and spacing
One radius everywhere: `rounded-xl` (12px). Spacing scale 4/8/12/16/24/32. Touch targets 56px or taller on the bus device screen.

## Rules
- One accent color. Status colors are semantic only and never the sole signal (always icon plus word).
- Icons: Phosphor, weight bold, one family.
- Buttons and headings use Title Case. No em-dashes in copy.
- Hover states raise contrast. Motion respects `prefers-reduced-motion`.
- Only animate transform, opacity and filter. Never `transition: all`.
- Header nav stays on one line at 375px wide.
