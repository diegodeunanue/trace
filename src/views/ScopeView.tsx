import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { TracePoint } from '@/lib/parseTimeline'
import { filterPoints } from '@/lib/parseTimeline'
import type { ScopeSelection } from '@/App'
import { detectCities, type CityMeta } from '@/lib/cities'

interface Props {
  allPoints: TracePoint[]
  onConfirm: (selection: ScopeSelection, filtered: TracePoint[]) => void
  onBack: () => void
}

export default function ScopeView({ allPoints, onConfirm, onBack }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [pointCount, setPointCount] = useState(0)
  const [mode, setMode] = useState<'pan' | 'draw'>('pan')
  const [isDrawing, setIsDrawing] = useState(false)
  const drawStart = useRef<[number, number] | null>(null)
  const bboxLayerAdded = useRef(false)
  const [detectedCities, setDetectedCities] = useState<CityMeta[]>([])
  const [selectedCity, setSelectedCity] = useState<CityMeta | null>(null)

  // Date range from all points
  const { minDate, maxDate } = useMemo(() => {
    const ts = allPoints.map(p => p.timestamp.getTime())
    return {
      minDate: new Date(Math.min(...ts)).toISOString().split('T')[0],
      maxDate: new Date(Math.max(...ts)).toISOString().split('T')[0],
    }
  }, [allPoints])

  // Detect cities from effective bbox
  useEffect(() => {
    const lats = allPoints.map(p => p.lat)
    const lngs = allPoints.map(p => p.lng)
    const effectiveBbox: [number, number, number, number] = bbox ?? [
      Math.min(...lngs), Math.min(...lats),
      Math.max(...lngs), Math.max(...lats),
    ]
    const found = detectCities(effectiveBbox)
    setDetectedCities(found)
    // Clear selection if selected city is no longer detected
    setSelectedCity(prev => found.find(c => c.id === prev?.id) ?? null)
  }, [allPoints, bbox])

  // Compute filtered count
  useEffect(() => {
    const filtered = bbox
      ? filterPoints(
          allPoints,
          bbox,
          startDate ? new Date(startDate) : null,
          endDate ? new Date(endDate) : null,
        )
      : allPoints.filter(p => {
          if (startDate && p.timestamp < new Date(startDate)) return false
          if (endDate && p.timestamp > new Date(endDate)) return false
          return true
        })
    setPointCount(filtered.length)
  }, [allPoints, bbox, startDate, endDate])

  // Init map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    // Compute center from data
    const lats = allPoints.map(p => p.lat)
    const lngs = allPoints.map(p => p.lng)
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm-tiles', paint: { 'raster-opacity': 0.25 } }],
      },
      center: [centerLng, centerLat],
      zoom: 10,
    })

    map.on('load', () => {
      // Add dot layer for all points (sampled for perf)
      const sample = allPoints.filter((_, i) => i % Math.max(1, Math.floor(allPoints.length / 8000)) === 0)
      map.addSource('points', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: sample.map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: {},
          })),
        },
      })
      map.addLayer({
        id: 'dots',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': 2,
          'circle-color': '#9b59b6',
          'circle-opacity': 0.5,
        },
      })

      // Fit to data
      const bounds = new maplibregl.LngLatBounds()
      for (const p of allPoints) bounds.extend([p.lng, p.lat])
      map.fitBounds(bounds, { padding: 60, maxZoom: 12 })
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [allPoints])

  // Draw bbox on map
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.loaded()) return

    if (!bboxLayerAdded.current) {
      map.addSource('bbox', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'bbox-fill', type: 'fill', source: 'bbox', paint: { 'fill-color': '#9b59b6', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'bbox-line', type: 'line', source: 'bbox', paint: { 'line-color': '#9b59b6', 'line-width': 1.5 } })
      bboxLayerAdded.current = true
    }

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox
      ;(map.getSource('bbox') as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[minLng, minLat],[maxLng, minLat],[maxLng, maxLat],[minLng, maxLat],[minLng, minLat]]] },
          properties: {},
        }],
      })
    }
  }, [bbox])

  // Re-enable dragPan and cancel any in-progress draw when switching to pan mode
  useEffect(() => {
    if (mode === 'pan') {
      mapRef.current?.dragPan.enable()
      setIsDrawing(false)
      drawStart.current = null
    }
  }, [mode])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!mapRef.current || mode !== 'draw') return
    e.preventDefault()
    const map = mapRef.current
    map.dragPan.disable()
    const rect = mapContainer.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const lngLat = map.unproject([x, y])
    drawStart.current = [lngLat.lng, lngLat.lat]
    setIsDrawing(true)
  }, [mode])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !drawStart.current || !mapRef.current) return
    const map = mapRef.current
    const rect = mapContainer.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const lngLat = map.unproject([x, y])
    const [startLng, startLat] = drawStart.current
    setBbox([
      Math.min(startLng, lngLat.lng),
      Math.min(startLat, lngLat.lat),
      Math.max(startLng, lngLat.lng),
      Math.max(startLat, lngLat.lat),
    ])
  }, [isDrawing])

  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return
    mapRef.current?.dragPan.enable()
    setIsDrawing(false)
    drawStart.current = null
  }, [isDrawing])

  function handleConfirm() {
    const effectiveBbox = bbox ?? (() => {
      const lats = allPoints.map(p => p.lat)
      const lngs = allPoints.map(p => p.lng)
      return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as [number, number, number, number]
    })()
    const filtered = filterPoints(
      allPoints,
      effectiveBbox,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null,
    )
    onConfirm(
      {
        bbox: effectiveBbox,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        city: selectedCity,
      },
      filtered,
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm transition-colors">← Back</button>
        <h2 className="text-sm font-medium text-text-primary">Define your trace</h2>
        <button
          onClick={handleConfirm}
          disabled={pointCount === 0}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all bg-gradient-to-r from-accent-purple to-accent-orange text-white disabled:opacity-30 hover:opacity-90"
        >
          Use {pointCount.toLocaleString()} points →
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-64 shrink-0 border-r border-border p-4 flex flex-col gap-5 overflow-y-auto">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Draw area</p>
            <p className="text-xs text-text-muted leading-relaxed">
              Switch to <span className="text-text-primary">Draw</span> mode on the map, then drag to select an area. Leave blank to use all your data.
            </p>
            {bbox && (
              <button
                onClick={() => setBbox(null)}
                className="mt-2 text-xs text-accent-purple hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>

          {/* City detection */}
          {detectedCities.length > 0 && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Cities found</p>
              <p className="text-xs text-text-muted mb-3 leading-relaxed">Select one to use as map background in the next step.</p>
              <div className="flex flex-col gap-1">
                {detectedCities.map(city => (
                  <button
                    key={city.id}
                    onClick={() => setSelectedCity(prev => prev?.id === city.id ? null : city)}
                    className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left w-full transition-colors ${
                      selectedCity?.id === city.id
                        ? 'bg-accent-purple/15 border border-accent-purple/40'
                        : 'hover:bg-surface border border-transparent'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      selectedCity?.id === city.id ? 'border-accent-purple' : 'border-border'
                    }`}>
                      {selectedCity?.id === city.id && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-purple" />
                      )}
                    </span>
                    <span>
                      <span className="text-xs font-medium text-text-primary block leading-tight">{city.name}</span>
                      <span className="text-xs text-text-muted leading-tight">{city.country}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Date range</p>
            <div className="flex flex-col gap-2">
              <div>
                <label className="text-xs text-text-muted mb-1 block">From</label>
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-purple"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">To</label>
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-purple"
                />
              </div>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-border">
            <p className="text-xs text-text-muted">
              <span className="text-text-primary font-medium">{pointCount.toLocaleString()}</span> points selected
              {' '}/ {allPoints.length.toLocaleString()} total
            </p>
          </div>
        </div>

        {/* Map */}
        <div
          ref={mapContainer}
          className="flex-1 relative"
          style={{ cursor: mode === 'draw' ? 'crosshair' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Pan / Draw mode toggle */}
          <div className="absolute top-3 right-3 z-10 flex rounded-lg overflow-hidden border border-border shadow-lg text-xs font-medium">
            <button
              onClick={() => setMode('pan')}
              className={`px-3 py-1.5 transition-colors ${mode === 'pan' ? 'bg-accent-purple text-white' : 'bg-surface text-text-muted hover:text-text-primary'}`}
            >
              Pan
            </button>
            <button
              onClick={() => setMode('draw')}
              className={`px-3 py-1.5 transition-colors ${mode === 'draw' ? 'bg-accent-purple text-white' : 'bg-surface text-text-muted hover:text-text-primary'}`}
            >
              Draw
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
