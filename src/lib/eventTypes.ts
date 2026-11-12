/**
 * Event types and the questions each one asks. Stored on the event as `eventType` and
 * `typeDetails` (a small map of text answers), so older events without them keep working.
 */
export type EventType = 'workshop' | 'conference' | 'hackathon' | 'seminar' | 'meetup' | 'webinar' | 'competition';

export interface TypeField { key: string; label: string; placeholder?: string; long?: boolean }
export interface TypeInfo { label: string; emoji: string; blurb: string; fields: TypeField[]; online?: boolean }

export const EVENT_TYPES: Record<EventType, TypeInfo> = {
  workshop: {
    label: 'Workshop', emoji: '🛠️', blurb: 'Hands-on training on a skill or topic',
    fields: [
      { key: 'institution', label: 'Institution name' },
      { key: 'trainer', label: 'Trainer details', placeholder: 'Name, designation, organisation', long: true },
      { key: 'department', label: 'Department' },
      { key: 'topic', label: 'Skill or topic' },
      { key: 'audience', label: 'Target participants', placeholder: 'e.g. Final-year students, faculty' },
    ],
  },
  conference: {
    label: 'Conference', emoji: '🎤', blurb: 'Talks and tracks for an industry or field',
    fields: [
      { key: 'organisation', label: 'Company or organisation name' },
      { key: 'industry', label: 'Industry' },
      { key: 'speakers', label: 'Speakers', placeholder: 'Main speakers (you can add full profiles in Speakers)', long: true },
      { key: 'tracks', label: 'Conference tracks', placeholder: 'e.g. AI, Policy, Startups', long: true },
      { key: 'audience', label: 'Target audience' },
    ],
  },
  hackathon: {
    label: 'Hackathon', emoji: '💻', blurb: 'Teams build solutions to challenges',
    fields: [
      { key: 'organisation', label: 'Organising institution or company' },
      { key: 'problems', label: 'Problem statements', long: true },
      { key: 'teamSize', label: 'Team size', placeholder: 'e.g. 2–4 members' },
      { key: 'challenges', label: 'Challenges', long: true },
      { key: 'requirements', label: 'Participation requirements', long: true },
    ],
  },
  seminar: {
    label: 'Seminar', emoji: '📚', blurb: 'An expert talk on a subject',
    fields: [
      { key: 'organisation', label: 'Institution or company' },
      { key: 'speaker', label: 'Speaker details', long: true },
      { key: 'subject', label: 'Subject' },
      { key: 'audience', label: 'Target audience' },
    ],
  },
  meetup: {
    label: 'Meetup', emoji: '🤝', blurb: 'A community gets together and networks',
    fields: [
      { key: 'community', label: 'Community or organisation' },
      { key: 'purpose', label: 'Networking purpose', long: true },
      { key: 'audience', label: 'Target audience' },
    ],
  },
  webinar: {
    label: 'Webinar', emoji: '🖥️', blurb: 'An online session', online: true,
    fields: [
      { key: 'host', label: 'Host organisation' },
      { key: 'platform', label: 'Online platform', placeholder: 'e.g. Google Meet, Zoom, YouTube Live' },
      { key: 'speaker', label: 'Speaker details', long: true },
      { key: 'topic', label: 'Topic' },
    ],
  },
  competition: {
    label: 'Competition', emoji: '🏆', blurb: 'Participants compete for prizes',
    fields: [
      { key: 'organisation', label: 'Organising institution or company' },
      { key: 'category', label: 'Competition category' },
      { key: 'eligibility', label: 'Eligibility criteria', long: true },
      { key: 'prizes', label: 'Prizes', long: true },
      { key: 'rules', label: 'Rules and participation requirements', long: true },
    ],
  },
};
export const TYPE_ORDER = Object.keys(EVENT_TYPES) as EventType[];
export const typeInfo = (t?: string) => (t && t in EVENT_TYPES ? EVENT_TYPES[t as EventType] : null);

/**
 * The answers for this type, trimmed and short enough to store. Blank answers are kept as '' so a
 * cleared field really clears when saved over an existing event.
 */
export function cleanDetails(t: EventType | undefined, d: Record<string, string> | undefined): Record<string, string> {
  const info = typeInfo(t);
  if (!info) return {};
  return Object.fromEntries(info.fields.map((f) => [f.key, (d?.[f.key] ?? '').trim().slice(0, f.long ? 1000 : 160)]));
}
/** The answered questions for showing on the event page, in the type's order. */
export function shownDetails(t?: string, d?: Record<string, string>) {
  const info = typeInfo(t);
  if (!info || !d) return [];
  return info.fields.map((f) => ({ label: f.label, value: (d[f.key] ?? '').trim() })).filter((x) => x.value);
}
