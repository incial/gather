import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const asha = () => env.authenticatedContext('asha', { email: 'asha@x.test', email_verified: true }).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true }).firestore();
const guest = () => env.authenticatedContext('g1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
type Db = ReturnType<typeof asha>;

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
const profile = (name: string, extra = {}) => ({
  profileId: `pid${name}xx`, name, photo: '', photoSource: 'none', headline: '', bio: '', organisation: '', designation: '', education: '',
  skills: [], interests: [], location: '', linkedin: '', website: '', portfolio: '', links: [], visibility: 'public', ...extra,
});
/** What the app does: claim the new name, point the profile at it, release the old one. */
function claim(db: Db, uid: string, h: string, previous?: string) {
  const b = writeBatch(db);
  b.set(doc(db, `usernames/${h}`), { uid, at: serverTimestamp() });
  b.set(doc(db, `profiles/${uid}`), { username: h }, { merge: true });
  if (previous) b.delete(doc(db, `usernames/${previous}`));
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-usernames',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'profiles/asha'), profile('Asha'));
    await setDoc(doc(db, 'profiles/ben'), profile('Ben'));
  });
});

describe('usernames', () => {
  it('you can claim a free one and it shows on your profile', async () => {
    await assertSucceeds(claim(asha(), 'asha', 'asha.k'));
    await assertSucceeds(getDoc(doc(ben(), 'usernames/asha.k')));
  });
  it('one username, one account: a taken name can’t be claimed', async () => {
    await claim(asha(), 'asha', 'asha.k');
    await assertFails(claim(ben(), 'ben', 'asha.k'));
  });
  it('you can’t point your profile at someone else’s name, or claim one for someone else', async () => {
    await claim(asha(), 'asha', 'asha.k');
    await assertFails(setDoc(doc(ben(), 'profiles/ben'), { username: 'asha.k' }, { merge: true }));
    await assertFails(setDoc(doc(ben(), 'usernames/benny'), { uid: 'asha', at: serverTimestamp() }));
  });
  it('a claim must come with the profile update (no hoarding names)', async () => {
    await assertFails(setDoc(doc(asha(), 'usernames/spare'), { uid: 'asha', at: serverTimestamp() }));
    await assertFails(setDoc(doc(asha(), 'profiles/asha'), { username: 'nope' }, { merge: true }));
  });
  it('changing it releases the old one, which someone else can then take', async () => {
    await claim(asha(), 'asha', 'asha.k');
    // Can't keep the old one while taking a new one.
    await assertFails(claim(asha(), 'asha', 'asha.new'));
    await assertSucceeds(claim(asha(), 'asha', 'asha.new', 'asha.k'));
    await assertSucceeds(claim(ben(), 'ben', 'asha.k'));
  });
  it('only proper usernames: 3–20 lowercase letters, numbers, dots, underscores', async () => {
    for (const bad of ['ab', 'Asha', '_asha', 'asha k', 'a'.repeat(21), 'ash@']) await assertFails(claim(asha(), 'asha', bad));
    await assertSucceeds(claim(asha(), 'asha', 'a_b.9'));
  });
  it('the list of usernames can’t be downloaded, names can’t be edited, guests can’t claim', async () => {
    await claim(asha(), 'asha', 'asha.k');
    await assertFails(getDocs(collection(ben(), 'usernames')));
    await assertFails(setDoc(doc(asha(), 'usernames/asha.k'), { uid: 'asha', at: serverTimestamp(), x: 1 }));
    await assertFails(setDoc(doc(guest(), 'usernames/guesty'), { uid: 'g1', at: serverTimestamp() }));
  });
  it('deleting your account frees the name; others can’t delete it', async () => {
    await claim(asha(), 'asha', 'asha.k');
    await assertFails(deleteDoc(doc(ben(), 'usernames/asha.k')));
    await assertFails(deleteDoc(doc(asha(), 'usernames/asha.k')));
    const db = asha();
    const b = writeBatch(db);
    b.delete(doc(db, 'profiles/asha'));
    b.delete(doc(db, 'usernames/asha.k'));
    await assertSucceeds(b.commit());
  });
  it('editing the rest of your profile keeps working with a username set', async () => {
    await claim(asha(), 'asha', 'asha.k');
    await assertSucceeds(setDoc(doc(asha(), 'profiles/asha'), { ...profile('Asha', { name: 'Asha K', headline: 'Hi' }), username: 'asha.k' }, { merge: true }));
  });
});
