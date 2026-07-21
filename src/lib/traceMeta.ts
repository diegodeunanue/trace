/**
 * traceMeta.ts
 *
 * Derives the wall-label copy from the trace itself. The design shows fixed
 * strings for the two sample cities, but a visitor's own upload has to produce
 * the same card, so everything here is computed from the points.
 */

import type { TracePoint } from './parseTimeline'

/** Median is used rather than mean so a stray outlying fix cannot drag it. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** "34.60°S  58.38°W" */
export function formatCoords(points: TracePoint[]): string {
  if (points.length === 0) return ''
  const lat = median(points.map(p => p.lat))
  const lng = median(points.map(p => p.lng))
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(2)}°${ns}  ${Math.abs(lng).toFixed(2)}°${ew}`
}

/**
 * "9 days · September 2025", or "21 days · Sep–Oct 2025" when the trace spans
 * more than one month.
 */
export function formatPeriod(points: TracePoint[]): string {
  if (points.length === 0) return ''
  const days = new Set(points.map(p => p.timestamp.toISOString().slice(0, 10))).size
  const times = points.map(p => p.timestamp.getTime())
  const first = new Date(Math.min(...times))
  const last = new Date(Math.max(...times))

  const dayLabel = `${days} ${days === 1 ? 'day' : 'days'}`
  const longMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const shortMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

  const sameMonth = first.getUTCFullYear() === last.getUTCFullYear() &&
                    first.getUTCMonth() === last.getUTCMonth()
  if (sameMonth) return `${dayLabel} · ${longMonth(first)} ${first.getUTCFullYear()}`

  const sameYear = first.getUTCFullYear() === last.getUTCFullYear()
  return sameYear
    ? `${dayLabel} · ${shortMonth(first)}–${shortMonth(last)} ${first.getUTCFullYear()}`
    : `${dayLabel} · ${shortMonth(first)} ${first.getUTCFullYear()}–${shortMonth(last)} ${last.getUTCFullYear()}`
}

/** Years the trace covers, for the poster subtitle: "2025" or "2025–2026". */
export function formatYears(points: TracePoint[]): string | undefined {
  if (points.length === 0) return undefined
  const years = [...new Set(points.map(p => p.timestamp.getFullYear()))].sort()
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`
}
