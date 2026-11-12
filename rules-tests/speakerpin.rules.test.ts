import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let env: RulesTestEnvironment;
const E = 'events/e1';
const org = () => env.authenticatedContext('org', { email: 'boss@org.test', email_verified: true }).firestore();
const sam = () => env.authenticatedContext('sam', { email: 'sam@x.test', email_verified: true }).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true }).firestore();
const guest = () => env.authenticatedContext('g1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
type Db = ReturnType<typeof org>;
const future = () => Timestamp.fromMillis(Date.now() + 86_400_000);
const past = () => Timestamp.fromMillis(Date.now() - 1000);
const PIN = '4827';

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
const pinDoc = (extra = {}) => ({ pin: PIN, revoked: false, expiresAt: future(), eventTitle: 'E', createdAt: serverTimestamp(), ...extra });

/** What the app does: save the guess (uses a try), then mark it correct. */
async function guess(db: Db, uid: string, pin: string, n: number, eventId = 'e1') {
  const path = `events/${eventId}/speakerTries/${uid}`;
  await setDoc(doc(db, path), { pin, n, ok: false, at: serverTimestamp() });
  return setDoc(doc(db, path), { ok: true }, { merge: true });
}
function becomeSpeaker(db: Db, uid: string, eventId = 'e1', extra: Record<string, unknown> = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `events/${eventId}/speakers/sp1`), { uid }, { merge: true });
  b.set(doc(db, `events/${eventId}/roles/${uid}`), {
    uid, name: 'Sam', email: `${uid}@x.test`, roles: ['speaker'], speakerId: 'sp1', status: 'verified', active: true, pulse: true, code: 'PIN', at: serverTimestamp(), ...extra,
  });
  b.set(doc(db, `users/${uid}/speaking/${eventId}`), { eventId, speakerId: 'sp1' });
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-pin',
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
    await setDoc(doc(db, 'events/e2/speakers/sp1'), { name: 'Sam' });
    await setDoc(doc(db, 'speakerPins/e1'), pinDoc());
    await setDoc(doc(db, 'speakerPins/e2'), pinDoc({ pin: '9051' }));
  });
});

describe('the four-digit speaker code', () => {
  it('only organisers can read or set it, and it must be exactly 4 digits', async () => {
    await assertFails(getDoc(doc(sam(), 'speakerPins/e1')));
    await assertFails(getDocs(collection(sam(), 'speakerPins')));
    await assertSucceeds(getDoc(doc(org(), 'speakerPins/e1')));
    await assertFails(setDoc(doc(sam(), 'speakerPins/e1'), pinDoc({ pin: '1111' })));
    await assertSucceeds(setDoc(doc(org(), 'speakerPins/e1'), pinDoc({ pin: '0571' })));
    await assertFails(setDoc(doc(org(), 'speakerPins/e1'), pinDoc({ pin: '12345' })));
    await assertFails(setDoc(doc(org(), 'speakerPins/e1'), pinDoc({ pin: '12a4' })));
    await assertFails(setDoc(doc(org(), 'speakerPins/e1'), pinDoc({ pin: '123' })));
  });

  it('the right code makes you a speaker with Pulse, on your own account', async () => {
    await assertSucceeds(guess(sam(), 'sam', PIN, 1));
    await assertSucceeds(becomeSpeaker(sam(), 'sam'));
  });

  it('a wrong guess can’t be marked correct, and you can’t skip the check', async () => {
    await assertFails(guess(sam(), 'sam', '1111', 1));
    await assertFails(becomeSpeaker(sam(), 'sam'));
    // Without any saved guess at all.
    await assertFails(becomeSpeaker(ben(), 'ben'));
  });

  it('every guess uses a try, and there are only 10', async () => {
    for (let n = 1; n <= 10; n++) await assertFails(guess(sam(), 'sam', String(1000 + n), n));
    // The 11th try is refused, even with the right code.
    await assertFails(setDoc(doc(sam(), `${E}/speakerTries/sam`), { pin: PIN, n: 11, ok: false, at: serverTimestamp() }));
    // Tries can't be rewound or reset by the person.
    await assertFails(setDoc(doc(sam(), `${E}/speakerTries/sam`), { pin: PIN, n: 1, ok: false, at: serverTimestamp() }));
    await assertFails(deleteDoc(doc(sam(), `${E}/speakerTries/sam`)));
    // The organiser can reset them.
    await assertSucceeds(deleteDoc(doc(org(), `${E}/speakerTries/sam`)));
    await assertSucceeds(guess(sam(), 'sam', PIN, 1));
  });

  it('a saved guess and the “correct” mark can’t go in one step (no free retries)', async () => {
    const db = sam();
    const b = writeBatch(db);
    b.set(doc(db, `${E}/speakerTries/sam`), { pin: '1111', n: 1, ok: true, at: serverTimestamp() });
    await assertFails(b.commit());
  });

  it('a code from one event never works for another', async () => {
    await assertFails(guess(sam(), 'sam', '9051', 1, 'e1'));
    await assertSucceeds(guess(sam(), 'sam', PIN, 2, 'e1'));
    await assertFails(becomeSpeaker(sam(), 'sam', 'e2'));
  });

  it('a changed, switched-off or expired code stops working', async () => {
    await assertSucceeds(guess(sam(), 'sam', PIN, 1));
    await seed((db) => setDoc(doc(db, 'speakerPins/e1'), pinDoc({ pin: '7302' })));
    await assertFails(becomeSpeaker(sam(), 'sam'));
    await seed((db) => setDoc(doc(db, 'speakerPins/e1'), pinDoc({ revoked: true })));
    await assertFails(guess(sam(), 'sam', PIN, 2));
    await seed((db) => setDoc(doc(db, 'speakerPins/e1'), pinDoc({ expiresAt: past() })));
    await assertFails(guess(sam(), 'sam', PIN, 3));
  });

  it('nobody else can read your tries, and guests can’t guess', async () => {
    await assertSucceeds(guess(sam(), 'sam', PIN, 1));
    await assertFails(getDoc(doc(ben(), `${E}/speakerTries/sam`)));
    const mine = await assertSucceeds(getDoc(doc(sam(), `${E}/speakerTries/sam`)));
    expect(mine.data()?.ok).toBe(true);
    await assertFails(setDoc(doc(guest(), `${E}/speakerTries/g1`), { pin: PIN, n: 1, ok: false, at: serverTimestamp() }));
  });

  it('the role can’t be made without Pulse or with someone else’s speaker profile', async () => {
    await assertSucceeds(guess(sam(), 'sam', PIN, 1));
    await assertFails(becomeSpeaker(sam(), 'sam', 'e1', { pulse: false }));
    await seed((db) => setDoc(doc(db, `${E}/speakers/sp1`), { name: 'Sam', uid: 'ben' }));
    await assertFails(becomeSpeaker(sam(), 'sam'));
  });
});
