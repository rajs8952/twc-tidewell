'use client'

import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, MailCheck, Send, UserX } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { adminGetUsers, adminImportUsers, type ImportOutcome } from '@/app/actions/admin'
import { ROLE_LABEL } from '@/components/admin/UserDialogs'
import { errorMessage } from '@rajs8952/core/errors'
import { IMPORT_BATCH, IMPORT_TEMPLATE, MAX_IMPORT_ROWS, readImport, type ImportRow } from '@/lib/csv-import'
import { TEAMS } from '@/lib/messages'

/* ------------------------------------------------------------------
 * Admin portal → Import: create many accounts from a CSV and email each
 * person an invitation. Rows are checked in the browser first (and again
 * on the server); existing accounts are skipped, never changed.
 * ------------------------------------------------------------------ */

type Result = { outcome: ImportOutcome; detail?: string }

const OUTCOME: Record<ImportOutcome, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  invited: { label: 'Invited', tone: 'text-emerald-700', icon: MailCheck },
  created_no_email: { label: 'Created, email not sent', tone: 'text-[#B9650E]', icon: AlertCircle },
  exists: { label: 'Skipped: already has an account', tone: 'text-muted', icon: UserX },
  failed: { label: 'Not created', tone: 'text-[#C42B1C]', icon: AlertCircle },
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  URL.revokeObjectURL(url)
}

