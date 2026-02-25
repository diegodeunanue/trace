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
      {/* Logo */}
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-light tracking-tight bg-gradient-to-r from-accent-purple to-accent-orange bg-clip-text text-transparent">
          Trace
        </h1>
        <p className="mt-3 text-text-muted text-sm tracking-wide">
          Your life, traced.
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
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-2xl">
              📍
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

      {/* Privacy note */}
      <p className="mt-8 text-text-muted text-xs text-center max-w-xs leading-relaxed">
        100% local processing. Your data never leaves your browser.
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
