/* ------------------------------------------------------------------
 * OmniWell plans (supabase/subscriptions.sql). Prices include GST and
 * other taxes. Premium features are locked in the screens with
 * components/plans/PremiumGate.tsx, and in the database where it matters
 * (chat, programmes, wellness contacts, reminders).
 * ------------------------------------------------------------------ */

export const PRICES = {
  monthly: { amount: 99, label: '₹99', per: 'month' },
  yearly: { amount: 599, label: '₹599', per: 'year', note: 'about ₹50 a month, save 50%' },
} as const
export type BillingPeriod = keyof typeof PRICES

export const TRIAL_DAYS = 7
/** The one programme open to free accounts (mirrors the SQL trigger). */
export const FREE_PROGRAMME = 'hydration-kickstart'

export interface PlanInfo {
  premium: boolean
  staff: boolean
  plan: 'free' | 'premium'
  source: 'none' | 'trial' | 'paid' | 'company' | 'grandfathered' | 'admin'
  premium_until: string | null
  billing_period: BillingPeriod | null
  status: 'active' | 'past_due' | 'cancelled' | 'halted'
  cancel_at_period_end: boolean
  trial_used: boolean
}

/** Before supabase/subscriptions.sql is run, everyone keeps everything. */
export const EVERYTHING: PlanInfo = {
  premium: true,
  staff: false,
  plan: 'premium',
  source: 'grandfathered',
  premium_until: null,
  billing_period: null,
  status: 'active',
  cancel_at_period_end: false,
  trial_used: true,
}

export const daysLeft = (until: string | null, now = Date.now()) => (until ? Math.max(0, Math.ceil((Date.parse(until) - now) / 86_400_000)) : null)

/** What Premium adds, in the order the plans page lists it. */
export const PREMIUM_FEATURES = [
  { key: 'chat', title: 'Chat with your therapist and dietitian', text: 'Private messages with the wellness team, with photos and read receipts.' },
  { key: 'eap', title: 'EAP helpline and calls', text: 'The Employee Assistance Programme and call buttons for the wellness team.' },
  { key: 'reminders', title: 'Reminders', text: 'Gentle nudges for each tracker, which stop once you’re done.' },
  { key: 'insights', title: 'Insights', text: 'Your last 30 days for every tracker, and how your habits connect.' },
  { key: 'garden', title: 'Water garden', text: 'A plant that grows with every water-goal day.' },
  { key: 'programmes', title: 'All programmes', text: 'Sleep reset, Stress reset and Move more, one small step a day.' },
  { key: 'recap', title: 'Weekly recap and smart nudges', text: 'Your week every Monday, and suggestions that notice patterns.' },
] as const
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number]['key']

export const FREE_FEATURES = [
  'All six trackers, with one-tap logging and editing',
  'Goals, streaks and the BMI calculator',
  'Tip of the day and the Hydration kickstart programme',
  'The emergency number (112), always',
] as const
