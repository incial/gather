import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Its own project id, so it can run alongside the main rules tests on the same emulator.
let env: RulesTestEnvironment;
const ORG = { email: 'boss@org.test', email_verified: true };
const owner = () => env.authenticatedContext('owner', { email: 'own@x.test', email_verified: true }).firestore();
const org = () => env.authenticatedContext('org', ORG).firestore();
const sup = () => env.authenticatedContext('sup', { email: 'god@x.test', email_verified: true }).firestore();
const asha = () => env.authenticatedContext('asha', { email: 'asha@x.test', email_verified: true }).firestore();
const ben = () => env.authenticatedContext('ben', { email: 'ben@x.test', email_verified: true }).firestore();
const guest = (uid = 'g1') => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const P = 'pulse/p1';
const SURVEY = 'pulse/s1';
const future = (ms = 60000) => Timestamp.fromMillis(Date.now() + ms);
const past = () => Timestamp.fromMillis(Date.now() - 1000);

const survey = { welcome: '', thanks: '', limit: 0, opensAt: '', closesAt: '', opensAtTs: null, closesAtTs: null, oneByOne: true };
const pulse = (extra = {}) => ({
  kind: 'presentation', title: 'Talk', description: '', ownerUid: 'owner', ownerName: 'O', eventId: '', eventTitle: '',
  status: 'live', code: 'ABC234', access: 'public', anonymous: false, askName: false, audienceResults: true, locked: false,
  slides: [{ id: 'q1' }, { id: 'q2' }], survey, ...extra,
});
const state = (extra = {}) => ({ slideId: 'q1', index: 0, open: true, paused: false, showResults: false, ended: false, closesAt: null, openedAt: null, reveal: [], ...extra });
const answer = (uid: string, extra = {}) => ({ slideId: 'q1', uid, name: 'Me', value: ['o1'], at: serverTimestamp(), ...extra });

async function seed(fn: (db: ReturnType<typeof org>) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-pulse',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'organisers/boss@org.test'), {});
    await setDoc(doc(db, 'superAdmins/god@x.test'), {});
    await setDoc(doc(db, 'events/e1'), { ownerUid: 'org', published: true, registration: 'open', title: 'E' });
    await setDoc(doc(db, 'events/e1/attendees/asha'), { uid: 'asha', email: 'asha@x.test' });
    await setDoc(doc(db, P), pulse());
    await setDoc(doc(db, `${P}/live/state`), state());
    await setDoc(doc(db, `${P}/private/key`), { answers: { q2: ['o9'] }, openedAt: {}, vaultId: '' });
    await setDoc(doc(db, 'pulseCodes/ABC234'), { pid: 'p1', ownerUid: 'owner' });
    await setDoc(doc(db, SURVEY), pulse({ kind: 'survey', status: 'published', code: 'SRV234' }));
  });
});

describe('creating and managing', () => {
  it('an organiser creates a draft with its code and key in one batch', async () => {
    const db = org();
    const b = writeBatch(db);
    b.set(doc(db, 'pulse/new'), pulse({ status: 'draft', code: 'NEW234', ownerUid: 'org' }));
    b.set(doc(db, 'pulseCodes/NEW234'), { pid: 'new', ownerUid: 'org' });
    b.set(doc(db, 'pulse/new/private/key'), { answers: {}, openedAt: {}, vaultId: '' });
    await assertSucceeds(b.commit());
  });
  it('anyone can organise their own Pulse session, but not one for an event they don’t run', async () => {
    await assertSucceeds(setDoc(doc(ben(), 'pulse/x'), pulse({ status: 'draft', ownerUid: 'ben', eventId: '' })));
    await assertFails(setDoc(doc(ben(), 'pulse/y'), pulse({ status: 'draft', ownerUid: 'ben', eventId: 'e1' })));
    await assertFails(setDoc(doc(ben(), 'pulse/z'), pulse({ status: 'draft', ownerUid: 'owner', eventId: '' })));
  });
  it('guests and signed-out visitors cannot create', async () => {
    await assertFails(setDoc(doc(guest(), 'pulse/x'), pulse({ status: 'draft', ownerUid: 'g1' })));
    await assertFails(setDoc(doc(anon(), 'pulse/x'), pulse({ status: 'draft' })));
  });
  it('a join code can never be taken over', async () => {
    await assertFails(setDoc(doc(ben(), 'pulseCodes/ABC234'), { pid: 'mine', ownerUid: 'ben' }));
  });
  it('event activities need an organiser (or that event’s speaker)', async () => {
    await assertFails(setDoc(doc(ben(), 'pulse/x'), pulse({ status: 'draft', ownerUid: 'ben', eventId: 'e1' })));
    await assertSucceeds(setDoc(doc(org(), 'pulse/x'), pulse({ status: 'draft', ownerUid: 'org', eventId: 'e1' })));
  });
  it('others cannot edit, but the owner and super admins can', async () => {
    await assertFails(setDoc(doc(ben(), P), { title: 'hacked' }, { merge: true }));
    await assertSucceeds(setDoc(doc(owner(), P), { title: 'New' }, { merge: true }));
    await assertSucceeds(setDoc(doc(sup(), P), { title: 'Moderated' }, { merge: true }));
  });
  it('quiz answers stay private to the owner', async () => {
    await assertFails(getDoc(doc(asha(), `${P}/private/key`)));
    await assertFails(getDoc(doc(guest(), `${P}/private/key`)));
    await assertSucceeds(getDoc(doc(owner(), `${P}/private/key`)));
  });
  it('drafts are hidden from everyone but the owner', async () => {
    await seed((db) => setDoc(doc(db, P), { status: 'draft' }, { merge: true }));
    await assertFails(getDoc(doc(guest(), P)));
    await assertSucceeds(getDoc(doc(owner(), P)));
  });
});

