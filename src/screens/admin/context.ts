import { createContext, useContext } from 'react';
import { backend, type Where } from '../../lib/backend';
import type { EventData } from '../../lib/exports';
import { slug } from '../../lib/exports';
import { useCol } from '../../lib/live';
import type { AttendanceDoc, AttendeeDoc, ConnectionDoc, EventDoc, EventInfoDoc, FeedbackDoc, PreregDoc, SavedDoc, SessionDoc, SessionFeedbackDoc, SpeakerDoc } from '../../lib/types';

/** The small, always-needed part of an event. Larger collections load per tab with useAdminCol. */
export interface AdminBase { event: EventDoc; info: EventInfoDoc | null; sessions: SessionDoc[]; speakers: SpeakerDoc[] }
export const AdminCtx = createContext<AdminBase | null>(null);

export function useAdmin() {
  const data = useContext(AdminCtx)!;
  return { ...data, prefix: slug(data.event.title) };
}

interface Cols { attendees: AttendeeDoc; preregistered: PreregDoc; attendance: AttendanceDoc; feedback: FeedbackDoc; connections: ConnectionDoc; saved: SavedDoc; sessionFeedback: SessionFeedbackDoc }

/** A live list for one admin tab. Shared with other tabs that need the same list, and closed when unused. */
export function useAdminCol<K extends keyof Cols>(name: K, where: Where = []) {
  const { event } = useContext(AdminCtx)!;
  return useCol<Cols[K]>(`events/${event.id}/${name}`, where);
}

/** Everything about an event, read once, for exports. Only runs when someone downloads. */
export async function loadEventData(base: AdminBase): Promise<EventData> {
  const p = `events/${base.event.id}`;
  const [attendees, prereg, attendance, feedback, connections, saved, sessionFeedback] = await Promise.all([
    backend.getCol<AttendeeDoc>(`${p}/attendees`), backend.getCol<PreregDoc>(`${p}/preregistered`), backend.getCol<AttendanceDoc>(`${p}/attendance`),
    backend.getCol<FeedbackDoc>(`${p}/feedback`), backend.getCol<ConnectionDoc>(`${p}/connections`), backend.getCol<SavedDoc>(`${p}/saved`),
    backend.getCol<SessionFeedbackDoc>(`${p}/sessionFeedback`),
  ]);
  return { ...base, attendees, prereg, attendance, feedback, connections, saved, sessionFeedback };
}
