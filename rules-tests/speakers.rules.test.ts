import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const E = 'events/e1';
const org = () => env.authenticatedContext('org', { email: 'boss@org.test', email_verified: true }).firestore();
const asha = () => env.authenticatedContext('asha', { email: 'asha@x.test', email_verified: true }).firestore();
const sam = () => env.authenticatedContext('sam', { email: 'sam@x.test', email_verified: true }).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true }).firestore();
const future = () => Timestamp.fromMillis(Date.now() + 86_400_000);
const past = () => Timestamp.fromMillis(Date.now() - 1000);
const CODE = 'ABCDE23456';

async function seed(fn: (db: ReturnType<typeof org>) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
const code = (extra = {}) => ({ eventId: 'e1', eventTitle: 'E', common: true, speakerId: '', speakerName: '', pulse: true, expiresAt: future(), used: false, usedBy: '', revoked: false, ...extra });
const role = (uid: string, extra = {}) => ({ uid, name: 'Sam', email: `${uid}@x.test`, roles: ['speaker'], speakerId: 'sp1', status: 'verified', active: true, pulse: true, code: CODE, at: serverTimestamp(), ...extra });

/** What the app does when someone enters the speaker code and picks a listed speaker. */
function redeem(db: ReturnType<typeof org>, uid: string, c = CODE, eventId = 'e1', extra: Record<string, unknown> = {}, speakerId = 'sp1') {
  const b = writeBatch(db);
  b.set(doc(db, `events/${eventId}/speakers/${speakerId}`), { uid }, { merge: true });
  b.set(doc(db, `events/${eventId}/roles/${uid}`), { ...role(uid), code: c, speakerId, ...extra });
  b.set(doc(db, `users/${uid}/speaking/${eventId}`), { eventId, speakerId });
  return b.commit();
}
/** …or isn't on the list and adds a speaker profile from their own details. */
function redeemOwn(db: ReturnType<typeof org>, uid: string, profile: Record<string, unknown> = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `${E}/speakers/${uid}`), { uid, name: 'New Speaker', role: '', organisation: '', topic: '', bio: '', photo: '', ...profile });
  b.set(doc(db, `${E}/roles/${uid}`), { ...role(uid), speakerId: uid });
  b.set(doc(db, `users/${uid}/speaking/e1`), { eventId: 'e1', speakerId: uid });
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-speakers',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'organisers/boss@org.test'), {});
    await setDoc(doc(db, E), { published: true, registration: 'open', title: 'E' });
    await setDoc(doc(db, 'events/e2'), { published: true, registration: 'open', title: 'E2' });
    await setDoc(doc(db, `${E}/speakers/sp1`), { name: 'Sam' });
    await setDoc(doc(db, `${E}/speakers/sp2`), { name: 'Sue' });
    await setDoc(doc(db, `${E}/attendees/asha`), { uid: 'asha', email: 'asha@x.test', joinedAt: 't', source: 'app', name: 'Asha' });
    await setDoc(doc(db, `${E}/attendees/sam`), { uid: 'sam', email: 'sam@x.test', joinedAt: 't', source: 'app', name: 'Sam' });
    await setDoc(doc(db, `speakerCodes/${CODE}`), code());
  });
});

