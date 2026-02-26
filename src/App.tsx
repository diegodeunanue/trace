import { useState } from 'react'
import UploadView from '@/views/UploadView'
import ScopeView from '@/views/ScopeView'
import StyleView from '@/views/StyleView'
import ExportView from '@/views/ExportView'
import type { TracePoint } from '@/lib/parseTimeline'
import type { CityMeta } from '@/lib/cities'
import type { ExportRenderData } from '@/lib/exportRenderer'

export type AppStep = 'upload' | 'scope' | 'style' | 'export'

export interface ScopeSelection {
  bbox: [number, number, number, number]
  startDate: Date | null
  endDate: Date | null
  city: CityMeta | null
}

export default function App() {
  const [step, setStep]                 = useState<AppStep>('upload')
  const [allPoints, setAllPoints]       = useState<TracePoint[]>([])
  const [scopedPoints, setScopedPoints] = useState<TracePoint[]>([])
  const [selectedCity, setSelectedCity] = useState<CityMeta | null>(null)
  const [exportData, setExportData]     = useState<ExportRenderData | null>(null)

  function handleUpload(points: TracePoint[]) {
    setAllPoints(points)
    setStep('scope')
  }

  function handleScope(selection: ScopeSelection, filtered: TracePoint[]) {
    setScopedPoints(filtered)
    setSelectedCity(selection.city)
    setStep('style')
  }

  function handleBack() {
    if (step === 'scope')  setStep('upload')
    if (step === 'style')  setStep('scope')
    if (step === 'export') setStep('style')
  }

  function handleExport(data: ExportRenderData) {
    setExportData(data)
    setStep('export')
  }

  return (
    <div className="h-full w-full">
      {step === 'upload' && (
        <UploadView onUpload={handleUpload} />
      )}
      {step === 'scope' && (
        <ScopeView
          allPoints={allPoints}
          onConfirm={handleScope}
          onBack={handleBack}
        />
      )}
      {/* StyleView stays mounted under the export overlay so the graph is preserved */}
      {(step === 'style' || step === 'export') && (
        <StyleView
          points={scopedPoints}
          city={selectedCity}
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
  )
}
