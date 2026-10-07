/* ------------------------------------------------------------------
 * Biometrics helpers: height, age and BMI from the profile.
 * Age is stored as a birth year (profiles.birth_year) so it doesn't go stale.
 * ------------------------------------------------------------------ */

export const HEIGHT_CM = { min: 100, max: 250 } as const
export const AGE = { min: 13, max: 120 } as const

const CM_PER_IN = 2.54

export const cmToFeetInches = (cm: number) => {
  const totalIn = Math.round(cm / CM_PER_IN)
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 }
}

export const feetInchesToCm = (ft: number, inches: number) => Math.round((ft * 12 + inches) * CM_PER_IN * 10) / 10

export const ageFromBirthYear = (birthYear: number | null, now = new Date()) =>
  birthYear == null ? null : now.getFullYear() - birthYear

export const birthYearFromAge = (age: number, now = new Date()) => now.getFullYear() - age

/** Body-mass index to one decimal, or null without both measurements. */
export function bmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg) return null
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}

/** WHO adult BMI bands. A rough guide only: it ignores muscle, frame and age. */
export function bmiBand(value: number): { label: string; position: number } {
  // position: where the value sits on a 15–35 scale, for the indicator bar.
  const position = Math.min(1, Math.max(0, (value - 15) / 20))
  if (value < 18.5) return { label: 'Below the healthy range', position }
  if (value < 25) return { label: 'In the healthy range', position }
  if (value < 30) return { label: 'Above the healthy range', position }
  return { label: 'Well above the healthy range', position }
}

/** Weights (kg, one decimal) that give a BMI of 18.5 to 24.9 at this height. */
export function healthyWeightRange(heightCm: number | null): { min: number; max: number } | null {
  if (!heightCm) return null
  const m2 = (heightCm / 100) ** 2
  return { min: Math.round(18.5 * m2 * 10) / 10, max: Math.round(24.9 * m2 * 10) / 10 }
}
