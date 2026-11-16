/**
 * The summaries behind the dashboard APIs. On the server every read uses the caller's own token (see
 * ../server/firestore), and the counting/averaging happens in Firestore or here on the server, so each screen
 * receives only the numbers and the few items it actually shows, never the underlying lists.
 */
import { answersFor, surveyAnswers } from '../pulse/answers';
import { formatAnswer, leaderboard, summarize, TYPES } from '../pulse/engine';
import type { PulseDoc, PulseQuestion, PulseResponse, PulseSubmission, Slide } from '../pulse/types';
import type { Question } from '../types';

/** What the summaries need from the database. The server passes Firestore (as the caller); demo mode passes the in-browser store. */
export type Val = string | number | boolean | null;
export type Doc = { id: string } & Record<string, unknown>;
/** [field, value] is "equals"; [field, value, '>'] is "greater than". Dotted fields reach into maps. */
export type Filter = [field: string, value: Val, op?: '==' | '>'];
export interface Reader {
  count(parent: string, col: string, filters?: Filter[]): Promise<number>;
  /** How many matching documents have a number in `field`, and its average (null when none). */
  average(parent: string, col: string, field: string, filters?: Filter[]): Promise<{ n: number; avg: number | null }>;
  query(parent: string, col: string, opts?: { filters?: Filter[]; select?: string[]; limit?: number }): Promise<Doc[]>;
  getDoc(path: string): Promise<Doc | null>;
  /** Each path's document, null if it doesn't exist, 'denied' if the caller may not read it. */
  getMany(paths: string[]): Promise<Map<string, Doc | null | 'denied'>>;
}

const byId = async <T>(ids: string[], fn: (id: string) => Promise<T>) => Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await fn(id)] as const)));

/* ---------- Organiser: one event ---------- */

/** The event Overview's numbers, in one request instead of seven separate counts. */
export async function eventOverview(r: Reader, eventId: string) {
  const p = `events/${eventId}`;
  const [attendees, preregistered, checkins, feedback, connections, saved, checkedIn] = await Promise.all([
    r.count(p, 'attendees'), r.count(p, 'preregistered'), r.count(p, 'attendance'), r.count(p, 'feedback'),
    r.count(p, 'connections'), r.count(p, 'saved'), r.count(p, 'attendees', [['checkedIn', true]]),
  ]);
  return { attendees, preregistered, checkins, feedback, connections, saved, checkedIn };
}

/** How many people checked in to each session (Attendance tiles and the Schedule list), one request for all. */
export const sessionAttendance = (r: Reader, eventId: string, sessionIds: string[]) =>
  byId(sessionIds, (s) => r.count(`events/${eventId}`, 'attendance', [['sessionId', s]]));

/** How many attendees saved each speaker's contact (Speakers admin), one request for all. */
export const speakerConnections = (r: Reader, eventId: string, speakerIds: string[]) =>
  byId(speakerIds, (s) => r.count(`events/${eventId}`, 'connections', [['speakerId', s]]));

/** Star counts 1–5 for ratings matching the filters, counted by Firestore (no ratings downloaded). */
async function stars(r: Reader, parent: string, col: string, field: string, filters: Filter[]) {
  const dist = await Promise.all([1, 2, 3, 4, 5].map((n) => r.count(parent, col, [...filters, [field, n]])));
  const n = dist.reduce((a, b) => a + b, 0);
  const avg = n ? dist.reduce((a, c, i) => a + c * (i + 1), 0) / n : null;
  return { n, avg, dist };
}

/** Comments shown per session / text question. The full set is in the CSV download. */
const COMMENTS = 30;

/**
 * The Feedback screen: per-session ratings (average, star counts, recent comments) and, for the overall event
 * form, each question's average and star counts, option counts, or written answers. Ratings are counted in
 * Firestore; only the comments themselves are downloaded, and only as many as are shown.
 */
