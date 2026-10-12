/**
 * A same-site path to send someone to after logging in, confirming an email
 * or tapping a notification, or `fallback` if it isn't one.
 *
 * Checking the string's start isn't enough: browsers treat "\" like "/" and
 * drop tabs and newlines, so "/\evil.com" or "/<tab>/evil.com" become
 * "//evil.com", another site. Instead the path is resolved the way a browser
 * would and kept only if it stays on our own origin. Pure, so it's shared by
 * the server routes, the login page and the service worker.
 */
export function safePath(input: unknown, fallback = '/dashboard'): string {
  if (typeof input !== 'string' || !input.startsWith('/')) return fallback
  const base = 'https://omniwell.invalid'
  try {
    const url = new URL(input, base)
    if (url.origin !== base) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
