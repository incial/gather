import { hue } from './format';
import type { Accent, EventDoc } from './types';

/* Event colour and photo for cards: shared by the website's phone reel and the desktop 3D carousel. */

export const colourOf = (e: EventDoc): Accent => e.color ?? hue(e.id);

/** Stock photos (Unsplash) for events that have no banner of their own, by event type. */
const UNSPLASH = (id: string) => `https://images.unsplash.com/photo-${id}?w=720&q=70&auto=format&fit=crop`;
const STOCK: Record<string, string[]> = {
  workshop: ['1522202176988-66273c2fd55f', '1556761175-b413da4baf72'],
  conference: ['1540575467063-178a50c2df87', '1505373877841-8d25f7d46678'],
  hackathon: ['1504384308090-c894fdcc538d', '1556761175-b413da4baf72'],
  seminar: ['1475721027785-f74eccf877e2', '1511578314322-379afb476865'],
  meetup: ['1515187029135-18ee286d815b', '1531058020387-3be344556be6'],
  webinar: ['1517245386807-bb43f82c33c4', '1522202176988-66273c2fd55f'],
  competition: ['1531058020387-3be344556be6', '1504384308090-c894fdcc538d'],
  other: ['1505373877841-8d25f7d46678', '1540575467063-178a50c2df87', '1511578314322-379afb476865'],
};
/** The event's own banner if it has one, otherwise a fitting stock photo (stable per event). */
export function photoOf(e: EventDoc) {
  if (e.bannerThumb) return e.bannerThumb;
  const pool = STOCK[e.eventType ?? 'other'] ?? STOCK.other;
  let h = 0;
  for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return UNSPLASH(pool[h % pool.length]);
}