export async function feedbackSummary(r: Reader, eventId: string, sessionIds: string[], speakerIds: string[]) {
  const p = `events/${eventId}`;
  const event = await r.getDoc(p);
  if (!event) return null;
  const questions = (event.questions as Question[] | undefined) ?? [];
  const [total, sessions, overall, speakers] = await Promise.all([
    r.count(p, 'feedback'),
    byId(sessionIds, async (s) => {
      const n = await r.count(p, 'sessionFeedback', [['sessionId', s]]);
      if (!n) return { n: 0, avg: null, dist: [0, 0, 0, 0, 0], comments: [] as string[] };
      const [rated, docs] = await Promise.all([
        stars(r, p, 'sessionFeedback', 'rating', [['sessionId', s]]),
        r.query(p, 'sessionFeedback', { filters: [['sessionId', s]], select: ['comment'], limit: 200 }),
      ]);
      const comments = docs.map((d) => String(d.comment ?? '').trim()).filter(Boolean).slice(0, COMMENTS);
      return { ...rated, comments };
    }),
    Promise.all(questions.map(async (q) => {
      const field = `answers.${q.id}`;
      if (q.type === 'rating') return { id: q.id, type: q.type, ...(await stars(r, p, 'feedback', field, [])) };
      if (q.type === 'choice') {
        const options = await Promise.all((q.options ?? []).map(async (o) => ({ option: o, n: await r.count(p, 'feedback', [[field, o]]) })));
        return { id: q.id, type: q.type, n: options.reduce((a, o) => a + o.n, 0), options };
      }
      const docs = await r.query(p, 'feedback', { select: [field], limit: 300 });
      const answers = docs.map((d) => String((d.answers as Record<string, unknown> | undefined)?.[q.id] ?? '').trim()).filter(Boolean);
      return { id: q.id, type: q.type, n: answers.length, answers: answers.slice(0, COMMENTS * 2) };
    })),
    // Each speaker's average from the overall form: one aggregation per speaker, no responses downloaded.
    byId(speakerIds, (sid) => r.average(p, 'feedback', `speakerRatings.${sid}`, [[`speakerRatings.${sid}`, 0, '>']])),
  ]);
  return { total, sessions, questions: overall, speakers };
}

/* ---------- Organiser home, God view ---------- */

/** Registered attendees per event (Events you host, God view rows), one request for all. */
export const eventAttendeeCounts = (r: Reader, eventIds: string[]) =>
  byId(eventIds, (id) => r.count(`events/${id}`, 'attendees'));

/** Platform totals for the Master Admin's God view (the rules allow these only for super admins). */
export async function platformStats(r: Reader) {
  const [events, users, pulse, organisers, certificates] = await Promise.all(
    ['events', 'users', 'pulse', 'organisers', 'certificates'].map((c) => r.count('', c)),
  );
  return { events, users, pulse, organisers, certificates };
}

/* ---------- Attendee tidy-ups ---------- */

/**
 * Which of these events no longer exist (deleted) or can't be opened any more (hidden), checked in one
 * request instead of one read per event from the phone.
 */
export async function missingEvents(r: Reader, eventIds: string[]) {
  const found = await r.getMany(eventIds.map((id) => `events/${id}`));
  const gone: string[] = [];
  const hidden: string[] = [];
  for (const id of eventIds) {
    const d = found.get(`events/${id}`);
    if (d === null || d === undefined) gone.push(id);
    else if (d === 'denied') hidden.push(id);
  }
  return { gone, hidden };
}

/* ---------- Gather Pulse ---------- */

/** Answers per activity (Pulse home cards), one request for all. `survey` lists the ones that are surveys. */
export const pulseAnswerCounts = (r: Reader, ids: string[], surveys: Set<string>) =>
  byId(ids, (id) => r.count(`pulse/${id}`, surveys.has(id) ? 'submissions' : 'responses'));

interface PulseKey { answers: Record<string, string[]>; openedAt: Record<string, string>; vaultId: string }

/** The activity with its real slides (from the locked vault if it has one) and the owner-only answer key. */
async function loadPulse(r: Reader, id: string) {
  const pulse = await r.getDoc(`pulse/${id}`) as (Doc & PulseDoc) | null;
  if (!pulse) return null;
  const key: PulseKey = { answers: {}, openedAt: {}, vaultId: '', ...((await r.getDoc(`pulse/${id}/private/key`)) as Partial<PulseKey> | null ?? {}) };
  let slides = pulse.slides ?? [];
  if (pulse.locked && key.vaultId) slides = ((await r.getDoc(`pulse/${id}/vault/${key.vaultId}`))?.slides as Slide[] | undefined) ?? [];
  return { pulse: { ...pulse, slides } as PulseDoc, key };
}