describe('live answers', () => {
  it('a guest joins a public presentation and answers the open slide', async () => {
    await assertSucceeds(getDoc(doc(guest(), P)));
    await assertSucceeds(getDoc(doc(guest(), `${P}/live/state`)));
    await assertSucceeds(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1')));
  });
  it('one answer per person per slide, and never as someone else', async () => {
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_g2`), answer('g2')));
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_x`), answer('g1')));
  });
  it('no answers for a slide that isn’t showing, or when closed or paused', async () => {
    await assertFails(setDoc(doc(guest(), `${P}/responses/q2_g1`), answer('g1', { slideId: 'q2' })));
    await seed((db) => setDoc(doc(db, `${P}/live/state`), { open: false }, { merge: true }));
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1')));
    await seed((db) => setDoc(doc(db, `${P}/live/state`), { open: true, paused: true }, { merge: true }));
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1')));
  });
  it('quiz answers only before the deadline, and they can’t be changed', async () => {
    await seed((db) => setDoc(doc(db, `${P}/live/state`), { closesAt: past() }, { merge: true }));
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1')));
    await seed((db) => setDoc(doc(db, `${P}/live/state`), { closesAt: future() }, { merge: true }));
    await assertSucceeds(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1')));
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1', { value: ['o2'] })));
  });
  it('anonymous sessions never store names', async () => {
    await seed((db) => setDoc(doc(db, P), { anonymous: true }, { merge: true }));
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1')));
    await assertSucceeds(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1', { name: '' })));
  });
  it('people can read only their own answer; the owner reads all', async () => {
    await seed((db) => setDoc(doc(db, `${P}/responses/q1_g2`), { uid: 'g2', slideId: 'q1' }));
    await assertFails(getDoc(doc(guest(), `${P}/responses/q1_g2`)));
    await assertSucceeds(getDoc(doc(guest(), `${P}/responses/q1_g1`)));
    await assertFails(getDocs(collection(guest(), `${P}/responses`)));
    await assertSucceeds(getDocs(collection(owner(), `${P}/responses`)));
  });
  it('event-only presentations need a joined attendee', async () => {
    await seed((db) => setDoc(doc(db, P), { access: 'event', eventId: 'e1' }, { merge: true }));
    await assertFails(getDoc(doc(guest(), P)));
    await assertFails(getDoc(doc(ben(), P)));
    await assertSucceeds(getDoc(doc(asha(), P)));
    await assertSucceeds(setDoc(doc(asha(), `${P}/responses/q1_asha`), answer('asha')));
    await assertSucceeds(getDocs(query(collection(asha(), 'pulse'), where('eventId', '==', 'e1'), where('status', '==', 'live'))));
    await assertFails(getDocs(query(collection(ben(), 'pulse'), where('eventId', '==', 'e1'), where('status', '==', 'live'))));
  });
  it('signed-in only presentations refuse guests', async () => {
    await seed((db) => setDoc(doc(db, P), { access: 'signedIn' }, { merge: true }));
    await assertFails(getDoc(doc(guest(), P)));
    await assertSucceeds(getDoc(doc(ben(), P)));
  });
  it('password-protected answers need the right key', async () => {
    await seed(async (db) => { await setDoc(doc(db, P), { locked: true }, { merge: true }); await setDoc(doc(db, `${P}/vault/right`), { slides: [] }); });
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1')));
    await assertFails(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1', { k: 'wrong' })));
    await assertSucceeds(setDoc(doc(guest(), `${P}/responses/q1_g1`), answer('g1', { k: 'right' })));
    await assertFails(getDocs(collection(guest(), `${P}/vault`)));
  });
});

describe('Q&A', () => {
  const q = (uid: string) => ({ slideId: 'q1', uid, name: 'N', text: 'Why?', votes: 0, voters: [], answered: false, hidden: false, at: serverTimestamp() });
  it('people ask up to five questions in their own slots', async () => {
    await assertSucceeds(setDoc(doc(guest(), `${P}/qa/g1_1`), q('g1')));
    await assertFails(setDoc(doc(guest(), `${P}/qa/g1_6`), q('g1')));
    await assertFails(setDoc(doc(guest(), `${P}/qa/g2_1`), q('g1')));
  });
  it('upvote once, never your own question', async () => {
    await seed((db) => setDoc(doc(db, `${P}/qa/g1_1`), { ...q('g1'), at: 't' }));
    await assertFails(setDoc(doc(guest('g1'), `${P}/qa/g1_1`), { votes: increment(1), voters: arrayUnion('g1') }, { merge: true }));
    await assertSucceeds(setDoc(doc(guest('g2'), `${P}/qa/g1_1`), { votes: increment(1), voters: arrayUnion('g2') }, { merge: true }));
    await assertFails(setDoc(doc(guest('g2'), `${P}/qa/g1_1`), { votes: increment(1), voters: arrayUnion('g2') }, { merge: true }));
    await assertFails(setDoc(doc(guest('g3'), `${P}/qa/g1_1`), { votes: increment(5), voters: arrayUnion('g3') }, { merge: true }));
  });
  it('only the presenter moderates', async () => {
    await seed((db) => setDoc(doc(db, `${P}/qa/g1_1`), { ...q('g1'), at: 't' }));
    await assertFails(setDoc(doc(guest('g2'), `${P}/qa/g1_1`), { hidden: true }, { merge: true }));
    await assertSucceeds(setDoc(doc(owner(), `${P}/qa/g1_1`), { hidden: true, answered: true }, { merge: true }));
  });
});

describe('surveys', () => {
  const sub = (uid: string, extra = {}) => ({ uid, name: 'N', email: '', answers: { q1: ['o1'] }, at: serverTimestamp(), ...extra });
  it('one response per person', async () => {
    await assertSucceeds(setDoc(doc(guest(), `${SURVEY}/submissions/g1`), sub('g1')));
    await assertFails(setDoc(doc(guest(), `${SURVEY}/submissions/g1`), sub('g1')));
    await assertFails(setDoc(doc(guest(), `${SURVEY}/submissions/g2`), sub('g2')));
  });
  it('closed, not yet open or past the end: no responses', async () => {
    await seed((db) => setDoc(doc(db, SURVEY), { status: 'closed' }, { merge: true }));
    await assertFails(setDoc(doc(guest(), `${SURVEY}/submissions/g1`), sub('g1')));
    await seed((db) => setDoc(doc(db, SURVEY), { status: 'published', survey: { ...survey, opensAtTs: future() } }, { merge: true }));
    await assertFails(setDoc(doc(guest(), `${SURVEY}/submissions/g1`), sub('g1')));
    await seed((db) => setDoc(doc(db, SURVEY), { survey: { ...survey, closesAtTs: past() } }, { merge: true }));
    await assertFails(setDoc(doc(guest(), `${SURVEY}/submissions/g1`), sub('g1')));
  });
  it('a response limit is enforced by the counter', async () => {
    await seed(async (db) => { await setDoc(doc(db, SURVEY), { survey: { ...survey, limit: 1 } }, { merge: true }); await setDoc(doc(db, `${SURVEY}/counter/main`), { n: 0 }); });
    const submit = async (uid: string) => {
      const db = guest(uid);
      const b = writeBatch(db);
      b.set(doc(db, `${SURVEY}/submissions/${uid}`), sub(uid));
      b.set(doc(db, `${SURVEY}/counter/main`), { n: increment(1) }, { merge: true });
      return b.commit();
    };
    await assertFails(setDoc(doc(guest('g1'), `${SURVEY}/submissions/g1`), sub('g1')));
    await assertSucceeds(submit('g1'));
    await assertFails(submit('g2'));
  });
  it('anonymous surveys never store names or emails', async () => {
    await seed((db) => setDoc(doc(db, SURVEY), { anonymous: true }, { merge: true }));
    await assertFails(setDoc(doc(ben(), `${SURVEY}/submissions/ben`), sub('ben')));
    await assertSucceeds(setDoc(doc(ben(), `${SURVEY}/submissions/ben`), sub('ben', { name: '' })));
  });
  it('an email can only be the person’s own', async () => {
    await assertFails(setDoc(doc(ben(), `${SURVEY}/submissions/ben`), sub('ben', { email: 'someone@else.test' })));
    await assertSucceeds(setDoc(doc(ben(), `${SURVEY}/submissions/ben`), sub('ben', { email: 'ben@x.test' })));
  });
  it('only the owner reads submissions', async () => {
    await assertFails(getDocs(collection(ben(), `${SURVEY}/submissions`)));
    await assertSucceeds(getDocs(collection(owner(), `${SURVEY}/submissions`)));
  });
});

describe('private events, banners and super admins', () => {
  beforeEach(() => seed(async (db) => {
    await setDoc(doc(db, 'events/priv'), { ownerUid: 'org', published: false, linkAccess: true, registration: 'open' });
    await setDoc(doc(db, 'events/priv/media/banner'), { data: 'x' });
    await setDoc(doc(db, 'events/dr'), { ownerUid: 'org', published: false, registration: 'open' });
    await setDoc(doc(db, 'events/dr/media/banner'), { data: 'x' });
    await setDoc(doc(db, 'users/ben'), { name: 'Ben', email: 'ben@x.test' });
  }));
  it('a private event opens with its link but is never listed', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'events/priv')));
    await assertSucceeds(getDoc(doc(anon(), 'events/priv/media/banner')));
    await assertFails(getDocs(query(collection(anon(), 'events'), where('linkAccess', '==', true))));
    await assertFails(getDoc(doc(anon(), 'events/dr')));
    await assertFails(getDoc(doc(anon(), 'events/dr/media/banner')));
  });
  it('only organisers upload banners', async () => {
    await assertFails(setDoc(doc(ben(), 'events/e1/media/banner'), { data: 'y' }));
    await assertSucceeds(setDoc(doc(org(), 'events/e1/media/banner'), { data: 'y' }));
  });
  it('super admins see people and can grant access; others cannot', async () => {
    await assertSucceeds(getDocs(collection(sup(), 'users')));
    await assertFails(getDocs(collection(asha(), 'users')));
    await assertFails(getDoc(doc(asha(), 'users/ben')));
    await assertSucceeds(setDoc(doc(sup(), 'superAdmins/new@x.test'), {}));
    await assertFails(setDoc(doc(org(), 'superAdmins/boss@org.test'), {}));
    await assertSucceeds(setDoc(doc(sup(), 'events/e1'), { title: 'Fixed' }, { merge: true }));
  });
  it('super admins cannot read anyone’s private phone details', async () => {
    await seed((db) => setDoc(doc(db, 'users/ben/profile/me'), { phone: '123' }));
    await assertFails(getDoc(doc(sup(), 'users/ben/profile/me')));
  });
  it('people can delete their own account data', async () => {
    await seed((db) => setDoc(doc(db, 'profiles/ben'), { name: 'Ben' }));
    await assertSucceeds(deleteDoc(doc(ben(), 'profiles/ben')));
    await assertSucceeds(deleteDoc(doc(ben(), 'users/ben')));
    await assertFails(deleteDoc(doc(asha(), 'users/ben')));
  });
  it('organisers remove attendees’ copies of a deleted event, and nothing else', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/ben/events/e1'), { title: 'E' });
      await setDoc(doc(db, 'users/ben/swipes/e1'), { choice: 'save' });
      await setDoc(doc(db, 'users/ben/profile/me'), { phone: '1' });
    });
    await assertFails(getDoc(doc(org(), 'users/ben/events/e1')));
    await assertFails(setDoc(doc(org(), 'users/ben/events/e1'), { title: 'x' }));
    await assertFails(deleteDoc(doc(org(), 'users/ben/profile/me')));
    await assertFails(deleteDoc(doc(asha(), 'users/ben/events/e1')));
    await assertSucceeds(deleteDoc(doc(org(), 'users/ben/events/e1')));
    await assertSucceeds(deleteDoc(doc(org(), 'users/ben/swipes/e1')));
  });
  it('a deleted event reads as missing, drafts stay hidden', async () => {
    await assertSucceeds(getDoc(doc(ben(), 'events/gone')));
    await assertFails(getDoc(doc(ben(), 'events/dr')));
  });
});
