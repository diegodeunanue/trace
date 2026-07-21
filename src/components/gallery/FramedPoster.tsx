import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Reference geometry from the design, in px. Everything scales from these. */
const REF = {
  canvasW: 300,
  canvasH: 384,
  matX: 44,
  matY: 46,
  moulding: 15,
}
/** Mat + moulding added to the artwork on each axis: 88+30 and 92+30. */
const CHROME_X = REF.matX * 2 + REF.moulding * 2   // 118
const CHROME_Y = REF.matY * 2 + REF.moulding * 2   // 122

interface Props {
  /**
   * Artwork aspect as width / height. Defaults to the design's 300x384. The
   * compose screen overrides it so the preview matches what actually exports
   * (3:4 portrait, 4:3 landscape) rather than the frame's own proportion.
   */
  aspect?: number
  /** Portrait keeps the reference aspect; landscape swaps it. */
  orientation?: 'portrait' | 'landscape'
  /** Canvas background while the artwork loads — the preset's own bg. */
  canvasBg?: string
  /** Rendered inside the mat, at the artwork's exact size. */
  children: ReactNode
  /** Overlaid on the artwork (poster title/subtitle on the compose screen). */
  overlay?: ReactNode
}

/**
 * A print on a gallery wall: dark moulding, a generous mat, and the artwork
 * inside it.
 *
 * The frame is measured and sized in JS rather than with percentage heights.
 * The artwork is a live MapLibre canvas, and MapLibre latches its drawing
 * buffer to whatever the container measured at construction — so the container
 * has to have real pixel dimensions before it mounts, not a percentage chain
 * that resolves later.
 *
 * Sizing scales the whole reference frame to the room instead of pinning the
 * artwork at its 300x384 reference size, which on a desktop viewport would
 * leave the work occupying under a tenth of the screen.
 */
export default function FramedPoster({
  aspect,
  orientation = 'portrait',
  canvasBg = '#050505',
  children,
  overlay,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  const landscape = orientation === 'landscape'
  const baseAspect = aspect ?? REF.canvasW / REF.canvasH
  const artAspect = landscape ? 1 / baseAspect : baseAspect

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Everything scales off the artwork height, so the mat stays proportionally
  // the same no matter the aspect. Capped so the frame reads as a print on a
  // wall rather than stretching edge to edge on a very large display.
  const s = box.w > 0
    ? Math.min(
        box.w / (REF.canvasH * artAspect + CHROME_X),
        box.h / (REF.canvasH + CHROME_Y),
        2.4,
      )
    : 0

  const moulding = Math.round(REF.moulding * s)
  const matX = Math.round(REF.matX * s)
  const matY = Math.round(REF.matY * s)
  const canvasH = Math.round(REF.canvasH * s)
  const canvasW = Math.round(REF.canvasH * s * artAspect)

  return (
    // The padding lives on the outer box and the measurement on the inner one.
    // getBoundingClientRect reports the border box, so measuring the padded
    // element would hand the scale calculation the padding back and the frame
    // would grow until it touched the header and footer.
    <div className="h-full w-full px-10 py-12">
      <div ref={hostRef} className="h-full w-full flex items-center justify-center">
      {s > 0 && (
        <div className="bg-frame shadow-frame" style={{ padding: moulding }}>
          <div className="bg-mat" style={{ padding: `${matY}px ${matX}px` }}>
            {/*
              The hairline is not decoration. A "Light" poster is cream and the
              mat is cream, so without an edge the print dissolves into the board
              and you cannot tell where the work stops — which is also exactly
              what a real mat window edge does.
            */}
            <div
              className="relative overflow-hidden"
              style={{
                width: canvasW,
                height: canvasH,
                background: canvasBg,
                boxShadow: '0 0 0 1px rgba(29,27,23,0.18)',
              }}
            >
              {children}
              {overlay}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