/** Everything a results page needs to show, computed here (same maths as before), not in the browser. */
export async function pulseResults(r: Reader, id: string) {
  const loaded = await loadPulse(r, id);
  if (!loaded) return null;
  const { pulse: p, key } = loaded;
  const survey = p.kind === 'survey';
  const base = `pulse/${id}`;
  const [responses, subs, qa, starts, eligible] = await Promise.all([
    survey ? Promise.resolve([]) : r.query(base, 'responses') as Promise<unknown[]> as Promise<PulseResponse[]>,
    survey ? r.query(base, 'submissions') as Promise<unknown[]> as Promise<PulseSubmission[]> : Promise.resolve([]),
    p.slides.some((s) => s.type === 'qa') ? r.query(base, 'qa') as Promise<unknown[]> as Promise<PulseQuestion[]> : Promise.resolve([]),
    survey ? r.count(base, 'starts') : Promise.resolve(0),
    p.eventId ? r.count(`events/${p.eventId}`, 'attendees').catch(() => null) : Promise.resolve(null),
  ]);
  const participants = survey ? subs.length : new Set([...responses.map((x) => x.uid), ...qa.map((q) => q.uid)]).size;
  const answerCount = survey ? subs.reduce((a, s) => a + Object.keys(s.answers ?? {}).length, 0) : responses.length + qa.length;
  const board = p.slides.some((s) => s.type === 'quiz')
    ? leaderboard(responses.filter((x) => key.answers[x.slideId]), key.answers, key.openedAt, Object.fromEntries(p.slides.map((s) => [s.id, s.timeLimit])), p.anonymous)
    : [];
  const slides = p.slides.filter((s) => TYPES[s.type].interactive).map((s) => {
    if (s.type === 'qa') {
      const list = qa.filter((q) => q.slideId === s.id).sort((a, b) => b.votes - a.votes)
        .map((q) => ({ id: q.id, text: q.text, votes: q.votes, answered: !!q.answered, hidden: !!q.hidden, name: p.anonymous ? '' : q.name || 'Guest' }));
      return { id: s.id, type: s.type, total: list.length, qa: list };
    }
    const answers = survey ? surveyAnswers(s.id, subs) : answersFor(s.id, responses);
    const summary = summarize(s, answers, s.type === 'quiz' ? key.answers[s.id] ?? [] : []);
    // Who answered what (a collapsed table on the page), only when the activity isn't anonymous.
    const individual = !p.anonymous && s.type !== 'open' ? answers.map((a) => ({ id: a.id, name: a.name || 'Guest', answer: formatAnswer(s, a.value) })) : [];
    return { id: s.id, type: s.type, total: answers.length, summary, individual };
  });
  return {
    pulse: { ...p, slides: p.slides.map((s) => (s.type === 'quiz' ? { ...s, correct: key.answers[s.id] ?? [] } : s)) },
    participants, answerCount, starts, eligible, submissions: subs.length, board, slides,
  };
}

/** The raw rows for the CSV download, only when someone presses Export (owner only, enforced by the rules). */
export async function pulseExport(r: Reader, id: string) {
  const loaded = await loadPulse(r, id);
  if (!loaded) return null;
  const base = `pulse/${id}`;
  const survey = loaded.pulse.kind === 'survey';
  const [responses, subs, qa] = await Promise.all([
    survey ? Promise.resolve([]) : r.query(base, 'responses'),
    survey ? r.query(base, 'submissions') : Promise.resolve([]),
    loaded.pulse.slides.some((s) => s.type === 'qa') ? r.query(base, 'qa') : Promise.resolve([]),
  ]);
  return { responses, subs, qa };
}

export type EventOverview = Awaited<ReturnType<typeof eventOverview>>;
export type FeedbackSummary = NonNullable<Awaited<ReturnType<typeof feedbackSummary>>>;
export type PulseResults = NonNullable<Awaited<ReturnType<typeof pulseResults>>>;
export type PulseExport = NonNullable<Awaited<ReturnType<typeof pulseExport>>>;
export type PlatformStats = Awaited<ReturnType<typeof platformStats>>;
