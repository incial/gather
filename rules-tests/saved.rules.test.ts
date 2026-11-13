import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-gather-saved', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 } });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'events/e1'), { ownerUid: 'org', published: true, title: 'E' });
    await setDoc(doc(db, 'events/priv'), { ownerUid: 'org', published: false, linkAccess: true, title: 'P' });
    await setDoc(doc(db, 'events/draft'), { ownerUid: 'org', published: false, title: 'D' });
    await setDoc(doc(db, 'organisers/boss@org.test'), {});
  });
});
const ctx = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();

/** Exactly what the app writes when saving (users/{uid}/swipes + the organisers' copy). */
function save(uid: string, tokenEmail: string, eventId = 'e1', appEmail = tokenEmail.toLowerCase()) {
  const db = ctx(uid, tokenEmail);
  const b = writeBatch(db);
  b.set(doc(db, `users/${uid}/swipes/${eventId}`), { choice: 'save', title: 'E', tagline: '', startsAt: 'x', endsAt: 'y', venue: 'v', color: 'blue', at: serverTimestamp() });
  b.set(doc(db, `events/${eventId}/saved/${uid}`), { uid, name: 'A', email: appEmail, at: serverTimestamp() });
  return b.commit();
}

describe('saved events', () => {
  it('saves for a lower-case email', async () => { await assertSucceeds(save('asha', 'asha@x.test')); });
  it('saves when the Google email has capital letters (the bug that blocked saving)', async () => { await assertSucceeds(save('ben', 'Ben.Thomas@X.test')); });
  it('saving the same event twice keeps one record', async () => {
    await assertSucceeds(save('asha', 'asha@x.test'));
    await assertSucceeds(save('asha', 'asha@x.test'));
  });
  it('private-link events can be saved; drafts can’t', async () => {
    await assertSucceeds(save('asha', 'asha@x.test', 'priv'));
    await assertFails(save('asha', 'asha@x.test', 'draft'));
  });
  it('nobody can save, read or remove another person’s saved events', async () => {
    const db = ctx('cara', 'cara@x.test');
    await assertFails(setDoc(doc(db, 'events/e1/saved/asha'), { uid: 'asha', name: 'A', email: 'asha@x.test', at: serverTimestamp() }));
    await save('asha', 'asha@x.test');
    await assertFails(getDoc(doc(db, 'users/asha/swipes/e1')));
    await assertFails(deleteDoc(doc(db, 'users/asha/swipes/e1')));
    await assertFails(deleteDoc(doc(db, 'events/e1/saved/asha')));
  });
  it('unsaving removes both records', async () => {
    await save('asha', 'asha@x.test');
    const db = ctx('asha', 'asha@x.test');
    await assertSucceeds(deleteDoc(doc(db, 'users/asha/swipes/e1')));
    await assertSucceeds(deleteDoc(doc(db, 'events/e1/saved/asha')));
  });
  it('the Master Admin is recognised even with a capitalised Google email', async () => {
    const db = ctx('master', 'Toincial@Gmail.com');
    await assertSucceeds(setDoc(doc(db, 'events/e1'), { title: 'Renamed' }, { merge: true }));
  });
});
