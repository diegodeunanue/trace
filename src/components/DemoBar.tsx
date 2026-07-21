import type { DemoSet } from '@/lib/demo'

interface Props {
  demos: DemoSet[]
  active: DemoSet
  onSelect: (d: DemoSet) => void
  onUseOwnData: () => void
}

/**
 * Shown only while a baked sample is on screen. Makes it obvious the visitor is
 * looking at example data, and lets them flip between the available samples.
 */
export default function DemoBar({ demos, active, onSelect, onUseOwnData }: Props) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-5 py-2 border-b border-border bg-surface/50">
      <span className="text-xs text-text-muted uppercase tracking-wider shrink-0">
        Sample trace
      </span>

      <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
        {demos.map(d => (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            className={`
              px-3 py-1 rounded-full text-xs whitespace-nowrap border transition-all
              ${active.id === d.id
                ? 'border-accent-purple text-accent-purple bg-accent-purple/10'
                : 'border-border text-text-muted hover:border-accent-purple/50'
              }
            `}
          >
            {d.label}
          </button>
        ))}
      </div>

      <span className="text-xs text-text-muted truncate hidden md:block">
        {active.blurb}
      </span>

      <button
        onClick={onUseOwnData}
        className="ml-auto shrink-0 text-xs text-accent-purple/80 hover:text-accent-purple underline underline-offset-2 transition-colors"
      >
        Try it with your own history
      </button>
    </div>
  )
}
