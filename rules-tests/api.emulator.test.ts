import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The dashboard APIs, run against the Firestore emulator with the real security rules. Each request carries a
 * sign-in token for a test person, so these check both the numbers and that the rules still decide access.
 */
const PROJECT = 'demo-gather-api';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';

let env: RulesTestEnvironment;
type Handler = (req: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;
const routes: Record<string, Handler> = {};

/** An unsigned sign-in token, which the emulator accepts in place of a real Google one. */
function token(uid: string, email: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid, email, email_verified: true,
    iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: 'google.com', identities: {} },
  })}.`;
}
const OWNER = token('own', 'owner@x.test');
const ASHA = token('asha', 'asha@x.test');
const STRANGER = token('zed', 'zed@x.test');

let ip = 0;
async function call(route: string, path: string, who: string | null, id?: string) {
  // A different address per request, so the per-address rate limit never interferes with the tests.
  const headers: Record<string, string> = { 'x-forwarded-for': `10.0.${Math.floor(++ip / 250)}.${ip % 250}` };
  if (who) headers.authorization = `Bearer ${who}`;
  const res = await routes[route](new Request(`http://localhost${path}`, { headers }), id ? { params: Promise.resolve({ id }) } : undefined);
  return { status: res.status, body: await res.json() };
}

const E = 'events/e1';
async function seed(fn: (db: Firestore) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
  const load = async (name: string, path: string) => { routes[name] = (await import(path)).GET; };
  await load('overview', '../src/app/api/events/[id]/overview/route');
  await load('attendance', '../src/app/api/events/[id]/attendance-counts/route');
  await load('connections', '../src/app/api/events/[id]/speaker-connections/route');
  await load('feedback', '../src/app/api/events/[id]/feedback-summary/route');
  await load('attendees', '../src/app/api/events/attendee-counts/route');
  await load('missing', '../src/app/api/me/missing-events/route');
  await load('platform', '../src/app/api/platform/stats/route');
  await load('pulseResults', '../src/app/api/pulse/[id]/results/route');
  await load('pulseExport', '../src/app/api/pulse/[id]/export/route');
  await load('pulseCounts', '../src/app/api/pulse/answer-counts/route');
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, E), {
      ownerUid: 'own', published: true, registration: 'open', title: 'E', lineup: [],
      questions: [
        { id: 'q1', type: 'rating', label: 'Overall' },
        { id: 'q2', type: 'choice', label: 'Again?', options: ['Yes', 'No'] },
        { id: 'q3', type: 'text', label: 'Anything else?' },
      ],
    });
    for (const [uid, checkedIn] of [['asha', true], ['ben', false], ['cy', true]] as const) {
      await setDoc(doc(db, `${E}/attendees/${uid}`), { uid, email: `${uid}@x.test`, name: uid, joinedAt: 't', source: 'app', checkedIn });
    }
    await setDoc(doc(db, `${E}/attendance/a1`), { sessionId: 's1', uid: 'asha' });
    await setDoc(doc(db, `${E}/attendance/a2`), { sessionId: 's1', uid: 'cy' });
    await setDoc(doc(db, `${E}/attendance/a3`), { sessionId: 's2', uid: 'asha' });
    await setDoc(doc(db, `${E}/connections/c1`), { speakerId: 'sp1', uid: 'asha' });
    await setDoc(doc(db, `${E}/feedback/asha`), { uid: 'asha', answers: { q1: 5, q2: 'Yes', q3: 'Great day' }, speakerRatings: { sp1: 4 } });
    await setDoc(doc(db, `${E}/feedback/cy`), { uid: 'cy', answers: { q1: 3, q2: 'No' }, speakerRatings: { sp1: 2, sp2: 5 } });
    await setDoc(doc(db, `${E}/sessionFeedback/f1`), { sessionId: 's1', uid: 'asha', rating: 4, comment: 'Useful' });
    await setDoc(doc(db, `${E}/sessionFeedback/f2`), { sessionId: 's1', uid: 'cy', rating: 5, comment: '' });
    await setDoc(doc(db, 'events/e2'), { ownerUid: 'own', published: true, title: 'E2', lineup: [] });
    await setDoc(doc(db, 'events/e2/attendees/asha'), { uid: 'asha', email: 'asha@x.test', name: 'asha', joinedAt: 't', source: 'app' });
    // A presentation with one multiple-choice question and one quiz question.
    await setDoc(doc(db, 'pulse/p1'), {
      kind: 'presentation', title: 'P', ownerUid: 'own', ownerName: 'O', eventId: '', eventTitle: '', status: 'live', access: 'public',
      anonymous: false, locked: false, code: 'ABC123',
      slides: [
        { id: 'm1', type: 'mc', title: 'Colour?', options: [{ id: 'r', label: 'Red' }, { id: 'b', label: 'Blue' }] },
        { id: 'z1', type: 'quiz', title: '2+2?', timeLimit: 0, options: [{ id: 'o3', label: '3' }, { id: 'o4', label: '4' }] },
      ],
    });
    await setDoc(doc(db, 'pulse/p1/private/key'), { answers: { z1: ['o4'] }, openedAt: {}, vaultId: '' });
    await setDoc(doc(db, 'pulse/p1/responses/r1'), { slideId: 'm1', uid: 'asha', name: 'Asha', value: 'r' });
    await setDoc(doc(db, 'pulse/p1/responses/r2'), { slideId: 'm1', uid: 'cy', name: 'Cy', value: 'r' });
    await setDoc(doc(db, 'pulse/p1/responses/r3'), { slideId: 'z1', uid: 'asha', name: 'Asha', value: 'o4' });
  });
});

