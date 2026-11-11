import { backend, type WriteOp } from '../backend';
import type { AppUser } from '../types';
import { lockKey, newCode, newSlide, summarize, type Answer } from './engine';
import type { AnswerValue, PulseDoc, PulseKind, PulseLiveResults, PulseResponse, PulseState, PulseSubmission, Slide } from './types';

/** Owner-only extras: quiz answers, when each quiz question opened, and where locked questions are kept. */
export interface PulseKey { answers: Record<string, string[]>; openedAt: Record<string, string>; vaultId: string }

export const P = (id: string) => `pulse/${id}`;
const blankKey = (): PulseKey => ({ answers: {}, openedAt: {}, vaultId: '' });

export function blankPulse(kind: PulseKind, user: AppUser, event?: { id: string; title: string }): Omit<PulseDoc, 'id' | 'code'> {
  const first = newSlide(kind === 'survey' ? 'mc' : 'wordcloud');
  first.title = kind === 'survey' ? 'How did you hear about us?' : 'In one word, how are you feeling today?';
  return {
    kind, title: kind === 'survey' ? 'Untitled survey' : 'Untitled presentation', description: '',
    ownerUid: user.uid, ownerName: user.name, eventId: event?.id ?? '', eventTitle: event?.title ?? '',
    status: 'draft', access: event ? 'event' : 'public', anonymous: kind === 'survey', askName: false, audienceResults: true, locked: false,
    slides: [first],
    survey: { welcome: '', thanks: 'Thank you! Your response has been recorded.', limit: 0, opensAt: '', closesAt: '', opensAtTs: null, closesAtTs: null, oneByOne: true },
  };
}

/** Creates a draft with a unique join code. The code document can only be created once, so two drafts never share a code. */
export async function createPulse(kind: PulseKind, user: AppUser, event?: { id: string; title: string }) {
  const id = backend.newId();
  const data = blankPulse(kind, user, event);
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode();
    if (await backend.getDoc(`pulseCodes/${code}`).catch(() => null)) continue;
    await backend.write([
      { type: 'set', path: P(id), data: { ...data, code, createdAt: backend.now(), updatedAt: backend.now() } },
      { type: 'set', path: `pulseCodes/${code}`, data: { pid: id, ownerUid: user.uid } },
      { type: 'set', path: `${P(id)}/private/key`, data: blankKey() as unknown as Record<string, unknown> },
    ]);
    return id;
  }
  throw new Error('Couldn’t reserve a join code. Please try again.');
}

/** Everything the builder needs: the presentation with its quiz answers and locked questions put back in. */
export async function loadForOwner(id: string): Promise<{ pulse: PulseDoc; key: PulseKey } | null> {
  const pulse = await backend.getDoc<PulseDoc>(P(id));
  if (!pulse) return null;
  const key = { ...blankKey(), ...(await backend.getDoc<PulseKey>(`${P(id)}/private/key`)) };
  let slides = pulse.slides;
  if (pulse.locked && key.vaultId) slides = (await backend.getDoc<{ slides: Slide[] }>(`${P(id)}/vault/${key.vaultId}`))?.slides ?? [];
  return { pulse: { ...pulse, slides: slides.map((s) => (s.type === 'quiz' ? { ...s, correct: key.answers[s.id] ?? [] } : s)) }, key };
}

const toTs = (iso: string) => (iso ? new Date(iso) : null);

/**
 * Saves the builder. Quiz answers go to the owner-only key, never to the slides people can read.
 * password: undefined keeps the current lock, null removes it, a string sets a new password.
 */
