import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, getDocs, collection, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Runs only against the local emulator: the "demo-" project id cannot reach a real Firebase project.
let env: RulesTestEnvironment;
const E = 'events/e1';
const ORG = { email: 'boss@org.test', email_verified: true };
const ASHA = { email: 'asha@x.test', email_verified: true };
const org = () => env.authenticatedContext('org', ORG).firestore();
const asha = () => env.authenticatedContext('asha', ASHA).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const future = () => Timestamp.fromMillis(Date.now() + 60000);
const past = () => Timestamp.fromMillis(Date.now() - 1000);

async function seed(fn: (db: ReturnType<typeof org>) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
const attendance = (key: string, uid = 'asha', extra = {}) => ({ uid, sessionId: 's1', name: 'A', email: 'a', method: 'qr', key, at: serverTimestamp(), ...extra });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'organisers/boss@org.test'), {});
    await setDoc(doc(db, E), { ownerUid: 'org', published: true, registration: 'open', feedbackOpen: true, title: 'NFDP' });
    await setDoc(doc(db, 'events/draft'), { ownerUid: 'org', published: false, registration: 'open' });
    await setDoc(doc(db, `${E}/sessions/s1`), { title: 'S' });
    await setDoc(doc(db, `${E}/speakers/sp1`), { name: 'Dr X', email: 'x@y.z' });
    await setDoc(doc(db, `${E}/sessionKeys/s1`), { key: 'ABC234', prev: 'PRV234', open: true, expiresAt: future() });
    await setDoc(doc(db, `${E}/private/info`), { wifiName: 'N', wifiPassword: 'P' });
    await setDoc(doc(db, `${E}/directory/asha`), { uid: 'asha', name: 'Asha' });
    await setDoc(doc(db, `${E}/attendees/asha`), { uid: 'asha', email: 'asha@x.test', joinedAt: 't', source: 'app', name: 'Asha' });
  });
});

describe('events', () => {
  it('public can read published events, not drafts', async () => {
    await assertSucceeds(getDoc(doc(anon(), E)));
    await assertFails(getDoc(doc(anon(), 'events/draft')));
    await assertSucceeds(getDocs(query(collection(anon(), 'events'), where('published', '==', true))));
    await assertFails(getDocs(collection(anon(), 'events')));
  });
  it('only organisers can write', async () => {
    await assertFails(setDoc(doc(asha(), E), { title: 'hacked' }, { merge: true }));
    await assertSucceeds(setDoc(doc(org(), E), { title: 'new' }, { merge: true }));
  });
  it('an unverified email is not an organiser', async () => {
    const fake = env.authenticatedContext('fake', { email: 'boss@org.test', email_verified: false }).firestore();
    await assertFails(setDoc(doc(fake, E), { title: 'x' }, { merge: true }));
  });
  it('attendees cannot add themselves as organisers', async () => {
    await assertFails(setDoc(doc(asha(), 'organisers/asha@x.test'), {}));
  });
});

describe('speakers and keys', () => {
  it('speaker contact details need an attendee', async () => {
    await assertFails(getDoc(doc(anon(), `${E}/speakers/sp1`)));
    await assertFails(getDoc(doc(ben(), `${E}/speakers/sp1`)));
    await assertSucceeds(getDoc(doc(asha(), `${E}/speakers/sp1`)));
  });
  it('attendees can never read the check-in keys', async () => {
    await assertFails(getDoc(doc(asha(), `${E}/sessionKeys/s1`)));
    await assertSucceeds(getDoc(doc(org(), `${E}/sessionKeys/s1`)));
  });
});

