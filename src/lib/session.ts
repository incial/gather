import type { SessionDoc, SessionKind } from './types';

export const KIND_LABEL: Record<SessionKind, string> = { talk: 'Talk', workshop: 'Workshop', activity: 'Activity', panel: 'Panel', break: 'Break' };
export const KIND_ICON = { talk: 'mic', workshop: 'tool', activity: 'sparkle', panel: 'people', break: 'coffee' } as const;

/** Feedback opens when the session starts, if the organiser left it on. */
export const canRate = (s: SessionDoc, now = Date.now()) => s.feedbackOn !== false && Date.parse(s.startsAt) <= now;
