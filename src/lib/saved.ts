import { useMemo } from 'react';
import { fetchMissingEvents } from './summaries';
import { backend } from './backend';
import { useCol } from './live';
import type { AppUser, EventDoc, SwipeDoc } from './types';

/**
 * Saved events have one source of truth: users/{uid}/swipes/{eventId} with choice "save".
 * (events/{id}/saved/{uid} is a copy for organisers to see interest.) Every page reads the same
 * live list through useSavedEvents, so Explore, event pages, the profile and Saved always agree.
 */
export function useSwipes(uid: string | undefined) {
  const swipes = useCol<SwipeDoc>(uid ? `users/${uid}/swipes` : null);
  return useMemo(() => ({
    loading: swipes.loading,
    error: swipes.error,
    all: swipes.data,
    saved: swipes.data.filter((s) => s.choice === 'save'),
    skipped: swipes.data.filter((s) => s.choice === 'skip'),
    isSaved: (id: string) => swipes.data.some((s) => s.id === id && s.choice === 'save'),
  }), [swipes.loading, swipes.error, swipes.data]);
}

// One write at a time per event, so repeated taps can't race each other.
const inFlight = new Set<string>();
export const isBusy = (eventId: string) => inFlight.has(eventId);

async function once<T>(eventId: string, f: () => Promise<T>): Promise<T | undefined> {
  if (inFlight.has(eventId)) return undefined;
  inFlight.add(eventId);
  try { return await f(); } finally { inFlight.delete(eventId); }
}

const summary = (ev: EventDoc, choice: SwipeDoc['choice']): Omit<SwipeDoc, 'id'> => ({
  choice, title: ev.title, tagline: ev.tagline ?? '', startsAt: ev.startsAt, endsAt: ev.endsAt, venue: ev.venue, color: ev.color,
  ...(ev.bannerThumb ? { bannerThumb: ev.bannerThumb } : {}), at: backend.now() as string,
});

/** Save (or skip) an event. Saving never touches registration or attendance. */
export const swipe = (ev: EventDoc, user: AppUser, choice: SwipeDoc['choice']) => once(ev.id, () => {
  const savedPath = `events/${ev.id}/saved/${user.uid}`;
  return backend.write([
    { type: 'set', path: `users/${user.uid}/swipes/${ev.id}`, data: summary(ev, choice) },
    choice === 'save'
      ? { type: 'set', path: savedPath, data: { uid: user.uid, name: user.name, email: user.email, at: backend.now() } }
      : { type: 'delete', path: savedPath },
  ]);
});

/** Unsave: removes both records. Explore shows the event again as undiscovered. */
export const unsave = (eventId: string, uid: string) => once(eventId, () => backend.write([
  { type: 'delete', path: `users/${uid}/swipes/${eventId}` },
  { type: 'delete', path: `events/${eventId}/saved/${uid}` },
]));

/**
 * Removes saved entries whose event was deleted, at most once per session. Events that still
 * exist but are hidden are kept and shown as unavailable instead.
 */
export async function tidySaved(uid: string, saved: SwipeDoc[]): Promise<{ gone: string[]; hidden: string[] }> {
  const key = `gather-saved-tidy-${uid}`;
  try { if (sessionStorage.getItem(key)) return { gone: [], hidden: [] }; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
  // Every saved event checked in one request instead of one read per event from the phone.
  const { gone, hidden } = await fetchMissingEvents(saved.map((s) => s.id)).catch(() => ({ gone: [] as string[], hidden: [] as string[] }));
  await Promise.all(gone.map((id) => unsave(id, uid)?.catch(() => {})));
  return { gone, hidden };
}