describe('sign-in and access', () => {
  it('refuses requests without a sign-in token', async () => {
    expect((await call('overview', '/api/events/e1/overview', null, 'e1')).status).toBe(401);
  });
  it('refuses people who may not see the numbers (the rules decide)', async () => {
    expect((await call('overview', '/api/events/e1/overview', STRANGER, 'e1')).status).toBe(403);
    expect((await call('feedback', '/api/events/e1/feedback-summary', ASHA, 'e1')).status).toBe(403);
    expect((await call('pulseResults', '/api/pulse/p1/results', ASHA, 'p1')).status).toBe(403);
    expect((await call('platform', '/api/platform/stats', OWNER)).status).toBe(403);
  });
  it('refuses malformed ids', async () => {
    expect((await call('attendance', '/api/events/e1/attendance-counts?sessions=a/b', OWNER, 'e1')).status).toBe(400);
    expect((await call('overview', '/api/events/x%2Fy/overview', OWNER, 'x/y')).status).toBe(400);
  });
});

describe('organiser numbers', () => {
  it('Overview: every number in one request', async () => {
    const r = await call('overview', '/api/events/e1/overview', OWNER, 'e1');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ attendees: 3, preregistered: 0, checkins: 3, feedback: 2, connections: 1, saved: 0, checkedIn: 2 });
  });
  it('check-ins per session and connections per speaker, batched', async () => {
    expect((await call('attendance', '/api/events/e1/attendance-counts?sessions=s1,s2,s3', OWNER, 'e1')).body).toEqual({ s1: 2, s2: 1, s3: 0 });
    expect((await call('connections', '/api/events/e1/speaker-connections?speakers=sp1,sp2', OWNER, 'e1')).body).toEqual({ sp1: 1, sp2: 0 });
  });
  it('attendees per hosted event, batched', async () => {
    expect((await call('attendees', '/api/events/attendee-counts?ids=e1,e2', OWNER)).body).toEqual({ e1: 3, e2: 1 });
  });
  it('Feedback: averages, star counts, options, comments and speaker averages, worked out on the server', async () => {
    const r = await call('feedback', '/api/events/e1/feedback-summary?sessions=s1,s2&speakers=sp1,sp2,sp3', OWNER, 'e1');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.sessions.s1).toEqual({ n: 2, avg: 4.5, dist: [0, 0, 0, 1, 1], comments: ['Useful'] });
    expect(r.body.sessions.s2.n).toBe(0);
    const [q1, q2, q3] = r.body.questions;
    expect(q1).toMatchObject({ id: 'q1', n: 2, avg: 4, dist: [0, 0, 1, 0, 1] });
    expect(q2).toMatchObject({ id: 'q2', n: 2, options: [{ option: 'Yes', n: 1 }, { option: 'No', n: 1 }] });
    expect(q3).toMatchObject({ id: 'q3', n: 1, answers: ['Great day'] });
    expect(r.body.speakers).toEqual({ sp1: { n: 2, avg: 3 }, sp2: { n: 1, avg: 5 }, sp3: { n: 0, avg: null } });
  });
});

describe('attendee tidy-up', () => {
  it('tells deleted events apart from ones that still exist, in one request', async () => {
    const r = await call('missing', '/api/me/missing-events?ids=e1,gone1', ASHA);
    expect(r.status).toBe(200);
    expect([...r.body.gone, ...r.body.hidden]).not.toContain('e1');
    expect([...r.body.gone, ...r.body.hidden]).toContain('gone1');
  });
});

describe('Gather Pulse', () => {
  it('results: charts and leaderboard computed on the server', async () => {
    const r = await call('pulseResults', '/api/pulse/p1/results', OWNER, 'p1');
    expect(r.status).toBe(200);
    expect(r.body.participants).toBe(2);
    expect(r.body.answerCount).toBe(3);
    const mc = r.body.slides.find((s: { id: string }) => s.id === 'm1');
    expect(mc.total).toBe(2);
    expect(mc.summary.bars.map((b: { count: number }) => b.count)).toEqual([2, 0]);
    expect(r.body.board[0]).toMatchObject({ name: 'Asha', score: 1000, right: 1 });
    // The raw responses are not part of the results.
    expect(JSON.stringify(r.body)).not.toContain('"responses"');
  });
  it('export: the raw rows, only for the owner', async () => {
    const r = await call('pulseExport', '/api/pulse/p1/export', OWNER, 'p1');
    expect(r.body.responses).toHaveLength(3);
    expect((await call('pulseExport', '/api/pulse/p1/export', STRANGER, 'p1')).status).toBe(403);
  });
  it('answers per activity, batched', async () => {
    expect((await call('pulseCounts', '/api/pulse/answer-counts?items=p1:p', OWNER)).body).toEqual({ p1: 3 });
    expect((await call('pulseCounts', '/api/pulse/answer-counts?items=p1:x', OWNER)).status).toBe(400);
  });
});
