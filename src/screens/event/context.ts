import { createContext, useContext } from 'react';
import type { AttendanceDoc, AttendeeDoc, ConnectionDoc, EventDoc, EventInfoDoc, FeedbackDoc, RoleDoc, SessionDoc, SessionFeedbackDoc, SpeakerDoc } from '../../lib/types';

export interface EventCtxValue {
  event: EventDoc;
  me: AttendeeDoc;
  sessions: SessionDoc[];
  speakers: SpeakerDoc[];
  attendance: AttendanceDoc[];
  connections: ConnectionDoc[];
  feedback: FeedbackDoc | null;
  info: EventInfoDoc | null;
  sessionFeedback: SessionFeedbackDoc[];
  /** Set when this person is an active speaker at the event. */
  role: RoleDoc | null;
}
export const EventCtx = createContext<EventCtxValue | null>(null);
export const useEventCtx = () => useContext(EventCtx)!;
