import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/** Speaker photos: only ever the photo on the speaker's own Google account. */
let env: RulesTestEnvironment;
const PIC = 'https://lh3.googleusercontent.com/a/asha-photo';
const asha = () => env.authenticatedContext('asha', { email: 'asha@x.test', email_verified: true, picture: PIC }).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true, picture: 'https://lh3.googleusercontent.com/a/ben' }).firestore();
type Db = ReturnType<typeof asha>;
const E = 'events/e1';

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
/** What the app writes when a listed speaker signs in with their email (claim flow), optionally with a photo. */
function claim(db: Db, extra: Record<string, unknown>) {
  const b = writeBatch(db);
  b.set(doc(db, `${E}/speakers/sp1`), { uid: 'asha', ...extra }, { merge: true });
  b.set(doc(db, `${E}/roles/asha`), { uid: 'asha', name: 'Asha', email: 'asha@x.test', roles: ['speaker'], speakerId: 'sp1', status: 'verified', active: true, pulse: true, code: 'EMAIL', at: serverTimestamp() });
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-spphoto',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, E), { ownerUid: 'own', published: true, registration: 'open', title: 'E' });
    await setDoc(doc(db, `${E}/speakers/sp1`), { name: 'Asha', email: 'asha@x.test', emailLower: 'asha@x.test', uid: '' });
    await setDoc(doc(db, `${E}/attendees/asha`), { uid: 'asha', email: 'asha@x.test', name: 'Asha', joinedAt: 't', source: 'app' });
  });
});

describe('speaker photo from the account', () => {
  it('claiming with your own account photo works (and without one, as before)', async () => {
    await assertSucceeds(claim(asha(), { photo: PIC }));
  });
  it('claiming without a photo still works exactly as before', async () => {
    await assertSucceeds(claim(asha(), {}));
  });
  it('any other image is refused when claiming', async () => {
    await assertFails(claim(asha(), { photo: 'https://evil.example/fake.png' }));
  });
  it('a linked speaker can fill in their account photo later, but not someone else’s picture', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, `${E}/speakers/sp1`), { uid: 'asha' }, { merge: true });
      await setDoc(doc(db, `${E}/roles/asha`), { uid: 'asha', speakerId: 'sp1', active: true });
    });
    await assertSucceeds(setDoc(doc(asha(), `${E}/speakers/sp1`), { photo: PIC }, { merge: true }));
    await assertFails(setDoc(doc(asha(), `${E}/speakers/sp1`), { photo: 'https://lh3.googleusercontent.com/a/ben' }, { merge: true }));
  });
  it('nobody else can set a speaker’s photo', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, `${E}/speakers/sp1`), { uid: 'asha' }, { merge: true });
      await setDoc(doc(db, `${E}/roles/asha`), { uid: 'asha', speakerId: 'sp1', active: true });
    });
    await assertFails(setDoc(doc(ben(), `${E}/speakers/sp1`), { photo: 'https://lh3.googleusercontent.com/a/ben' }, { merge: true }));
  });
});
