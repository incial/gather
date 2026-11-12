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
