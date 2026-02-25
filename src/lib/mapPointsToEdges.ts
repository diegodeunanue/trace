/**
 * mapPointsToEdges.ts
 *
 * Assigns each GPS point to the nearest street edge in the OSM graph.
 * Uses a simple spatial grid index for performance (mirrors the KDTree
 * approach in cartograph's map_points_to_map.py).
 */

import type { TracePoint } from './parseTimeline'
import type { OSMEdge, OSMGraph } from './fetchOSMNetwork'

interface GridCell {
  edgeIndices: number[]
}

/** Build a spatial grid index over edge midpoints for fast nearest-edge lookup */
function buildSpatialIndex(edges: OSMEdge[], cellSize: number) {
  const grid = new Map<string, GridCell>()

  const cellKey = (lat: number, lng: number) =>
    `${Math.floor(lat / cellSize)},${Math.floor(lng / cellSize)}`

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]
    // Use midpoint of edge
    const midLat = (e.coords[0][1] + e.coords[1][1]) / 2
    const midLng = (e.coords[0][0] + e.coords[1][0]) / 2
    const key = cellKey(midLat, midLng)
    if (!grid.has(key)) grid.set(key, { edgeIndices: [] })
    grid.get(key)!.edgeIndices.push(i)
  }

  return { grid, cellKey, cellSize }
}

/** Point-to-segment distance (in degrees, good enough for nearest-edge matching) */
function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function mapPointsToEdges(
  points: TracePoint[],
  graph: OSMGraph,
  onProgress?: (pct: number) => void,
): void {
  // Reset visits
  for (const edge of graph.edges) edge.visits = 0

  const CELL = 0.002 // ~200m in degrees
  const { grid, cellSize } = buildSpatialIndex(graph.edges, CELL)

  const total = points.length
  for (let i = 0; i < total; i++) {
    if (i % 5000 === 0) onProgress?.(i / total)

    const p = points[i]
    let bestIdx = -1
    let bestDist = Infinity

    // Search current cell + 8 neighbors
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const key = `${Math.floor(p.lat / cellSize) + dr},${Math.floor(p.lng / cellSize) + dc}`
        const cell = grid.get(key)
        if (!cell) continue
        for (const idx of cell.edgeIndices) {
          const e = graph.edges[idx]
          const d = distToSegment(
            p.lng, p.lat,
            e.coords[0][0], e.coords[0][1],
            e.coords[1][0], e.coords[1][1],
          )
          if (d < bestDist) { bestDist = d; bestIdx = idx }
        }
      }
    }

    if (bestIdx >= 0 && bestDist < 0.005) { // ~500m max snap distance
      graph.edges[bestIdx].visits++
    }
  }

  onProgress?.(1)

  // Snapshot original GPS counts so the pipeline can reset before each run
  for (const edge of graph.edges) {
    edge.originalVisits = edge.visits
  }
}
