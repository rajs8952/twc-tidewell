import { isAppRole, type AppRole } from '@/lib/admin'
import { isTeam, type Team } from '@/lib/messages'

/* ------------------------------------------------------------------
 * Bulk import (admin portal → Import): reading the CSV and checking each
 * row before anything is created. Pure, so the browser shows problems
 * straight away and the server checks the same rules again.
 *
 * Columns (any order, case and spacing ignored): name, email, and
 * optionally role (user, coach, hr, admin; empty = user) and team
 * (therapist or dietitian, required for coaches).
 * ------------------------------------------------------------------ */

export const MAX_IMPORT_ROWS = 300
/** Rows per server call: each account and its invitation email take a second or two. */
export const IMPORT_BATCH = 5
export const IMPORT_TEMPLATE = 'name,email,role,team\nPriya Shah,priya.shah@company.com,user,\nDr. Ananya Rao,ananya.rao@company.com,coach,therapist\n'

export interface ImportRow {
  /** 1-based line number in the file (the header is line 1). */
  line: number
  name: string
  email: string
  role: AppRole
  team: Team | null
  /** Why this row can't be imported, if it can't. */
  problem: string | null
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const HEADERS: Record<string, keyof Pick<ImportRow, 'name' | 'email' | 'role' | 'team'>> = {
  name: 'name',
  'full name': 'name',
  fullname: 'name',
  'employee name': 'name',
  email: 'email',
  'email address': 'email',
  'work email': 'email',
  role: 'role',
  team: 'team',
  'coach team': 'team',
}
const ROLE_WORDS: Record<string, AppRole> = { user: 'user', employee: 'user', coach: 'coach', hr: 'hr', admin: 'admin', administrator: 'admin' }

/** The file's separator, from its first line: comma, or semicolon or tab (Excel in some regions). */
function separatorOf(s: string) {
  const first = s.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch: string) => first.split(ch).length - 1
  return [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',')
}

/** Splits CSV text into rows of cells (quotes, escaped quotes, commas and line breaks inside quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^\uFEFF/, '')
  const sep = separatorOf(s)
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Reads and checks every row. `existing` holds emails that already have an account (lower case). */
export function readImport(text: string, existing: Set<string> = new Set()): { rows: ImportRow[]; error: string | null } {
  const table = parseCsv(text)
  if (table.length === 0) return { rows: [], error: 'The file is empty.' }
  const header = table[0]!.map((h) => HEADERS[h.trim().toLowerCase().replace(/[_-]+/g, ' ')] ?? null)
  if (!header.includes('name') || !header.includes('email')) {
    return { rows: [], error: 'The first line must name the columns, including “name” and “email” (and optionally “role” and “team”). Download the template to see the format.' }
  }
  const body = table.slice(1)
  if (body.length === 0) return { rows: [], error: 'There are no people in the file, only the header line.' }
  if (body.length > MAX_IMPORT_ROWS) return { rows: [], error: `That’s ${body.length} people. Import at most ${MAX_IMPORT_ROWS} at a time; split the file and import the rest afterwards.` }

  const seen = new Map<string, number>()
  const rows = body.map((cells, i): ImportRow => {
    const get = (key: string) => {
      const at = header.indexOf(key as never)
      return at >= 0 ? (cells[at] ?? '').trim() : ''
    }
    const name = get('name').replace(/\s+/g, ' ')
    const email = get('email').toLowerCase()
    const roleWord = get('role').toLowerCase()
    const role = roleWord ? ROLE_WORDS[roleWord] : 'user'
    const teamWord = get('team').toLowerCase()
    const team = isTeam(teamWord) ? teamWord : null
    const line = i + 2
    let problem: string | null = null
    if (!name) problem = 'Name is missing.'
    else if (name.length > 120) problem = 'Name is longer than 120 characters.'
    else if (!email) problem = 'Email is missing.'
    else if (email.length > 254 || !EMAIL.test(email)) problem = 'Email doesn’t look right.'
    else if (!role || !isAppRole(role)) problem = `Unknown role “${roleWord}”. Use user, coach, hr or admin.`
    else if (role === 'coach' && !team) problem = teamWord ? `Unknown team “${teamWord}”. Use therapist or dietitian.` : 'Coaches need a team: therapist or dietitian.'
    else if (seen.has(email)) problem = `Same email as line ${seen.get(email)}.`
    else if (existing.has(email)) problem = 'Already has an OmniWell account.'
    if (email && !seen.has(email)) seen.set(email, line)
    return { line, name, email, role: role ?? 'user', team: role === 'coach' ? team : null, problem }
  })
  return { rows, error: null }
}
