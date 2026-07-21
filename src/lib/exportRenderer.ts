/**
 * exportRenderer.ts
 *
 * Renders the trace visualization to a 2D canvas — used for both the
 * live preview in ExportView and the final high-res PNG download.
 *
 * Coordinate projection: simple linear mapping with Mercator cos(lat)
 * correction — accurate enough for city-scale areas.
 */

import type { OSMEdge } from './fetchOSMNetwork'
import type { ColorPreset } from './colorUtils'
import { getEdgeColor, getEdgeWidth } from './colorUtils'

export type ExportFormat = 'sandwich' | 'title-subtitle' | 'just-title'
export type ExportOrientation = 'horizontal' | 'vertical'

/** Free-form map rect in normalized poster coordinates (0–1).
 *  Values outside 0–1 are allowed — the map bleeds off poster edges. */
export interface MapRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ExportLayout {
  format: ExportFormat
  orientation: ExportOrientation
  title: string
  subtitle: string
  mapRect: MapRect
  textPosition: number  // 0 = outer edge of band, 0.5 = centered, 1 = near map
}

export interface ExportRenderData {
  processedEdges: OSMEdge[]
  cityEdges: [number, number][][]
  bgMode: 'spread' | 'city' | 'off'
  bgOpacity: number // 0–100
  bbox: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
  preset: ColorPreset
  params: { baseWidth: number; widthCap: number }
  /** Seeds the poster title — the city name when one was matched. */
  cityName?: string
  /** Seeds the poster subtitle — the year(s) the trace covers. */
  period?: string
}

export const DEFAULT_MAP_RECT: MapRect = { x: 0, y: 0.15, w: 1, h: 0.70 }

// High-res export dimensions (300 DPI-equivalent)
const EXPORT_DIMS: Record<ExportOrientation, [number, number]> = {
  horizontal: [4800, 3600],
  vertical:   [3600, 4800],
}

// Preview canvas dimensions (1/8 of export)
export const PREVIEW_DIMS: Record<ExportOrientation, [number, number]> = {
  horizontal: [600, 450],
  vertical:   [450, 600],
}

/** Project a lng/lat point into canvas pixel coords within a map rect.
 *  Applies cos(lat) Mercator correction so the map isn't stretched. */
function project(
  lng: number,
  lat: number,
  bbox: [number, number, number, number],
  mapXpx: number,
  mapYpx: number,
  mapWpx: number,
  mapHpx: number,
): [number, number] {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const avgLat = (minLat + maxLat) / 2
  const cosLat = Math.cos(avgLat * Math.PI / 180)

  // Visual aspect ratio with Mercator correction
  const geoAspect = ((maxLng - minLng) * cosLat) / (maxLat - minLat)
  const canvasAspect = mapWpx / mapHpx

  let drawW: number, drawH: number, offsetX: number, offsetY: number
  if (geoAspect > canvasAspect) {
    drawW = mapWpx; drawH = mapWpx / geoAspect
    offsetX = 0;    offsetY = (mapHpx - drawH) / 2
  } else {
    drawH = mapHpx; drawW = mapHpx * geoAspect
    offsetX = (mapWpx - drawW) / 2; offsetY = 0
  }

  const nx = (lng - minLng) / (maxLng - minLng)
  const ny = 1 - (lat - minLat) / (maxLat - minLat) // flip Y

  return [mapXpx + offsetX + nx * drawW, mapYpx + offsetY + ny * drawH]
}

/**
 * Render the full poster to any CanvasRenderingContext2D.
 *
 * lineWidthScale — multiplier applied to all edge widths.
 *   Pass 1.0 for the preview canvas (600px wide).
 *   Pass exportW / 600 for the high-res canvas.
 *
 * fontReady — set true once 'GothamBook' is confirmed loaded;
 *   text is skipped until then so the rest of the map still renders.
 */
