import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/** Marking yourself present when the organiser has opened self check-in for a session (scan fallback). */
let env: RulesTestEnvironment;
const ctx = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const asha = () => ctx('asha', 'asha@x.test');      // registered
const owner = () => ctx('own', 'owner@x.test');
const outsider = () => ctx('out', 'out@x.test');   // not registered
type Db = ReturnType<typeof asha>;
const E = 'events/e1';
const mark = (db: Db, uid: string, sid = 'open', extra = {}) =>
  setDoc(doc(db, `${E}/attendance/${sid}_${uid}`), { uid, sessionId: sid, name: 'A', email: `${uid}@x.test`, method: 'self', at: serverTimestamp(), ...extra });

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-selfcheckin',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, E), { ownerUid: 'own', published: true, registration: 'open', title: 'E' });
    await setDoc(doc(db, `${E}/sessions/open`), { title: 'Open', selfCheckIn: true });
    await setDoc(doc(db, `${E}/sessions/closed`), { title: 'Closed' });
    await setDoc(doc(db, `${E}/attendees/asha`), { uid: 'asha', email: 'asha@x.test', name: 'Asha', joinedAt: 't', source: 'app' });
  });
});

describe('self check-in', () => {
  it('works when the organiser opened it for the session', async () => {
    await assertSucceeds(mark(asha(), 'asha'));
  });
  it('is refused when it isn’t open (missed the code: they have to scan or type it)', async () => {
    await assertFails(mark(asha(), 'asha', 'closed'));
    await assertFails(mark(asha(), 'asha', 'no-such-session'));
  });
  it('only for yourself, only if registered, and only as “self”', async () => {
    await assertFails(mark(asha(), 'ben'));
    await assertFails(mark(outsider(), 'out'));
    await assertFails(mark(asha(), 'asha', 'open', { method: 'manual' }));
    await assertFails(mark(asha(), 'asha', 'open', { key: 'ABC123' }));
  });
  it('also marks you present at the event, like a scan', async () => {
    const db = asha();
    const b = writeBatch(db);
    b.set(doc(db, `${E}/attendance/open_asha`), { uid: 'asha', sessionId: 'open', name: 'A', email: 'asha@x.test', method: 'self', at: serverTimestamp() });
    b.set(doc(db, `${E}/attendees/asha`), { checkedIn: true, checkedInAt: serverTimestamp(), checkInMethod: 'self', checkedInBy: 'asha', checkInSession: 'open' }, { merge: true });
    b.set(doc(db, `${E}/checkinLog/l1`), { uid: 'asha', name: 'A', action: 'in', method: 'self', by: 'asha', byName: 'A', at: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
  it('only organisers open or close it', async () => {
    await assertSucceeds(setDoc(doc(owner(), `${E}/sessions/closed`), { selfCheckIn: true }, { merge: true }));
    await assertFails(setDoc(doc(asha(), `${E}/sessions/closed`), { selfCheckIn: true }, { merge: true }));
  });
});
