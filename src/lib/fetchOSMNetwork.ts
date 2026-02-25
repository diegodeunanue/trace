/**
 * fetchOSMNetwork.ts
 *
 * Fetches the street network for a bounding box from the Overpass API.
 * Builds a lightweight graph (nodes + edges) from the OSM way data.
 * The graph mirrors what osmnx produces in the Python cartograph pipeline.
 *
 * bgPad: if provided, the query area is expanded by this many degrees in
 * each direction while road-type selection is still based on the original
 * bbox. This gives a single request that covers both the trace area and the
 * surrounding city context — no second Overpass call needed.
 */

export interface OSMNode {
  id: number
  lat: number
  lng: number
}

export interface OSMEdge {
  id: string          // `${u}-${v}`
  u: number           // start node id
  v: number           // end node id
  coords: [number, number][]  // [[lng, lat], ...] — GeoJSON order for deck.gl
  visits: number      // filled in by mapPointsToEdges
  originalVisits: number  // snapshot after mapPointsToEdges, before pipeline
  normalizedVisits: number  // filled in by normalizing pipeline
  bgIntensity: number // 0–1, distance-weighted fade from visited edges for background layer
}

export interface OSMGraph {
  nodes: Map<number, OSMNode>
  edges: OSMEdge[]
  /** adjacency: node id → list of edge indices */
  adjacency: Map<number, number[]>
}

// Try endpoints in order; each gets 25 s before we move on
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

async function fetchOverpass(query: string): Promise<{ elements: { type: string; id: number; lat?: number; lon?: number; nodes?: number[] }[] }> {
  let lastMsg = 'unknown error'
  for (const url of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 25_000)
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (res.ok) return await res.json() as { elements: { type: string; id: number; lat?: number; lon?: number; nodes?: number[] }[] }
      lastMsg = `${res.status}`
    } catch (e) {
      clearTimeout(timer)
      lastMsg = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`Overpass API error: ${lastMsg}`)
}

function buildQuery(
  traceBbox: [number, number, number, number],
  queryBbox: [number, number, number, number],
): string {
  const [minLng, minLat, maxLng, maxLat] = traceBbox
  const areakm2 =
    (maxLat - minLat) * 111 *
    (maxLng - minLng) * 111 *
    Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180))

  const [qMinLng, qMinLat, qMaxLng, qMaxLat] = queryBbox
  const ob = `${qMinLat},${qMinLng},${qMaxLat},${qMaxLng}`

  if (areakm2 > 500) {
    return `[out:json][timeout:25];(way["highway"~"^(motorway|trunk|primary|secondary|motorway_link|trunk_link|primary_link|secondary_link)$"](${ob}););out body;>;out skel qt;`
  } else if (areakm2 > 50) {
    return `[out:json][timeout:25];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${ob}););out body;>;out skel qt;`
  } else {
    return `[out:json][timeout:25];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified)$"](${ob}););out body;>;out skel qt;`
  }
}

/**
 * Build a full OSMGraph from a flat array of coordinate segments.
 * Used when city data is available so we can skip the Overpass fetch entirely.
 */
export function buildGraphFromCoords(coords: [number, number][][]): OSMGraph {
  const nodeMap = new Map<string, number>()
  const nodes = new Map<number, OSMNode>()
  const edges: OSMEdge[] = []
  const adjacency = new Map<number, number[]>()
  let nextId = 0

  function getNode(lng: number, lat: number): number {
    // 5 decimal places ≈ 1m precision — deduplicates shared nodes
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`
    if (nodeMap.has(key)) return nodeMap.get(key)!
    const id = nextId++
    nodeMap.set(key, id)
    nodes.set(id, { id, lat, lng })
    return id
  }

  for (const seg of coords) {
    for (let i = 0; i < seg.length - 1; i++) {
      const [lng1, lat1] = seg[i]
      const [lng2, lat2] = seg[i + 1]
      const u = getNode(lng1, lat1)
      const v = getNode(lng2, lat2)
      const idx = edges.length
      edges.push({ id: `${u}-${v}`, u, v, coords: [[lng1, lat1], [lng2, lat2]], visits: 0, originalVisits: 0, normalizedVisits: 0, bgIntensity: 0 })
      if (!adjacency.has(u)) adjacency.set(u, [])
      if (!adjacency.has(v)) adjacency.set(v, [])
      adjacency.get(u)!.push(idx)
      adjacency.get(v)!.push(idx)
    }
  }

  return { nodes, edges, adjacency }
}

export async function fetchOSMNetwork(
  bbox: [number, number, number, number],
  onProgress?: (msg: string) => void,
  bgPad = 0,
): Promise<OSMGraph> {
  onProgress?.('Querying OpenStreetMap...')

  const [minLng, minLat, maxLng, maxLat] = bbox
  const queryBbox: [number, number, number, number] = bgPad > 0
    ? [minLng - bgPad, minLat - bgPad, maxLng + bgPad, maxLat + bgPad]
    : bbox

  const query = buildQuery(bbox, queryBbox)
  onProgress?.('Querying OpenStreetMap…')
  const data = await fetchOverpass(query)
  onProgress?.('Parsing street network...')

  const nodes = new Map<number, OSMNode>()
  const wayNodeLists: number[][] = []

  for (const el of data.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, { id: el.id, lat: el.lat, lng: el.lon })
    }
    if (el.type === 'way' && el.nodes) {
      wayNodeLists.push(el.nodes)
    }
  }

  onProgress?.('Building graph...')
  const edges: OSMEdge[] = []
  const adjacency = new Map<number, number[]>()

  const addAdj = (nodeId: number, edgeIdx: number) => {
    if (!adjacency.has(nodeId)) adjacency.set(nodeId, [])
    adjacency.get(nodeId)!.push(edgeIdx)
  }

  for (const nodeList of wayNodeLists) {
    for (let i = 0; i < nodeList.length - 1; i++) {
      const u = nodeList[i]
      const v = nodeList[i + 1]
      const nu = nodes.get(u)
      const nv = nodes.get(v)
      if (!nu || !nv) continue

      const edgeIdx = edges.length
      edges.push({
        id: `${u}-${v}`,
        u,
        v,
        coords: [[nu.lng, nu.lat], [nv.lng, nv.lat]],
        visits: 0,
        originalVisits: 0,
        normalizedVisits: 0,
        bgIntensity: 0,
      })
      addAdj(u, edgeIdx)
      addAdj(v, edgeIdx)
    }
  }

  onProgress?.(`Loaded ${edges.length.toLocaleString()} street segments`)
  return { nodes, edges, adjacency }
}
