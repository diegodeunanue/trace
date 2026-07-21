# Trace

> Turns your personal location history into clean, poster-quality geographical
> illustrations — a trip, a honeymoon, or a whole year on one print.

Runs entirely in your browser. None of your data is uploaded or leaves your
device. There is no server, no account, and no analytics on your file.

## Development

```bash
npm install
npm run dev        # localhost:5173
npm run build      # typecheck + production build into dist/
pkill -f vite      # stop the dev server
```

## What it does

Trace reads a Google Timeline export and renders it as a high-resolution,
print-ready visualization. All computation runs client-side via WebGL — the
file is parsed in the tab and never sent anywhere.

## UX flow

The app opens on a **baked sample trace**, so there is something on screen with
no upload. From there:

**Step 1 — Upload**
Drop your Google Timeline JSON. Parsed entirely in the browser.

**Step 2 — Scope**
A full-screen map shows all your data as a lightweight dot overview. Draw a
bounding box over the area you want, set an optional date range.

**Step 3 — Style**
The scoped data renders live via deck.gl. Pick one of 4 presets or adjust
spread, smoothing, opacity, colour and line weight. Changes are instant.

**Step 4 — Export**
Download a print-ready high-res PNG, with poster title and layout options.

## Architecture

Pure client-side SPA. No user data ever hits a server.

```
Stack: React + Vite + TypeScript + Tailwind
Maps:  deck.gl (WebGL) + MapLibre GL
Geo:   Turf.js
Host:  Vercel (static)
```

### Two-phase rendering

```
Phase 1 (once):   parseUserData()  → raw point array, in browser
                  street network   → loaded from public/cities/ or Overpass
Phase 2 (instant): applyStyle()    → deck.gl layer props → WebGL re-render
```

Parameter sliders update the render layer only — no data reprocessing.

### Camera framing

The camera frames the *rendered art*, not the raw input: it fits to the streets
that actually lit up, weighted by visit count and trimmed to the 2nd–98th
percentile. Framing on the raw point bbox does not work — one airport transfer
or bad GPS fix stretches it far past where the trace lives, leaving the
interesting part a speck in the corner.

## Data assets

Two kinds of generated asset live under `public/`. Both are produced by scripts
and neither contains anything a visitor uploads.

### Street networks — `public/cities/`

```bash
python scripts/download-cities.py                      # all cities, standard detail
python scripts/download-cities.py buenos-aires london  # specific cities
python scripts/download-cities.py sao-paulo --detail detailed \
    --bbox="-46.78,-23.65,-46.59,-23.49"               # dense, clipped to a rectangle
```

Detail levels: `bare` (motorway–secondary), `standard` (+ tertiary),
`detailed` (+ residential/service/unclassified).

Detail matters more than it looks. A compact city like Buenos Aires reads well
at `standard` (429 segments/km²); São Paulo at the same setting is only 113
segments/km² and renders as an empty grid, so it is fetched at `detailed` and
clipped by bbox to keep the file servable.

These files are large and stay out of the repo by default. The two the deployed
demo needs are committed as an explicit `.gitignore` exception.

### Sample traces — `public/demo/`

```bash
node scripts/extract-demo.mjs /path/to/Timeline.json
```

Produces the small scoped slices the app opens with. Each is clipped to one
city bbox and one date window, has overnight points removed, and is rounded to
5dp — roughly 50KB each. The source export is personal data and is never
committed.

## Data sources

| Source | Format | Status |
|---|---|---|
| Google Timeline | JSON | Supported |
| Activity (Apple/Google Health) | XML/JSON | Planned |
| Sleep (Apple/Google Health) | XML/JSON | Planned |
| Spotify streaming history | JSON | Planned |

## Status

Working end to end: sample traces, upload, scope, style and PNG export. Not yet
built: the payment gate on export, and any data source beyond Google Timeline.
