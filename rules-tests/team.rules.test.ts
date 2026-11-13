import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Organiser teams: the owner adds co-organisers by Google email. They manage the event like the owner,
 * except the team list, ownership and deleting the event.
 */
let env: RulesTestEnvironment;
const ctx = (uid: string, email: string, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const owner = () => ctx('own', 'owner@x.test');
const mate = () => ctx('mate', 'Mate@X.test');          // on the team (stored in lower case)
const stranger = () => ctx('str', 'stranger@x.test');
type Db = ReturnType<typeof owner>;
const E = 'events/e1';

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-team',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, E), { ownerUid: 'own', ownerEmail: 'owner@x.test', teamEmails: ['mate@x.test'], title: 'E', published: false, linkAccess: false, registration: 'open', joinCode: '111111', lineup: [], questions: [] });
    await setDoc(doc(db, `${E}/attendees/a1`), { uid: 'a1', email: 'a1@x.test', name: 'A', joinedAt: 't', source: 'app' });
    await setDoc(doc(db, `${E}/sessions/s1`), { title: 'Talk' });
  });
});

describe('team members manage the event', () => {
  it('see the draft and find it in their list', async () => {
    await assertSucceeds(getDoc(doc(mate(), E)));
    await assertSucceeds(getDocs(query(collection(mate(), 'events'), where('teamEmails', 'array-contains', 'mate@x.test'))));
  });
  it('edit details, schedule, attendees and check-in', async () => {
    await assertSucceeds(setDoc(doc(mate(), E), { title: 'Renamed' }, { merge: true }));
    await assertSucceeds(setDoc(doc(mate(), `${E}/sessions/s2`), { title: 'Another' }));
    await assertSucceeds(getDocs(collection(mate(), `${E}/attendees`)));
    await assertSucceeds(setDoc(doc(mate(), `${E}/attendees/a1`), { checkedIn: true, checkedInAt: serverTimestamp(), checkInMethod: 'manual', checkedInBy: 'mate' }, { merge: true }));
  });
  it('but can’t change the team, take ownership or delete the event', async () => {
    await assertFails(setDoc(doc(mate(), E), { teamEmails: ['mate@x.test', 'friend@x.test'] }, { merge: true }));
    await assertFails(setDoc(doc(mate(), E), { ownerUid: 'mate' }, { merge: true }));
    await assertFails(setDoc(doc(mate(), E), { ownerEmail: 'mate@x.test' }, { merge: true }));
    await assertFails(deleteDoc(doc(mate(), E)));
  });
  it('an unverified account with a team email gets nothing', async () => {
    await assertFails(getDoc(doc(ctx('fake', 'mate@x.test', false), E)));
    await assertFails(setDoc(doc(ctx('fake', 'mate@x.test', false), E), { title: 'x' }, { merge: true }));
  });
});

describe('the owner manages the team', () => {
  it('adds and removes people, up to 15', async () => {
    await assertSucceeds(setDoc(doc(owner(), E), { teamEmails: ['mate@x.test', 'friend@x.test'] }, { merge: true }));
    await assertSucceeds(setDoc(doc(owner(), E), { teamEmails: [] }, { merge: true }));
    const many = Array.from({ length: 16 }, (_, i) => `p${i}@x.test`);
    await assertFails(setDoc(doc(owner(), E), { teamEmails: many }, { merge: true }));
  });
  it('a removed member loses access straight away', async () => {
    await assertSucceeds(setDoc(doc(owner(), E), { teamEmails: [] }, { merge: true }));
    await assertFails(getDocs(collection(mate(), `${E}/attendees`)));
    await assertFails(setDoc(doc(mate(), E), { title: 'x' }, { merge: true }));
  });
  it('a new event can start with a team', async () => {
    await assertSucceeds(setDoc(doc(owner(), 'events/e2'), { ownerUid: 'own', ownerEmail: 'owner@x.test', teamEmails: ['mate@x.test'], title: 'E2', published: false }));
  });
});

describe('everyone else is still kept out', () => {
  it('a stranger can’t read the draft, its attendees, or edit it', async () => {
    await assertFails(getDoc(doc(stranger(), E)));
    await assertFails(getDocs(collection(stranger(), `${E}/attendees`)));
    await assertFails(setDoc(doc(stranger(), E), { title: 'x' }, { merge: true }));
    await assertFails(setDoc(doc(stranger(), E), { teamEmails: ['stranger@x.test'] }, { merge: true }));
  });
});
