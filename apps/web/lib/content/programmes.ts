import type { TrackerId } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * Short programmes: one small step a day for 5–7 days. Each day unlocks
 * the day after the last (counted from when the person started), and
 * progress is saved per account (supabase/programmes.sql). General
 * wellbeing guidance, not medical advice.
 * ------------------------------------------------------------------ */

export interface ProgrammeDay {
  title: string
  /** Why it helps, in two or three sentences. */
  body: string
  /** Today's one small action. */
  action: string
  /** Optional link to where the action happens. */
  link?: { href: string; label: string }
}

export interface Programme {
  id: string
  title: string
  summary: string
  /** The tracker it belongs with (icon, colour, and the focus match). */
  topic: TrackerId
  days: ProgrammeDay[]
}

export const PROGRAMMES: Programme[] = [
  {
    id: 'sleep-reset',
    title: 'Sleep reset',
    summary: 'Seven small changes for steadier, deeper sleep.',
    topic: 'sleep',
    days: [
      {
        title: 'Pick your wake-up time',
        body: 'Your body clock likes routine. Getting up at the same time every day, weekends included, is one of the most effective ways to steady your sleep.',
        action: 'Choose a wake-up time you can keep for the next week, and set an alarm for it every day.',
      },
      {
        title: 'Morning light',
        body: 'Daylight soon after waking tells your body clock that the day has started. That helps you feel sleepy at the right time in the evening.',
        action: 'Spend ten minutes outside or by a bright window within an hour of waking up.',
      },
      {
        title: 'An earlier last coffee',
        body: 'Caffeine stays in your system for many hours. Even when you can fall asleep, it can make your sleep lighter.',
        action: 'Have your last coffee, strong tea or energy drink before 2 pm today.',
      },
      {
        title: 'A wind-down hour',
        body: 'Bright screens and work messages keep your mind alert. A calm, repeated routine before bed signals that it’s time to rest.',
        action: 'For the last 30–60 minutes before bed, dim the lights, put work away and do something calm like reading or stretching.',
      },
      {
        title: 'Your bedroom',
        body: 'Most people sleep best in a room that’s slightly cool, dark and quiet. Small fixes make a real difference.',
        action: 'Change one thing tonight: thicker curtains or an eye mask, earplugs, a window open a crack, or the phone charging outside the bedroom.',
      },
      {
        title: 'If you can’t sleep, get up',
        body: 'Lying awake and frustrated teaches your brain that bed is a place for worrying. Getting up for a while breaks that link.',
        action: 'If you’re awake for about 20 minutes, get up, do something calm in dim light, and go back to bed when you feel sleepy.',
      },
      {
        title: 'Look back',
        body: 'You’ve tried six changes. Some will have helped more than others, and those are the ones worth keeping.',
        action: 'Look at your sleep for the week and pick the two habits that helped most to keep going.',
        link: { href: '/sleep', label: 'Open Sleep' },
      },
    ],
  },
  {
    id: 'stress-reset',
    title: 'Stress reset',
    summary: 'A week of quick, practical ways to take the edge off.',
    topic: 'mood',
    days: [
      {
        title: 'Notice it',
        body: 'Stress often shows up in the body first: tight shoulders, a clenched jaw, shallow breathing. Noticing it early makes it easier to deal with.',
        action: 'Do a mood check-in and set your stress level honestly.',
        link: { href: '/mood', label: 'Check in' },
      },
      {
        title: 'Breathe out longer',
        body: 'Breathing out for longer than you breathe in slows your heart rate and calms your body within a minute or two.',
        action: 'Try two minutes of breathing in for 4 and out for 6. The breathing guide in Meditation paces it for you.',
        link: { href: '/meditation', label: 'Open Meditation' },
      },
      {
        title: 'Move it out',
        body: 'Physical activity uses up stress hormones and lifts your mood. It doesn’t have to be a workout.',
        action: 'Take a brisk ten-minute walk today, ideally outside, and log it.',
        link: { href: '/exercise', label: 'Log a walk' },
      },
      {
        title: 'A worry window',
        body: 'Worries tend to spread across the whole day. Giving them a set time makes them easier to put down the rest of the time.',
        action: 'Set aside 15 minutes to write your worries down and one next step for each. If a worry comes up later, note it for tomorrow’s window.',
      },
      {
        title: 'One thing at a time',
        body: 'Switching between tasks is tiring and makes everything feel more urgent. Focusing on one thing gives your mind a break.',
        action: 'Pick one task, close everything else, and work on just that for 25 minutes.',
      },
      {
        title: 'Talk to someone',
        body: 'Sharing what’s on your mind with someone you trust makes it feel lighter, and they may see a way through you haven’t.',
        action: 'Message or call a friend, family member or colleague. If you’d rather talk to a professional, your therapist is a chat away.',
        link: { href: '/messages', label: 'Open Chats' },
      },
      {
        title: 'Your toolkit',
        body: 'You’ve tried six ways to handle stress. Knowing which work for you means you can reach for them next time.',
        action: 'Pick your top two and write them somewhere you’ll see them. If stress has been high for weeks, please talk to your therapist.',
        link: { href: '/messages', label: 'Talk to a therapist' },
      },
    ],
  },
  {
    id: 'hydration-kickstart',
    title: 'Hydration kickstart',
    summary: 'Five days to make drinking enough water automatic.',
    topic: 'water',
    days: [
      {
        title: 'Know your goal',
        body: 'How much you need depends on your body and how active you are. Your goal in OmniWell is worked out from your weight and activity level.',
        action: 'Check your daily goal on the Water page, and log every drink today.',
        link: { href: '/water', label: 'Open Water' },
      },
      {
        title: 'A glass with every meal',
        body: 'Linking water to something you already do is the easiest way to build the habit.',
        action: 'Drink a glass of water with each meal and snack today.',
      },
      {
        title: 'Keep it in sight',
        body: 'People drink more when water is easy to reach. Out of sight really is out of mind.',
        action: 'Keep a filled bottle on your desk or in your bag, and refill it whenever you get up.',
      },
      {
        title: 'Make it tastier',
        body: 'If plain water feels like a chore, small changes help. Herbal teas and other drinks count towards your goal in OmniWell too.',
        action: 'Try water with a slice of lemon, cucumber or mint, or a herbal tea.',
      },
      {
        title: 'Check in',
        body: 'Pale straw-coloured urine usually means you’re drinking enough. You’ve had four days of new habits; see how close you’re getting to your goal.',
        action: 'Look at your week on the Water page and keep the habit that made the biggest difference.',
        link: { href: '/water/stats', label: 'See your week' },
      },
    ],
  },
  {
    id: 'move-more',
    title: 'Move more',
    summary: 'Seven days of easy ways to fit more movement in.',
    topic: 'exercise',
    days: [
      {
        title: 'Ten minutes counts',
        body: 'You don’t need a gym or an hour. Short bouts of brisk activity add up and bring real benefits.',
        action: 'Take a brisk ten-minute walk today and log it.',
        link: { href: '/exercise', label: 'Log it' },
      },
      {
        title: 'Walk and talk',
        body: 'Many calls don’t need a screen. Walking while you talk turns sitting time into moving time.',
        action: 'Take one call or meeting on foot today.',
      },
      {
        title: 'Break up sitting',
        body: 'Long stretches of sitting are hard on the body, even for people who exercise. A couple of minutes on your feet each hour helps.',
        action: 'Stand up and move for two minutes every hour of your working day. Take the stairs when you can.',
      },
      {
        title: 'Strength at home',
        body: 'Strength work matters at every age, for your muscles, bones and balance. Simple bodyweight moves are enough to start.',
        action: 'Do two rounds of 10 squats, 10 wall push-ups and a 20–30 second plank. Go at your own pace and skip anything that hurts.',
      },
      {
        title: 'Stretch',
        body: 'A few minutes of gentle stretching eases stiffness from sitting and feels good at the end of the day.',
        action: 'Spend five minutes stretching your neck, shoulders, back and legs. Hold each stretch gently; it shouldn’t hurt.',
      },
      {
        title: 'Something you enjoy',
        body: 'You’re far more likely to keep doing activity you enjoy. It all counts: dancing, cycling, a sport, playing with the kids.',
        action: 'Spend 20 minutes on something active you actually like.',
      },
      {
        title: 'Plan your week',
        body: 'Health guidelines suggest about 150 minutes of moderate activity a week. Planning when it fits makes it far more likely to happen.',
        action: 'Set your weekly exercise goal in Profile and put three short sessions in your calendar for next week.',
        link: { href: '/profile', label: 'Set your goal' },
      },
    ],
  },
]

export const PROGRAMME_BY_ID = Object.fromEntries(PROGRAMMES.map((p) => [p.id, p])) as Record<string, Programme>

/* ---------- Progress ---------- */

export interface Enrolment {
  programme_id: string
  started_at: string
  /** Day numbers (1-based) marked done. */
  completed_days: number[]
  finished_at: string | null
}

export interface ProgrammeState {
  /** Days available so far: day 1 on the start day, one more each local day after. */
  unlocked: number
  done: Set<number>
  /** The day to show next (first unlocked one not done), or null when there isn't one today. */
  next: number | null
  finished: boolean
}

const localDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000

export function programmeState(p: Programme, e: Enrolment, now = new Date()): ProgrammeState {
  const since = Math.max(0, Math.round(localDay(now) - localDay(new Date(e.started_at))))
  const unlocked = Math.min(p.days.length, since + 1)
  const done = new Set(e.completed_days.filter((d) => d >= 1 && d <= p.days.length))
  const finished = done.size >= p.days.length
  let next: number | null = null
  for (let d = 1; d <= unlocked; d++) {
    if (!done.has(d)) {
      next = d
      break
    }
  }
  return { unlocked, done, next, finished }
}
