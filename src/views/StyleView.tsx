import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DeckGL } from '@deck.gl/react'
import { PathLayer } from '@deck.gl/layers'
import type { TracePoint } from '@/lib/parseTimeline'
import { fetchOSMNetwork, buildGraphFromCoords, type OSMEdge, type OSMGraph } from '@/lib/fetchOSMNetwork'
import { mapPointsToEdges } from '@/lib/mapPointsToEdges'
import { runPipeline, computeBgIntensity, DEFAULT_PARAMS, type VisualizationParams } from '@/lib/algorithms'
import { getEdgeColor, getEdgeWidth, PRESETS, DEFAULT_PRESET, type ColorPreset } from '@/lib/colorUtils'
import type { CityMeta } from '@/lib/cities'
import type { ExportRenderData } from '@/lib/exportRenderer'

interface Props {
  points: TracePoint[]
  city?: CityMeta | null
  onBack: () => void
  onExport: (data: ExportRenderData) => void
}

type LoadState = 'idle' | 'fetching' | 'processing' | 'ready' | 'error'
type BgMode = 'spread' | 'city' | 'off'

interface VisParams extends VisualizationParams {
  baseWidth: number
  widthCap: number
}

const DEFAULT_VIS_PARAMS: VisParams = {
  ...DEFAULT_PARAMS,
  baseWidth: 1,
  widthCap: 3,
}