export function renderToCanvas(
  ctx: CanvasRenderingContext2D,
  posterW: number,
  posterH: number,
  data: ExportRenderData,
  layout: ExportLayout,
  lineWidthScale: number,
  fontReady: boolean,
): void {
  const { processedEdges, cityEdges, bgMode, bgOpacity, bbox, preset, params } = data
  const bgAlpha = bgOpacity / 100

  // Background fill
  ctx.fillStyle = preset.background
  ctx.fillRect(0, 0, posterW, posterH)

  const mapXpx = layout.mapRect.x * posterW
  const mapYpx = layout.mapRect.y * posterH
  const mapWpx = layout.mapRect.w * posterW
  const mapHpx = layout.mapRect.h * posterH

  ctx.lineCap = 'round'

  // City grid background
  if (bgMode === 'city' && cityEdges.length > 0) {
    const [r, g, b, a] = preset.baseStreetColor
    ctx.lineWidth = preset.baseStreetWidth * lineWidthScale
    for (const seg of cityEdges) {
      if (seg.length < 2) continue
      ctx.strokeStyle = `rgba(${r},${g},${b},${(a / 255) * bgAlpha})`
      ctx.beginPath()
      for (let i = 0; i < seg.length; i++) {
        const [px, py] = project(seg[i][0], seg[i][1], bbox, mapXpx, mapYpx, mapWpx, mapHpx)
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
  }

  // Spread background (bgIntensity already computed per-edge)
  if (bgMode === 'spread') {
    const [r, g, b, a] = preset.baseStreetColor
    ctx.lineWidth = preset.baseStreetWidth * lineWidthScale
    for (const edge of processedEdges) {
      if (edge.bgIntensity <= 0) continue
      const alpha = (a / 255) * edge.bgIntensity * bgAlpha
      if (alpha < 0.01) continue
      const [x0, y0] = project(edge.coords[0][0], edge.coords[0][1], bbox, mapXpx, mapYpx, mapWpx, mapHpx)
      const [x1, y1] = project(edge.coords[1][0], edge.coords[1][1], bbox, mapXpx, mapYpx, mapWpx, mapHpx)
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  }

  // Trace layer
  for (const edge of processedEdges) {
    if (edge.normalizedVisits === 0) continue
    const [r, g, b, a] = getEdgeColor(edge.normalizedVisits, preset)
    if (a === 0) continue
    const [x0, y0] = project(edge.coords[0][0], edge.coords[0][1], bbox, mapXpx, mapYpx, mapWpx, mapHpx)
    const [x1, y1] = project(edge.coords[1][0], edge.coords[1][1], bbox, mapXpx, mapYpx, mapWpx, mapHpx)
    ctx.strokeStyle = `rgba(${r},${g},${b},${a / 255})`
    ctx.lineWidth = getEdgeWidth(edge.normalizedVisits, params) * lineWidthScale
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }

  if (!fontReady) return

  // ── Text overlay ──────────────────────────────────────────────────────────

  const isLight = preset.id === 'light'
  const textColor  = isLight ? '#1a0a00' : '#f0f0f0'
  const titleSize  = posterH * 0.06
  const subSize    = posterH * 0.026
  const textGap    = posterH * 0.015  // gap between title and subtitle centers in title-subtitle

  ctx.fillStyle    = textColor
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  const { format, title, subtitle } = layout
  const tp = layout.textPosition   // 0 = outer edge, 0.5 = centered, 1 = near map

  const topBandH = mapYpx                         // height of area above map
  const botBandH = posterH - (mapYpx + mapHpx)   // height of area below map

  /** Returns the Y center of a text element within a band.
   *  dir = +1 → tp=1 moves toward the inner edge (downward for top band)
   *  dir = −1 → tp=1 moves toward the inner edge (upward for bottom band) */
  function bandTextY(bandStart: number, bandH: number, fontSize: number, dir: 1 | -1): number {
    const center = bandStart + bandH * 0.5
    const range  = Math.max(0, bandH * 0.5 - fontSize * 0.8)
    return center + dir * (tp - 0.5) * 2 * range
  }

  if (format === 'sandwich') {
    if (topBandH > titleSize * 0.8) {
      ctx.font = `${titleSize}px "GothamBook", "Helvetica Neue", sans-serif`
      ctx.fillText(title, posterW / 2, bandTextY(0, topBandH, titleSize, 1))
    }
    if (botBandH > subSize * 0.8) {
      ctx.font = `${subSize}px "GothamBook", "Helvetica Neue", sans-serif`
      ctx.fillText(subtitle, posterW / 2, bandTextY(mapYpx + mapHpx, botBandH, subSize, -1))
    }

  } else if (format === 'title-subtitle') {
    const centerToCenterDist = (titleSize + subSize) / 2 + textGap
    const groupH = titleSize + textGap + subSize
    if (topBandH > groupH * 0.8) {
      const range      = Math.max(0, topBandH * 0.5 - groupH * 0.5)
      const groupCenter = topBandH * 0.5 + (tp - 0.5) * 2 * range
      ctx.font = `${titleSize}px "GothamBook", "Helvetica Neue", sans-serif`
      ctx.fillText(title, posterW / 2, groupCenter - centerToCenterDist / 2)
      ctx.font = `${subSize}px "GothamBook", "Helvetica Neue", sans-serif`
      ctx.fillText(subtitle, posterW / 2, groupCenter + centerToCenterDist / 2)
    }

  } else {
    // just-title — title in bottom band
    if (botBandH > titleSize * 0.8) {
      ctx.font = `${titleSize}px "GothamBook", "Helvetica Neue", sans-serif`
      ctx.fillText(title, posterW / 2, bandTextY(mapYpx + mapHpx, botBandH, titleSize, -1))
    }
  }
}

/** Download the poster as a high-res PNG. */
export async function downloadHighRes(
  data: ExportRenderData,
  layout: ExportLayout,
  filename = 'trace.png',
): Promise<void> {
  const [w, h] = EXPORT_DIMS[layout.orientation]

  let fontReady = false
  try {
    const font = new FontFace('GothamBook', 'url(/fonts/gotham-book.otf)')
    await font.load()
    document.fonts.add(font)
    fontReady = true
  } catch {
    fontReady = true // degrade gracefully to Helvetica Neue
  }

  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const lineWidthScale = w / PREVIEW_DIMS[layout.orientation][0]
  renderToCanvas(ctx, w, h, data, layout, lineWidthScale, fontReady)

  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