describe('the shared speaker code', () => {
  it('organisers create it; attendees can’t, and nobody can list codes', async () => {
    await assertSucceeds(setDoc(doc(org(), 'speakerCodes/ZZZZZ22222'), code()));
    await assertFails(setDoc(doc(asha(), 'speakerCodes/ZZZZZ33333'), code()));
    await assertFails(getDocs(collection(asha(), 'speakerCodes')));
  });
  it('an attendee links themselves to a listed speaker with the same account', async () => {
    await assertSucceeds(redeem(sam(), 'sam'));
    await assertSucceeds(getDoc(doc(sam(), `${E}/roles/sam`)));
  });
  it('the code works for many speakers, but each listed speaker links only once', async () => {
    await assertSucceeds(redeem(sam(), 'sam'));
    await assertFails(redeem(ben(), 'ben'));
    await assertSucceeds(redeem(ben(), 'ben', CODE, 'e1', {}, 'sp2'));
  });
  it('someone not on the list adds their own speaker profile, without featuring themselves', async () => {
    await assertSucceeds(redeemOwn(ben(), 'ben'));
    const zed = env.authenticatedContext('zed', { email: 'zed@x.test', email_verified: true }).firestore();
    await assertFails(redeemOwn(zed, 'zed', { featured: true }));
  });
  it('changed (cancelled) or expired codes are refused', async () => {
    await seed((db) => setDoc(doc(db, `speakerCodes/${CODE}`), { revoked: true }, { merge: true }));
    await assertFails(redeem(sam(), 'sam'));
    await seed((db) => setDoc(doc(db, `speakerCodes/${CODE}`), { revoked: false, expiresAt: past() }, { merge: true }));
    await assertFails(redeem(sam(), 'sam'));
  });
  it('a code for one event can’t make you a speaker at another', async () => {
    await assertFails(redeem(sam(), 'sam', CODE, 'e2'));
  });
  it('no speaker role without the code or without linking the speaker profile', async () => {
    await assertFails(setDoc(doc(sam(), `${E}/roles/sam`), role('sam')));
    await assertFails(setDoc(doc(sam(), `${E}/roles/sam`), role('sam', { code: 'NOPE234567' })));
    await seed((db) => setDoc(doc(db, `speakerCodes/${CODE}`), { pulse: false }, { merge: true }));
    await assertFails(redeem(sam(), 'sam', CODE, 'e1', { pulse: true }));
  });
  it('speakers edit their own public details only; organisers revoke', async () => {
    await assertSucceeds(redeem(sam(), 'sam'));
    await assertSucceeds(setDoc(doc(sam(), `${E}/speakers/sp1`), { bio: 'Updated bio', topic: 'Patents' }, { merge: true }));
    await assertFails(setDoc(doc(sam(), `${E}/speakers/sp1`), { order: 0, featured: true }, { merge: true }));
    await assertFails(setDoc(doc(asha(), `${E}/speakers/sp1`), { bio: 'hacked' }, { merge: true }));
    await assertFails(setDoc(doc(sam(), `${E}/roles/sam`), { pulse: true, speakerId: 'sp2' }, { merge: true }));
    await assertSucceeds(setDoc(doc(org(), `${E}/roles/sam`), { active: false }, { merge: true }));
  });
});

describe('speaker feedback', () => {
  const fb = (extra = {}) => ({ speakerId: 'sp1', rating: 5, text: 'Great', anonymous: false, uid: 'asha', name: 'Asha', photo: '', status: 'visible', at: serverTimestamp(), ...extra });
  function send(db: ReturnType<typeof org>, uid: string, fid: string, data: object, speakerId = 'sp1') {
    const b = writeBatch(db);
    b.set(doc(db, `${E}/speakerFeedback/${fid}`), data);
    b.set(doc(db, `${E}/speakerFeedbackOwners/${speakerId}_${uid}`), { uid, speakerId, fid, at: serverTimestamp() });
    return b.commit();
  }
  beforeEach(() => redeem(sam(), 'sam'));

  it('attendees send named or anonymous feedback, once per speaker', async () => {
    await assertSucceeds(send(asha(), 'asha', 'f1', fb()));
    await assertFails(send(asha(), 'asha', 'f2', fb({ text: 'again' })));
    await assertSucceeds(send(asha(), 'asha', 'f3', fb({ speakerId: 'sp2', anonymous: true, uid: '', name: '' }), 'sp2'));
  });
  it('anonymous feedback can’t carry any identity', async () => {
    await assertFails(send(asha(), 'asha', 'f1', fb({ anonymous: true })));
    await assertFails(send(asha(), 'asha', 'f1', fb({ anonymous: true, uid: '', name: '', photo: 'https://me.jpg' })));
  });
  it('named feedback can’t pretend to be someone else', async () => {
    await assertFails(send(asha(), 'asha', 'f1', fb({ uid: 'ben' })));
  });
  it('speakers and non-attendees can’t send speaker feedback', async () => {
    await assertFails(send(sam(), 'sam', 'f1', fb({ uid: 'sam', name: 'Sam', speakerId: 'sp2' }), 'sp2'));
    await assertFails(send(ben(), 'ben', 'f1', fb({ uid: 'ben', name: 'Ben' })));
  });
  it('speakers read only their own feedback, never who wrote anonymous feedback', async () => {
    await send(asha(), 'asha', 'f1', fb({ anonymous: true, uid: '', name: '' }));
    await assertSucceeds(getDocs(query(collection(sam(), `${E}/speakerFeedback`), where('speakerId', '==', 'sp1'), where('status', '==', 'visible'))));
    await assertFails(getDocs(query(collection(sam(), `${E}/speakerFeedback`), where('speakerId', '==', 'sp2'), where('status', '==', 'visible'))));
    await assertFails(getDoc(doc(sam(), `${E}/speakerFeedbackOwners/sp1_asha`)));
    await assertFails(getDocs(collection(sam(), `${E}/speakerFeedbackOwners`)));
    await assertSucceeds(getDocs(collection(org(), `${E}/speakerFeedbackOwners`)));
    await assertFails(getDocs(collection(asha(), `${E}/speakerFeedback`)));
  });
  it('speakers can report, not edit; hidden feedback disappears for them', async () => {
    await send(asha(), 'asha', 'f1', fb());
    await assertFails(setDoc(doc(sam(), `${E}/speakerFeedback/f1`), { rating: 1 }, { merge: true }));
    await assertSucceeds(setDoc(doc(sam(), `${E}/speakerFeedback/f1`), { status: 'reported' }, { merge: true }));
    await assertSucceeds(setDoc(doc(org(), `${E}/speakerFeedback/f1`), { status: 'hidden' }, { merge: true }));
    await assertFails(getDoc(doc(sam(), `${E}/speakerFeedback/f1`)));
  });
});