export default function StyleView({ points, city = null, onBack, onExport }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const graphRef = useRef<OSMGraph | null>(null)

  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadMsg, setLoadMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<ColorPreset>(DEFAULT_PRESET)
  const [params, setParams] = useState<VisParams>(DEFAULT_VIS_PARAMS)
  const [processedEdges, setProcessedEdges] = useState<OSMEdge[]>([])
  // Raw city coords stored separately so the city background always shows the
  // full downloaded city grid, independent of the trace pipeline.
  const [cityEdges, setCityEdges] = useState<[number, number][][]>([])

  const [mapReady, setMapReady] = useState(false)

  const [bgMode, setBgMode] = useState<BgMode>(city ? 'city' : 'spread')
  const [bgOpacity, setBgOpacity] = useState(20) // 0–100
  const [bgSpread, setBgSpread] = useState(10)   // 0–50 hops

  // Compute bbox from points
  const bbox = (() => {
    const lats = points.map(p => p.lat)
    const lngs = points.map(p => p.lng)
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as [number, number, number, number]
  })()

  // Small fixed buffer so GPS points right at the edge still snap to edges
  const bgPad = 0.01

  const centerLng = (bbox[0] + bbox[2]) / 2
  const centerLat = (bbox[1] + bbox[3]) / 2

  // deck.gl view state — synced to MapLibre via move listener
  const [viewState, setViewState] = useState({
    longitude: centerLng,
    latitude: centerLat,
    zoom: 12,
    pitch: 0,
    bearing: 0,
  })

  // Init map — includes CartoDB tile source/layer (hidden by default)
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': preset.background } },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 12,
      interactive: true,
    })
    mapRef.current = map

    map.on('load', () => {
      setMapReady(true)
    })

    map.on('move', () => {
      const c = map.getCenter()
      setViewState({
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      })
    })

    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update MapLibre background color when preset changes
  useEffect(() => {
    if (!mapReady) return
    mapRef.current?.setPaintProperty('bg', 'background-color', preset.background)
  }, [preset, mapReady])

  // Load street network + run pipeline (once on mount)
  // When a city is selected: load pre-downloaded city JSON → skip Overpass entirely
  // When no city: fetch from Overpass with fallback endpoints
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadState('fetching')
      setError(null)
      try {
        let graph: OSMGraph

        if (city) {
          setLoadMsg(`Loading ${city.name} street network…`)
          const res = await fetch(`/cities/${city.id}.json`)
          if (!res.ok) throw new Error(`City data not found. Run: python scripts/download-cities.py ${city.id}`)
          const data = await res.json() as { coords: [number, number][][] }
          if (cancelled) return
          setCityEdges(data.coords)
          setLoadMsg('Building city graph…')
          await new Promise(r => setTimeout(r, 30))
          graph = buildGraphFromCoords(data.coords)
        } else {
          graph = await fetchOSMNetwork(bbox, msg => {
            if (!cancelled) setLoadMsg(msg)
          }, bgPad)
        }

        if (cancelled) return
        graphRef.current = graph

        setLoadState('processing')
        setLoadMsg('Mapping your traces to streets...')
        await new Promise(r => setTimeout(r, 50))
        mapPointsToEdges(points, graph, pct => {
          if (!cancelled) setLoadMsg(`Mapping points... ${Math.round(pct * 100)}%`)
        })

        if (cancelled) return
        setLoadMsg('Running visualization pipeline...')
        await new Promise(r => setTimeout(r, 50))
        runPipeline(graph, params)
        computeBgIntensity(graph, bgSpread)

        if (cancelled) return
        setProcessedEdges([...graph.edges])
        setLoadState('ready')
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load map data.')
          setLoadState('error')
        }
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-run pipeline + bg intensity when params or bgSpread change
  const rerunAll = useCallback(() => {
    const graph = graphRef.current
    if (!graph || loadState !== 'ready') return
    runPipeline(graph, params)
    computeBgIntensity(graph, bgSpread)
    setProcessedEdges([...graph.edges])
  }, [params, bgSpread, loadState])

  useEffect(() => {
    if (loadState !== 'ready') return
    rerunAll()
  }, [params, bgSpread, rerunAll, loadState])

  // Fit the camera to the data being drawn — called by the Center button.
  const fitToData = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (bgMode === 'city' && cityEdges.length > 0) {
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
      for (const seg of cityEdges) {
        for (const [lng, lat] of seg) {
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
        }
      }
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, duration: 600 })
    } else {
      map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 60, duration: 600 })
    }
  }, [bgMode, cityEdges, bbox])

  const bgAlpha = Math.round(bgOpacity * 2.55) // bgOpacity 0–100 → alpha 0–255

  // City grid: show every downloaded city edge at uniform opacity.
  // Uses raw cityEdges (direct from city JSON) so the full city is always
  // rendered regardless of what the trace pipeline produces.
  const cityLayer = bgMode === 'city' && cityEdges.length > 0
    ? [new PathLayer({
        id: 'city-grid',
        data: cityEdges,
        getPath: (seg: [number, number][]) => seg,
        getColor: [
          preset.baseStreetColor[0],
          preset.baseStreetColor[1],
          preset.baseStreetColor[2],
          bgAlpha,
        ] as [number, number, number, number],
        getWidth: preset.baseStreetWidth,
        widthUnits: 'pixels',
        widthMinPixels: 0.3,
        pickable: false,
        updateTriggers: { getColor: [preset.id, bgAlpha] },
      })]
    : []

  const layers = [
    ...cityLayer,
    ...(bgMode === 'spread' && processedEdges.length > 0 ? [
      new PathLayer({
        id: 'bg-streets',
        data: processedEdges,
        getPath: (e: OSMEdge) => e.coords,
        getColor: (e: OSMEdge) => [
          preset.baseStreetColor[0],
          preset.baseStreetColor[1],
          preset.baseStreetColor[2],
          Math.round(e.bgIntensity * bgAlpha),
        ] as [number, number, number, number],
        getWidth: preset.baseStreetWidth,
        widthUnits: 'pixels',
        widthMinPixels: 0.3,
        pickable: false,
        updateTriggers: { getColor: [preset.id, bgAlpha] },
      }),
    ] : []),
    new PathLayer({
      id: 'trace',
      data: processedEdges.filter(e => Math.abs(e.normalizedVisits) > 0),
      getPath: (e: OSMEdge) => e.coords,
      getColor: (e: OSMEdge) => getEdgeColor(e.normalizedVisits, preset),
      getWidth: (e: OSMEdge) => getEdgeWidth(e.normalizedVisits, params),
      widthUnits: 'pixels',
      widthMinPixels: 0.5,
      pickable: false,
      updateTriggers: {
        getColor: [preset.id, params],
        getWidth: [params],
      },
    }),
  ]

  const setParam = (key: keyof VisParams, value: number) =>
    setParams(p => ({ ...p, [key]: value }))

  function handleExport() {
    const graph = graphRef.current
    if (!graph || loadState !== 'ready') return
    onExport({
      processedEdges: [...graph.edges],
      cityEdges,
      bgMode,
      bgOpacity,
      bbox,
      preset,
      params: { baseWidth: params.baseWidth, widthCap: params.widthCap },
    })
  }

  const BG_OPTIONS: { value: BgMode; label: string; sub: string; disabled?: boolean }[] = [
    { value: 'spread', label: 'Street spread', sub: 'Fade from your trace outward' },
    {
      value: 'city',
      label: city ? `${city.name} grid` : 'City grid',
      sub: city ? 'Full city street skeleton' : 'No city selected — go back to Scope',
      disabled: !city,
    },
    { value: 'off', label: 'Off', sub: 'Solid background only' },
  ]

  return (
    <div className="h-full w-full flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm transition-colors">← Back</button>
        <h2 className="text-sm font-medium text-text-primary">Style your trace</h2>
        <button
          disabled={loadState !== 'ready'}
          onClick={handleExport}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-accent-purple to-accent-orange text-white disabled:opacity-30 hover:opacity-90 transition-all"
        >
          Export →
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-64 shrink-0 border-r border-border p-4 flex flex-col gap-5 overflow-y-auto">

          {/* Presets */}
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Preset</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p)}
                  className={`
                    py-2 px-3 rounded-lg text-xs font-medium border transition-all
                    ${preset.id === p.id
                      ? 'border-accent-purple text-accent-purple bg-accent-purple/10'
                      : 'border-border text-text-muted hover:border-accent-purple/50'
                    }
                  `}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Background mode */}
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Background</p>
            <div className="flex flex-col gap-1 mb-3">
              {BG_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  disabled={opt.disabled}
                  onClick={() => setBgMode(opt.value)}
                  className={`flex items-start gap-2.5 py-1.5 px-1 rounded-lg text-left w-full transition-colors ${
                    opt.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface'
                  }`}
                >
                  <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    bgMode === opt.value ? 'border-accent-purple' : 'border-border'
                  }`}>
                    {bgMode === opt.value && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-purple" />
                    )}
                  </span>
                  <span className="flex flex-col">
                    <span className={`text-xs font-medium leading-tight ${bgMode === opt.value ? 'text-text-primary' : 'text-text-muted'}`}>
                      {opt.label}
                    </span>
                    <span className="text-xs text-text-muted leading-tight mt-0.5">{opt.sub}</span>
                  </span>
                </button>
              ))}
            </div>

            {bgMode !== 'off' && (
              <div className="flex flex-col gap-3">
                <Slider label="Opacity" value={bgOpacity} min={0} max={100} step={2} onChange={setBgOpacity} />
                {bgMode === 'spread' && (
                  <Slider label="Spread" value={bgSpread} min={0} max={50} step={1} onChange={setBgSpread} />
                )}
              </div>
            )}
          </div>

          {/* Trace params */}
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Customize</p>
            <div className="flex flex-col gap-4">
              <Slider label="Spread" value={params.spreadCoefficient} min={1} max={30} step={1} onChange={v => setParam('spreadCoefficient', v)} tooltip="How many hops your trace diffuses into neighboring streets" />
              <Slider label="Smoothing" value={params.smoothingFactor} min={0.5} max={0.99} step={0.01} onChange={v => setParam('smoothingFactor', v)} tooltip="How gently color fades from busy to quiet streets" />
              <Slider label="Width" value={params.baseWidth} min={0} max={3} step={0.1} onChange={v => setParam('baseWidth', v)} tooltip="Base thickness of all street lines" />
              <Slider label="Width cap" value={params.widthCap} min={1} max={14} step={0.5} onChange={v => setParam('widthCap', v)} tooltip="Maximum thickness for your most-visited streets" />
              <Slider label="Fade threshold" value={params.transparencyThreshold} min={0} max={30} step={1} onChange={v => setParam('transparencyThreshold', v)} tooltip="Bottom % of visited streets that fade to transparent" />
              <Slider label="Influence threshold" value={params.influenceThreshold} min={1} max={20} step={1} onChange={v => setParam('influenceThreshold', v)} tooltip="Visits needed for a street to spread color to its neighbors" />
            </div>
          </div>

          {/* Load state */}
          {loadState !== 'ready' && (
            <div className="mt-auto pt-4 border-t border-border">
              {loadState === 'error' ? (
                <p className="text-red-400 text-xs">{error}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border border-accent-purple border-t-transparent animate-spin shrink-0" />
                  <p className="text-text-muted text-xs">{loadMsg}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Map + deck.gl overlay */}
        <div className="flex-1 relative">
          <div ref={mapContainer} className="absolute inset-0" />

          {/* Map controls */}
          <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary shadow-lg text-lg leading-none transition-colors"
              title="Zoom in"
            >+</button>
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary shadow-lg text-lg leading-none transition-colors"
              title="Zoom out"
            >−</button>
            <button
              onClick={fitToData}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary shadow-lg text-xs leading-none transition-colors"
              title="Center"
            >⌖</button>
          </div>

          <DeckGL
            style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', pointerEvents: 'none' }}
            viewState={viewState}
            onViewStateChange={({ viewState: vs }) => setViewState(vs as typeof viewState)}
            controller={false}
            layers={layers}
          />
        </div>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, tooltip }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  tooltip?: string
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="relative group flex items-center gap-1 cursor-default">
          <span className="text-xs text-text-muted">{label}</span>
          {tooltip && (
            <>
              <span className="text-[10px] text-text-muted/40">ⓘ</span>
              <span className="absolute bottom-full left-0 mb-2 w-48 bg-surface border border-border rounded-lg px-2.5 py-2 text-xs text-text-primary leading-snug opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                {tooltip}
              </span>
            </>
          )}
        </span>
        <span className="text-xs text-text-primary font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={String(value)}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent-purple"
      />
    </div>
  )
}
