import { useEffect, useRef, useState } from 'react'
import {
  type ExportFormat,
  type ExportOrientation,
  type ExportLayout,
  type ExportRenderData,
  type MapRect,
  DEFAULT_MAP_RECT,
  PREVIEW_DIMS,
  renderToCanvas,
  downloadHighRes,
} from '@/lib/exportRenderer'

interface Props {
  data: ExportRenderData
  onBack: () => void
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

interface InteractState {
  type: 'drag' | 'resize'
  corner?: Corner
  startX: number
  startY: number
  startRect: MapRect
  containerW: number
  containerH: number
}

export default function ExportView({ data, onBack }: Props) {
  const [format, setFormat]           = useState<ExportFormat>('sandwich')
  const [orientation, setOrientation] = useState<ExportOrientation>('vertical')
  const [title, setTitle]             = useState(data.cityName ?? 'YOUR CITY')
  const [subtitle, setSubtitle]       = useState(data.period ?? '2024')
  const [mapRect, setMapRect]         = useState<MapRect>(DEFAULT_MAP_RECT)
  const [textPosition, setTextPosition] = useState(0.5)
  const [fontLoaded, setFontLoaded]   = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef     = useRef<HTMLDivElement>(null)
  const interactRef      = useRef<InteractState | null>(null)

  // Load Gotham Book for canvas text rendering
  useEffect(() => {
    const font = new FontFace('GothamBook', 'url(/fonts/gotham-book.otf)')
    font.load()
      .then(f => { document.fonts.add(f); setFontLoaded(true) })
      .catch(() => setFontLoaded(true))
  }, [])

  // Global mouse handlers for drag / resize — attached once, use ref for state
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const ia = interactRef.current
      if (!ia) return
      const dx = (e.clientX - ia.startX) / ia.containerW
      const dy = (e.clientY - ia.startY) / ia.containerH
      const r  = ia.startRect
      const MIN = 0.05

      if (ia.type === 'drag') {
        setMapRect({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h })
      } else {
        let { x, y, w, h } = r
        switch (ia.corner) {
          case 'nw':
            x = r.x + dx; y = r.y + dy
            w = Math.max(MIN, r.w - dx); h = Math.max(MIN, r.h - dy)
            break
          case 'ne':
            y = r.y + dy
            w = Math.max(MIN, r.w + dx); h = Math.max(MIN, r.h - dy)
            break
          case 'sw':
            x = r.x + dx
            w = Math.max(MIN, r.w - dx); h = Math.max(MIN, r.h + dy)
            break
          case 'se':
            w = Math.max(MIN, r.w + dx); h = Math.max(MIN, r.h + dy)
            break
        }
        setMapRect({ x, y, w, h })
      }
    }

    function onUp() { interactRef.current = null }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Re-render preview canvas whenever anything changes
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const [w, h] = PREVIEW_DIMS[orientation]
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const layout: ExportLayout = { format, orientation, title, subtitle, mapRect, textPosition }
    renderToCanvas(ctx, w, h, data, layout, 1, fontLoaded)
  }, [format, orientation, title, subtitle, mapRect, textPosition, fontLoaded, data])

  function startDrag(e: React.MouseEvent) {
    e.preventDefault()
    const cr = containerRef.current!.getBoundingClientRect()
    interactRef.current = {
      type: 'drag',
      startX: e.clientX, startY: e.clientY,
      startRect: { ...mapRect },
      containerW: cr.width, containerH: cr.height,
    }
  }

  function startResize(corner: Corner) {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const cr = containerRef.current!.getBoundingClientRect()
      interactRef.current = {
        type: 'resize', corner,
        startX: e.clientX, startY: e.clientY,
        startRect: { ...mapRect },
        containerW: cr.width, containerH: cr.height,
      }
    }
  }

  async function handleDownload() {
    setIsDownloading(true)
    try {
      const layout: ExportLayout = { format, orientation, title, subtitle, mapRect, textPosition }
      await downloadHighRes(data, layout)
    } finally {
      setIsDownloading(false)
    }
  }

  const aspectRatio = orientation === 'horizontal' ? '4/3' : '3/4'

  return (
    <div className="h-full w-full flex flex-col bg-bg" style={{ userSelect: 'none' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="text-text-muted hover:text-text-primary text-sm transition-colors"
        >
          ← Back
        </button>
        <h2 className="text-sm font-medium text-text-primary">Export your trace</h2>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-accent-purple to-accent-orange text-white disabled:opacity-50 hover:opacity-90 transition-all"
        >
          {isDownloading ? 'Exporting…' : 'Download →'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <div className="w-56 shrink-0 border-r border-border p-4 flex flex-col gap-5 overflow-y-auto">

          <div>
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-1.5">
              Title
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-purple/60 tracking-widest uppercase font-mono"
            />
          </div>

          {format !== 'just-title' && (
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1.5">
                Subtitle
              </label>
              <input
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-purple/60 tracking-wider font-mono"
              />
            </div>
          )}

          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-text-muted">Text position</span>
              <span className="text-xs text-text-primary font-mono">{Math.round(textPosition * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={textPosition}
              onChange={e => setTextPosition(parseFloat(e.target.value))}
              className="w-full accent-accent-purple"
            />
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 flex items-center justify-center overflow-hidden p-8 bg-surface/20">

          {/* Wrapper: matches poster aspect ratio, contains canvas + overlay */}
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              aspectRatio,
              maxWidth: '100%',
              maxHeight: '100%',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              borderRadius: '2px',
            }}
          >
            {/* Canvas fills the wrapper */}
            <canvas
              ref={previewCanvasRef}
              style={{ display: 'block', width: '100%', height: '100%' }}
            />

            {/* Interaction overlay */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left:   `${mapRect.x * 100}%`,
                  top:    `${mapRect.y * 100}%`,
                  width:  `${mapRect.w * 100}%`,
                  height: `${mapRect.h * 100}%`,
                }}
              >
                {/* Drag handle — covers interior */}
                <div
                  style={{ position: 'absolute', inset: 0, cursor: 'move' }}
                  onMouseDown={startDrag}
                />
                {/* Dashed border */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    border: '1px dashed rgba(155,89,182,0.55)',
                    pointerEvents: 'none',
                  }}
                />
                {/* Corner handles */}
                <CornerHandle corner="nw" onMouseDown={startResize('nw')} />
                <CornerHandle corner="ne" onMouseDown={startResize('ne')} />
                <CornerHandle corner="sw" onMouseDown={startResize('sw')} />
                <CornerHandle corner="se" onMouseDown={startResize('se')} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom card bar */}
      <div className="border-t border-border shrink-0 px-5 py-3 flex items-end gap-8">

        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Format</p>
          <div className="flex gap-2">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`flex flex-col items-center gap-2 px-3 py-2.5 rounded-lg border transition-all ${
                  format === opt.value
                    ? 'border-accent-purple bg-accent-purple/10'
                    : 'border-border hover:border-accent-purple/40'
                }`}
              >
                <FormatIcon format={opt.value} active={format === opt.value} />
                <span className={`text-xs leading-none ${format === opt.value ? 'text-accent-purple' : 'text-text-muted'}`}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Orientation</p>
          <div className="flex gap-2">
            {ORIENTATION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setOrientation(opt.value)}
                className={`flex flex-col items-center gap-2 px-3 py-2.5 rounded-lg border transition-all ${
                  orientation === opt.value
                    ? 'border-accent-purple bg-accent-purple/10'
                    : 'border-border hover:border-accent-purple/40'
                }`}
              >
                <OrientationIcon orientation={opt.value} active={orientation === opt.value} />
                <span className={`text-xs leading-none ${orientation === opt.value ? 'text-accent-purple' : 'text-text-muted'}`}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Corner resize handle ─────────────────────────────────────────────────────

