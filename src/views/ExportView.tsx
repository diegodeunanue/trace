import { useEffect, useRef, useState } from 'react'
import Shell, { NavLink, PrimaryButton, SectionLabel } from '@/components/gallery/Shell'
import FramedPoster from '@/components/gallery/FramedPoster'
import { GallerySlider } from '@/components/gallery/controls'
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

  const aspect = orientation === 'horizontal' ? 4 / 3 : 3 / 4

  return (
    <Shell
      screenLabel="Compose"
      navLeft={<NavLink onClick={onBack}>← back</NavLink>}
      navRight={
        <PrimaryButton onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? 'Exporting…' : 'Download ↓'}
        </PrimaryButton>
      }
    >
      <div className="h-full w-full flex" style={{ userSelect: 'none' }}>

        {/* The print, matted exactly as it will export */}
        <div className="flex-1 min-w-0">
          <FramedPoster aspect={aspect} canvasBg={data.preset.background}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
              <canvas ref={previewCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

              {/* Reframe handle over the artwork area */}
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
                  <div style={{ position: 'absolute', inset: 0, cursor: 'move' }} onMouseDown={startDrag} />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      border: '1px dashed var(--accent)',
                      opacity: 0.65,
                      pointerEvents: 'none',
                    }}
                  />
                  <CornerHandle corner="nw" onMouseDown={startResize('nw')} />
                  <CornerHandle corner="ne" onMouseDown={startResize('ne')} />
                  <CornerHandle corner="sw" onMouseDown={startResize('sw')} />
                  <CornerHandle corner="se" onMouseDown={startResize('se')} />
                </div>
              </div>
            </div>
          </FramedPoster>
        </div>

        {/* The rail */}
        <aside className="w-[352px] shrink-0 border-l border-line px-8 py-9 flex flex-col gap-7 overflow-y-auto">
          <div>
            <SectionLabel>Title</SectionLabel>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-mat border border-line rounded-sm px-3 py-2.5
                         font-mono text-[13px] uppercase tracking-[.14em] text-ink
                         focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {format !== 'just-title' && (
            <div>
              <SectionLabel>Subtitle</SectionLabel>
              <input
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                className="w-full bg-mat border border-line rounded-sm px-3 py-2.5
                           font-mono text-[13px] uppercase tracking-[.14em] text-ink
                           focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          )}

          <GallerySlider
            label="Text position"
            value={Math.round(textPosition * 100)}
            min={0}
            max={100}
            step={5}
            onChange={v => setTextPosition(v / 100)}
          />

          <div>
            <SectionLabel>Format</SectionLabel>
            <div className="flex gap-3">
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className="flex flex-col items-center gap-2 group"
                  aria-pressed={format === opt.value}
                >
                  <FormatIcon format={opt.value} active={format === opt.value} />
                  <span className={`font-mono text-[9px] uppercase tracking-[.16em] transition-opacity ${
                    format === opt.value ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'
                  }`}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Orientation</SectionLabel>
            <div className="flex gap-3 items-end">
              {ORIENTATION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setOrientation(opt.value)}
                  className="flex flex-col items-center gap-2 group"
                  aria-pressed={orientation === opt.value}
                >
                  <OrientationIcon orientation={opt.value} active={orientation === opt.value} />
                  <span className={`font-mono text-[9px] uppercase tracking-[.16em] transition-opacity ${
                    orientation === opt.value ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'
                  }`}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-auto pt-6 font-mono text-[9px] uppercase tracking-[.18em] text-muted">
            Exports at 4800 × 3600 px · PNG
          </p>
        </aside>
      </div>
    </Shell>
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
        background: 'var(--accent)',
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
  const frame = `w-9 h-11 p-[3px] flex flex-col gap-[3px] rounded-sm border transition-colors ${
    active ? 'border-accent' : 'border-line group-hover:border-muted'
  }`
  const bar = active ? 'bg-accent' : 'bg-muted/50'
  const art = 'flex-1 bg-muted/15'

  if (format === 'sandwich') return (
    <div className={frame}>
      <div className={`h-[3px] ${bar}`} />
      <div className={art} />
      <div className={`h-[2px] ${bar} opacity-70`} />
    </div>
  )
  if (format === 'title-subtitle') return (
    <div className={frame}>
      <div className={art} />
      <div className={`h-[3px] ${bar}`} />
      <div className={`h-[2px] ${bar} opacity-70`} />
    </div>
  )
  return (
    <div className={frame}>
      <div className={art} />
      <div className={`h-[3px] ${bar}`} />
    </div>
  )
}

// ─── Orientation card icon ────────────────────────────────────────────────────

const ORIENTATION_OPTIONS: { value: ExportOrientation; label: string }[] = [
  { value: 'horizontal', label: 'Landscape' },
  { value: 'vertical',   label: 'Portrait' },
]

function OrientationIcon({ orientation, active }: { orientation: ExportOrientation; active: boolean }) {
  const cls = `rounded-sm border transition-colors ${
    active ? 'border-accent' : 'border-line group-hover:border-muted'
  }`
  return orientation === 'horizontal'
    ? <div className={`w-12 h-9 ${cls}`} />
    : <div className={`w-9 h-11 ${cls}`} />
}