export async function savePulse(p: PulseDoc, key: PulseKey, password?: string | null): Promise<PulseKey> {
  const answers: Record<string, string[]> = {};
  const publicSlides = p.slides.map(({ correct, ...s }) => { if (s.type === 'quiz') answers[s.id] = correct ?? []; return s; });
  const next: PulseKey = { ...key, answers };
  const ops: WriteOp[] = [];
  let locked = p.locked;
  if (password === null && key.vaultId) { ops.push({ type: 'delete', path: `${P(p.id)}/vault/${key.vaultId}` }); next.vaultId = ''; locked = false; }
  if (typeof password === 'string' && password.trim()) {
    const k = await lockKey(p.id, password);
    if (key.vaultId && key.vaultId !== k) ops.push({ type: 'delete', path: `${P(p.id)}/vault/${key.vaultId}` });
    next.vaultId = k; locked = true;
  }
  if (locked && next.vaultId) ops.push({ type: 'set', path: `${P(p.id)}/vault/${next.vaultId}`, data: { slides: publicSlides } });
  const { id: _id, createdAt: _c, ...rest } = p;
  ops.push({ type: 'set', path: P(p.id), merge: true, data: {
    ...rest, locked, slides: locked ? [] : publicSlides,
    survey: { ...p.survey, opensAtTs: toTs(p.survey.opensAt), closesAtTs: toTs(p.survey.closesAt) },
    updatedAt: backend.now(),
  } });
  ops.push({ type: 'set', path: `${P(p.id)}/private/key`, data: next as unknown as Record<string, unknown> });
  await backend.write(ops);
  return next;
}

/* ---------- Surveys ---------- */

export async function publishSurvey(p: PulseDoc) {
  const ops: WriteOp[] = [{ type: 'set', path: P(p.id), merge: true, data: { status: 'published', updatedAt: backend.now() } }];
  // A response limit needs a counter people increase as they submit.
  if (p.survey.limit > 0 && !(await backend.getDoc(`${P(p.id)}/counter/main`))) ops.unshift({ type: 'set', path: `${P(p.id)}/counter/main`, data: { n: 0 } });
  await backend.write(ops);
}
export const setStatus = (id: string, status: PulseDoc['status']) =>
  backend.write([{ type: 'set', path: P(id), merge: true, data: { status, updatedAt: backend.now() } }]);

export async function submitSurvey(p: PulseDoc, uid: string, name: string, email: string, answers: Record<string, AnswerValue>, k: string) {
  const ops: WriteOp[] = [{ type: 'set', path: `${P(p.id)}/submissions/${uid}`, data: {
    uid, name: p.anonymous ? '' : name.trim().slice(0, 80), email: p.anonymous ? '' : email, answers, at: backend.now(), ...(p.locked ? { k } : {}),
  } }];
  if (p.survey.limit > 0) ops.push({ type: 'set', path: `${P(p.id)}/counter/main`, merge: true, data: { n: backend.inc(1) } });
  await backend.write(ops);
}

/** Marks that someone opened the survey, for completion rates. Once per person; repeats are ignored. */
export const markStart = (id: string, uid: string) =>
  backend.write([{ type: 'set', path: `${P(id)}/starts/${uid}`, data: { at: backend.now() } }]).catch(() => {});

/* ---------- Live presentations ---------- */

export function stateFor(slide: Slide | undefined, index: number, key: PulseKey): { state: Omit<PulseState, 'id'>; key: PulseKey } {
  const quiz = slide?.type === 'quiz';
  const now = new Date().toISOString();
  return {
    state: {
      slideId: slide?.id ?? '', index, open: !!slide, paused: false, showResults: !quiz, ended: false,
      closesAt: quiz && slide!.timeLimit ? (backend.timestampIn(slide!.timeLimit * 1000 + 1500) as string) : null,
      openedAt: backend.now() as string, reveal: [],
    },
    key: quiz ? { ...key, openedAt: { ...key.openedAt, [slide!.id]: now } } : key,
  };
}

export async function goLive(p: PulseDoc, key: PulseKey, index = 0) {
  const { state, key: k } = stateFor(p.slides[index], index, key);
  await backend.write([
    { type: 'set', path: `${P(p.id)}/live/state`, data: { ...state, updatedAt: backend.now() } },
    { type: 'set', path: `${P(p.id)}/live/results`, data: { slideId: state.slideId, total: 0, summary: { kind: 'none' }, leaderboard: [] } },
    { type: 'set', path: `${P(p.id)}/private/key`, data: k as unknown as Record<string, unknown> },
    { type: 'set', path: P(p.id), merge: true, data: { status: 'live', updatedAt: backend.now() } },
  ]);
  return k;
}

