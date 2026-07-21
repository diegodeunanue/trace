#!/usr/bin/env python3
"""
download-cities.py

Downloads bare-bones street networks (motorway/trunk/primary/secondary) for
pre-defined cities, using their official OSM administrative boundaries.
Streets are clipped to the exact city limits — no rectangular bbox.

Flow:
  1. Nominatim lookup: city name → OSM relation ID
  2. Overpass query:   rel(ID) → map_to_area → streets within that boundary

Usage:
    cd trace/
    python scripts/download-cities.py
    # OR to download specific cities only:
    python scripts/download-cities.py buenos-aires tokyo london

Output:
    public/cities/{city-id}.json   — one file per city
"""

import argparse
import json
import time
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# City definitions
# "search" is passed to Nominatim to resolve the OSM admin relation ID.
# Adjust the search string if the wrong boundary is selected.
# ---------------------------------------------------------------------------
CITIES = [
    # Ciudad Autónoma de Buenos Aires (bounded by General Paz Ave + Riachuelo)
    {"id": "buenos-aires",  "name": "Buenos Aires",  "search": "Ciudad Autónoma de Buenos Aires, Argentina"},
    # Ciudad de México (CDMX — 16 alcaldías)
    {"id": "mexico-city",   "name": "Mexico City",   "search": "Ciudad de México, Mexico"},
    # New York City (5 boroughs)
    {"id": "new-york",      "name": "New York",      "search": "City of New York, USA"},
    # City of Los Angeles (not LA County)
    {"id": "los-angeles",   "name": "Los Angeles",   "search": "City of Los Angeles, California, USA"},
    # City of Chicago
    {"id": "chicago",       "name": "Chicago",       "search": "City of Chicago, Illinois, USA"},
    # City and County of San Francisco
    {"id": "san-francisco", "name": "San Francisco", "search": "City and County of San Francisco, USA"},
    # Amalgamated City of Toronto
    {"id": "toronto",       "name": "Toronto",       "search": "City of Toronto, Ontario, Canada"},
    # Greater London (32 boroughs + City)
    {"id": "london",        "name": "London",        "search": "Greater London, England"},
    # Paris intramuros (20 arrondissements)
    {"id": "paris",         "name": "Paris",         "search": "Paris, Île-de-France, France"},
    # Berlin (city-state, 12 Bezirke)
    {"id": "berlin",        "name": "Berlin",        "search": "Berlin, Germany"},
    # Madrid municipality
    {"id": "madrid",        "name": "Madrid",        "search": "Madrid, Community of Madrid, Spain"},
    # Barcelona municipality
    {"id": "barcelona",     "name": "Barcelona",     "search": "Barcelona, Catalonia, Spain"},
    # Comune di Roma
    {"id": "rome",          "name": "Rome",          "search": "Roma, Lazio, Italy"},
    # Amsterdam municipality
    {"id": "amsterdam",     "name": "Amsterdam",     "search": "Amsterdam, Netherlands"},
    # Municipality of São Paulo
    {"id": "sao-paulo",     "name": "São Paulo",     "search": "São Paulo, Brazil"},
    # Tokyo 23 Special Wards (not the full Tokyo Metropolis)
    {"id": "tokyo",         "name": "Tokyo",         "search": "Special wards of Tokyo, Japan"},
    # Seoul Special Metropolitan City
    {"id": "seoul",         "name": "Seoul",         "search": "Seoul, South Korea"},
    # City of Sydney LGA
    {"id": "sydney",        "name": "Sydney",        "search": "City of Sydney, New South Wales, Australia"},
    # Republic of Singapore (island)
    {"id": "singapore",     "name": "Singapore",     "search": "Singapore"},
    # Emirate of Dubai
    {"id": "dubai",         "name": "Dubai",         "search": "Emirate of Dubai, United Arab Emirates"},
]

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Tried in order; the main instance 504s regularly on large boundaries.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]
OUTPUT_DIR    = Path(__file__).parent.parent / "public" / "cities"
DELAY_SECONDS = 10  # be polite to the APIs

# Highway tag sets per detail level
HIGHWAY_FILTERS = {
    "bare":     r"^(motorway|trunk|primary|secondary)$",
    "standard": r"^(motorway|trunk|primary|secondary|tertiary)$",
    "detailed": r"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified)$",
}


def get_osm_relation_id(search: str) -> int:
    """
    Query Nominatim for the OSM relation ID of the named admin boundary.
    Returns the first boundary relation found.
    """
    resp = requests.get(
        NOMINATIM_URL,
        params={"q": search, "format": "json", "limit": 5},
        headers={"User-Agent": "trace-app/1.0 (city background downloader)"},
        timeout=30,
    )
    resp.raise_for_status()
    for r in resp.json():
        if r.get("osm_type") == "relation" and r.get("class") == "boundary":
            return int(r["osm_id"])
    raise ValueError(f"No boundary relation found for: {search!r}")


def build_query(relation_id: int, detail: str) -> str:
    # Streets within the exact OSM admin boundary — no rectangular clipping
    hw = HIGHWAY_FILTERS[detail]
    return (
        f"[out:json][timeout:180];"
        f"rel({relation_id});"
        f"map_to_area->.a;"
        f'(way["highway"~"{hw}"](area.a););'
        f"out body;>;out skel qt;"
    )


