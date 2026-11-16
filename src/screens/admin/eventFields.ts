import type { EventDoc } from '../../lib/types';

/* Small event helpers used by the organiser dashboard, kept apart from the create/edit form so screens that
   only need these don't download the whole form. EventForm re-exports them, so existing imports keep working. */

export type EventFields = Pick<EventDoc, 'title' | 'tagline' | 'description' | 'organiser' | 'venue' | 'startsAt' | 'endsAt' | 'published' | 'registration' | 'feedbackOpen' | 'color' | 'mapLink' | 'linkAccess' | 'videoUrl' | 'expectedAttendees' | 'capacity' | 'eventType' | 'typeDetails'>;

export const blankEvent = (): EventFields => ({
  title: '', tagline: '', description: '', organiser: '', venue: '', startsAt: '', endsAt: '',
  published: false, registration: 'open', feedbackOpen: false, color: 'blue', mapLink: '', linkAccess: true, videoUrl: '', expectedAttendees: 0, capacity: 0, eventType: undefined, typeDetails: {},
});

/** Who can find the event, as one choice instead of two switches. */
export type Visibility = 'public' | 'private' | 'draft';
export const visibilityOf = (e: Pick<EventDoc, 'published' | 'linkAccess'>): Visibility => (e.published ? 'public' : e.linkAccess ? 'private' : 'draft');
export const visibilityPatch = (v: Visibility) => ({ published: v === 'public', linkAccess: v !== 'draft' });
export const VISIBILITY_LABEL: Record<Visibility, string> = { public: 'Public', private: 'Private link', draft: 'Draft' };