export async function showSlide(p: PulseDoc, key: PulseKey, index: number) {
  const { state, key: k } = stateFor(p.slides[index], index, key);
  const ops: WriteOp[] = [
    { type: 'set', path: `${P(p.id)}/live/state`, data: { ...state, updatedAt: backend.now() } },
    { type: 'set', path: `${P(p.id)}/live/results`, data: { slideId: state.slideId, total: 0, summary: { kind: 'none' }, leaderboard: [] } },
  ];
  if (k !== key) ops.push({ type: 'set', path: `${P(p.id)}/private/key`, data: k as unknown as Record<string, unknown> });
  await backend.write(ops);
  return k;
}

export const patchState = (id: string, patch: Partial<PulseState>) =>
  backend.write([{ type: 'set', path: `${P(id)}/live/state`, merge: true, data: { ...patch, updatedAt: backend.now() } }]);

export const endLive = (id: string) => backend.write([
  { type: 'set', path: `${P(id)}/live/state`, merge: true, data: { open: false, ended: true, updatedAt: backend.now() } },
  { type: 'set', path: P(id), merge: true, data: { status: 'closed', updatedAt: backend.now() } },
]);

/** The presenter shares a summary so 300 phones read one document instead of every answer. */
export const publishResults = (id: string, r: Omit<PulseLiveResults, 'id'>) =>
  backend.write([{ type: 'set', path: `${P(id)}/live/results`, data: r as unknown as Record<string, unknown> }]);

export const submitAnswer = (p: PulseDoc, slideId: string, uid: string, name: string, value: AnswerValue, k: string) =>
  backend.write([{ type: 'set', path: `${P(p.id)}/responses/${slideId}_${uid}`, data: {
    slideId, uid, name: p.anonymous ? '' : name.trim().slice(0, 80), value, at: backend.now(), ...(p.locked ? { k } : {}),
  } }]);

export const hideResponse = (pid: string, rid: string, hidden: boolean) =>
  backend.write([{ type: 'set', path: `${P(pid)}/responses/${rid}`, merge: true, data: { hidden } }]);

/* ---------- Q&A ---------- */

export const ask = (p: PulseDoc, slideId: string, uid: string, name: string, text: string, n: number, k: string) =>
  backend.write([{ type: 'set', path: `${P(p.id)}/qa/${uid}_${n}`, data: {
    slideId, uid, name: p.anonymous ? '' : name.trim().slice(0, 80), text: text.trim().slice(0, 280), votes: 0, voters: [], answered: false, hidden: false, at: backend.now(), ...(p.locked ? { k } : {}),
  } }]);

export const upvote = (pid: string, qid: string, uid: string) =>
  backend.write([{ type: 'set', path: `${P(pid)}/qa/${qid}`, merge: true, data: { votes: backend.inc(1), voters: backend.union(uid) } }]);

export const moderateQuestion = (pid: string, qid: string, patch: { answered?: boolean; hidden?: boolean }) =>
  backend.write([{ type: 'set', path: `${P(pid)}/qa/${qid}`, merge: true, data: patch }]);

/* ---------- Finding and removing ---------- */

export async function findPulseByCode(code: string) {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 6) return null;
  return (await backend.getDoc<{ pid: string }>(`pulseCodes/${c}`))?.pid ?? null;
}

export async function deletePulse(p: PulseDoc) {
  const ops: WriteOp[] = [];
  for (const sub of ['responses', 'qa', 'submissions', 'starts', 'live', 'private', 'vault', 'counter']) {
    const docs = await backend.getCol<{ id: string }>(`${P(p.id)}/${sub}`).catch(() => []);
    ops.push(...docs.map((d) => ({ type: 'delete' as const, path: `${P(p.id)}/${sub}/${d.id}` })));
  }
  ops.push({ type: 'delete', path: `pulseCodes/${p.code}` }, { type: 'delete', path: P(p.id) });
  await backend.write(ops);
}

/* ---------- Results ---------- */

export const answersFor = (slideId: string, rows: PulseResponse[]): Answer[] =>
  rows.filter((r) => r.slideId === slideId).map((r) => ({ id: r.id, value: r.value, name: r.name, hidden: r.hidden }));

export const surveyAnswers = (slideId: string, subs: PulseSubmission[]): Answer[] =>
  subs.filter((s) => s.answers && s.answers[slideId] !== undefined).map((s) => ({ id: s.id, value: s.answers[slideId], name: s.name }));

export { summarize };
