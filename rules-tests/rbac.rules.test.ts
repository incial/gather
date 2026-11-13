import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * One account, many roles. Anyone can organise; each event belongs to whoever created it; the
 * Master Admin (toincial@gmail.com) controls everything. Permissions come from the rules, not the app.
 */
let env: RulesTestEnvironment;
const ctx = (uid: string, email: string, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const asha = () => ctx('asha', 'asha@x.test');   // organises e-asha, attends e-ben
const ben = () => ctx('ben', 'ben@x.test');      // organises e-ben
const master = () => ctx('master', 'toincial@gmail.com');
const guest = () => env.authenticatedContext('g1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
type Db = ReturnType<typeof asha>;
const ev = (owner: string, extra = {}) => ({ ownerUid: owner, title: 'E', published: true, registration: 'open', joinCode: '111111', lineup: [], questions: [], ...extra });

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-rbac',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'events/e-asha'), ev('asha'));
    await setDoc(doc(db, 'events/e-ben'), ev('ben'));
    await setDoc(doc(db, 'events/e-ben-draft'), ev('ben', { published: false, linkAccess: false }));
    await setDoc(doc(db, 'events/e-ben/attendees/asha'), { uid: 'asha', email: 'asha@x.test', name: 'Asha', joinedAt: 't', source: 'app' });
    await setDoc(doc(db, 'events/e-ben/sessions/s1'), { title: 'Talk' });
  });
});

describe('open organiser registration', () => {
  it('any signed-in Google account can create an event, and owns it', async () => {
    await assertSucceeds(setDoc(doc(ctx('new', 'new@x.test'), 'events/fresh'), ev('new')));
  });
  it('but not for someone else, not as a guest, not with an unverified email', async () => {
    await assertFails(setDoc(doc(asha(), 'events/fresh'), ev('ben')));
    await assertFails(setDoc(doc(guest(), 'events/fresh'), ev('g1')));
    await assertFails(setDoc(doc(ctx('nv', 'nv@x.test', false), 'events/fresh'), ev('nv')));
  });
  it('organisers see their own drafts; nobody else does', async () => {
    await assertSucceeds(getDoc(doc(ben(), 'events/e-ben-draft')));
    await assertFails(getDoc(doc(asha(), 'events/e-ben-draft')));
    await assertSucceeds(getDocs(query(collection(ben(), 'events'), where('ownerUid', '==', 'ben'))));
  });
});

describe('each organiser controls only their own events', () => {
  it('the owner edits and manages their event', async () => {
    await assertSucceeds(setDoc(doc(ben(), 'events/e-ben'), { title: 'New' }, { merge: true }));
    await assertSucceeds(setDoc(doc(ben(), 'events/e-ben/sessions/s2'), { title: 'Another' }));
    await assertSucceeds(getDocs(collection(ben(), 'events/e-ben/attendees')));
    await assertSucceeds(setDoc(doc(ben(), 'speakerPins/e-ben'), { pin: '4827', revoked: false, expiresAt: Timestamp.fromMillis(Date.now() + 1e8), eventTitle: 'E', createdAt: serverTimestamp() }));
  });
  it('another organiser can’t edit, read attendees, check in, set codes or delete it', async () => {
    await assertFails(setDoc(doc(asha(), 'events/e-ben'), { title: 'Hacked' }, { merge: true }));
    await assertFails(setDoc(doc(asha(), 'events/e-ben/sessions/s2'), { title: 'x' }));
    await assertFails(getDocs(collection(asha(), 'events/e-ben/attendees')));
    await assertFails(setDoc(doc(asha(), 'events/e-ben/attendees/asha'), { checkedIn: true, checkedInAt: serverTimestamp(), checkInMethod: 'manual', checkedInBy: 'asha' }, { merge: true }));
    await assertFails(setDoc(doc(asha(), 'speakerPins/e-ben'), { pin: '1111', revoked: false, expiresAt: Timestamp.now(), eventTitle: 'E', createdAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(asha(), 'events/e-ben')));
  });
  it('the owner can’t hand the event to someone else (only the Master Admin can)', async () => {
    await assertFails(setDoc(doc(ben(), 'events/e-ben'), { ownerUid: 'asha' }, { merge: true }));
    await assertSucceeds(setDoc(doc(master(), 'events/e-ben'), { ownerUid: 'asha' }, { merge: true }));
  });
});

describe('dual role: organiser and attendee on one account', () => {
  it('Asha runs her own event and attends Ben’s as a normal attendee', async () => {
    await assertSucceeds(setDoc(doc(asha(), 'events/e-asha'), { title: 'Mine' }, { merge: true }));
    await assertSucceeds(getDoc(doc(asha(), 'events/e-ben/attendees/asha')));
    await assertFails(getDoc(doc(asha(), 'events/e-ben/attendees/ben')));
  });
});

describe('Master Admin', () => {
  it('has full control of every event and its data, built in (no database entry needed)', async () => {
    await assertSucceeds(getDoc(doc(master(), 'events/e-ben-draft')));
    await assertSucceeds(setDoc(doc(master(), 'events/e-ben'), { title: 'Moderated' }, { merge: true }));
    await assertSucceeds(getDocs(collection(master(), 'events/e-ben/attendees')));
    await assertSucceeds(getDocs(collection(master(), 'events')));
    const m = master();
    const b = writeBatch(m);
    b.delete(doc(m, 'events/e-ben/sessions/s1'));
    b.delete(doc(m, 'events/e-ben'));
    await assertSucceeds(b.commit());
  });
  it('only the Master Admin manages platform lists (super admins, organisers)', async () => {
    await assertSucceeds(setDoc(doc(master(), 'superAdmins/helper@x.test'), {}));
    await assertFails(setDoc(doc(ben(), 'superAdmins/ben@x.test'), {}));
    await assertFails(setDoc(doc(ben(), 'organisers/someone@x.test'), {}));
  });
  it('an unverified account with that email gets nothing', async () => {
    await assertFails(getDoc(doc(ctx('fake', 'toincial@gmail.com', false), 'events/e-ben-draft')));
  });
  it('a super admin the Master Admin added also has full control', async () => {
    await seed((db) => setDoc(doc(db, 'superAdmins/helper@x.test'), {}));
    await assertSucceeds(setDoc(doc(ctx('helper', 'helper@x.test'), 'events/e-ben'), { title: 'Helped' }, { merge: true }));
  });
});