describe('joining', () => {
  const me = { uid: 'ben', email: 'ben@x.test', source: 'app', joinedAt: 't', name: 'Ben' };
  it('open event: anyone can join as themselves only', async () => {
    await assertSucceeds(setDoc(doc(ben(), `${E}/attendees/ben`), me));
    await assertFails(setDoc(doc(ben(), `${E}/attendees/zed`), { ...me, uid: 'zed' }));
    await assertFails(setDoc(doc(ben(), `${E}/attendees/ben`), { ...me, email: 'other@x.test' }));
  });
  it('invite event: must be on the list', async () => {
    await seed((db) => setDoc(doc(db, E), { registration: 'invite' }, { merge: true }));
    await assertFails(setDoc(doc(ben(), `${E}/attendees/ben`), me));
    await seed((db) => setDoc(doc(db, `${E}/preregistered/ben@x.test`), { name: 'Ben' }));
    await assertSucceeds(setDoc(doc(ben(), `${E}/attendees/ben`), me));
  });
  it('the join batch used by the app passes', async () => {
    const db = ben();
    const b = writeBatch(db);
    b.set(doc(db, `${E}/attendees/ben`), me);
    b.set(doc(db, 'users/ben/events/e1'), { title: 'NFDP' });
    b.set(doc(db, `${E}/directory/ben`), { uid: 'ben', name: 'Ben', institution: '', department: '', designation: '' });
    await assertSucceeds(b.commit());
  });
  it('people cannot read each other', async () => {
    await assertFails(getDoc(doc(ben(), `${E}/attendees/asha`)));
    await assertFails(getDocs(collection(asha(), `${E}/attendees`)));
    await assertSucceeds(getDocs(collection(org(), `${E}/attendees`)));
  });
});

describe('attendance', () => {
  const path = `${E}/attendance/s1_asha`;
  it('accepts the current key', async () => {
    await assertSucceeds(setDoc(doc(asha(), path), attendance('ABC234')));
  });
  it('accepts the previous key during rotation', async () => {
    await assertSucceeds(setDoc(doc(asha(), path), attendance('PRV234')));
  });
  it('rejects wrong and blank keys', async () => {
    await assertFails(setDoc(doc(asha(), path), attendance('WRONG1')));
    await assertFails(setDoc(doc(asha(), path), attendance('')));
    await seed((db) => setDoc(doc(db, `${E}/sessionKeys/s1`), { prev: '' }, { merge: true }));
    await assertFails(setDoc(doc(asha(), path), attendance('')));
  });
  it('rejects expired or closed check-in', async () => {
    await seed((db) => setDoc(doc(db, `${E}/sessionKeys/s1`), { expiresAt: past() }, { merge: true }));
    await assertFails(setDoc(doc(asha(), path), attendance('ABC234')));
    await seed((db) => setDoc(doc(db, `${E}/sessionKeys/s1`), { expiresAt: future(), open: false }, { merge: true }));
    await assertFails(setDoc(doc(asha(), path), attendance('ABC234')));
  });
  it('rejects marking someone else, faking the method or the time', async () => {
    await assertFails(setDoc(doc(asha(), `${E}/attendance/s1_ben`), attendance('ABC234', 'ben')));
    await assertFails(setDoc(doc(asha(), path), attendance('ABC234', 'asha', { method: 'staff' })));
    await assertFails(setDoc(doc(asha(), path), attendance('ABC234', 'asha', { at: Timestamp.fromMillis(0) })));
  });
  it('non-attendees cannot check in', async () => {
    await assertFails(setDoc(doc(ben(), `${E}/attendance/s1_ben`), attendance('ABC234', 'ben')));
  });
  it('attendees cannot change or delete a record; the app can look up its own', async () => {
    await assertSucceeds(getDoc(doc(asha(), path))); // missing doc: the app's "already checked in?" lookup
    await assertSucceeds(setDoc(doc(asha(), path), attendance('ABC234')));
    await assertFails(setDoc(doc(asha(), path), attendance('ABC234', 'asha', { name: 'x' })));
    await assertFails(deleteDoc(doc(asha(), path)));
    await assertSucceeds(getDocs(query(collection(asha(), `${E}/attendance`), where('uid', '==', 'asha'))));
    await assertFails(getDocs(collection(asha(), `${E}/attendance`)));
  });
  it('organisers can mark anyone by hand', async () => {
    await assertSucceeds(setDoc(doc(org(), `${E}/attendance/s1_ben`), { uid: 'ben', sessionId: 's1', method: 'manual' }));
  });
});

