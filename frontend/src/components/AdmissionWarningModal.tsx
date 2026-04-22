/**
 * AdmissionWarningModal — user-facing gate for risky and destructive edits.
 *
 * Shown automatically when EditAdmissionService classifies an incoming edit
 * as 'risky' or 'destructive'. The user sees only simple, actionable language —
 * internal risk classes are never exposed directly.
 *
 * Risky     → "Continue" / "Cancel"  (yellow warning tone)
 * Destructive → "I understand, proceed" / "Cancel"  (red danger tone)
 *
 * The caller provides onConfirm / onDeny — the modal itself is stateless.
 */

import type { AdmissionDecision } from '../services/EditAdmissionService';

interface Props {
  decision:  AdmissionDecision;
  onConfirm: () => void;
  onDeny:    () => void;
}

export function AdmissionWarningModal({ decision, onConfirm, onDeny }: Props) {
  const isDestructive = decision.requiresStrongConfirmation;

  // ── Colour tokens ─────────────────────────────────────────────────────────
  const accentBorder  = isDestructive ? '#ef4444' : '#f59e0b';
  const iconBg        = isDestructive ? 'rgba(239,68,68,0.12)'  : 'rgba(245,158,11,0.12)';
  const iconColor     = isDestructive ? '#ef4444' : '#f59e0b';
  const confirmBg     = isDestructive ? '#ef4444' : '#f59e0b';
  const confirmHover  = isDestructive ? '#dc2626' : '#d97706';
  const confirmLabel  = isDestructive ? 'I understand, proceed' : 'Continue';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 flex items-center justify-center z-[200]"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onDeny}
    >
      {/* Panel */}
      <div
        className="relative rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        style={{
          background:  '#0f1117',
          border:      `1.5px solid ${accentBorder}`,
          boxShadow:   `0 0 0 1px ${accentBorder}22, 0 24px 48px rgba(0,0,0,0.6)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div style={{ height: 3, background: accentBorder }} />

        <div className="p-6 space-y-4">
          {/* Icon + heading */}
          <div className="flex items-start gap-3">
            <div
              className="flex-shrink-0 flex items-center justify-center rounded-lg mt-0.5"
              style={{
                width: 36, height: 36,
                background: iconBg,
                color: iconColor,
              }}
            >
              {isDestructive ? (
                /* Skull / danger icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26C17.81 13.47 19 11.38 19 9c0-3.87-3.13-7-7-7z"/>
                  <line x1="10" y1="17" x2="10" y2="21"/>
                  <line x1="14" y1="17" x2="14" y2="21"/>
                </svg>
              ) : (
                /* Shield-alert icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>

            <div className="flex-1">
              <h2
                className="text-base font-semibold leading-tight"
                style={{ color: accentBorder }}
              >
                {decision.userHeading}
              </h2>
              <p
                className="mt-2 text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: '#94a3b8' }}
              >
                {decision.userBody}
              </p>
            </div>
          </div>

          {/* Snapshot note */}
          {!isDestructive && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(245,158,11,0.07)', color: '#94a3b8' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              A snapshot will be saved automatically before applying.
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onDeny}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color:      '#94a3b8',
                border:     '1px solid rgba(255,255,255,0.10)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: confirmBg, color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = confirmHover)}
              onMouseLeave={e => (e.currentTarget.style.background = confirmBg)}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
