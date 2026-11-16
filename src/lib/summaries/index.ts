/**
 * The browser side of the dashboard APIs. Screens ask for the numbers they show; the server works them out
 * (counting inside Firestore) and sends back only those numbers. Per-row counts (one per session, speaker,
 * event or activity) are gathered for a moment and fetched in one request, so a list of 30 rows makes one
 * call, not 30.
 *
 * In demo mode there is no server data, so the same summary code (./core) runs on the in-browser store.
 */
'use client';
import { useCallback, useEffect, useReducer } from 'react';
import { backend, isDemo } from '../backend';
import * as core from './core';

export type { EventOverview, FeedbackSummary, PlatformStats, PulseExport, PulseResults } from './core';

export class ApiError extends Error {
  constructor(public status: number) {
    super(status === 401 || status === 403 ? 'You don’t have access to this.' : status === 404 ? 'This no longer exists.'
      : status === 429 ? 'Too many requests. Wait a minute and try again.' : 'Couldn’t load this just now. Try again.');
  }
}

/** GET one of the app's own APIs as the signed-in person. */
async function get<T>(path: string): Promise<T> {
  const token = await backend.idToken();
  if (!token) throw new ApiError(401);
  const res = await fetch(path, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

/* ---------- Demo mode: the same summaries, read from the in-browser store ---------- */

const at = (d: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), d);
const join = (parent: string, col: string) => (parent ? `${parent}/${col}` : col);
async function rows(parent: string, col: string, filters: core.Filter[] = []) {
  const all = await backend.getCol<core.Doc>(join(parent, col));
  return all.filter((d) => filters.every(([f, v, op]) => {
    const x = at(d, f);
    return op === '>' ? typeof x === 'number' && x > (v as number) : x === v;
  }));
}
const demoReader: core.Reader = {
  count: async (parent, col, filters) => (await rows(parent, col, filters)).length,
  average: async (parent, col, field, filters) => {
    const nums = (await rows(parent, col, filters)).map((d) => at(d, field)).filter((x): x is number => typeof x === 'number');
    return { n: nums.length, avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null };
  },
  query: async (parent, col, opts = {}) => (await rows(parent, col, opts.filters)).slice(0, opts.limit ?? Infinity),
  getDoc: (path) => backend.getDoc<core.Doc>(path),
  getMany: async (paths) => new Map(await Promise.all(paths.map(async (p) => [p, await backend.getDoc<core.Doc>(p).catch(() => 'denied' as const)] as const))),
};

/* ---------- One-off summaries ---------- */

const q = (name: string, ids: string[]) => (ids.length ? `?${name}=${ids.map(encodeURIComponent).join(',')}` : '');

export const fetchEventOverview = (eventId: string) =>
  isDemo ? core.eventOverview(demoReader, eventId) : get<core.EventOverview>(`/api/events/${eventId}/overview`);

export const fetchFeedbackSummary = (eventId: string, sessionIds: string[], speakerIds: string[]) =>
  isDemo ? core.feedbackSummary(demoReader, eventId, sessionIds, speakerIds).then((r) => { if (!r) throw new ApiError(404); return r; })
    : get<core.FeedbackSummary>(`/api/events/${eventId}/feedback-summary?sessions=${sessionIds.join(',')}&speakers=${speakerIds.join(',')}`);

export const fetchPulseResults = (id: string) =>
  isDemo ? core.pulseResults(demoReader, id).then((r) => { if (!r) throw new ApiError(404); return r; })
    : get<core.PulseResults>(`/api/pulse/${id}/results`);

export const fetchPulseExport = (id: string) =>
  isDemo ? core.pulseExport(demoReader, id).then((r) => { if (!r) throw new ApiError(404); return r; })
    : get<core.PulseExport>(`/api/pulse/${id}/export`);

export const fetchPlatformStats = () =>
  isDemo ? core.platformStats(demoReader) : get<core.PlatformStats>('/api/platform/stats');

/** Which of these events were deleted (`gone`) or can no longer be opened (`hidden`), in one request. */
export async function fetchMissingEvents(ids: string[]): Promise<{ gone: string[]; hidden: string[] }> {
  if (!ids.length) return { gone: [], hidden: [] };
  if (isDemo) return core.missingEvents(demoReader, ids);
  const out = { gone: [] as string[], hidden: [] as string[] };
  for (let i = 0; i < ids.length; i += 300) {
    const r = await get<{ gone: string[]; hidden: string[] }>(`/api/me/missing-events${q('ids', ids.slice(i, i + 300))}`);
    out.gone.push(...r.gone); out.hidden.push(...r.hidden);
  }
  return out;
}

/** A summary kept for a minute and shared by every screen that shows it; `refresh` fetches it again. */
const TTL_MS = 60_000;
interface Slot { data: unknown; error: unknown; at: number; loading: boolean; subs: Set<() => void> }
const slots = new Map<string, Slot>();
const slot = (key: string) => { let s = slots.get(key); if (!s) slots.set(key, (s = { data: undefined, error: null, at: 0, loading: false, subs: new Set() })); return s; };

function load(key: string, fn: () => Promise<unknown>) {
  const s = slot(key);
  if (s.loading) return;
  s.loading = true;
  fn().then((d) => { s.data = d; s.error = null; }, (e) => { s.error = e; })
    .finally(() => { s.loading = false; s.at = Date.now(); s.subs.forEach((f) => f()); });
}

export function useSummary<T>(key: string | null, fn: () => Promise<T>): { data: T | undefined; error: unknown; loading: boolean; refresh: () => void } {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!key) return;
    const s = slot(key);
    s.subs.add(force);
    if (!s.loading && (s.at === 0 || Date.now() - s.at > TTL_MS)) load(key, fn);
    return () => { s.subs.delete(force); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => { if (key) { load(key, fn); force(); } }, [key]);
  const s = key ? slots.get(key) : undefined;
  return { data: s?.data as T | undefined, error: s?.error ?? null, loading: !!s?.loading || (!!key && !s?.at), refresh };
}

