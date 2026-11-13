import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const E = 'events/e1';
const org = () => env.authenticatedContext('org', { email: 'boss@org.test', email_verified: true }).firestore();
const asha = () => env.authenticatedContext('asha', { email: 'asha@x.test', email_verified: true }).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true }).firestore();
type Db = ReturnType<typeof org>;
const future = () => Timestamp.fromMillis(Date.now() + 600_000);

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
const log = (uid: string, by: string, extra = {}) => ({ uid, name: uid, action: 'in', method: 'manual', by, byName: by, at: serverTimestamp(), ...extra });

/** Organiser marks someone present, with the history entry. */
function markPresent(db: Db, uid: string, by = 'org', extra = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `${E}/attendees/${uid}`), { checkedIn: true, checkedInAt: serverTimestamp(), checkInMethod: 'manual', checkedInBy: by, ...extra }, { merge: true });
  b.set(doc(db, `${E}/checkinLog/${uid}-${Math.random()}`), log(uid, by));
  return b.commit();
}
/** What the app writes when an attendee scans a session's live QR. */
function selfScan(db: Db, uid: string, key = 'ABC123', present = true) {
  const b = writeBatch(db);
  b.set(doc(db, `${E}/attendance/s1_${uid}`), { uid, sessionId: 's1', name: uid, email: `${uid}@x.test`, method: 'qr', key, at: serverTimestamp() });
  if (present) {
    b.set(doc(db, `${E}/attendees/${uid}`), { checkedIn: true, checkedInAt: serverTimestamp(), checkInMethod: 'self', checkedInBy: uid, checkInSession: 's1' }, { merge: true });
    b.set(doc(db, `${E}/checkinLog/${uid}-self`), log(uid, uid, { method: 'self' }));
  }
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-checkin',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'organisers/boss@org.test'), {});
    await setDoc(doc(db, E), { ownerUid: 'org', published: true, registration: 'open', title: 'E' });
    for (const u of ['asha', 'ben']) await setDoc(doc(db, `${E}/attendees/${u}`), { uid: u, email: `${u}@x.test`, joinedAt: 't', source: 'app', name: u, checkedIn: false });
    await setDoc(doc(db, `${E}/sessionKeys/s1`), { key: 'ABC123', prev: 'ZZZ999', open: true, expiresAt: future() });
  });
});

describe('manual check-in by an organiser', () => {
  it('marks present and records which organiser did it', async () => {
    await assertSucceeds(markPresent(org(), 'asha'));
  });
  it('can’t be recorded under another organiser’s name', async () => {
    await assertFails(markPresent(org(), 'asha', 'someone-else'));
  });
  it('attendees can’t mark themselves or others present by hand', async () => {
    await assertFails(markPresent(asha(), 'asha', 'asha'));
    await assertFails(markPresent(asha(), 'ben', 'asha'));
  });
  it('undo is allowed for organisers and goes in the history', async () => {
    await markPresent(org(), 'asha');
    const db = org();
    const b = writeBatch(db);
    b.set(doc(db, `${E}/attendees/asha`), { checkedIn: false, checkedInAt: null, checkInMethod: null, checkedInBy: null }, { merge: true });
    b.set(doc(db, `${E}/checkinLog/undo1`), log('asha', 'org', { action: 'undo', method: '' }));
    await assertSucceeds(b.commit());
  });
});

describe('the check-in history', () => {
  it('can’t be edited or deleted, even by organisers, and only organisers read it', async () => {
    await markPresent(org(), 'asha');
    await seed((db) => setDoc(doc(db, `${E}/checkinLog/x`), log('asha', 'org')));
    await assertFails(setDoc(doc(org(), `${E}/checkinLog/x`), { action: 'undo' }, { merge: true }));
    await assertFails(deleteDoc(doc(org(), `${E}/checkinLog/x`)));
    await assertSucceeds(getDocs(collection(org(), `${E}/checkinLog`)));
    await assertFails(getDocs(collection(asha(), `${E}/checkinLog`)));
  });
  it('entries must carry the writer’s own account and the server time', async () => {
    await assertFails(setDoc(doc(org(), `${E}/checkinLog/y`), log('asha', 'ben')));
    await assertFails(setDoc(doc(org(), `${E}/checkinLog/y`), { ...log('asha', 'org'), at: Timestamp.now() }));
  });
});

