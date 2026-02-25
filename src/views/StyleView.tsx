import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DeckGL } from '@deck.gl/react'
import { PathLayer } from '@deck.gl/layers'
import type { TracePoint } from '@/lib/parseTimeline'
import { fetchOSMNetwork, type OSMGraph } from '@/lib/fetchOSMNetwork'
import { mapPointsToEdges } from '@/lib/mapPointsToEdges'
import { runPipeline, DEFAULT_PARAMS, type VisualizationParams } from '@/lib/algorithms'
import { getEdgeColor, getEdgeWidth, PRESETS, DEFAULT_PRESET, type ColorPreset } from '@/lib/colorUtils'
import type { ScopeSelection } from '@/App'

interface Props {
  points: TracePoint[]
  scopeSelection?: ScopeSelection
  onBack: () => void
}

type LoadState = 'idle' | 'fetching' | 'processing' | 'ready' | 'error'

interface VisParams extends VisualizationParams {
  baseWidth: number
  widthCap: number
}

const DEFAULT_VIS_PARAMS: VisParams = {
  ...DEFAULT_PARAMS,
  baseWidth: 1,
  widthCap: 3,
}

export default function StyleView({ points, onBack }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const graphRef = useRef<OSMGraph | null>(null)

  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadMsg, setLoadMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<ColorPreset>(DEFAULT_PRESET)
  const [params, setParams] = useState<VisParams>(DEFAULT_VIS_PARAMS)
  const [processedEdges, setProcessedEdges] = useState<OSMGraph['edges']>([])

  // Compute bbox from points
  const bbox = (() => {
    const lats = points.map(p => p.lat)
    const lngs = points.map(p => p.lng)
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as [number, number, number, number]
  })()

  const centerLng = (bbox[0] + bbox[2]) / 2
  const centerLat = (bbox[1] + bbox[3]) / 2

  // Init map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': preset.background } }],
      },
      center: [centerLng, centerLat],
      zoom: 12,
      interactive: true,
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update map background when preset changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.loaded()) return
    map.setPaintProperty('bg', 'background-color', preset.background)
  }, [preset])

  // Fetch OSM + map points (once on mount)
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadState('fetching')
      setError(null)
      try {
        const graph = await fetchOSMNetwork(bbox, msg => {
          if (!cancelled) setLoadMsg(msg)
        })
        if (cancelled) return
        graphRef.current = graph

        setLoadState('processing')
        setLoadMsg('Mapping your traces to streets...')

        // Run in next tick to allow UI update
        await new Promise(r => setTimeout(r, 50))
        mapPointsToEdges(points, graph, pct => {
          if (!cancelled) setLoadMsg(`Mapping points... ${Math.round(pct * 100)}%`)
        })

        if (cancelled) return
        setLoadMsg('Running visualization pipeline...')
        await new Promise(r => setTimeout(r, 50))
        runPipeline(graph, params)

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

  // Re-run pipeline when params change (after initial load)
  const rerunPipeline = useCallback(() => {
    const graph = graphRef.current
    if (!graph || loadState !== 'ready') return
    runPipeline(graph, params)
    setProcessedEdges([...graph.edges])
  }, [params, loadState])

  useEffect(() => {
    if (loadState !== 'ready') return
    rerunPipeline()
  }, [params, rerunPipeline, loadState])

  // deck.gl view state synced to MapLibre
  const [viewState, setViewState] = useState({
    longitude: centerLng,
    latitude: centerLat,
    zoom: 12,
    pitch: 0,
    bearing: 0,
  })

  const layers = [
    new PathLayer({
      id: 'trace',
      data: processedEdges.filter(e => Math.abs(e.normalizedVisits) > 0),
      getPath: (e: OSMGraph['edges'][0]) => e.coords,
      getColor: (e: OSMGraph['edges'][0]) => getEdgeColor(e.normalizedVisits, preset),
      getWidth: (e: OSMGraph['edges'][0]) => getEdgeWidth(e.normalizedVisits, params),
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

  return (
    <div className="h-full w-full flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm transition-colors">← Back</button>
        <h2 className="text-sm font-medium text-text-primary">Style your trace</h2>
        <button
          disabled={loadState !== 'ready'}
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

          {/* Params */}
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Customize</p>
            <div className="flex flex-col gap-4">
              <Slider label="Spread" value={params.spreadCoefficient} min={1} max={12} step={1} onChange={v => setParam('spreadCoefficient', v)} />
              <Slider label="Smoothing" value={params.smoothingFactor} min={0.5} max={0.99} step={0.01} onChange={v => setParam('smoothingFactor', v)} />
              <Slider label="Width" value={params.baseWidth} min={0.5} max={4} step={0.5} onChange={v => setParam('baseWidth', v)} />
              <Slider label="Width cap" value={params.widthCap} min={1} max={8} step={0.5} onChange={v => setParam('widthCap', v)} />
              <Slider label="Fade threshold" value={params.transparencyThreshold} min={0} max={30} step={1} onChange={v => setParam('transparencyThreshold', v)} />
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

function Slider({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-text-muted">{label}</span>
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
