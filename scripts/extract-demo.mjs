#!/usr/bin/env node
/**
 * extract-demo.mjs
 *
 * Builds the baked sample traces in public/demo/ from a Google Timeline export.
 *
 * Usage:
 *     node scripts/extract-demo.mjs /path/to/Timeline.json
 *
 * The export itself is personal data and is never committed — only the small
 * scoped slices this script produces are. Each slice is deliberately narrow:
 *
 *   - clipped to one city bbox, so nothing outside the named city can leak in
 *   - clipped to one date window
 *   - overnight points (00:00-07:00 local) dropped: they are stationary, so
 *     they contribute a hotspot rather than a route, and a dwell cluster is the
 *     most identifying thing in a location history
 *   - coordinates rounded to 5dp (~1m), which is well past what the render needs
 *
 * The city bboxes below are tighter than the administrative bboxes in
 * src/lib/cities.ts. They frame where the trace actually lives; a single
 * airport transfer across the metro otherwise stretches the extent so far that
 * the interesting part renders as a speck.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = `${REPO}/public/demo`

// Both cities are UTC-3, so 03:00-10:00 UTC is local midnight to 07:00.
const NIGHT_START_UTC = 3
const NIGHT_END_UTC = 10

const SLICES = [
  {
    id: 'buenos-aires',
    label: 'Buenos Aires',
    bbox: [-58.54, -34.71, -58.34, -34.52],
    from: '2025-09-12T00:00:00Z',
    to: '2025-10-02T00:00:00Z',
  },
  {
    // Central Sao Paulo, not the full municipality — excludes the Guarulhos
    // airport run, which spans ~0.24 deg on its own.
    id: 'sao-paulo',
    label: 'São Paulo',
    bbox: [-46.75, -23.62, -46.62, -23.52],
    from: '2025-10-02T00:00:00Z',
    to: '2025-10-08T23:59:59Z',
  },
]

function parseLatLng(str) {
  if (typeof str !== 'string') return null
  const p = str.replace(/°/g, '').split(',').map(s => parseFloat(s.trim()))
  return (p.length === 2 && !p.some(Number.isNaN)) ? p : null
}

const src = process.argv[2]
if (!src) {
  console.error('Usage: node scripts/extract-demo.mjs /path/to/Timeline.json')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(src, 'utf8'))
if (!Array.isArray(raw.semanticSegments)) {
  console.error('Not a Google Timeline export: no "semanticSegments" array.')
  process.exit(1)
}

const all = []
for (const seg of raw.semanticSegments) {
  if (Array.isArray(seg.timelinePath)) {
    for (const pt of seg.timelinePath) {
      const c = parseLatLng(pt.point)
      const t = pt.time ? new Date(pt.time) : null
      if (c && t && !Number.isNaN(t.getTime())) {
        all.push({ lat: c[0], lng: c[1], t, source: 'path' })
      }
    }
  }
  if (seg.visit) {
    try {
      const c = parseLatLng(seg.visit.topCandidate.placeLocation.latLng)
      const t = seg.startTime ? new Date(seg.startTime) : null
      if (c && t && !Number.isNaN(t.getTime())) {
        all.push({ lat: c[0], lng: c[1], t, source: 'visit' })
      }
    } catch { /* malformed visit — skip */ }
  }
}

mkdirSync(OUT_DIR, { recursive: true })

for (const s of SLICES) {
  const from = new Date(s.from)
  const to = new Date(s.to)
  const [minLng, minLat, maxLng, maxLat] = s.bbox

  const inScope = all.filter(p =>
    p.t >= from && p.t <= to &&
    p.lng >= minLng && p.lng <= maxLng &&
    p.lat >= minLat && p.lat <= maxLat)

  const kept = inScope.filter(p => {
    const h = p.t.getUTCHours()
    return !(h >= NIGHT_START_UTC && h < NIGHT_END_UTC)
  })

  const points = kept
    .sort((a, b) => a.t - b.t)
    .map(p => ({
      lat: Math.round(p.lat * 1e5) / 1e5,
      lng: Math.round(p.lng * 1e5) / 1e5,
      timestamp: p.t.toISOString(),
      source: p.source,
    }))

  if (points.length === 0) {
    console.error(`${s.id}: no points in scope — check the date window and bbox.`)
    continue
  }

  const body = JSON.stringify({ city: s.id, label: s.label, points })
  writeFileSync(`${OUT_DIR}/${s.id}.json`, body)

  const days = new Set(points.map(p => p.timestamp.slice(0, 10))).size
  console.log(
    `${s.id.padEnd(14)} in-scope=${String(inScope.length).padStart(4)}  ` +
    `overnight-dropped=${String(inScope.length - kept.length).padStart(3)}  ` +
    `kept=${String(points.length).padStart(4)}  days=${days}  ` +
    `${(body.length / 1024).toFixed(0)}KB`)
}