describe('self check-in with a session QR', () => {
  it('marks you present at the event, once, with the live key', async () => {
    await assertSucceeds(selfScan(asha(), 'asha'));
  });
  it('a wrong or old key can’t mark you present', async () => {
    await assertFails(selfScan(asha(), 'asha', 'WRONG1'));
  });
  it('you can’t mark yourself present without a session scan in the same step', async () => {
    await assertFails(setDoc(doc(asha(), `${E}/attendees/asha`), { checkedIn: true, checkedInAt: serverTimestamp(), checkInMethod: 'self', checkedInBy: 'asha', checkInSession: 's1' }, { merge: true }));
  });
  it('nobody can self-check-in someone else', async () => {
    const db = asha();
    const b = writeBatch(db);
    b.set(doc(db, `${E}/attendance/s1_asha`), { uid: 'asha', sessionId: 's1', name: 'a', email: 'asha@x.test', method: 'qr', key: 'ABC123', at: serverTimestamp() });
    b.set(doc(db, `${E}/attendees/ben`), { checkedIn: true, checkedInAt: serverTimestamp(), checkInMethod: 'self', checkedInBy: 'ben', checkInSession: 's1' }, { merge: true });
    await assertFails(b.commit());
  });
  it('a session scan on its own still works when already checked in', async () => {
    await markPresent(org(), 'asha');
    await assertSucceeds(selfScan(asha(), 'asha', 'ABC123', false));
  });
});

describe('deleting an event', () => {
  it('the check-in history can only be removed while the whole event is being deleted', async () => {
    await seed((db) => setDoc(doc(db, `${E}/checkinLog/z`), log('asha', 'org')));
    await assertFails(deleteDoc(doc(org(), `${E}/checkinLog/z`)));
    await seed((db) => setDoc(doc(db, E), { deleting: true }, { merge: true }));
    await assertFails(deleteDoc(doc(asha(), `${E}/checkinLog/z`)));
    await assertSucceeds(deleteDoc(doc(org(), `${E}/checkinLog/z`)));
  });
});

describe('announcements', () => {
  const ann = (by: string, extra = {}) => ({ text: 'Lunch is at 1 pm in Hall B', by, byName: 'Org', at: serverTimestamp(), ...extra });
  it('organisers post them; attendees read them but can’t post, edit or delete', async () => {
    await assertSucceeds(setDoc(doc(org(), `${E}/announcements/a1`), ann('org')));
    await assertSucceeds(getDocs(collection(asha(), `${E}/announcements`)));
    await assertFails(setDoc(doc(asha(), `${E}/announcements/a2`), ann('asha')));
    await assertFails(setDoc(doc(org(), `${E}/announcements/a1`), { text: 'changed' }, { merge: true }));
    await assertFails(deleteDoc(doc(asha(), `${E}/announcements/a1`)));
    await assertSucceeds(deleteDoc(doc(org(), `${E}/announcements/a1`)));
  });
  it('people outside the event can’t read them; posts must be short and signed by the poster', async () => {
    await seed((db) => setDoc(doc(db, `${E}/announcements/a1`), { text: 'x', by: 'org', byName: 'O', at: Timestamp.now() }));
    const out = env.authenticatedContext('zed', { email: 'zed@x.test', email_verified: true }).firestore();
    await assertFails(getDocs(collection(out, `${E}/announcements`)));
    await assertFails(setDoc(doc(org(), `${E}/announcements/a3`), ann('org', { text: 'x'.repeat(501) })));
    await assertFails(setDoc(doc(org(), `${E}/announcements/a3`), ann('someone')));
  });
});
