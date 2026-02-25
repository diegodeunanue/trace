# Trace

> Your life, traced. Turn your personal data into print-ready visual art.

100% local processing. We don't care about your data.

## Development

```bash
# Start dev server (localhost:5173)
npm run dev

# Kill it
pkill -f vite
```

## What it does

Trace takes your personal data exports (Google Timeline) and renders them as beautiful, high-resolution poster-quality visualizations. All computation runs client-side via WebGL.

## UX Flow

**Step 1 — Upload**
Drop your Google Timeline JSON. Parsed entirely in the browser.

**Step 2 — Scope**
A full-screen map shows all your data as a lightweight dot overview. Draw a bounding box over the area you want, set an optional date range. "My Buenos Aires trip in September" = bbox over BA + September filter.

**Step 3 — Style**
The scoped data renders live via deck.gl. Pick one of 4 presets or expand the panel to customize: spread, smoothing, opacity, color, line weight. Changes are instant (GPU re-render, ~16ms). Save custom presets locally.

**Step 4 — Export**
Download a print-ready high-res PNG. Payment gate at this step.

## Architecture

Pure client-side SPA. No user data ever hits a server.

```
Stack: React + Vite + TypeScript + Tailwind
Maps:  deck.gl (WebGL) + MapLibre GL
Geo:   Turf.js
Pay:   LemonSqueezy / Stripe Checkout
Host:  Vercel (static)
```

### Two-phase rendering

```
Phase 1 (once):   parseUserData()  → raw point array, in browser
                  fetchMapTiles()  → street network, cached
Phase 2 (instant): applyStyle()   → deck.gl layer props → WebGL re-render
```

Parameter sliders update the render layer only — no data reprocessing. This is what makes customization feel instant.

## Data Sources

| Source | Format | Status |
|---|---|---|
| Google Timeline | JSON | ✅ V1 |
| Activity (Apple/Google Health) | XML/JSON | Planned |
| Sleep (Apple/Google Health) | XML/JSON | Planned |
| Spotify streaming history | JSON | Planned |

## Monetization

Free preview (watermarked) → pay once to download full resolution (~$15–20). No accounts, no subscriptions.

## Status

Early development. UI prototype exists (Lovable). Core visualization logic exists (cartograph repo). Porting both to a unified client-side architecture.
