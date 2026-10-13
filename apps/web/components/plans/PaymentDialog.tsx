'use client'

import { CheckCircle2, CircleAlert, CircleX, Crown, RotateCcw } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

/* ------------------------------------------------------------------
 * The message after a payment attempt: success, closed without paying,
 * failed, couldn't confirm, or couldn't start. A real modal (native
 * <dialog>): focus moves into it, Esc closes it, the page behind is inert.
 * ------------------------------------------------------------------ */

export type PaymentResult =
  | { kind: 'success'; detail: string }
  | { kind: 'closed' }
  | { kind: 'failed'; reason: string }
  | { kind: 'unconfirmed'; reason: string }
  | { kind: 'not-started'; reason: string }

const LOOK = {
  success: { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700', title: 'Welcome to Premium' },
  closed: { icon: CircleAlert, tone: 'bg-[#FFF7E6] text-[#B9650E]', title: 'Payment not completed' },
  failed: { icon: CircleX, tone: 'bg-[#FDECEA] text-[#C42B1C]', title: 'Your payment didn’t go through' },
  unconfirmed: { icon: CircleAlert, tone: 'bg-[#FFF7E6] text-[#B9650E]', title: 'We couldn’t confirm your payment' },
  'not-started': { icon: CircleX, tone: 'bg-[#FDECEA] text-[#C42B1C]', title: 'Couldn’t open the payment page' },
} as const

function body(r: PaymentResult) {
  switch (r.kind) {
    case 'success':
      return [r.detail, 'Chat with your coaches, reminders, insights and everything else in Premium are now unlocked.']
    case 'closed':
      return ['You left the payment page before paying, so nothing was charged.', 'You can try again whenever you’re ready.']
    case 'failed':
      return [`Reason: ${r.reason.replace(/\.?$/, '.')}`, 'No money was taken. Please try again, or use a different card or UPI ID.']
    case 'unconfirmed':
      return [
        r.reason,
        'If money was taken from your account, please don’t pay again: your Premium will be switched on automatically as soon as Razorpay confirms the payment. If it isn’t within a day, contact your OmniWell administrator.',
      ]
    case 'not-started':
      return [r.reason, 'Nothing was charged. Check your connection and try again.']
  }
}

export function PaymentDialog({ result, onClose, onRetry }: { result: PaymentResult | null; onClose: () => void; onRetry: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (result && !d.open) d.showModal()
    if (!result && d.open) d.close()
  }, [result])

  const look = result ? LOOK[result.kind] : null
  const Icon = look?.icon ?? CheckCircle2
  const canRetry = !!result && (result.kind === 'closed' || result.kind === 'failed' || result.kind === 'not-started')

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="w-[min(92vw,26rem)] rounded-3xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      {result && look && (
        <div className="p-6" role={result.kind === 'success' ? 'status' : 'alert'}>
          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${look.tone}`}>
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <h2 id={titleId} className="mt-4 text-xl font-extrabold">
            {look.title}
          </h2>
          <div id={descId} className="mt-2 space-y-2 text-sm text-ink/80">
            {body(result).map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            {canRetry ? (
              <>
                <button type="button" onClick={onClose} className="btn-secondary">
                  Close
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    onClose()
                    onRetry()
                  }}
                  className="btn-primary"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden /> Try again
                </button>
              </>
            ) : (
              <button type="button" autoFocus onClick={onClose} className="btn-primary">
                {result.kind === 'success' && <Crown className="h-4 w-4" aria-hidden />}
                {result.kind === 'success' ? 'Done' : 'Close'}
              </button>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}