export function ImportUsers() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [existing, setExisting] = useState<Set<string> | null>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [results, setResults] = useState<Map<string, Result>>(new Map())
  const [error, setError] = useState<string | null>(null)

  // Existing accounts, so the preview can flag them before anything is sent.
  useEffect(() => {
    adminGetUsers()
      .then((r) => setExisting(new Set(r.ok ? r.data.flatMap((u) => (u.email ? [u.email.toLowerCase()] : [])) : [])))
      .catch(() => setExisting(new Set()))
  }, [])

  const parsed = useMemo(() => (text.trim() ? readImport(text, existing ?? new Set()) : null), [text, existing])
  const ready = parsed?.rows.filter((r) => !r.problem) ?? []
  const problems = (parsed?.rows.length ?? 0) - ready.length
  const finished = results.size > 0 && !running

  async function pick(file: File) {
    setError(null)
    setResults(new Map())
    if (file.size > 1024 * 1024) return setError('That file is over 1 MB. A CSV of a few hundred people is usually under 50 KB.')
    setFileName(file.name)
    setText(await file.text())
  }

  async function run() {
    if (!ready.length) return
    setRunning(true)
    setError(null)
    setDone(0)
    const out = new Map<string, Result>()
    try {
      for (let i = 0; i < ready.length; i += IMPORT_BATCH) {
        const batch = ready.slice(i, i + IMPORT_BATCH)
        const res = await adminImportUsers(batch.map(({ name, email, role, team }) => ({ name, email, role, team })))
        if (!res.ok) throw new Error(res.error)
        for (const r of res.data) out.set(r.email, { outcome: r.outcome, detail: r.detail })
        setResults(new Map(out))
        setDone(Math.min(ready.length, i + batch.length))
      }
    } catch (e) {
      setError(`${errorMessage(e)} Rows already processed are listed below; run the import again to continue (people already created will be skipped).`)
    } finally {
      setRunning(false)
    }
  }

  const count = (o: ImportOutcome) => [...results.values()].filter((r) => r.outcome === o).length
  const reportCsv = () =>
    ['line,name,email,role,team,result,detail', ...(parsed?.rows ?? []).map((r) => {
      const res = results.get(r.email)
      const result = r.problem ? 'not imported' : res ? OUTCOME[res.outcome].label : 'not run'
      return [r.line, r.name, r.email, r.role, r.team ?? '', result, r.problem ?? res?.detail ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })].join('\n')

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Import people</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Create accounts from a CSV and email each person an invitation. They set their own password with a code sent to their email, so you never choose or share
            passwords. Up to {MAX_IMPORT_ROWS} people at a time.
          </p>
        </div>
        <button type="button" onClick={() => download('omniwell-import-template.csv', IMPORT_TEMPLATE)} className="btn-secondary">
          <Download className="h-4 w-4" aria-hidden /> Template
        </button>
      </div>

      <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void pick(f)
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={running} className="btn-primary">
            <FileUp className="h-4 w-4" aria-hidden /> Choose a CSV file
          </button>
          <span className="text-sm text-muted">{fileName ?? 'or paste the rows below'}</span>
        </div>
        <label htmlFor="csv-text" className="label mt-4">
          CSV
        </label>
        <textarea
          id="csv-text"
          rows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFileName(null)
            setResults(new Map())
          }}
          disabled={running}
          placeholder={IMPORT_TEMPLATE}
          className="input min-h-[120px] resize-y font-mono text-xs"
          spellCheck={false}
        />
        <p className="mt-1.5 text-xs text-muted">
          Columns: <b>name</b>, <b>email</b>, and optionally <b>role</b> (user, coach, hr or admin; empty means user) and <b>team</b> (therapist or dietitian, for
          coaches). Commas, semicolons or tabs all work, so a sheet saved from Excel or Google Sheets is fine.
        </p>
      </section>

      {parsed?.error && (
        <p role="alert" className="notice-error mt-6">
          {parsed.error}
        </p>
      )}

      {parsed && !parsed.error && (
        <section aria-labelledby="preview-title" className="mt-6 overflow-hidden rounded-3xl bg-white ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id="preview-title" className="text-lg font-bold">
                {finished ? 'Results' : 'Check before importing'}
              </h2>
              <p className="text-sm text-muted" aria-live="polite">
                {finished
                  ? `${count('invited')} invited · ${count('created_no_email')} created without email · ${count('exists')} skipped · ${count('failed') + problems} not imported`
                  : `${ready.length} ready${problems ? ` · ${problems} with a problem (they’ll be left out)` : ''}${existing === null ? ' · checking existing accounts…' : ''}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {finished && (
                <button type="button" onClick={() => download('omniwell-import-results.csv', reportCsv())} className="btn-secondary">
                  <Download className="h-4 w-4" aria-hidden /> Results
                </button>
              )}
              {!finished && (
                <button type="button" onClick={run} disabled={running || !ready.length || existing === null} className="btn-primary">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  {running ? `Creating ${done} of ${ready.length}…` : `Create ${ready.length} ${ready.length === 1 ? 'account' : 'accounts'} and send invitations`}
                </button>
              )}
            </div>
          </div>
          {running && (
            <div className="h-1.5 bg-mist" aria-hidden>
              <div className="h-full bg-tide-600 transition-all" style={{ width: `${(done / Math.max(1, ready.length)) * 100}%` }} />
            </div>
          )}
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 bg-mist text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Line</th>
                  <th className="px-3 py-2.5 font-bold">Name</th>
                  <th className="px-3 py-2.5 font-bold">Email</th>
                  <th className="px-3 py-2.5 font-bold">Role</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {parsed.rows.map((r: ImportRow) => {
                  const res = results.get(r.email)
                  const o = res ? OUTCOME[res.outcome] : null
                  const Icon = o?.icon
                  return (
                    <tr key={r.line} className={r.problem ? 'bg-[#FFF8F6]' : undefined}>
                      <td className="px-4 py-2.5 tabular-nums text-muted">{r.line}</td>
                      <td className="px-3 py-2.5 font-semibold">{r.name || '–'}</td>
                      <td className="px-3 py-2.5">{r.email || '–'}</td>
                      <td className="px-3 py-2.5">
                        {ROLE_LABEL[r.role]}
                        {r.team && <span className="text-muted"> · {TEAMS[r.team].label}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.problem ? (
                          <span className="font-semibold text-[#C42B1C]">{r.problem}</span>
                        ) : o && Icon ? (
                          <span className={`inline-flex items-center gap-1 font-semibold ${o.tone}`} title={res?.detail}>
                            <Icon className="h-4 w-4 shrink-0" aria-hidden /> {o.label}
                            {res?.detail && res.outcome !== 'exists' && <span className="font-normal text-muted">: {res.detail}</span>}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" aria-hidden /> Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="notice-error mt-6">
          {error}
        </p>
      )}

      <p className="mt-6 text-xs text-muted">
        Invitations come from OmniWell’s email account, which can send about 500 emails a day. The invitation links to “Set up your account” on the log-in page; there’s
        nothing in it that a company email scanner could use up. Imported people appear in <Link href="/admin" className="font-bold underline underline-offset-2">Users</Link>,
        where you can change roles or capacity as usual.
      </p>
    </>
  )
}
