import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * One person = one account (Firebase Auth UID). Organiser-listed speakers are assignments that get
 * linked to that account; speaker access is an event-specific role on it, never a second identity.
 */
let env: RulesTestEnvironment;
const E = 'events/e1';
const ctx = (uid: string, email: string, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const org = () => ctx('org', 'boss@org.test');
const priya = () => ctx('priya', 'priya@x.test');
const sam = () => ctx('sam', 'sam@x.test');
const imposter = () => ctx('imp', 'imp@x.test');
type Db = ReturnType<typeof org>;
const future = () => Timestamp.fromMillis(Date.now() + 86_400_000);
const PIN = '4827';

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
const role = (uid: string, email: string, speakerId: string, code: string) => ({
  uid, name: uid, email, roles: ['speaker'], speakerId, status: 'verified', active: true, pulse: true, code, at: serverTimestamp(),
});
/** What the app writes to link an organiser-listed entry and give the speaker role (and join if needed). */
function claim(db: Db, uid: string, email: string, speakerId: string, code: string, eventId = 'e1', join = false) {
  const b = writeBatch(db);
  b.set(doc(db, `events/${eventId}/speakers/${speakerId}`), { uid }, { merge: true });
  b.set(doc(db, `events/${eventId}/roles/${uid}`), role(uid, email, speakerId, code));
  b.set(doc(db, `users/${uid}/speaking/${eventId}`), { eventId, speakerId });
  if (join) {
    b.set(doc(db, `events/${eventId}/attendees/${uid}`), { uid, email, name: uid, phone: '', institution: '', department: '', designation: 'Speaker', photo: '', source: 'app', listed: false, joinedAt: serverTimestamp(), checkedIn: false });
    b.set(doc(db, `users/${uid}/events/${eventId}`), { title: 'E' });
  }
  return b.commit();
}
async function guessPin(db: Db, uid: string, eventId = 'e1', n = 1) {
  await setDoc(doc(db, `events/${eventId}/speakerTries/${uid}`), { pin: PIN, n, ok: false, at: serverTimestamp() });
  await setDoc(doc(db, `events/${eventId}/speakerTries/${uid}`), { ok: true }, { merge: true });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-identity',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'organisers/boss@org.test'), {});
    for (const id of ['e1', 'e2']) {
      await setDoc(doc(db, `events/${id}`), { ownerUid: 'org', published: true, registration: 'invite', title: id });
      await setDoc(doc(db, `speakerPins/${id}`), { pin: PIN, revoked: false, expiresAt: future(), eventTitle: id, createdAt: Timestamp.now() });
    }
    // Organiser-listed speakers: Priya with her email, Sam with his, one with no email.
    await setDoc(doc(db, `${E}/speakers/sp-priya`), { name: 'Dr. Priya', email: 'Priya@x.test', emailLower: 'priya@x.test' });
    await setDoc(doc(db, `${E}/speakers/sp-sam`), { name: 'Sam', email: 'sam@x.test', emailLower: 'sam@x.test' });
    await setDoc(doc(db, `${E}/speakers/sp-open`), { name: 'Guest', email: '', emailLower: '' });
    await setDoc(doc(db, 'events/e2/speakers/sp-priya'), { name: 'Dr. Priya', email: 'priya@x.test', emailLower: 'priya@x.test' });
    // Sam is already an attendee of e1.
    await setDoc(doc(db, `${E}/attendees/sam`), { uid: 'sam', email: 'sam@x.test', name: 'Sam', joinedAt: 't', source: 'app' });
  });
});

describe('1. listed before registering, then signs up', () => {
  it('finds her own entry by verified email (only hers) and claims it, joining the invite-only event, with no code', async () => {
    const found = await assertSucceeds(getDocs(query(collection(priya(), `${E}/speakers`), where('emailLower', '==', 'priya@x.test'))));
    expect(found.docs.map((d) => d.id)).toEqual(['sp-priya']);
    await assertFails(getDocs(query(collection(priya(), `${E}/speakers`), where('emailLower', '==', 'sam@x.test'))));
    await assertSucceeds(claim(priya(), 'priya', 'priya@x.test', 'sp-priya', 'EMAIL', 'e1', true));
  });
  it('an unverified email can’t claim by email', async () => {
    await assertFails(claim(ctx('priya', 'priya@x.test', false), 'priya', 'priya@x.test', 'sp-priya', 'EMAIL', 'e1', true));
  });
});