/** Drops cached summaries and counts (when a different person signs in, nothing of the last one's stays). */
export function forgetSummaries(prefix = '') {
  for (const [k, s] of slots) if (k.startsWith(prefix)) Object.assign(s, { data: undefined, error: null, at: 0 });
  for (const [k, s] of counts) if (k.startsWith(prefix)) Object.assign(s, { n: null, error: false, at: 0 });
}

/* ---------- Per-row counts, batched ---------- */

/**
 * The kinds of per-row count. `scope` is the event for sessions and speakers, '' otherwise. For activities the
 * id is `<pulseId>:s` (a survey: counts submissions) or `<pulseId>:p` (a presentation: counts responses).
 */
export type CountKind = 'attendance' | 'connections' | 'attendees' | 'pulse';

async function fetchCounts(kind: CountKind, scope: string, ids: string[]): Promise<Record<string, number>> {
  if (isDemo) {
    if (kind === 'attendance') return core.sessionAttendance(demoReader, scope, ids);
    if (kind === 'connections') return core.speakerConnections(demoReader, scope, ids);
    if (kind === 'attendees') return core.eventAttendeeCounts(demoReader, ids);
    const plain = ids.map((i) => i.split(':')[0]);
    const r = await core.pulseAnswerCounts(demoReader, plain, new Set(ids.filter((i) => i.endsWith(':s')).map((i) => i.split(':')[0])));
    return Object.fromEntries(ids.map((i) => [i, r[i.split(':')[0]] ?? 0]));
  }
  if (kind === 'attendance') return get(`/api/events/${scope}/attendance-counts${q('sessions', ids)}`);
  if (kind === 'connections') return get(`/api/events/${scope}/speaker-connections${q('speakers', ids)}`);
  if (kind === 'attendees') return get(`/api/events/attendee-counts${q('ids', ids)}`);
  const r = await get<Record<string, number>>(`/api/pulse/answer-counts?items=${ids.map(encodeURIComponent).join(',')}`);
  return Object.fromEntries(ids.map((i) => [i, r[i.split(':')[0]] ?? 0]));
}

interface CountSlot { n: number | null; error: boolean; at: number; loading: boolean; subs: Set<() => void> }
const counts = new Map<string, CountSlot>();
const countSlot = (key: string) => { let s = counts.get(key); if (!s) counts.set(key, (s = { n: null, error: false, at: 0, loading: false, subs: new Set() })); return s; };
const queue = new Map<string, Set<string>>();
let timer: ReturnType<typeof setTimeout> | null = null;
const BATCH = 100;

function flush() {
  timer = null;
  const work = [...queue.entries()];
  queue.clear();
  for (const [group, idSet] of work) {
    const [kind, scope] = group.split('|') as [CountKind, string];
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += BATCH) {
      const part = ids.slice(i, i + BATCH);
      const done = (r: Record<string, number> | null) => {
        for (const id of part) {
          const s = countSlot(`${group}|${id}`);
          s.loading = false; s.at = Date.now();
          if (r) { s.n = r[id] ?? 0; s.error = false; } else s.error = true;
          s.subs.forEach((f) => f());
        }
      };
      fetchCounts(kind, scope, part).then(done, () => done(null));
    }
  }
}

function requestCount(kind: CountKind, scope: string, id: string) {
  const group = `${kind}|${scope}`;
  const s = countSlot(`${group}|${id}`);
  if (s.loading) return;
  s.loading = true;
  let set = queue.get(group);
  if (!set) queue.set(group, (set = new Set()));
  set.add(id);
  // Wait a moment so every row on screen joins the same request.
  if (!timer) timer = setTimeout(flush, 30);
}

/** Records a count the screen already knows (e.g. the length of a live list), so no request is needed for it. */
export function primeCount(kind: CountKind, scope: string, id: string, n: number) {
  const s = countSlot(`${kind}|${scope}|${id}`);
  s.n = n; s.error = false; s.at = Date.now();
  s.subs.forEach((f) => f());
}

/** One row's count, fetched together with every other row's. `id` null: nothing is fetched. */
export function useRowCount(kind: CountKind, scope: string, id: string | null): { n: number | null; error: boolean; refresh: () => void } {
  const key = id ? `${kind}|${scope}|${id}` : null;
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!key || !id) return;
    const s = countSlot(key);
    s.subs.add(force);
    if (!s.loading && (s.at === 0 || Date.now() - s.at > TTL_MS)) requestCount(kind, scope, id);
    return () => { s.subs.delete(force); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => { if (id) requestCount(kind, scope, id); }, [key]);
  const s = key ? counts.get(key) : undefined;
  return { n: s?.n ?? null, error: !!s?.error, refresh };
}