def build_bbox_query(bbox: list, detail: str) -> str:
    """
    Streets inside a plain rectangle. Useful when the admin boundary is far
    larger than the area of interest — a whole municipality at `detailed` can
    run to tens of MB, which is not something to serve on a static page.
    """
    hw = HIGHWAY_FILTERS[detail]
    min_lng, min_lat, max_lng, max_lat = bbox
    # Overpass bbox order is south,west,north,east
    ob = f"{min_lat},{min_lng},{max_lat},{max_lng}"
    return (
        f"[out:json][timeout:180];"
        f'(way["highway"~"{hw}"]({ob}););'
        f"out body;>;out skel qt;"
    )


def fetch_city(city: dict, detail: str, bbox: list = None, attempts: int = 2) -> dict:
    if bbox:
        print("bbox", end=" ", flush=True)
        query = build_bbox_query(bbox, detail)
    else:
        rel_id = get_osm_relation_id(city["search"])
        print(f"relation {rel_id}", end=" ", flush=True)
        query = build_query(rel_id, detail)
    last_err = None
    for attempt in range(attempts):
        for url in OVERPASS_URLS:
            try:
                resp = requests.post(
                    url,
                    data={"data": query},
                    headers={"User-Agent": "trace-app/1.0 (city background downloader)"},
                    timeout=300,
                )
                resp.raise_for_status()
                return resp.json()
            except Exception as e:  # noqa: BLE001 — any endpoint failure moves to the next
                last_err = e
                print(f"\n    {url.split('//')[1].split('/')[0]} failed ({e}); trying next",
                      end=" ", flush=True)
                time.sleep(5)
    raise RuntimeError(f"all Overpass endpoints failed: {last_err}")


def build_coords(data: dict) -> list:
    """Return list of [[lng, lat], [lng, lat]] segments from Overpass response."""
    nodes = {}
    ways  = []

    for el in data["elements"]:
        if el["type"] == "node":
            nodes[el["id"]] = [el["lon"], el["lat"]]
        elif el["type"] == "way" and "nodes" in el:
            ways.append(el["nodes"])

    coords = []
    for node_list in ways:
        for i in range(len(node_list) - 1):
            u = nodes.get(node_list[i])
            v = nodes.get(node_list[i + 1])
            if u and v:
                coords.append([u, v])

    return coords


def round_coords(coords: list, dp: int = 5) -> list:
    """
    OSM ships 7 decimal places (~1 cm). 5dp is ~1 m — far past what a street
    render resolves — and trims roughly 15% off the file before compression.
    """
    return [[[round(x, dp), round(y, dp)] for x, y in seg] for seg in coords]


def main():
    parser = argparse.ArgumentParser(description="Download city street networks from OSM.")
    parser.add_argument(
        "cities", nargs="*",
        help="City IDs to download (default: all). E.g. buenos-aires tokyo london",
    )
    parser.add_argument(
        "--detail", choices=["bare", "standard", "detailed"], default="standard",
        help=(
            "Street detail level: "
            "bare = motorway/trunk/primary/secondary, "
            "standard = + tertiary (default), "
            "detailed = + residential/service/unclassified"
        ),
    )
    parser.add_argument(
        "--bbox", default=None,
        help=(
            "Clip to a rectangle instead of the city's admin boundary: "
            "minLng,minLat,maxLng,maxLat. Use when the boundary is much larger "
            "than the area you need at this detail level."
        ),
    )
    args = parser.parse_args()

    bbox = None
    if args.bbox:
        bbox = [float(x) for x in args.bbox.split(",")]
        if len(bbox) != 4:
            parser.error("--bbox needs 4 comma-separated numbers: minLng,minLat,maxLng,maxLat")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    requested = set(args.cities)
    targets = [c for c in CITIES if not requested or c["id"] in requested]

    if not targets:
        print(f"No matching cities found for: {requested}")
        print(f"Available: {[c['id'] for c in CITIES]}")
        import sys; sys.exit(1)

    print(f"Detail level: {args.detail} ({HIGHWAY_FILTERS[args.detail]})\n")

    for i, city in enumerate(targets):
        out_path = OUTPUT_DIR / f"{city['id']}.json"
        print(f"[{i+1}/{len(targets)}] {city['name']} ...", end=" ", flush=True)

        try:
            data   = fetch_city(city, args.detail, bbox)
            coords = round_coords(build_coords(data))
            print(f"→ {len(coords):,} segments", end=" ")

            payload = {"id": city["id"], "name": city["name"], "coords": coords}
            with open(out_path, "w") as f:
                json.dump(payload, f, separators=(",", ":"))

            size_kb = out_path.stat().st_size / 1024
            print(f"({size_kb:.0f} KB)")

        except Exception as e:
            print(f"ERROR: {e}")

        if i < len(targets) - 1:
            print(f"  (waiting {DELAY_SECONDS}s...)")
            time.sleep(DELAY_SECONDS)

    print("\nDone. Files saved to public/cities/")


if __name__ == "__main__":
    main()
