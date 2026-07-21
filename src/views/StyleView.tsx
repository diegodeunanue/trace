import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DeckGL } from '@deck.gl/react'
import { PathLayer } from '@deck.gl/layers'
import type { TracePoint } from '@/lib/parseTimeline'
import { fetchOSMNetwork, buildGraphFromCoords, type OSMEdge, type OSMGraph } from '@/lib/fetchOSMNetwork'
import { mapPointsToEdges } from '@/lib/mapPointsToEdges'
import { runPipeline, computeBgIntensity, DEFAULT_PARAMS, type VisualizationParams } from '@/lib/algorithms'
import { getEdgeColor, getEdgeWidth, PRESETS, type ColorPreset } from '@/lib/colorUtils'
import type { CityMeta } from '@/lib/cities'
import type { ExportRenderData } from '@/lib/exportRenderer'
import { formatCoords, formatPeriod, formatYears } from '@/lib/traceMeta'
import Shell, { NavLink, PrimaryButton, SectionLabel } from '@/components/gallery/Shell'
import FramedPoster from '@/components/gallery/FramedPoster'
import { WallLabel, SampleTabs, Palette, Disclosure, GallerySlider } from '@/components/gallery/controls'

export interface SampleTab { id: string; label: string }

interface Props {
  points: TracePoint[]
  city?: CityMeta | null
  preset: ColorPreset
  onPresetChange: (p: ColorPreset) => void
  /** Sample switcher — omitted when the visitor is on their own data. */
  samples?: SampleTab[]
  activeSampleId?: string
  onSelectSample?: (t: SampleTab) => void
  backLabel?: string
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

const BG_LABELS: Record<BgMode, string> = {
  spread: 'Street spread',
  city: 'City grid',
  off: 'Off',
}

/** Mobile gets a different layout, not a reflow of the desktop rail. */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export default function StyleView({
  points, city = null, preset, onPresetChange,
  samples, activeSampleId, onSelectSample,
  backLabel, onBack, onExport,
}: Props) {
  const isNarrow = useIsNarrow()
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const graphRef = useRef<OSMGraph | null>(null)

  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadMsg, setLoadMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useState<VisParams>(DEFAULT_VIS_PARAMS)
  const [processedEdges, setProcessedEdges] = useState<OSMEdge[]>([])
  // Raw city coords stored separately so the city background always shows the
  // full downloaded city grid, independent of the trace pipeline.
  const [cityEdges, setCityEdges] = useState<[number, number][][]>([])
  const [mapReady, setMapReady] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const [bgMode, setBgMode] = useState<BgMode>(city ? 'city' : 'spread')
  const [bgOpacity, setBgOpacity] = useState(20) // 0–100
  const [bgSpread, setBgSpread] = useState(10)   // 0–50 hops

  const bbox = (() => {
    const lats = points.map(p => p.lat)
    const lngs = points.map(p => p.lng)
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as
      [number, number, number, number]
  })()

  // Small fixed buffer so GPS points right at the edge still snap to edges
  const bgPad = 0.01

  const centerLng = (bbox[0] + bbox[2]) / 2
  const centerLat = (bbox[1] + bbox[3]) / 2

  const [viewState, setViewState] = useState({
    longitude: centerLng,
    latitude: centerLat,
    zoom: 12,
    pitch: 0,
    bearing: 0,
  })

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
      attributionControl: false,
    })
    mapRef.current = map

    map.on('load', () => setMapReady(true))
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

    // MapLibre caches the container size at construction. The frame around the
    // artwork is measured and can settle a frame later, so track it.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(mapContainer.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  // The artwork sits in a framed box on desktop and full-bleed on mobile, so
  // crossing the breakpoint hands MapLibre a different container node. Rebuild
  // rather than leave the map bound to a node that is no longer in the tree.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow])

  useEffect(() => {
    if (!mapReady) return
    mapRef.current?.setPaintProperty('bg', 'background-color', preset.background)
  }, [preset, mapReady])

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
          graph = await fetchOSMNetwork(bbox, msg => { if (!cancelled) setLoadMsg(msg) }, bgPad)
        }

        if (cancelled) return
        graphRef.current = graph

        setLoadState('processing')
        setLoadMsg('Mapping your traces to streets…')
        await new Promise(r => setTimeout(r, 50))
        mapPointsToEdges(points, graph, pct => {
          if (!cancelled) setLoadMsg(`Mapping points… ${Math.round(pct * 100)}%`)
        })

        if (cancelled) return
        setLoadMsg('Running visualization pipeline…')
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

  /**
   * Frame the art, not the input. The raw point bbox is a poor guide: a single
   * airport transfer or bad GPS fix stretches it far past where the trace
   * actually lives, leaving the interesting part a speck in one corner. Framing
   * on the streets that actually lit up — weighted by visit count, so a long
   * tail of single-visit streets across town cannot drag the frame — puts the
   * composition on screen the way it will print.
   */
  useEffect(() => {
    if (loadState !== 'ready' || !mapReady) return
    const map = mapRef.current
    const graph = graphRef.current
    if (!map) return

    const wPct = (vals: { v: number; w: number }[], p: number) => {
      const sorted = [...vals].sort((a, b) => a.v - b.v)
      const total = sorted.reduce((s, x) => s + x.w, 0)
      let acc = 0
      for (const x of sorted) {
        acc += x.w
        if (acc >= total * p) return x.v
      }
      return sorted[sorted.length - 1].v
    }

    let frame = bbox
    const visited = graph?.edges.filter(e => e.originalVisits > 0) ?? []
    if (visited.length >= 20) {
      const lngs = visited.map(e => ({ v: (e.coords[0][0] + e.coords[1][0]) / 2, w: e.originalVisits }))
      const lats = visited.map(e => ({ v: (e.coords[0][1] + e.coords[1][1]) / 2, w: e.originalVisits }))
      frame = [wPct(lngs, 0.02), wPct(lats, 0.02), wPct(lngs, 0.98), wPct(lats, 0.98)]
    }

    map.resize()
    // On mobile the sheet covers the lower part of the canvas, so the work has
    // to be framed into the strip that is actually visible above it.
    const padding = isNarrow
      ? { top: 72, bottom: Math.round(window.innerHeight * 0.44), left: 20, right: 20 }
      : 24
    map.fitBounds([[frame[0], frame[1]], [frame[2], frame[3]]], { padding, duration: 0 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState, mapReady, isNarrow])

  const bgAlpha = Math.round(bgOpacity * 2.55)

  const cityLayer = bgMode === 'city' && cityEdges.length > 0
    ? [new PathLayer({
        id: 'city-grid',
        data: cityEdges,
        getPath: (seg: [number, number][]) => seg,
        getColor: [
          preset.baseStreetColor[0], preset.baseStreetColor[1], preset.baseStreetColor[2], bgAlpha,
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
          preset.baseStreetColor[0], preset.baseStreetColor[1], preset.baseStreetColor[2],
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
      updateTriggers: { getColor: [preset.id, params], getWidth: [params] },
    }),
  ]

  const setParam = (key: keyof VisParams, value: number) =>
    setParams(p => ({ ...p, [key]: value }))

  function handleExport() {
    const graph = graphRef.current
    if (!graph || loadState !== 'ready') return
    onExport({
      cityName: city?.name.toUpperCase(),
      period: formatYears(points),
      processedEdges: [...graph.edges],
      cityEdges,
      bgMode,
      bgOpacity,
      bbox,
      preset,
      params: { baseWidth: params.baseWidth, widthCap: params.widthCap },
    })
  }

  const title = city?.name ?? 'Your trace'

  const artwork = (
    <>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />
      <DeckGL
        style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', pointerEvents: 'none' }}
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs as typeof viewState)}
        controller={false}
        layers={layers}
      />
      {loadState !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-mat">
          <p className="font-mono text-[9px] uppercase tracking-[.22em] text-muted text-center px-6">
            {loadState === 'error' ? error : loadMsg || 'Preparing'}
          </p>
        </div>
      )}
    </>
  )

  const sliders = (
    <>
      <GallerySlider label="Spread" value={params.spreadCoefficient} min={1} max={30} step={1}
        onChange={v => setParam('spreadCoefficient', v)} />
      <GallerySlider label="Smoothing" value={params.smoothingFactor} min={0.5} max={0.99} step={0.01}
        onChange={v => setParam('smoothingFactor', v)} />
      <GallerySlider label="Width" value={params.baseWidth} min={0} max={3} step={0.1}
        onChange={v => setParam('baseWidth', v)} />
      <GallerySlider label="Width cap" value={params.widthCap} min={1} max={14} step={0.5}
        onChange={v => setParam('widthCap', v)} />
      <GallerySlider label="Fade threshold" value={params.transparencyThreshold} min={0} max={30} step={1}
        onChange={v => setParam('transparencyThreshold', v)} />
      <GallerySlider label="Influence" value={params.influenceThreshold} min={1} max={20} step={1}
        onChange={v => setParam('influenceThreshold', v)} />
    </>
  )

  // ── Mobile: the work is full-bleed and the controls ride over it in a sheet.
  if (isNarrow) {
    return (
      <div className="h-full w-full relative overflow-hidden" style={{ background: preset.background }}>
        <div className="absolute inset-0">{artwork}</div>

        {/* A scrim, not a bar: the status row has to stay legible over a dark
            Glow render and a cream Light one alike. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-24 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.45), transparent)' }}
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4">
          <span className="font-sans text-[16px] font-semibold lowercase tracking-[.34em] text-mat">
            trace
          </span>
          <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.18em] text-mat/85">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#8FD18F' }} />
            In-browser
          </span>
        </div>

        <div
          className="absolute inset-x-0 bottom-0 bg-mat shadow-sheet px-5 pt-3 pb-6 flex flex-col gap-4 overflow-y-auto"
          style={{ borderRadius: '22px 22px 0 0', maxHeight: adjustOpen ? '72%' : undefined }}
        >
          <span className="mx-auto w-9 h-1 rounded-full bg-line shrink-0" />

          <div className="flex items-baseline justify-between">
            <h2 className="font-sans text-[21px] font-medium">{title}</h2>
            <button
              onClick={() => setAdjustOpen(o => !o)}
              className="font-mono text-[9px] uppercase tracking-[.18em] text-muted"
            >
              Adjust {adjustOpen ? '▾' : '▴'}
            </button>
          </div>

          <p className="font-mono text-[10px] tracking-[.03em] text-muted -mt-2">
            {formatCoords(points)} · {formatPeriod(points)}
          </p>

          {samples && samples.length > 1 && activeSampleId && onSelectSample && (
            <SampleTabs items={samples} activeId={activeSampleId} onSelect={onSelectSample} />
          )}

          <Palette presets={PRESETS} activeId={preset.id} onSelect={onPresetChange} />

          {adjustOpen && <div className="flex flex-col gap-4 pt-1">{sliders}</div>}

          <div className="flex items-stretch gap-3 pt-1">
            {!adjustOpen && (
              <button
                onClick={() => setAdjustOpen(true)}
                className="flex-1 border border-line rounded-sm py-3 font-sans text-[11px]
                           font-medium uppercase tracking-[.16em]"
              >
                Adjust 6
              </button>
            )}
            <div className={adjustOpen ? 'w-full' : 'flex-1'}>
              <PrimaryButton full onClick={handleExport} disabled={loadState !== 'ready'}>
                Export →
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Shell
      screenLabel="Style"
      navLeft={<NavLink onClick={onBack}>← {backLabel ?? 'back'}</NavLink>}
      navRight={
        <span className="font-mono text-[10px] tracking-[.12em] text-muted">N° 001 / ∞</span>
      }
    >
      <div className="h-full w-full flex">
        {/* The work */}
        <div className="flex-1 min-w-0 relative">
          <FramedPoster canvasBg={preset.background}>{artwork}</FramedPoster>
        </div>

        {/* The rail */}
        <aside className="w-[352px] shrink-0 border-l border-line px-8 py-9 flex flex-col gap-7 overflow-y-auto">
          <WallLabel
            edition="Trace · N° 001"
            title={title}
            coords={formatCoords(points)}
            dates={formatPeriod(points)}
          />

          {samples && samples.length > 1 && activeSampleId && onSelectSample && (
            <div>
              <SectionLabel>Sample</SectionLabel>
              <SampleTabs items={samples} activeId={activeSampleId} onSelect={onSelectSample} />
            </div>
          )}

          <div>
            <SectionLabel>Palette</SectionLabel>
            <Palette presets={PRESETS} activeId={preset.id} onSelect={onPresetChange} />
          </div>

          <div className="border-t border-line pt-1">
            <Disclosure
              label="Adjust"
              summary={`${adjustOpen ? '' : '6 params'}`}
              open={adjustOpen}
              onToggle={() => setAdjustOpen(o => !o)}
            >
              {sliders}

              <div className="pt-3 mt-1 border-t border-line">
                <SectionLabel>Ground</SectionLabel>
                <div className="flex items-center gap-4 mb-4">
                  {(Object.keys(BG_LABELS) as BgMode[]).map(mode => {
                    const disabled = mode === 'city' && !city
                    const active = bgMode === mode
                    return (
                      <button
                        key={mode}
                        disabled={disabled}
                        onClick={() => setBgMode(mode)}
                        className={`font-mono text-[9px] uppercase tracking-[.16em] pb-0.5 border-b transition-all ${
                          active ? 'border-ink opacity-100' : 'border-transparent opacity-45 hover:opacity-80'
                        } ${disabled ? 'opacity-20 cursor-not-allowed hover:opacity-20' : ''}`}
                      >
                        {BG_LABELS[mode]}
                      </button>
                    )
                  })}
                </div>
                {bgMode !== 'off' && (
                  <div className="flex flex-col gap-4">
                    <GallerySlider label="Ground opacity" value={bgOpacity} min={0} max={100} step={2}
                      onChange={setBgOpacity} />
                    {bgMode === 'spread' && (
                      <GallerySlider label="Ground spread" value={bgSpread} min={0} max={50} step={1}
                        onChange={setBgSpread} />
                    )}
                  </div>
                )}
              </div>
            </Disclosure>
          </div>

          <div className="mt-auto pt-6">
            <PrimaryButton full onClick={handleExport} disabled={loadState !== 'ready'}>
              Compose print →
            </PrimaryButton>
          </div>
        </aside>
      </div>
    </Shell>
  )
}
