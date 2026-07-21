import type { ReactNode } from 'react'
import { presetSwatch, type ColorPreset } from '@/lib/colorUtils'
import { SectionLabel } from './Shell'

/**
 * The card beside the print. Everything on it is derived from the trace itself
 * rather than written by hand, so it stays true for a visitor's own upload.
 */
export function WallLabel({
  edition, title, coords, dates,
}: { edition: string; title: string; coords: string; dates: string }) {
  return (
    <div className="pl-[18px] border-l-2" style={{ borderColor: 'var(--accent)' }}>
      <p className="font-mono text-[9px] uppercase tracking-[.22em] text-muted">{edition}</p>
      <h2 className="mt-2 font-sans text-[29px] font-medium tracking-[.02em] leading-tight">{title}</h2>
      <div className="mt-3 space-y-1 font-mono text-[10px] tracking-[.03em] text-muted">
        <p>{coords}</p>
        <p>{dates}</p>
        <p>Street network, weighted by visit frequency</p>
      </div>
    </div>
  )
}

export function SampleTabs<T extends { id: string; label: string }>({
  items, activeId, onSelect,
}: { items: T[]; activeId: string; onSelect: (item: T) => void }) {
  return (
    <div className="flex items-center gap-6">
      {items.map(item => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={`font-sans text-[15px] pb-1 border-b transition-all ${
              active
                ? 'border-ink opacity-100'
                : 'border-transparent opacity-45 hover:opacity-80'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function Palette({
  presets, activeId, onSelect,
}: { presets: ColorPreset[]; activeId: string; onSelect: (p: ColorPreset) => void }) {
  return (
    <div className="flex items-start gap-4">
      {presets.map(p => {
        const active = p.id === activeId
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="flex flex-col items-center gap-2 group"
            aria-pressed={active}
          >
            <span
              className="w-8 h-8 rounded-full transition-all"
              style={{
                background: presetSwatch(p),
                outline: active ? '2px solid var(--accent)' : '2px solid transparent',
                outlineOffset: '3px',
              }}
            />
            <span
              className={`font-mono text-[9px] uppercase tracking-[.18em] transition-opacity ${
                active ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'
              }`}
            >
              {p.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Disclosure({
  label, summary, open, onToggle, children,
}: {
  label: string
  summary: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-baseline justify-between py-2 group">
        <span className="font-mono text-[9px] uppercase tracking-[.22em] text-muted group-hover:text-ink transition-colors">
          {label}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[.18em] text-muted group-hover:text-ink transition-colors">
          {summary} {open ? '▴' : '▾'}
        </span>
      </button>
      {open && <div className="pt-3 pb-1 flex flex-col gap-4">{children}</div>}
    </div>
  )
}

/** Integers read as 05 / 10; fractions keep their decimals. */
function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v).padStart(2, '0') : String(v)
}

export function GallerySlider({
  label, value, min, max, step, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[.18em] text-muted">{label}</span>
        <span className="font-mono text-[9px] text-ink">{formatValue(value)}</span>
      </div>
      <input
        type="range"
        className="gallery-slider"
        min={min}
        max={max}
        step={step}
        value={String(value)}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
      />
    </div>
  )
}

export { SectionLabel }
