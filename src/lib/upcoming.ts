import { backend } from './backend';
import type { EventDoc } from './types';

/**
 * Published events that haven't ended yet, soonest-ending first, at most `max`. The server does the
 * filtering (events.published == true and endsAt >= now, index in firestore.indexes.json), so past
 * events are never downloaded. Until that index is deployed the query fails, and this falls back to
 * the older read: up to 60 published events in any order, filtered here.
 * Kept tiny on purpose: the pre-rendered home page imports it.
 */
export async function getUpcomingEvents(max: number): Promise<EventDoc[]> {
  try {
    return await backend.getCol<EventDoc>('events', [['published', true]], { orderBy: 'endsAt', from: new Date().toISOString(), limit: max });
  } catch {
    const now = Date.now();
    return (await backend.getCol<EventDoc>('events', [['published', true]], { limit: 60 }))
      .filter((e) => Date.parse(e.endsAt ?? e.startsAt) > now);
  }
}