describe('event assets', () => {
  it('attendees read assets and fetch a file; strangers cannot', async () => {
    await seed(async (db) => { await setDoc(doc(db, `${E}/assets/a1`), { title: 'Slides' }); await setDoc(doc(db, `${E}/assetFiles/a1`), { data: 'AAAA', mime: 'application/pdf', name: 's.pdf' }); });
    await assertSucceeds(getDocs(collection(asha(), `${E}/assets`)));
    await assertSucceeds(getDoc(doc(asha(), `${E}/assetFiles/a1`)));
    await assertFails(getDocs(collection(asha(), `${E}/assetFiles`)));
    await assertFails(getDoc(doc(ben(), `${E}/assetFiles/a1`)));
    await assertFails(getDocs(collection(anon(), `${E}/assets`)));
  });
  it('only organisers add files, within the size limit', async () => {
    const file = (n: number) => ({ data: 'x'.repeat(n), mime: 'application/pdf', name: 's.pdf' });
    await assertFails(setDoc(doc(asha(), `${E}/assetFiles/a2`), file(10)));
    await assertFails(setDoc(doc(asha(), `${E}/assets/a2`), { title: 'x' }));
    await assertSucceeds(setDoc(doc(org(), `${E}/assetFiles/a2`), file(900000)));
    await assertFails(setDoc(doc(org(), `${E}/assetFiles/a3`), file(960001)));
    await assertFails(setDoc(doc(org(), `${E}/assetFiles/a4`), { ...file(10), extra: 1 }));
    await assertSucceeds(getDocs(collection(org(), `${E}/assetFiles`)));
  });
});

describe('certificates', () => {
  const cert = { eventId: 'e1', uid: 'asha', name: 'Asha', eventTitle: 'NFDP', title: 'Certificate', organiser: '', dates: '', venue: '', signers: [] };
  it('anyone can verify by ID; listing is limited to your own', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'certificates/GTH-AAAA-BBBB-CCCC'), cert); await setDoc(doc(db, `${E}/certIndex/asha`), { uid: 'asha', certId: 'GTH-AAAA-BBBB-CCCC' }); });
    await assertSucceeds(getDoc(doc(anon(), 'certificates/GTH-AAAA-BBBB-CCCC')));
    await assertFails(getDocs(collection(anon(), 'certificates')));
    await assertSucceeds(getDocs(query(collection(asha(), 'certificates'), where('uid', '==', 'asha'))));
    await assertFails(getDocs(query(collection(ben(), 'certificates'), where('uid', '==', 'asha'))));
    await assertSucceeds(getDoc(doc(asha(), `${E}/certIndex/asha`)));
    await assertFails(getDoc(doc(ben(), `${E}/certIndex/asha`)));
  });
  it('only organisers issue or revoke; attendees cannot give themselves one', async () => {
    await assertFails(setDoc(doc(asha(), 'certificates/GTH-FAKE-FAKE-FAKE'), cert));
    await assertFails(setDoc(doc(asha(), `${E}/certIndex/asha`), { uid: 'asha', certId: 'x' }));
    await assertSucceeds(setDoc(doc(org(), 'certificates/GTH-REAL-REAL-REAL'), cert));
    await assertSucceeds(deleteDoc(doc(org(), 'certificates/GTH-REAL-REAL-REAL')));
  });
});

