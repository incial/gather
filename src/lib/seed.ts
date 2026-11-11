import { FDP_EVENT, FDP_SESSIONS, FDP_SPEAKERS } from './programme';
import { DEFAULT_QUESTIONS } from './questions';
import type { Accent } from './types';

/** Demo mode only: the real FDP programme plus sample events and people. */
export function seedDemo() {
  const day = (n: number, h: number, m = 0) => {
    const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.toISOString();
  };
  const e = 'events/ie-fdp';
  const store: Record<string, Record<string, unknown>> = {
    'organisers/organiser@gather.demo': { addedAt: new Date().toISOString() },
    'superAdmins/organiser@gather.demo': { addedAt: new Date().toISOString() },
    [e]: {
      ...FDP_EVENT, joinCode: '482913', published: true, registration: 'open', feedbackOpen: true,
      lineup: FDP_SPEAKERS.map(({ id, name, role }) => ({ id, name, role })), questions: DEFAULT_QUESTIONS,
      createdAt: new Date().toISOString(),
    },
  };
  for (const { id, ...s } of FDP_SPEAKERS) store[`${e}/speakers/${id}`] = s;
  for (const { id, ...s } of FDP_SESSIONS) store[`${e}/sessions/${id}`] = s;
  const samples: [string, string, string, string, Accent, number][] = [
    ['ai-summit', 'AI in Education Summit', 'Sample event: tools for every classroom', 'Convention Centre, Kochi', 'blue', 14],
    ['research-day', 'Research Writing Day', 'Sample event: from draft to published paper', 'Central Library Hall', 'lime', 21],
    ['leaders', 'Campus Leaders Forum', 'Sample event: leading teams in education', 'Senate Hall', 'violet', 30],
    ['design-sprint', 'Teaching Design Sprint', 'Sample event: build a better course in a day', 'Innovation Lab', 'rose', 40],
  ];
  samples.forEach(([id, title, tagline, venue, color, d], i) => {
    store[`events/${id}`] = {
      title, tagline, organiser: 'Sample organiser', venue, color, description: 'Sample event for demo mode.',
      startsAt: day(d, 9, 30), endsAt: day(d, 17), joinCode: String(310200 + i), published: true, registration: 'open',
      feedbackOpen: false, lineup: [], questions: DEFAULT_QUESTIONS, createdAt: new Date().toISOString(),
    };
  });
  store[`${e}/private/info`] = { wifiName: 'NFDP-Guest', wifiPassword: 'sample-password' };
  ['One', 'Two', 'Three', 'Four'].forEach((n, i) => {
    store[`${e}/directory/sample${i}`] = { uid: `sample${i}`, name: `Sample Attendee ${n}`, institution: 'Sample College', department: 'Sample department', designation: 'Assistant Professor' };
  });
  return store;
}
