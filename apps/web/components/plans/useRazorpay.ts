'use client'

/* Razorpay Checkout runs in the browser from Razorpay's own script; card and UPI details never touch OmniWell. */

const SRC = 'https://checkout.razorpay.com/v1/checkout.js'

export interface CheckoutSuccess {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

let loading: Promise<void> | null = null

export function loadRazorpay(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('Couldn’t load the payment window. Check your connection and try again.'))
    }
    document.body.appendChild(s)
  })
  return loading
}

/** How Checkout ended: paid, closed without paying, or closed after a failed attempt. */
export type CheckoutOutcome =
  | { status: 'paid'; proof: CheckoutSuccess }
  | { status: 'closed' }
  | { status: 'failed'; reason: string }

/**
 * Opens Checkout for a subscription. Razorpay keeps its window open after a
 * failed attempt so the person can try again inside it, so a failure is only
 * reported if they then close the window without paying.
 */
export async function payWithRazorpay(o: { keyId: string; subscriptionId: string; email: string; name: string; description: string }): Promise<CheckoutOutcome> {
  await loadRazorpay()
  return new Promise((resolve) => {
    let lastFailure: string | null = null
    const rzp = new window.Razorpay!({
      key: o.keyId,
      subscription_id: o.subscriptionId,
      name: 'OmniWell',
      description: o.description,
      prefill: { email: o.email, name: o.name },
      theme: { color: '#0F2F37' },
      handler: (r: CheckoutSuccess) => resolve({ status: 'paid', proof: r }),
      modal: {
        // The phone's Back button and Esc close the window (after "Are you sure?"), like the close button.
        handleback: true,
        escape: true,
        confirm_close: true,
        ondismiss: () => resolve(lastFailure ? { status: 'failed', reason: lastFailure } : { status: 'closed' }),
      },
    })
    rzp.on('payment.failed', (r) => {
      lastFailure = r.error?.description || 'The payment was declined.'
    })
    rzp.open()
  })
}
