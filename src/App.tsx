import { useEffect, useState } from 'react'
import UploadView from '@/views/UploadView'
import ScopeView from '@/views/ScopeView'
import StyleView, { type SampleTab } from '@/views/StyleView'
import ExportView from '@/views/ExportView'
import type { TracePoint } from '@/lib/parseTimeline'
import type { CityMeta } from '@/lib/cities'
import type { ExportRenderData } from '@/lib/exportRenderer'
import { PRESETS, type ColorPreset } from '@/lib/colorUtils'
import { DEMOS, DEFAULT_DEMO, loadDemo, demoCity, type DemoSet } from '@/lib/demo'

export type AppStep = 'upload' | 'scope' | 'style' | 'export'
/** 'demo' = baked sample trace; 'user' = something the visitor dropped in. */
export type DataMode = 'demo' | 'user'

export interface ScopeSelection {
  bbox: [number, number, number, number]
  startDate: Date | null
  endDate: Date | null
  city: CityMeta | null
}

const byId = (id: string) => PRESETS.find(p => p.id === id) ?? PRESETS[0]

/**
 * Desktop opens on Light — a cream, letterpress-looking print, which is the
 * strongest first impression the renderer produces. Mobile opens on Glow, where
 * the artwork is full-bleed behind a paper sheet and needs to read dark against
 * it.
 */
function initialPreset(): ColorPreset {
  const narrow = typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
  return narrow ? byId('glow-dark') : byId('light')
}

export default function App() {
  const [mode, setMode]             = useState<DataMode>('demo')
  const [activeDemo, setActiveDemo] = useState<DemoSet>(DEFAULT_DEMO)
  const [demoError, setDemoError]   = useState<string | null>(null)
  const [preset, setPreset]         = useState<ColorPreset>(initialPreset)

  const [step, setStep]             = useState<AppStep>('style')
  const [allPoints, setAllPoints]   = useState<TracePoint[]>([])
  const [exportData, setExportData] = useState<ExportRenderData | null>(null)

  /**
   * Points and their city must land together. StyleView loads its street
   * network once on mount and keys off `renderKey`, so committing the points
   * before the city would remount it against the previous city's network and
   * render nothing.
   */
  const [trace, setTrace] = useState<{
    points: TracePoint[]
    city: CityMeta | null
    renderKey: string
  } | null>(null)

  // The gallery chrome is neutral; this is the only colour it borrows from the
  // artwork, and every control reads it from the root.
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', preset.accent)
  }, [preset])

  useEffect(() => {
    if (mode !== 'demo') return
    let cancelled = false
    setDemoError(null)
    setTrace(null)
    loadDemo(activeDemo)
      .then(points => {
        if (cancelled) return
        setTrace({ points, city: demoCity(activeDemo), renderKey: `demo-${activeDemo.id}` })
        setStep('style')
      })
      .catch(e => {
        if (!cancelled) setDemoError(e instanceof Error ? e.message : 'Could not load the sample trace.')
      })
    return () => { cancelled = true }
  }, [mode, activeDemo])

  function handleUpload(points: TracePoint[]) {
    setAllPoints(points)
    setStep('scope')
  }

  function handleScope(selection: ScopeSelection, filtered: TracePoint[]) {
    setTrace({ points: filtered, city: selection.city, renderKey: `user-${Date.now()}` })
    setStep('style')
  }

  function handleBack() {
    // In demo mode there is no upload/scope history to walk back through — the
    // only meaningful "back" is switching to your own data.
    if (mode === 'demo') { startOwnData(); return }
    if (step === 'scope')  setStep('upload')
    if (step === 'style')  setStep('scope')
    if (step === 'export') setStep('style')
  }

  function handleExport(data: ExportRenderData) {
    setExportData(data)
    setStep('export')
  }

  function startOwnData() {
    setMode('user')
    setAllPoints([])
    setTrace(null)
    setExportData(null)
    setStep('upload')
  }

  function backToDemo() {
    setMode('demo')
    setActiveDemo(DEFAULT_DEMO)
  }

  const sampleTabs: SampleTab[] = DEMOS.map(d => ({ id: d.id, label: d.label }))

  return (
    <>
      {mode === 'user' && step === 'upload' && (
        <UploadView onUpload={handleUpload} onViewSample={backToDemo} />
      )}

      {mode === 'user' && step === 'scope' && (
        <ScopeView allPoints={allPoints} onConfirm={handleScope} onBack={handleBack} />
      )}

      {demoError && mode === 'demo' && (
        <div className="h-full w-full flex flex-col items-center justify-center gap-5 bg-wall text-center px-6">
          <p className="font-mono text-[11px] tracking-[.06em] text-ink">{demoError}</p>
          <button
            onClick={startOwnData}
            className="border border-line rounded-sm px-4 py-2 font-sans text-[11px] font-medium
                       uppercase tracking-[.16em] hover:border-ink transition-colors"
          >
            Use your own data
          </button>
        </div>
      )}

      {/* StyleView stays mounted under the export overlay so the graph is
          preserved. Keyed so a new trace remounts it against the right network. */}
      {!demoError && (step === 'style' || step === 'export') && trace && (
        <StyleView
          key={trace.renderKey}
          points={trace.points}
          city={trace.city}
          preset={preset}
          onPresetChange={setPreset}
          samples={mode === 'demo' ? sampleTabs : undefined}
          activeSampleId={mode === 'demo' ? activeDemo.id : undefined}
          onSelectSample={mode === 'demo'
            ? (t) => { const d = DEMOS.find(x => x.id === t.id); if (d) setActiveDemo(d) }
            : undefined}
          backLabel={mode === 'demo' ? 'use your own data' : 'back'}
          onBack={handleBack}
          onExport={handleExport}
        />
      )}

      {step === 'export' && exportData && (
        <div className="fixed inset-0 z-50">
          <ExportView data={exportData} onBack={() => setStep('style')} />
        </div>
      )}
    </>
  )
}