describe('public profiles', () => {
  const prof = (over: Record<string, unknown> = {}) => ({ profileId: 'abc23xyz', name: 'Asha', photo: '', photoSource: 'none', headline: 'Teacher', bio: '', organisation: 'X', designation: '', education: '', skills: ['IPR'], interests: [], location: '', linkedin: '', website: '', portfolio: '', links: [], visibility: 'public', ...over });
  it('each person creates and edits only their own profile', async () => {
    await assertSucceeds(setDoc(doc(asha(), 'profiles/asha'), prof()));
    await assertFails(setDoc(doc(ben(), 'profiles/asha'), prof({ name: 'fake' })));
    await assertSucceeds(setDoc(doc(asha(), 'profiles/asha'), prof({ headline: 'Updated' })));
  });
  it('the profile ID cannot change once created', async () => {
    await seed((db) => setDoc(doc(db, 'profiles/asha'), prof()));
    await assertFails(setDoc(doc(asha(), 'profiles/asha'), prof({ profileId: 'stolen99' })));
  });
  it('phone, email and unknown fields can never be stored on a public profile', async () => {
    await assertFails(setDoc(doc(asha(), 'profiles/asha'), prof({ phone: '123' })));
    await assertFails(setDoc(doc(asha(), 'profiles/asha'), prof({ email: 'a@b.c' })));
    await assertFails(setDoc(doc(asha(), 'profiles/asha'), prof({ role: 'organiser' })));
    await assertFails(setDoc(doc(asha(), 'profiles/asha'), prof({ visibility: 'everyone' })));
    await assertFails(setDoc(doc(asha(), 'profiles/asha'), prof({ name: '' })));
    await assertFails(setDoc(doc(asha(), 'profiles/asha'), prof({ photo: 'x'.repeat(200001) })));
  });
  it('visible profiles are readable by signed-in people only; hidden ones by the owner only', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'profiles/asha'), prof()); await setDoc(doc(db, 'profiles/ben'), prof({ profileId: 'benbenbe', visibility: 'private' })); });
    await assertSucceeds(getDoc(doc(ben(), 'profiles/asha')));
    await assertFails(getDoc(doc(anon(), 'profiles/asha')));
    await assertFails(getDoc(doc(asha(), 'profiles/ben')));
    await assertSucceeds(getDoc(doc(ben(), 'profiles/ben')));
    await assertSucceeds(getDocs(query(collection(asha(), 'profiles'), where('profileId', '==', 'abc23xyz'), where('visibility', '==', 'public'))));
    await assertFails(getDocs(collection(asha(), 'profiles')));
  });
});

describe('profiles', () => {
  it('each person reads and writes only their own profile', async () => {
    await assertSucceeds(setDoc(doc(asha(), 'users/asha'), { name: 'Asha', email: 'asha@x.test', photo: 'https://x' }));
    await assertSucceeds(getDoc(doc(asha(), 'users/asha')));
    await assertFails(getDoc(doc(ben(), 'users/asha')));
    await assertFails(setDoc(doc(ben(), 'users/asha'), { name: 'x' }));
    await assertFails(getDoc(doc(anon(), 'users/asha')));
  });
  it('a People entry may carry a photo', async () => {
    await assertSucceeds(setDoc(doc(asha(), `${E}/directory/asha`), { uid: 'asha', name: 'A', institution: '', department: '', designation: '', photo: 'https://x' }));
  });
});

describe('Wi-Fi and People', () => {
  it('Wi-Fi is for joined attendees and organisers only', async () => {
    await assertFails(getDoc(doc(anon(), `${E}/private/info`)));
    await assertFails(getDoc(doc(ben(), `${E}/private/info`)));
    await assertSucceeds(getDoc(doc(asha(), `${E}/private/info`)));
    await assertFails(setDoc(doc(asha(), `${E}/private/info`), { wifiName: 'x' }));
    await assertSucceeds(setDoc(doc(org(), `${E}/private/info`), { wifiName: 'x', wifiPassword: 'y' }));
  });
  it('People is for joined attendees only', async () => {
    await assertFails(getDocs(collection(anon(), `${E}/directory`)));
    await assertFails(getDocs(collection(ben(), `${E}/directory`)));
    await assertSucceeds(getDocs(collection(asha(), `${E}/directory`)));
  });
  it('a People entry can never hold email or phone', async () => {
    await assertFails(setDoc(doc(asha(), `${E}/directory/asha`), { uid: 'asha', name: 'A', phone: '123' }));
    await assertFails(setDoc(doc(asha(), `${E}/directory/asha`), { uid: 'asha', name: 'A', email: 'a@b.c' }));
  });
  it('people manage only their own entry and can opt out', async () => {
    await assertFails(setDoc(doc(ben(), `${E}/directory/asha`), { uid: 'asha', name: 'fake' }));
    await assertFails(setDoc(doc(ben(), `${E}/directory/ben`), { uid: 'ben', name: 'Not joined' }));
    await assertFails(deleteDoc(doc(ben(), `${E}/directory/asha`)));
    await assertSucceeds(deleteDoc(doc(asha(), `${E}/directory/asha`)));
  });
});

