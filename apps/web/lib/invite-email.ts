import { layout } from '@/lib/email'

/** The invitation: a plain link to "Set up your account" (no token in it), where they get a code and choose a password. */
export function inviteEmail(name: string, email: string, site: string) {
  const first = name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(/\s+/)[0]
  return layout({
    heading: 'You’re invited to OmniWell',
    paragraphs: [
      first ? `Hi ${first},` : 'Hi,',
      'Your company has set up an OmniWell account for you: one place for your daily wellbeing habits, with private access to the company’s therapists and dietitians.',
      `To get started, open OmniWell, enter this email address (${email}), and we’ll send you a 6-digit code to choose your password.`,
    ],
    button: { label: 'Set up your account', url: `${site}/login?setup=1` },
    footer: 'If you weren’t expecting this, you can ignore this email. Nobody can use the account until they choose a password with a code sent to this address.',
  })
}
