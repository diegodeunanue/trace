import { useCallback, useState } from 'react'
import { parseTimelineJSON, type TracePoint } from '@/lib/parseTimeline'
import Shell, { GhostButton } from '@/components/gallery/Shell'

interface Props {
  onUpload: (points: TracePoint[]) => void
  onViewSample: () => void
}

export default function UploadView({ onUpload, onViewSample }: Props) {
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
    <Shell
      screenLabel="Upload"
      navRight={<GhostButton onClick={onViewSample}>View sample →</GhostButton>}
    >
      <div className="h-full w-full overflow-y-auto flex flex-col items-center justify-center px-8 py-10">
        <h1 className="font-sans text-[40px] font-normal tracking-[.005em] text-center">
          Drop in your location history
        </h1>
        <p className="mt-4 max-w-[560px] text-center font-sans text-[15px] leading-relaxed text-muted">
          Trace turns it into a clean, poster-quality geographical illustration —
          a trip, a honeymoon, or a whole year on one print.
        </p>

        {/* The drop zone is framed like the work it will become. */}
        <label
          className="mt-10 bg-frame shadow-frame cursor-pointer block"
          style={{ padding: 15 }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input type="file" accept=".json" className="hidden" onChange={onFileInput} />
          <div
            className="bg-mat flex flex-col items-center justify-center gap-4 transition-colors"
            style={{
              width: 520,
              height: 264,
              border: `1.5px dashed ${dragging ? 'var(--accent)' : 'rgba(29,27,23,0.14)'}`,
            }}
          >
            {loading ? (
              <p className="font-mono text-[9px] uppercase tracking-[.22em] text-muted">
                Parsing in this tab…
              </p>
            ) : (
              <>
                <PinGlyph />
                <p className="font-sans text-[16px]">Drop your Timeline JSON here</p>
                <p className="font-mono text-[9px] uppercase tracking-[.18em] text-muted">
                  Google Takeout → Location History → Timeline.json
                </p>
              </>
            )}
          </div>
        </label>

        {error && (
          <p className="mt-5 max-w-[520px] text-center font-mono text-[10px] leading-relaxed text-[#B0402A]">
            {error}
          </p>
        )}

        {/* Restated where it matters, beside the file picker. Deliberately
            precise about the one network call the app makes, so the claim holds
            up if someone opens the network tab. */}
        <p className="mt-8 max-w-[560px] text-center font-mono text-[10px] leading-[1.7] text-muted">
          Your file is read in this tab and never sent anywhere. The only thing Trace
          requests from the network is public street-map data for the area you pick —
          never your file, and nothing at all for the sample cities.
        </p>

        <button
          onClick={() => window.open('https://takeout.google.com', '_blank', 'noopener,noreferrer')}
          className="mt-5 font-mono text-[10px] tracking-[.06em] text-muted underline underline-offset-4 hover:text-ink transition-colors"
        >
          How to export your Google Timeline →
        </button>
      </div>
    </Shell>
  )
}

function PinGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
         strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