describe('session feedback', () => {
  const data = (uid = 'asha', rating = 4) => ({ uid, sessionId: 's1', rating, comment: '', name: 'A', email: 'a' });
  const path = `${E}/sessionFeedback/s1_asha`;
  it('attendees rate a session for themselves, 1 to 5', async () => {
    await assertSucceeds(setDoc(doc(asha(), path), data()));
    await assertSucceeds(setDoc(doc(asha(), path), data('asha', 2)));
    await assertFails(setDoc(doc(asha(), path), data('asha', 9)));
    await assertFails(setDoc(doc(asha(), path), data('asha', 0)));
  });
  it('rejects non-attendees and rating as someone else', async () => {
    await assertFails(setDoc(doc(ben(), `${E}/sessionFeedback/s1_ben`), data('ben')));
    await assertFails(setDoc(doc(asha(), `${E}/sessionFeedback/s1_ben`), data('ben')));
  });
  it('respects the organiser turning feedback off', async () => {
    await seed((db) => setDoc(doc(db, `${E}/sessions/s1`), { feedbackOn: false }, { merge: true }));
    await assertFails(setDoc(doc(asha(), path), data()));
  });
  it('ratings are private to the author and organisers', async () => {
    await seed((db) => setDoc(doc(db, path), data()));
    await assertFails(getDoc(doc(ben(), path)));
    await assertSucceeds(getDocs(query(collection(asha(), `${E}/sessionFeedback`), where('uid', '==', 'asha'))));
    await assertFails(getDocs(collection(asha(), `${E}/sessionFeedback`)));
    await assertSucceeds(getDocs(collection(org(), `${E}/sessionFeedback`)));
  });
});

describe('Explore and saved', () => {
  it('people manage only their own swipes and profile', async () => {
    await assertSucceeds(setDoc(doc(asha(), 'users/asha/swipes/e1'), { choice: 'save' }));
    await assertSucceeds(setDoc(doc(asha(), 'users/asha/profile/me'), { name: 'A' }));
    await assertFails(getDoc(doc(ben(), 'users/asha/swipes/e1')));
    await assertFails(setDoc(doc(ben(), 'users/asha/swipes/e1'), { choice: 'skip' }));
    await assertFails(getDoc(doc(ben(), 'users/asha/profile/me')));
  });
  it('saving an event records only yourself, on published events', async () => {
    const data = { uid: 'ben', email: 'ben@x.test', name: 'Ben' };
    await assertSucceeds(setDoc(doc(ben(), `${E}/saved/ben`), data));
    await assertFails(setDoc(doc(ben(), `${E}/saved/asha`), { ...data, uid: 'asha' }));
    await assertFails(setDoc(doc(ben(), `${E}/saved/ben`), { ...data, email: 'fake@x.test' }));
    await assertFails(setDoc(doc(ben(), 'events/draft/saved/ben'), data));
  });
  it('the saved list is private to organisers', async () => {
    await seed((db) => setDoc(doc(db, `${E}/saved/ben`), { uid: 'ben' }));
    await assertFails(getDocs(collection(asha(), `${E}/saved`)));
    await assertSucceeds(getDocs(collection(org(), `${E}/saved`)));
    await assertSucceeds(deleteDoc(doc(ben(), `${E}/saved/ben`)));
  });
});

describe('feedback and connections', () => {
  it('attendees can send feedback only while open', async () => {
    await assertSucceeds(setDoc(doc(asha(), `${E}/feedback/asha`), { uid: 'asha', answers: {} }));
    await seed((db) => setDoc(doc(db, E), { feedbackOpen: false }, { merge: true }));
    await assertFails(setDoc(doc(asha(), `${E}/feedback/asha`), { uid: 'asha', answers: { a: 1 } }));
  });
  it('feedback is private to the author and organisers', async () => {
    await seed((db) => setDoc(doc(db, `${E}/feedback/asha`), { uid: 'asha' }));
    await assertFails(getDoc(doc(ben(), `${E}/feedback/asha`)));
    await assertSucceeds(getDoc(doc(org(), `${E}/feedback/asha`)));
  });
  it('connections are created by the attendee for themselves', async () => {
    const data = { uid: 'asha', speakerId: 'sp1', method: 'scan' };
    await assertSucceeds(setDoc(doc(asha(), `${E}/connections/asha_sp1`), data));
    await assertFails(setDoc(doc(ben(), `${E}/connections/ben_sp1`), { ...data, uid: 'ben' }));
    await assertFails(setDoc(doc(asha(), `${E}/connections/ben_sp1`), { ...data, uid: 'ben' }));
  });
});
