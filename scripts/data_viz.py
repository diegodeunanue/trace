#!/usr/bin/env python3
"""
data_viz — Quick standalone visualization of city map JSON.

Usage:
    pip install folium   # one-time
    python scripts/data_viz.py
    python scripts/data_viz.py public/cities/buenos-aires.json
    python scripts/data_viz.py public/cities/mexico-city.json

Opens a browser with the street network drawn on an interactive map.
"""

import json
import sys
import webbrowser
from pathlib import Path

def main():
    repo = Path(__file__).resolve().parent.parent
    default_path = repo / "public" / "cities" / "buenos-aires.json"
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_path
    if not path.is_absolute():
        path = repo / path

    if not path.exists():
        print(f"File not found: {path}")
        sys.exit(1)

    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    coords = data.get("coords")
    if not coords:
        print("JSON has no 'coords' key.")
        sys.exit(1)

    try:
        import folium
    except ImportError:
        print("Install folium: pip install folium")
        sys.exit(1)

    # Bbox from data
    all_lng, all_lat = [], []
    for seg in coords:
        for pt in seg:
            all_lng.append(pt[0])
            all_lat.append(pt[1])
    center_lat = (min(all_lat) + max(all_lat)) / 2
    center_lng = (min(all_lng) + max(all_lng)) / 2

    m = folium.Map(location=[center_lat, center_lng], zoom_start=11, tiles="CartoDB dark_matter")
    for seg in coords:
        # seg is list of [lng, lat]; folium expects (lat, lng)
        pts = [(p[1], p[0]) for p in seg]
        folium.PolyLine(pts, color="#6366f1", weight=1.5, opacity=0.8).add_to(m)

    out = repo / "data_viz.html"
    m.save(str(out))
    print(f"Saved {out}")
    webbrowser.open(f"file://{out}")


if __name__ == "__main__":
    main()
