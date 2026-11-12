import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const E = 'events/e1';
const asha = () => env.authenticatedContext('asha', { email: 'asha@x.test', email_verified: true }).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true }).firestore();
const cara = () => env.authenticatedContext('cara', { email: 'cara@x.test', email_verified: true }).firestore();
type Db = ReturnType<typeof asha>;

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
const card = (uid: string, extra = {}) => ({ uid, name: uid, institution: 'X', department: '', designation: '', photo: '', ...extra });
/** What the app writes when someone saves their details with the toggle on or off. */
function saveDetails(db: Db, uid: string, share: boolean, dirExtra: Record<string, unknown> = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `${E}/attendees/${uid}`), { shareContact: share, listed: true }, { merge: true });
  b.set(doc(db, `${E}/directory/${uid}`), card(uid, dirExtra));
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-contact',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, E), { published: true, registration: 'open', title: 'E' });
    for (const u of ['asha', 'ben']) await setDoc(doc(db, `${E}/attendees/${u}`), { uid: u, email: `${u}@x.test`, phone: '98470 00000', joinedAt: 't', source: 'app', name: u });
    await setDoc(doc(db, 'pings/e1_asha_ben'), { eventId: 'e1', fromUid: 'asha', toUid: 'ben', status: 'accepted', message: 'hi', updatedAt: 't' });
  });
});

describe('sharing contact details on the People list', () => {
  it('with the toggle on, your own email and phone can be shown', async () => {
    await assertSucceeds(saveDetails(asha(), 'asha', true, { email: 'asha@x.test', phone: '98470 00000' }));
  });
  it('with the toggle off, email and phone can’t be on your card', async () => {
    await assertFails(saveDetails(asha(), 'asha', false, { email: 'asha@x.test', phone: '98470 00000' }));
    await assertSucceeds(saveDetails(asha(), 'asha', false));
  });
  it('only your real registered email and phone, never made-up ones', async () => {
    await assertFails(saveDetails(asha(), 'asha', true, { email: 'boss@org.test', phone: '98470 00000' }));
    await assertFails(saveDetails(asha(), 'asha', true, { email: 'asha@x.test', phone: '11111' }));
  });
  it('nobody can put contact details on someone else’s card', async () => {
    await assertFails(saveDetails(asha(), 'ben', true, { email: 'ben@x.test', phone: '98470 00000' }));
  });
});

describe('sharing your phone with a connection', () => {
  it('each person can share or stop sharing only their own number', async () => {
    await assertSucceeds(setDoc(doc(asha(), 'pings/e1_asha_ben'), { fromPhone: '98470 00000', updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(ben(), 'pings/e1_asha_ben'), { toPhone: '98470 11111', updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(asha(), 'pings/e1_asha_ben'), { fromPhone: '', updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(asha(), 'pings/e1_asha_ben'), { toPhone: '1', updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(cara(), 'pings/e1_asha_ben'), { fromPhone: '1', updatedAt: serverTimestamp() }, { merge: true }));
  });
  it('only after the request is accepted', async () => {
    await seed((db) => setDoc(doc(db, 'pings/e1_asha_ben'), { status: 'pending' }, { merge: true }));
    await assertFails(setDoc(doc(asha(), 'pings/e1_asha_ben'), { fromPhone: '98470 00000', updatedAt: serverTimestamp() }, { merge: true }));
  });
});
