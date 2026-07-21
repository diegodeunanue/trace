import type { ReactNode } from 'react'

interface Props {
  /** Centre header label — STYLE / COMPOSE / UPLOAD. */
  screenLabel: string
  /** Left of the wordmark: a back link or nothing. */
  navLeft?: ReactNode
  /** Right end of the header: primary action, or the edition mark. */
  navRight?: ReactNode
  children: ReactNode
}

/**
 * The gallery frame every screen sits in: a thin header, the room, and a quiet
 * privacy line along the bottom.
 *
 * The privacy statement used to be a full-width tinted band directly under the
 * brand. It is the product's core promise, but "important" and "loud" are not
 * the same thing — as a footer rule it stays permanently visible on every
 * screen without competing with the work.
 */
export default function Shell({ screenLabel, navLeft, navRight, children }: Props) {
  return (
    <div className="h-full w-full flex flex-col bg-wall text-ink">
      <header className="shrink-0 h-[52px] px-[30px] flex items-center gap-7 border-b border-line">
        <span className="font-sans text-[19px] font-semibold lowercase tracking-[.34em] select-none">
          trace
        </span>
        {navLeft}
        <span className="flex-1 text-center font-mono text-[9.5px] uppercase tracking-[.30em] text-muted">
          {screenLabel}
        </span>
        <div className="flex items-center justify-end min-w-[120px]">{navRight}</div>
      </header>

      <div className="flex-1 min-h-0 relative">{children}</div>

      <footer className="shrink-0 h-[38px] flex items-center justify-center gap-2 border-t border-line">
        <LockGlyph />
        <p className="font-mono text-[9px] tracking-[.10em] text-muted">
          Parsed in this tab · never uploaded · no account · no analytics
        </p>
      </footer>
    </div>
  )
}

/** Text link in the header rail. */
export function NavLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-[11px] tracking-[.08em] lowercase text-muted hover:text-ink transition-colors"
    >
      {children}
    </button>
  )
}

/** Filled ink button — one per screen at most. */
export function PrimaryButton({
  children, onClick, disabled = false, full = false,
}: { children: ReactNode; onClick: () => void; disabled?: boolean; full?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${full ? 'w-full' : ''} bg-ink text-wall rounded-sm px-6 py-3
                  font-sans text-[11px] font-medium uppercase tracking-[.17em]
                  disabled:opacity-30 hover:opacity-90 transition-opacity`}
    >
      {children}
    </button>
  )
}

/** Outlined counterpart for secondary navigation. */
export function GhostButton({
  children, onClick,
}: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border border-line rounded-sm px-4 py-2 font-sans text-[11px] font-medium
                 uppercase tracking-[.16em] text-ink hover:border-ink transition-colors"
    >
      {children}
    </button>
  )
}

/** Small-caps mono section label used throughout the rail. */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <span className="font-mono text-[9px] uppercase tracking-[.22em] text-muted">{children}</span>
      {right}
    </div>
  )
}

function LockGlyph() {
  return (
    <svg width="9" height="11" viewBox="0 0 10 12" fill="none" aria-hidden="true" className="text-muted">
      <rect x="0.6" y="4.9" width="8.8" height="6.5" rx="1" stroke="currentColor" strokeWidth="1" />
      <path d="M2.7 4.9V3.2a2.3 2.3 0 0 1 4.6 0v1.7" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}
