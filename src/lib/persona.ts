/**
 * A friendly emoji and colour for each person, worked out from their account ID so it is the same on
 * every device and needs nothing stored. Used only in the profile and people sections.
 */
const FACES = ['🧑‍💻', '👩‍🎨', '🧑‍🚀', '😎', '🤓', '🧑‍🔬', '🥳', '🤠', '👩‍🏫', '🧑‍🎤', '🦊', '🐼', '🦄', '🐯', '🐸', '🤖', '👾', '🧑‍🍳', '🦁', '🐨', '🧑‍🎨', '👨‍🚀', '🐙', '🌞'];
export const TONES = ['lime', 'pink', 'violet', 'sun', 'sky', 'ink'] as const;
export type Tone = (typeof TONES)[number];

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
export const emojiFor = (id: string) => FACES[hash(id) % FACES.length];
export const toneFor = (id: string): Tone => TONES[(hash(id) >>> 5) % TONES.length];

export interface Activity { events: number; saved: number; people: number; certificates: number; profile: number }

export interface Badge { id: string; emoji: string; title: string; hint: string; got: boolean }

/** Badges earned from what you've already done in Gather. Nothing extra is saved. */
export function badges(a: Activity): Badge[] {
  return [
    { id: 'first-event', emoji: '🎟️', title: 'First event', hint: 'Join an event', got: a.events >= 1 },
    { id: 'regular', emoji: '🎪', title: 'Regular', hint: 'Join 3 events', got: a.events >= 3 },
    { id: 'hello', emoji: '🤝', title: 'Hello there', hint: 'Make your first connection', got: a.people >= 1 },
    { id: 'connector', emoji: '🕸️', title: 'Connector', hint: 'Connect with 5 people', got: a.people >= 5 },
    { id: 'curator', emoji: '🔖', title: 'Curator', hint: 'Save 3 events', got: a.saved >= 3 },
    { id: 'complete', emoji: '✨', title: 'All set', hint: 'Complete your profile', got: a.profile >= 100 },
    { id: 'certified', emoji: '🎓', title: 'Certified', hint: 'Earn a certificate', got: a.certificates >= 1 },
  ];
}

const LEVELS = [
  { at: 0, name: 'Newcomer' }, { at: 60, name: 'Explorer' }, { at: 150, name: 'Regular' },
  { at: 300, name: 'Connector' }, { at: 500, name: 'Community star' }, { at: 800, name: 'Legend' },
];

/** Points and level, from the same activity. */
export function level(a: Activity) {
  const points = a.events * 40 + a.people * 25 + a.saved * 5 + a.certificates * 50 + Math.round(a.profile / 2);
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].at) i++;
  const next = LEVELS[i + 1];
  const progress = next ? Math.min(100, Math.round(((points - LEVELS[i].at) / (next.at - LEVELS[i].at)) * 100)) : 100;
  return { points, n: i + 1, name: LEVELS[i].name, next: next ? { name: next.name, need: next.at - points } : null, progress };
}
