/* ------------------------------------------------------------------
 * Spearman rank correlation, pure TypeScript, no dependencies.
 *
 * Spearman's rho is the Pearson correlation of the RANKS of the values,
 * so it measures any monotonic relationship and suits ordinal data such as
 * a 1–5 mood score. Ties get the average of the ranks they span. With ties
 * the shortcut 1 − 6Σd²/(n(n²−1)) is wrong, so this always computes the
 * Pearson correlation of the ranks, which is exact in both cases.
 * ------------------------------------------------------------------ */

export interface SpearmanResult {
  /** Coefficient in [-1, 1], or null when it isn't defined (see `reason`). */
  rho: number | null
  /** Number of complete (x, y) pairs used. */
  n: number
  reason?: 'too-few-pairs' | 'no-variation'
}

/** Fewer pairs than this and rho isn't returned. */
export const MIN_PAIRS = 3

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * 1-based ranks; tied values share the mean of the positions they occupy.
 * e.g. [10, 20, 20, 30] → [1, 2.5, 2.5, 4]
 */
export function averageRanks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const ranks = new Array<number>(values.length)
  for (let start = 0; start < order.length; ) {
    let end = start
    while (end + 1 < order.length && order[end + 1].v === order[start].v) end++
    const rank = (start + end) / 2 + 1 // mean of 1-based positions start+1 … end+1
    for (let k = start; k <= end; k++) ranks[order[k].i] = rank
    start = end + 1
  }
  return ranks
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length
  const meanA = a.reduce((s, v) => s + v, 0) / n
  const meanB = b.reduce((s, v) => s + v, 0) / n
  let cov = 0
  let varA = 0
  let varB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    cov += da * db
    varA += da * da
    varB += db * db
  }
  if (varA === 0 || varB === 0) return null
  return cov / Math.sqrt(varA * varB)
}

/**
 * Spearman's rho for two equal-length arrays of paired observations.
 * Index i of `x` pairs with index i of `y`. A pair is skipped when either
 * value is null, undefined or not a finite number (pairwise deletion).
 */
export function spearman(x: ReadonlyArray<number | null | undefined>, y: ReadonlyArray<number | null | undefined>): SpearmanResult {
  if (x.length !== y.length) throw new Error(`spearman: arrays differ in length (${x.length} vs ${y.length})`)

  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < x.length; i++) {
    const a = x[i]
    const b = y[i]
    if (isNum(a) && isNum(b)) {
      xs.push(a)
      ys.push(b)
    }
  }

  const n = xs.length
  if (n < MIN_PAIRS) return { rho: null, n, reason: 'too-few-pairs' }

  const r = pearson(averageRanks(xs), averageRanks(ys))
  if (r === null) return { rho: null, n, reason: 'no-variation' }
  // Floating-point error can land a hair outside [-1, 1].
  return { rho: Math.max(-1, Math.min(1, r)), n }
}

/** Plain-language strength for |rho|, using common rule-of-thumb bands. */
export function describeStrength(rho: number): 'very weak' | 'weak' | 'moderate' | 'strong' | 'very strong' {
  const a = Math.abs(rho)
  if (a < 0.2) return 'very weak'
  if (a < 0.4) return 'weak'
  if (a < 0.6) return 'moderate'
  if (a < 0.8) return 'strong'
  return 'very strong'
}
