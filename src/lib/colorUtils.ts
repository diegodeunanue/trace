/**
 * colorUtils.ts
 *
 * Color interpolation for the visualization.
 * Mirrors cartograph's color_transparency_width.py.
 *
 * Each preset defines a 3-stop gradient (low → mid → high visits)
 * and a background color. Returned as RGBA arrays for deck.gl.
 */

type RGB = [number, number, number]
type RGBA = [number, number, number, number]

export interface ColorPreset {
  id: string
  label: string
  background: string  // CSS hex for MapLibre background
  low: RGB            // low-visit color
  mid: RGB            // mid-visit color
  high: RGB           // high-visit color
  baseStreetColor: RGBA
  baseStreetWidth: number
  /**
   * Drives `--accent` on the app root. The gallery chrome is otherwise neutral,
   * so this single value is the only colour the UI borrows from the artwork —
   * selected states only, never decoration.
   */
  accent: string
}

/** CSS gradient for a palette swatch chip, least- to most-visited. */
export function presetSwatch(p: ColorPreset): string {
  const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
  return `linear-gradient(135deg, ${rgb(p.low)}, ${rgb(p.mid)} 61%, ${rgb(p.high)})`
}

export const PRESETS: ColorPreset[] = [
  {
    id: 'glow-dark',
    label: 'Glow',
    background: '#060708',
    low:  [102, 51,  153],  // purple
    mid:  [230, 126, 34],   // orange
    high: [242, 242, 242],  // near white
    baseStreetColor: [123, 179, 211, 60],
    baseStreetWidth: 0.5,
    accent: '#E67E22',
  },
  {
    id: 'ember',
    label: 'Ember',
    background: '#080503',
    low:  [120, 20,  20],   // deep red
    mid:  [220, 100, 0],    // orange
    high: [255, 240, 100],  // bright yellow
    baseStreetColor: [180, 100, 60, 50],
    baseStreetWidth: 0.5,
    accent: '#E2711D',
  },
  {
    id: 'frost',
    label: 'Frost',
    background: '#03080f',
    low:  [20,  40,  100],  // deep navy
    mid:  [60,  160, 220],  // sky blue
    high: [200, 235, 255],  // icy white
    baseStreetColor: [60, 120, 180, 50],
    baseStreetWidth: 0.5,
    accent: '#3CA0DC',
  },
  {
    id: 'light',
    label: 'Light',
    background: '#f7f4ef',
    low:  [180, 140, 200],  // soft purple
    mid:  [200, 80,  30],   // terracotta
    high: [60,  20,  10],   // dark brown
    baseStreetColor: [160, 150, 140, 80],
    baseStreetWidth: 0.5,
    accent: '#C8501E',
  },
]

export const DEFAULT_PRESET = PRESETS[0]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpRGB(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ]
}

/**
 * Map a normalizedVisits value (signed float) to an RGBA color.
 * Negative values = below transparency threshold, alpha is reduced.
 * Zero = invisible.
 */
export function getEdgeColor(normalizedVisits: number, preset: ColorPreset): RGBA {
  if (normalizedVisits === 0) return [0, 0, 0, 0]

  const alpha = normalizedVisits < 0 ? Math.abs(normalizedVisits) : 1.0
  const intensity = Math.abs(normalizedVisits)

  let rgb: RGB
  if (intensity < 0.5) {
    rgb = lerpRGB(preset.low, preset.mid, intensity * 2)
  } else {
    rgb = lerpRGB(preset.mid, preset.high, (intensity - 0.5) * 2)
  }

  return [...rgb, Math.round(alpha * 255)] as RGBA
}

/**
 * Map normalizedVisits to line width in pixels.
 * Mirrors cartograph's width_cap logic.
 */
export function getEdgeWidth(
  normalizedVisits: number,
  params: { baseWidth: number; widthCap: number },
): number {
  const intensity = Math.abs(normalizedVisits)
  if (intensity === 0) return 0
  return params.baseWidth + params.baseWidth * params.widthCap * intensity
}