describe('2. an existing attendee is added as a speaker', () => {
  it('is linked on the same account (attendee record untouched)', async () => {
    await assertSucceeds(claim(sam(), 'sam', 'sam@x.test', 'sp-sam', 'EMAIL'));
  });
});

describe('3. an existing attendee enters the speaker code', () => {
  it('with no listed entry: speaker role on the same account, own profile', async () => {
    await guessPin(sam(), 'sam');
    const db = sam();
    const b = writeBatch(db);
    b.set(doc(db, `${E}/speakers/sam`), { uid: 'sam', name: 'Sam S', role: '', organisation: '', topic: '', bio: '', photo: '' });
    b.set(doc(db, `${E}/roles/sam`), role('sam', 'sam@x.test', 'sam', 'PIN'));
    await assertSucceeds(b.commit());
  });
  it('can claim an open entry (no email) with the code', async () => {
    await guessPin(sam(), 'sam');
    await assertSucceeds(claim(sam(), 'sam', 'sam@x.test', 'sp-open', 'PIN'));
  });
  it('can’t claim someone else’s entry, even with the code (no impersonation)', async () => {
    await guessPin(imposter(), 'imp');
    await assertFails(claim(imposter(), 'imp', 'imp@x.test', 'sp-priya', 'PIN', 'e1', true));
    await assertFails(claim(imposter(), 'imp', 'imp@x.test', 'sp-priya', 'EMAIL', 'e1', true));
  });
});

describe('4. already attendee and speaker', () => {
  it('can’t take a second speaker entry at the same event (one entry per person per event)', async () => {
    await claim(sam(), 'sam', 'sam@x.test', 'sp-sam', 'EMAIL');
    await guessPin(sam(), 'sam');
    await assertFails(claim(sam(), 'sam', 'sam@x.test', 'sp-open', 'PIN'));
  });
});

describe('5. two accounts claim the same entry', () => {
  it('only the first succeeds; the second is refused', async () => {
    await guessPin(sam(), 'sam');
    await guessPin(imposter(), 'imp');
    await assertSucceeds(claim(sam(), 'sam', 'sam@x.test', 'sp-open', 'PIN'));
    await assertFails(claim(imposter(), 'imp', 'imp@x.test', 'sp-open', 'PIN', 'e1', true));
  });
});

describe('6. a speaker is removed', () => {
  it('keeps the attendee record; email matching can’t undo the removal, only the code can', async () => {
    await claim(sam(), 'sam', 'sam@x.test', 'sp-sam', 'EMAIL');
    // Organiser removes: role off, entry freed, speaking copy removed. Attendee record stays.
    const o = org();
    const b = writeBatch(o);
    b.set(doc(o, `${E}/roles/sam`), { active: false }, { merge: true });
    b.set(doc(o, `${E}/speakers/sp-sam`), { uid: '' }, { merge: true });
    b.delete(doc(o, 'users/sam/speaking/e1'));
    await assertSucceeds(b.commit());
    await assertFails(claim(sam(), 'sam', 'sam@x.test', 'sp-sam', 'EMAIL'));
    await guessPin(sam(), 'sam');
    await assertSucceeds(claim(sam(), 'sam', 'sam@x.test', 'sp-sam', 'PIN'));
  });
});

describe('7. the same speaker at several events', () => {
  it('one account holds a separate speaker role per event', async () => {
    await assertSucceeds(claim(priya(), 'priya', 'priya@x.test', 'sp-priya', 'EMAIL', 'e1', true));
    await assertSucceeds(claim(priya(), 'priya', 'priya@x.test', 'sp-priya', 'EMAIL', 'e2', true));
  });
});
