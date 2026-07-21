import { useCallback, useState } from 'react'
import { parseTimelineJSON, type TracePoint } from '@/lib/parseTimeline'

interface Props {
  onUpload: (points: TracePoint[]) => void
}

export default function UploadView({ onUpload }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)

  const processFile = useCallback(async (file: File) => {
    setError(null)
    setLoading(true)
    try {
      const text = await file.text()
      const raw = JSON.parse(text) as unknown
      const result = parseTimelineJSON(raw)
      onUpload(result.points)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file.')
    } finally {
      setLoading(false)
    }
  }, [onUpload])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-bg px-6">
      {/* Intro */}
      <div className="mb-10 text-center max-w-lg">
        <h1 className="text-3xl font-light tracking-tight text-text-primary">
          Drop in your location history
        </h1>
        <p className="mt-3 text-text-muted text-sm leading-relaxed">
          Trace turns it into a clean, poster-quality geographical illustration —
          a trip, a honeymoon, or a whole year on one print.
        </p>
      </div>

      {/* Drop zone */}
      <label
        className={`
          w-full max-w-md aspect-video flex flex-col items-center justify-center
          border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200
          ${dragging
            ? 'border-accent-purple bg-accent-purple/5 scale-[1.02]'
            : 'border-border hover:border-accent-purple/50 hover:bg-surface'
          }
        `}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".json"
          className="hidden"
          onChange={onFileInput}
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-accent-purple border-t-transparent animate-spin" />
            <p className="text-text-muted text-sm">Parsing your data...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center px-8">
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-accent-purple">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <p className="text-text-primary text-sm font-medium">
              Drop your Timeline JSON here
            </p>
            <p className="text-text-muted text-xs leading-relaxed">
              Export from Google Takeout → Location History → Timeline.json
            </p>
          </div>
        )}
      </label>

      {error && (
        <p className="mt-4 text-red-400 text-xs text-center max-w-sm">{error}</p>
      )}

      {/* Privacy note — restated at the exact moment it matters, next to the
          file picker. Deliberately precise about the one network call the app
          does make, so the claim holds up if someone opens the network tab. */}
      <p className="mt-8 text-text-muted text-xs text-center max-w-md leading-relaxed">
        Your file is read in this tab and never sent anywhere. The only thing Trace
        requests from the network is public street-map data for the area you pick —
        never your file, and nothing at all for the sample cities.
      </p>

      {/* How to get your data */}
      <button
        className="mt-4 text-xs text-accent-purple/70 hover:text-accent-purple underline underline-offset-2 transition-colors"
        onClick={() => window.open('https://takeout.google.com', '_blank')}
      >
        How to export your Google Timeline →
      </button>
    </div>
  )
}
