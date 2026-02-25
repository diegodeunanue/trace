import { useState } from 'react'
import UploadView from '@/views/UploadView'
import ScopeView from '@/views/ScopeView'
import StyleView from '@/views/StyleView'
import type { TracePoint } from '@/lib/parseTimeline'
import type { CityMeta } from '@/lib/cities'

export type AppStep = 'upload' | 'scope' | 'style'

export interface ScopeSelection {
  bbox: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
  startDate: Date | null
  endDate: Date | null
  city: CityMeta | null
}

export default function App() {
  const [step, setStep] = useState<AppStep>('upload')
  const [allPoints, setAllPoints] = useState<TracePoint[]>([])
  const [scopedPoints, setScopedPoints] = useState<TracePoint[]>([])
  const [selectedCity, setSelectedCity] = useState<CityMeta | null>(null)

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
    if (step === 'scope') setStep('upload')
    if (step === 'style') setStep('scope')
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
      {step === 'style' && (
        <StyleView
          points={scopedPoints}
          city={selectedCity}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
