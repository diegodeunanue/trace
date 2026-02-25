/**
 * algorithms.ts
 *
 * Port of cartograph's normalization pipeline:
 *   spreading → smoothing → normalizing
 *
 * All algorithms operate on the OSMGraph edges array in-place,
 * writing to edge.normalizedVisits.
 */

import type { OSMGraph } from './fetchOSMNetwork'

export interface VisualizationParams {
  spreadCoefficient: number   // default 5  — diffusion iterations
  smoothingFactor: number     // default 0.95 — gradient gentleness (0–1)
  transparencyThreshold: number // default 10 — % of low values that fade
}

export const DEFAULT_PARAMS: VisualizationParams = {
  spreadCoefficient: 5,
  smoothingFactor: 0.95,
  transparencyThreshold: 10,
}

/** Stage 1: spread activity from visited edges to connected neighbors */
function spread(graph: OSMGraph, coefficient: number): void {
  // Work on a copy so iterations don't bleed into each other
  const base = graph.edges.map(e => e.visits)

  for (let iter = 0; iter < coefficient; iter++) {
    for (let i = 0; i < graph.edges.length; i++) {
      if (base[i] === 0) continue
      const edge = graph.edges[i]
      for (const nodeId of [edge.u, edge.v]) {
        const neighbors = graph.adjacency.get(nodeId) ?? []
        for (const ni of neighbors) {
          if (base[ni] === 0) {
            // Mark as diffused with sentinel 0.5
            graph.edges[ni].visits = Math.max(graph.edges[ni].visits, 0.5)
          }
        }
      }
    }
    // Sync base for next iteration
    for (let i = 0; i < graph.edges.length; i++) base[i] = graph.edges[i].visits
  }
}

/** Stage 2: smooth gradients from high-visit edges to their neighbors */
function smooth(graph: OSMGraph, factor: number): void {
  const visits = graph.edges.map(e => e.visits)
  const maxV = Math.max(...visits)
  if (maxV === 0) return

  // Find top 10% edges (min 3 visits, or top 10% of max)
  const threshold = Math.max(3, maxV * 0.1)
  let active = graph.edges
    .map((e, i) => (e.visits >= threshold ? i : -1))
    .filter(i => i >= 0)

  const smoothed = [...visits]

  for (let iter = 0; iter < 50 && active.length > 0; iter++) {
    const nextActive: number[] = []
    for (const i of active) {
      const edge = graph.edges[i]
      const parentVal = smoothed[i]
      for (const nodeId of [edge.u, edge.v]) {
        const neighbors = graph.adjacency.get(nodeId) ?? []
        for (const ni of neighbors) {
          if (smoothed[ni] > 0) {
            const proposed = parentVal * factor
            if (proposed > smoothed[ni]) {
              smoothed[ni] = proposed
              nextActive.push(ni)
            }
          }
        }
      }
    }
    active = nextActive
  }

  for (let i = 0; i < graph.edges.length; i++) {
    graph.edges[i].visits = smoothed[i]
  }
}

/** Stage 3: normalize to 0–1 using sqrt scaling, apply transparency threshold */
function normalize(graph: OSMGraph, transparencyThreshold: number): void {
  const positiveVisits = graph.edges
    .map(e => e.visits)
    .filter(v => v > 0)

  if (positiveVisits.length === 0) return

  const maxV = Math.max(...positiveVisits)
  const uniqueSorted = [...new Set(positiveVisits)].sort((a, b) => a - b)
  const numUnique = uniqueSorted.length

  // Transparency threshold: bottom N% of unique values fade out
  const bottomN = Math.max(2, Math.floor(numUnique * transparencyThreshold / 100))
  const transparencyThresholdValue = uniqueSorted[bottomN - 1]

  for (const edge of graph.edges) {
    if (edge.visits <= 0) {
      edge.normalizedVisits = 0
      continue
    }
    // Square-root scaling (gives more visual range to lower values)
    const normalized = Math.sqrt(edge.visits / maxV)
    edge.normalizedVisits = normalized
  }

  // Store transparency info as negative values for edges below threshold
  // (renderer will treat abs value as intensity, sign as alpha flag)
  for (const edge of graph.edges) {
    if (edge.visits > 0 && edge.visits < transparencyThresholdValue) {
      // Partial transparency: scale alpha 0→1 over the threshold range
      const minV = uniqueSorted[0]
      const alphaFactor = (edge.visits - minV) / (transparencyThresholdValue - minV + 1e-9)
      edge.normalizedVisits = -Math.abs(edge.normalizedVisits) * Math.max(0.05, alphaFactor)
    }
  }
}

/** Run the full normalization pipeline on a graph */
export function runPipeline(graph: OSMGraph, params: VisualizationParams): void {
  spread(graph, params.spreadCoefficient)
  smooth(graph, params.smoothingFactor)
  normalize(graph, params.transparencyThreshold)
}