describe('check-in, pass ID and capacity', () => {
  it('attendees can’t check themselves in or change their pass ID', async () => {
    await assertFails(setDoc(doc(asha(), `${E}/attendees/asha`), { checkedIn: true, checkedInAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(asha(), `${E}/attendees/asha`), { regId: 'AB23-CD45' }, { merge: true }));
    await assertFails(setDoc(doc(asha(), `${E}/attendees/asha`), { regId: 'ZZ23-CD45' }, { merge: true }));
  });
  it('organisers check people in with the server’s time only', async () => {
    await assertFails(setDoc(doc(org(), `${E}/attendees/asha`), { checkedIn: true, checkedInAt: Timestamp.now() }, { merge: true }));
    await assertSucceeds(setDoc(doc(org(), `${E}/attendees/asha`), { checkedIn: true, checkedInAt: serverTimestamp(), checkInMethod: 'pass' }, { merge: true }));
  });
  it('registration stops at capacity', async () => {
    await seed(async (db) => { await setDoc(doc(db, E), { capacity: 1 }, { merge: true }); await setDoc(doc(db, `${E}/counters/attendees`), { n: 0 }); });
    const join = (db: ReturnType<typeof org>, uid: string, withCounter = true) => {
      const b = writeBatch(db);
      b.set(doc(db, `${E}/attendees/${uid}`), { uid, email: `${uid}@x.test`, joinedAt: serverTimestamp(), source: 'app', name: uid });
      if (withCounter) b.set(doc(db, `${E}/counters/attendees`), { n: increment(1) }, { merge: true });
      return b.commit();
    };
    await assertFails(join(ben(), 'ben', false));
    await assertSucceeds(join(ben(), 'ben'));
    const zed = env.authenticatedContext('zed', { email: 'zed@x.test', email_verified: true }).firestore();
    await assertFails(join(zed, 'zed'));
  });
});

describe('Pulse for speakers', () => {
  const pulse = (owner: string) => ({ kind: 'presentation', title: 'T', ownerUid: owner, ownerName: '', eventId: 'e1', eventTitle: 'E', status: 'draft', code: 'QWE234', access: 'event', anonymous: false, locked: false, slides: [], survey: { limit: 0 } });
  it('speakers with Pulse permission create event sessions; others can’t', async () => {
    await redeem(sam(), 'sam');
    await assertSucceeds(setDoc(doc(sam(), 'pulse/p1'), pulse('sam')));
    await assertFails(setDoc(doc(asha(), 'pulse/p2'), pulse('asha')));
  });
  it('a speaker without Pulse permission can’t', async () => {
    await seed((db) => setDoc(doc(db, `speakerCodes/${CODE}`), { pulse: false }, { merge: true }));
    await assertSucceeds(redeem(sam(), 'sam', CODE, 'e1', { pulse: false }));
    await assertFails(setDoc(doc(sam(), 'pulse/p1'), pulse('sam')));
  });
});
