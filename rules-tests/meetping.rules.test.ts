import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const E = 'events/e1';
const ctx = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.test`, email_verified: true }).firestore();
const asha = () => ctx('asha');
const ben = () => ctx('ben');
const cara = () => ctx('cara');
const guest = () => env.authenticatedContext('g1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();

async function seed(fn: (db: ReturnType<typeof asha>) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
const ping = (from: string, to: string, extra = {}) => ({
  eventId: 'e1', eventTitle: 'E', fromUid: from, fromName: from, fromPhoto: '', toUid: to, toName: to, toPhoto: '',
  message: 'I’d love to connect!', status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});
const note = (from: string, id: string, extra = {}) => ({ type: 'ping', pingId: id, eventId: 'e1', eventTitle: 'E', fromUid: from, fromName: from, fromPhoto: '', message: 'Hi', read: false, at: serverTimestamp(), ...extra });

/** What the app writes when someone taps Send. */
function send(db: ReturnType<typeof asha>, from: string, to: string, extra = {}, eventId = 'e1') {
  const id = `${eventId}_${from}_${to}`;
  const b = writeBatch(db);
  b.set(doc(db, `pings/${id}`), ping(from, to, { eventId, ...extra }));
  b.set(doc(db, `users/${to}/notifications/${id}`), note(from, id, { eventId }));
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-pings',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, E), { published: true, registration: 'open', title: 'E' });
    await setDoc(doc(db, 'events/e2'), { published: true, registration: 'open', title: 'E2' });
    for (const u of ['asha', 'ben', 'cara']) await setDoc(doc(db, `${E}/attendees/${u}`), { uid: u, email: `${u}@x.test`, joinedAt: 't', source: 'app', name: u });
  });
});

describe('sending a Meet Ping', () => {
  it('an attendee sends one to another attendee, with the notification', async () => {
    await assertSucceeds(send(asha(), 'asha', 'ben'));
  });
  it('only one request per pair per event', async () => {
    await assertSucceeds(send(asha(), 'asha', 'ben'));
    await assertFails(send(asha(), 'asha', 'ben', { message: 'again?' }));
  });
  it('not to yourself, not as someone else, not for an event you aren’t at', async () => {
    await assertFails(send(asha(), 'asha', 'asha'));
    await assertFails(setDoc(doc(asha(), 'pings/e1_ben_cara'), ping('ben', 'cara')));
    await assertFails(send(asha(), 'asha', 'ben', {}, 'e2'));
  });
  it('the recipient must be at the event too, and guests can’t send', async () => {
    await assertFails(send(asha(), 'asha', 'zed'));
    await assertFails(send(guest(), 'g1', 'ben'));
  });
  it('roles travel with the ping', async () => {
    await assertSucceeds(send(asha(), 'asha', 'ben', { fromRole: 'Speaker', toRole: 'Attendee' }));
  });
  it('messages are limited and can’t arrive already accepted', async () => {
    await assertFails(send(asha(), 'asha', 'ben', { message: 'x'.repeat(301) }));
    await assertFails(send(asha(), 'asha', 'ben', { status: 'accepted' }));
  });
  it('a notification can’t be faked without a new ping', async () => {
    await assertFails(setDoc(doc(asha(), 'users/ben/notifications/e1_asha_ben'), note('asha', 'e1_asha_ben')));
    await assertSucceeds(send(asha(), 'asha', 'ben'));
    await assertFails(setDoc(doc(asha(), 'users/ben/notifications/e1_asha_ben'), note('asha', 'e1_asha_ben')));
  });
});

describe('privacy', () => {
  beforeEach(() => send(asha(), 'asha', 'ben'));
  it('only the two people can read a ping', async () => {
    await assertSucceeds(getDoc(doc(asha(), 'pings/e1_asha_ben')));
    await assertSucceeds(getDoc(doc(ben(), 'pings/e1_asha_ben')));
    await assertFails(getDoc(doc(cara(), 'pings/e1_asha_ben')));
    await assertSucceeds(getDocs(query(collection(ben(), 'pings'), where('toUid', '==', 'ben'))));
    await assertFails(getDocs(query(collection(cara(), 'pings'), where('toUid', '==', 'ben'))));
  });
  it('notifications are readable only by the recipient', async () => {
    await assertSucceeds(getDocs(collection(ben(), 'users/ben/notifications')));
    await assertFails(getDocs(collection(asha(), 'users/ben/notifications')));
    await assertSucceeds(setDoc(doc(ben(), 'users/ben/notifications/e1_asha_ben'), { read: true }, { merge: true }));
  });
});

describe('answering', () => {
  beforeEach(() => send(asha(), 'asha', 'ben'));
  it('only the recipient can accept or decline, once', async () => {
    await assertFails(setDoc(doc(asha(), 'pings/e1_asha_ben'), { status: 'accepted', updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(cara(), 'pings/e1_asha_ben'), { status: 'accepted', updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(ben(), 'pings/e1_asha_ben'), { status: 'declined', updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(ben(), 'pings/e1_asha_ben'), { status: 'accepted', updatedAt: serverTimestamp() }, { merge: true }));
  });
  it('the recipient can’t rewrite the message', async () => {
    await assertFails(setDoc(doc(ben(), 'pings/e1_asha_ben'), { message: 'changed', status: 'accepted', updatedAt: serverTimestamp() }, { merge: true }));
  });
  it('accepting notifies the sender, only together with the acceptance', async () => {
    await assertFails(setDoc(doc(ben(), 'users/asha/notifications/e1_asha_ben_ok'), note('ben', 'e1_asha_ben', { type: 'accepted' })));
    const db = ben();
    const b = writeBatch(db);
    b.set(doc(db, 'pings/e1_asha_ben'), { status: 'accepted', updatedAt: serverTimestamp() }, { merge: true });
    b.set(doc(db, 'users/asha/notifications/e1_asha_ben_ok'), note('ben', 'e1_asha_ben', { type: 'accepted' }));
    await assertSucceeds(b.commit());
  });
  it('the sender cancels (the record stays), the recipient can’t, nobody deletes it', async () => {
    await assertFails(deleteDoc(doc(asha(), 'pings/e1_asha_ben')));
    await assertFails(setDoc(doc(ben(), 'pings/e1_asha_ben'), { status: 'cancelled', updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(asha(), 'pings/e1_asha_ben'), { status: 'cancelled', updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(getDoc(doc(asha(), 'pings/e1_asha_ben')));
    // Once cancelled, the recipient can't accept it any more.
    await assertFails(setDoc(doc(ben(), 'pings/e1_asha_ben'), { status: 'accepted', updatedAt: serverTimestamp() }, { merge: true }));
  });
  it('a cancelled ping can be sent again, re-notifying the recipient', async () => {
    await setDoc(doc(asha(), 'pings/e1_asha_ben'), { status: 'cancelled', updatedAt: serverTimestamp() }, { merge: true });
    const db = asha();
    const b = writeBatch(db);
    b.set(doc(db, 'pings/e1_asha_ben'), { status: 'pending', message: 'Second try?', updatedAt: serverTimestamp() }, { merge: true });
    b.set(doc(db, 'users/ben/notifications/e1_asha_ben'), { read: false, message: 'Second try?', at: serverTimestamp() }, { merge: true });
    await assertSucceeds(b.commit());
    // …but not while it's still pending (no notification spam).
    await assertFails(setDoc(doc(asha(), 'users/ben/notifications/e1_asha_ben'), { read: false, at: serverTimestamp() }, { merge: true }));
  });
  it('WhatsApp records are server-only', async () => {
    await assertFails(setDoc(doc(asha(), 'pings/e1_asha_ben'), { wa: { status: 'sent' } }, { merge: true }));
    await assertFails(getDoc(doc(asha(), 'waMessages/m1')));
  });
});
