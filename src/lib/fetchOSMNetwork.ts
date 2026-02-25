/**
 * fetchOSMNetwork.ts
 *
 * Fetches the street network for a bounding box from the Overpass API.
 * Builds a lightweight graph (nodes + edges) from the OSM way data.
 * The graph mirrors what osmnx produces in the Python cartograph pipeline.
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
  normalizedVisits: number  // filled in by normalizing pipeline
}

export interface OSMGraph {
  nodes: Map<number, OSMNode>
  edges: OSMEdge[]
  /** adjacency: node id → list of edge indices */
  adjacency: Map<number, number[]>
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/** Automatically pick network type based on bbox area (mirrors osmnx logic) */
function networkTypeQuery(bbox: [number, number, number, number]): string {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const latDiff = maxLat - minLat
  const lngDiff = maxLng - minLng
  // Rough km² estimate
  const areakm2 = latDiff * 111 * lngDiff * 111 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)

  // Overpass bbox format: south,west,north,east
  const ob = `${minLat},${minLng},${maxLat},${maxLng}`

  if (areakm2 > 1000) {
    // Large area: primary roads only
    return `[out:json][timeout:60];(way["highway"~"^(motorway|trunk|primary|motorway_link|trunk_link|primary_link)$"](${ob}););out body;>;out skel qt;`
  } else if (areakm2 > 100) {
    // Medium: drive + service
    return `[out:json][timeout:60];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${ob}););out body;>;out skel qt;`
  } else {
    // Small: all walkable streets
    return `[out:json][timeout:60];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|living_street|pedestrian|footway|path|cycleway|steps|unclassified)$"](${ob}););out body;>;out skel qt;`
  }
}

export async function fetchOSMNetwork(
  bbox: [number, number, number, number],
  onProgress?: (msg: string) => void,
): Promise<OSMGraph> {
  onProgress?.('Querying OpenStreetMap...')

  const query = networkTypeQuery(bbox)
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`)

  onProgress?.('Parsing street network...')
  const data = await res.json() as { elements: { type: string; id: number; lat?: number; lon?: number; nodes?: number[] }[] }

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
        normalizedVisits: 0,
      })
      addAdj(u, edgeIdx)
      addAdj(v, edgeIdx)
    }
  }

  onProgress?.(`Loaded ${edges.length.toLocaleString()} street segments`)
  return { nodes, edges, adjacency }
}
