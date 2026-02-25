/**
 * parseTimeline.ts
 *
 * Parses a Google Timeline JSON export into a flat array of TracePoints.
 * All processing is 100% client-side — no data leaves the browser.
 *
 * Supports the current Google Timeline format (semanticSegments).
 * Each segment contains either a timelinePath (GPS track) or a visit
 * (inferred place). Both are extracted.
 */

export interface TracePoint {
  lat: number
  lng: number
  timestamp: Date
  source: 'path' | 'visit'
}

/** Parse a coordinate string like "19.4046088°, -99.1662539°" */
function parseLatLng(str: string): [number, number] | null {
  const clean = str.replace(/°/g, '').trim()
  const parts = clean.split(',').map(s => parseFloat(s.trim()))
  if (parts.length !== 2 || parts.some(isNaN)) return null
  return [parts[0], parts[1]]
}

export interface ParseResult {
  points: TracePoint[]
  dateRange: { min: Date; max: Date } | null
  totalRaw: number
  skipped: number
}

export function parseTimelineJSON(raw: unknown): ParseResult {
  let totalRaw = 0
  let skipped = 0
  const points: TracePoint[] = []

  const data = raw as Record<string, unknown>
  const segments = data['semanticSegments'] as unknown[]

  if (!Array.isArray(segments)) {
    throw new Error(
      'Unrecognized Timeline format. Expected "semanticSegments" array. ' +
      'Make sure you exported the correct file from Google Takeout.'
    )
  }

  for (const seg of segments) {
    const segment = seg as Record<string, unknown>

    // --- timelinePath: GPS track points ---
    if (Array.isArray(segment['timelinePath'])) {
      for (const pt of segment['timelinePath'] as Record<string, unknown>[]) {
        totalRaw++
        const coords = parseLatLng(pt['point'] as string)
        const ts = pt['time'] ? new Date(pt['time'] as string) : null
        if (!coords || !ts || isNaN(ts.getTime())) { skipped++; continue }
        points.push({ lat: coords[0], lng: coords[1], timestamp: ts, source: 'path' })
      }
    }

    // --- visit: inferred place visit ---
    const visit = segment['visit'] as Record<string, unknown> | undefined
    if (visit) {
      totalRaw++
      try {
        const top = (visit['topCandidate'] as Record<string, unknown>)
        const loc = (top['placeLocation'] as Record<string, unknown>)
        const coords = parseLatLng(loc['latLng'] as string)
        const ts = segment['startTime'] ? new Date(segment['startTime'] as string) : null
        if (!coords || !ts || isNaN(ts.getTime())) { skipped++; continue }
        points.push({ lat: coords[0], lng: coords[1], timestamp: ts, source: 'visit' })
      } catch {
        skipped++
      }
    }
  }

  if (points.length === 0) {
    throw new Error('No location points found in the file. The Timeline may be empty or in an unexpected format.')
  }

  const timestamps = points.map(p => p.timestamp.getTime())
  const dateRange = {
    min: new Date(Math.min(...timestamps)),
    max: new Date(Math.max(...timestamps)),
  }

  return { points, dateRange, totalRaw, skipped }
}

/** Filter points by bounding box and optional date range */
export function filterPoints(
  points: TracePoint[],
  bbox: [number, number, number, number], // [minLng, minLat, maxLng, maxLat]
  startDate: Date | null,
  endDate: Date | null,
): TracePoint[] {
  const [minLng, minLat, maxLng, maxLat] = bbox
  return points.filter(p => {
    if (p.lng < minLng || p.lng > maxLng) return false
    if (p.lat < minLat || p.lat > maxLat) return false
    if (startDate && p.timestamp < startDate) return false
    if (endDate && p.timestamp > endDate) return false
    return true
  })
}
