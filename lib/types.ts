import type { Activity, BeverageId, Gender } from './hydration'

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  weight_kg: number
  gender: Gender
  activity_level: Activity
  custom_goal_ml: number | null
}

export interface DrinkLog {
  id: string
  beverage: BeverageId
  amount_ml: number
  multiplier: number
  effective_ml: number
  logged_at: string
}