const CORNER_STYLE: Record<Corner, React.CSSProperties> = {
  nw: { top: -5,    left: -5,    cursor: 'nw-resize' },
  ne: { top: -5,    right: -5,   cursor: 'ne-resize' },
  sw: { bottom: -5, left: -5,    cursor: 'sw-resize' },
  se: { bottom: -5, right: -5,   cursor: 'se-resize' },
}

function CornerHandle({ corner, onMouseDown }: { corner: Corner; onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        width: 10,
        height: 10,
        background: '#9b59b6',
        borderRadius: 2,
        ...CORNER_STYLE[corner],
      }}
    />
  )
}

// ─── Format card icon ─────────────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'sandwich',       label: 'Sandwich' },
  { value: 'title-subtitle', label: 'Title + sub' },
  { value: 'just-title',     label: 'Just title' },
]

function FormatIcon({ format, active }: { format: ExportFormat; active: boolean }) {
  const map  = active ? 'bg-accent-purple/25' : 'bg-text-muted/15'
  const bold = active ? 'bg-accent-purple/70' : 'bg-text-muted/50'
  const med  = active ? 'bg-accent-purple/45' : 'bg-text-muted/30'

  if (format === 'sandwich') return (
    <div className="flex flex-col gap-[3px] w-9 h-10">
      <div className={`h-[5px] rounded-sm ${bold}`} />
      <div className={`flex-1 rounded-sm ${map}`} />
      <div className={`h-[4px] rounded-sm ${med}`} />
    </div>
  )
  if (format === 'title-subtitle') return (
    <div className="flex flex-col gap-[3px] w-9 h-10">
      <div className={`h-[5px] rounded-sm ${bold}`} />
      <div className={`h-[3px] rounded-sm ${med}`} />
      <div className={`flex-1 rounded-sm ${map}`} />
    </div>
  )
  return (
    <div className="flex flex-col gap-[3px] w-9 h-10">
      <div className={`flex-1 rounded-sm ${map}`} />
      <div className={`h-[5px] rounded-sm ${bold}`} />
    </div>
  )
}

// ─── Orientation card icon ────────────────────────────────────────────────────

const ORIENTATION_OPTIONS: { value: ExportOrientation; label: string }[] = [
  { value: 'horizontal', label: 'Landscape' },
  { value: 'vertical',   label: 'Portrait' },
]

function OrientationIcon({ orientation, active }: { orientation: ExportOrientation; active: boolean }) {
  const cls = `border-2 rounded-sm transition-colors ${
    active ? 'border-accent-purple bg-accent-purple/10' : 'border-text-muted/30'
  }`
  return orientation === 'horizontal'
    ? <div className={`w-12 h-9 ${cls}`} />
    : <div className={`w-9 h-12 ${cls}`} />
}
