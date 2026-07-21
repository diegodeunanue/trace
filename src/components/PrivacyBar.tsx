import type { DataMode } from '@/App'

interface Props {
  mode: DataMode
  onUseOwnData: () => void
  onBackToDemo: () => void
}

/**
 * Persistent header. The privacy statement is the product's core promise, so
 * it gets its own band rather than a footnote.
 */
export default function PrivacyBar({ mode, onUseOwnData, onBackToDemo }: Props) {
  return (
    <header className="shrink-0 border-b border-border">
      {/* Brand row */}
      <div className="flex items-center justify-between gap-4 px-5 py-2.5">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-lg font-light tracking-tight bg-gradient-to-r from-accent-purple to-accent-orange bg-clip-text text-transparent">
            Trace
          </span>
          <span className="text-xs text-text-muted truncate hidden sm:block">
            Your location history, as poster-quality geographical illustration.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {mode === 'user' && (
            <button
              onClick={onBackToDemo}
              className="px-3 py-1.5 rounded-lg text-xs text-text-muted border border-border hover:text-text-primary hover:border-accent-purple/50 transition-colors"
            >
              View sample
            </button>
          )}
          {mode === 'demo' && (
            <button
              onClick={onUseOwnData}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-accent-purple to-accent-orange text-white hover:opacity-90 transition-opacity"
            >
              Use your own data
            </button>
          )}
        </div>
      </div>

      {/* Privacy band */}
      <div className="flex items-center gap-3 px-5 py-2 bg-accent-purple/[0.07] border-t border-accent-purple/20">
        <ShieldIcon />
        <p className="text-xs leading-snug text-text-primary">
          <span className="font-medium">This runs entirely in your browser.</span>
          <span className="text-text-muted"> Your location file is parsed in this tab and never uploaded — no server, no account, no analytics on your data. We don't care about your data.</span>
        </p>
      </div>
    </header>
  )
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-accent-purple"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
