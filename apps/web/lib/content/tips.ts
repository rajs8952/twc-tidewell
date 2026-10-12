import type { TrackerId } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * Tip of the day: short, general wellbeing guidance (not medical advice),
 * five per tracker. Each day shows one, from the trackers the person chose
 * to focus on (all six if none), rotating so a topic doesn't repeat two
 * days running when there's more than one.
 * ------------------------------------------------------------------ */

export interface Tip {
  id: string
  topic: TrackerId
  title: string
  body: string
}

export const TIPS: Tip[] = [
  // Water
  { id: 'water-morning', topic: 'water', title: 'Start with a glass', body: 'You wake up a little dehydrated after a night’s sleep. A glass of water before your first coffee is an easy win.' },
  { id: 'water-meals', topic: 'water', title: 'One with every meal', body: 'Pairing a glass of water with each meal and snack gets you a long way towards your goal without thinking about it.' },
  { id: 'water-bottle', topic: 'water', title: 'Keep it in sight', body: 'People drink more when water is within reach. Keep a bottle on your desk and refill it each time you get up.' },
  { id: 'water-flavour', topic: 'water', title: 'Flavour without sugar', body: 'A slice of lemon, cucumber or a few berries makes water more interesting. Herbal tea counts towards your goal too.' },
  { id: 'water-colour', topic: 'water', title: 'Check the colour', body: 'Pale straw-coloured urine usually means you’re drinking enough. Darker can be a sign to drink a bit more.' },
  // Mood
  { id: 'mood-name', topic: 'mood', title: 'Name the feeling', body: 'Putting a feeling into words, even just “tired and tense”, can take some of the edge off. A quick check-in does exactly that.' },
  { id: 'mood-outside', topic: 'mood', title: 'Get outside', body: 'Time in daylight and green space lifts mood for many people. Even a ten-minute walk around the block counts.' },
  { id: 'mood-gratitude', topic: 'mood', title: 'Three good things', body: 'Before bed, note three things that went well today, however small. It trains your attention to notice the good.' },
  { id: 'mood-connect', topic: 'mood', title: 'Reach out', body: 'A short message or call to someone you like is one of the most reliable mood boosters there is.' },
  { id: 'mood-talk', topic: 'mood', title: 'You don’t have to manage alone', body: 'If low mood or stress hangs around for more than a couple of weeks, talking to a therapist can really help. It’s private.' },
  // Sleep
  { id: 'sleep-wake', topic: 'sleep', title: 'Same wake-up time', body: 'Getting up at the same time every day, weekends included, is one of the strongest ways to steady your sleep.' },
  { id: 'sleep-light', topic: 'sleep', title: 'Morning light', body: 'Ten minutes of daylight soon after waking helps set your body clock, so you feel sleepy at the right time at night.' },
  { id: 'sleep-caffeine', topic: 'sleep', title: 'Mind the afternoon coffee', body: 'Caffeine stays in your system for hours. Try keeping coffee, strong tea and energy drinks to before about 2 pm.' },
  { id: 'sleep-wind-down', topic: 'sleep', title: 'A wind-down routine', body: 'The same calm routine each night, like dim lights, a shower and a book, tells your body that sleep is coming.' },
  { id: 'sleep-room', topic: 'sleep', title: 'Cool, dark and quiet', body: 'A slightly cool, dark, quiet bedroom helps most people sleep better. An eye mask or earplugs are cheap fixes.' },
  // Meditation
  { id: 'meditation-short', topic: 'meditation', title: 'Short is fine', body: 'Three minutes of focused breathing still counts. A short session you actually do beats a long one you skip.' },
  { id: 'meditation-exhale', topic: 'meditation', title: 'Breathe out longer', body: 'Breathing in for 4 and out for 6 slows your heart rate and calms your body. Try it for two minutes.' },
  { id: 'meditation-anchor', topic: 'meditation', title: 'Attach it to a habit', body: 'Meditate right after something you already do every day, like your morning coffee or arriving at your desk.' },
  { id: 'meditation-wander', topic: 'meditation', title: 'Wandering is the practice', body: 'Your mind will wander. Noticing that and gently coming back is the exercise itself, not a sign of failing.' },
  { id: 'meditation-body', topic: 'meditation', title: 'Try a body scan', body: 'Slowly move your attention from your toes to your head, noticing tension and letting it soften. Good before sleep.' },
  // Exercise
  { id: 'exercise-ten', topic: 'exercise', title: 'Ten minutes counts', body: 'Short bouts of brisk activity add up. Three ten-minute walks give much of the benefit of one thirty-minute one.' },
  { id: 'exercise-150', topic: 'exercise', title: 'Aim for 150 a week', body: 'Health guidelines suggest about 150 minutes of moderate activity a week, like brisk walking, plus some strength work.' },
  { id: 'exercise-stand', topic: 'exercise', title: 'Break up sitting', body: 'Stand up and move for a couple of minutes every hour. Take calls on your feet or walk to a colleague’s desk.' },
  { id: 'exercise-strength', topic: 'exercise', title: 'Strength at home', body: 'Squats, wall push-ups and a short plank need no equipment. Two rounds a couple of times a week builds strength.' },
  { id: 'exercise-enjoy', topic: 'exercise', title: 'Pick what you enjoy', body: 'The best exercise is the one you’ll keep doing. Dancing, cycling to work and playing with kids all count.' },
  // Weight
  { id: 'weight-trend', topic: 'weight', title: 'Watch the trend', body: 'Weight goes up and down by a kilo or more from day to day with water and food. The trend over weeks is what matters.' },
  { id: 'weight-same-time', topic: 'weight', title: 'Weigh at the same time', body: 'For numbers you can compare, weigh yourself at the same time of day, ideally in the morning before breakfast.' },
  { id: 'weight-plate', topic: 'weight', title: 'Half a plate of veg', body: 'Filling half your plate with vegetables or salad adds fibre and keeps you full, without counting anything.' },
  { id: 'weight-slow', topic: 'weight', title: 'Eat a little slower', body: 'It takes a while for fullness to register. Putting your fork down between bites helps you notice when you’ve had enough.' },
  { id: 'weight-dietitian', topic: 'weight', title: 'Ask the dietitian', body: 'Your company dietitian can help you set a realistic goal and a plan that fits your life. Start a chat any time.' },
]

/** Days since 1 January 1970 in local time, so the tip changes at local midnight. */
const dayNumber = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)

/** Today's tip: rotates through the focus topics (or all), then through each topic's tips. */
export function tipOfTheDay(now = new Date(), focus: string[] = []): Tip {
  const all = [...new Set(TIPS.map((t) => t.topic))]
  const topics = all.filter((t) => focus.includes(t))
  const pool = topics.length ? topics : all
  const n = dayNumber(now)
  const topic = pool[n % pool.length]!
  const ofTopic = TIPS.filter((t) => t.topic === topic)
  return ofTopic[Math.floor(n / pool.length) % ofTopic.length]!
}
