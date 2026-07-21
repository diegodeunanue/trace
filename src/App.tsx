import { useEffect, useState } from 'react'
import UploadView from '@/views/UploadView'
import ScopeView from '@/views/ScopeView'
import StyleView from '@/views/StyleView'
import ExportView from '@/views/ExportView'
import PrivacyBar from '@/components/PrivacyBar'
import DemoBar from '@/components/DemoBar'
import type { TracePoint } from '@/lib/parseTimeline'
import type { CityMeta } from '@/lib/cities'
import type { ExportRenderData } from '@/lib/exportRenderer'
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

export default function App() {
  const [mode, setMode]                 = useState<DataMode>('demo')
  const [activeDemo, setActiveDemo]     = useState<DemoSet>(DEFAULT_DEMO)
  const [demoError, setDemoError]       = useState<string | null>(null)

  const [step, setStep]                 = useState<AppStep>('style')
  const [allPoints, setAllPoints]       = useState<TracePoint[]>([])
  const [exportData, setExportData]     = useState<ExportRenderData | null>(null)

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

  // Load the sample trace on mount, and again whenever the demo is switched.
  // The visitor sees a finished poster without touching anything.
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
    // In demo mode there is no upload/scope history to walk back through —
    // the only meaningful "back" is switching to your own data.
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

  const showDemoBar = mode === 'demo' && step !== 'export'

  return (
    <div className="h-full w-full flex flex-col bg-bg">
      <PrivacyBar mode={mode} onUseOwnData={startOwnData} onBackToDemo={backToDemo} />

      {showDemoBar && (
        <DemoBar
          demos={DEMOS}
          active={activeDemo}
          onSelect={setActiveDemo}
          onUseOwnData={startOwnData}
        />
      )}

      <div className="flex-1 min-h-0 relative">
        {demoError && mode === 'demo' && (
          <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-red-400 text-sm">{demoError}</p>
            <button
              onClick={startOwnData}
              className="px-4 py-2 rounded-lg text-sm border border-border text-text-muted hover:text-text-primary hover:border-accent-purple/50 transition-colors"
            >
              Use your own data instead
            </button>
          </div>
        )}

        {mode === 'user' && step === 'upload' && (
          <UploadView onUpload={handleUpload} />
        )}

        {mode === 'user' && step === 'scope' && (
          <ScopeView
            allPoints={allPoints}
            onConfirm={handleScope}
            onBack={handleBack}
          />
        )}

        {/* Loading the sample: keep the canvas area occupied so the layout does
            not jump when the trace arrives. */}
        {mode === 'demo' && !demoError && !trace && (
          <div className="h-full w-full flex items-center justify-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-accent-purple border-t-transparent animate-spin" />
            <p className="text-text-muted text-sm">Loading the {activeDemo.label} sample…</p>
          </div>
        )}

        {/* StyleView stays mounted under the export overlay so the graph is preserved.
            Keyed so a new trace remounts it and reloads the matching street network. */}
        {!demoError && (step === 'style' || step === 'export') && trace && (
          <StyleView
            key={trace.renderKey}
            points={trace.points}
            city={trace.city}
            backLabel={mode === 'demo' ? 'Use your own data' : undefined}
            onBack={handleBack}
            onExport={handleExport}
          />
        )}

        {step === 'export' && exportData && (
          <div className="fixed inset-0 z-50">
            <ExportView data={exportData} onBack={() => setStep('style')} />
          </div>
        )}
      </div>
    </div>
  )
}
