import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Organiser assignment ("Make speaker"), the third way to become a speaker beside the pre-registered email and
 * the four-digit code. Same account, same records, no duplicates.
 */
let env: RulesTestEnvironment;
const ctx = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const org = () => ctx('own', 'owner@x.test');
const other = () => ctx('ben', 'ben@x.test');          // another organiser, not this event's
const asha = () => ctx('asha', 'asha@x.test');         // registered attendee
type Db = ReturnType<typeof org>;
const E = 'events/e1';
const role = (uid: string, speakerId: string, extra = {}) => ({ uid, name: 'Asha', email: `${uid}@x.test`, roles: ['speaker'], speakerId, status: 'verified', active: true, pulse: true, code: 'ORGANISER', at: serverTimestamp(), ...extra });

/** What promoteToSpeaker writes: the speaker entry linked to them, their role, and the public lineup. */
function promote(db: Db, uid: string, sid: string, opts: { speakerUid?: string; roleExtra?: object } = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `${E}/speakers/${sid}`), { name: 'Asha', role: '', organisation: '', uid: opts.speakerUid ?? uid, emailLower: `${uid}@x.test`, category: 'regular', order: 1_000_000 }, { merge: true });
  b.set(doc(db, `${E}/roles/${uid}`), role(uid, sid, opts.roleExtra));
  b.set(doc(db, E), { lineup: [{ id: sid, name: 'Asha', role: '' }] }, { merge: true });
  return b.commit();
}

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-promote',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, E), { ownerUid: 'own', published: true, registration: 'open', title: 'E', lineup: [] });
    await setDoc(doc(db, `${E}/attendees/asha`), { uid: 'asha', email: 'asha@x.test', name: 'Asha', joinedAt: 't', source: 'app' });
  });
});

describe('organiser makes an attendee a speaker', () => {
  it('works for someone registered at the event, and they are a speaker straight away', async () => {
    await assertSucceeds(promote(org(), 'asha', 'sp-new'));
    // Their own app can read the role (speaker access) and mirror it into their Speaker area.
    await assertSucceeds(getDoc(doc(asha(), `${E}/roles/asha`)));
    await assertSucceeds(setDoc(doc(asha(), 'users/asha/speaking/e1'), { eventId: 'e1', speakerId: 'sp-new', speakerName: 'Asha', eventTitle: 'E', startsAt: 't', pulse: true }));
  });
  it('reuses a pre-registered email entry instead of making a duplicate', async () => {
    await seed((db) => setDoc(doc(db, `${E}/speakers/sp-listed`), { name: 'Dr Asha', email: 'asha@x.test', emailLower: 'asha@x.test', uid: '' }));
    await assertSucceeds(promote(org(), 'asha', 'sp-listed'));
  });
  it('can re-activate someone an organiser removed earlier', async () => {
    await seed((db) => setDoc(doc(db, `${E}/roles/asha`), { uid: 'asha', speakerId: 'sp-old', active: false, roles: ['speaker'], status: 'verified', code: 'PIN', pulse: true }));
    await assertSucceeds(promote(org(), 'asha', 'sp-old'));
  });
  it('not for someone who isn’t registered at the event', async () => {
    await assertFails(promote(org(), 'stranger', 'sp-x'));
  });
  it('not by anyone other than this event’s organiser', async () => {
    await assertFails(promote(other(), 'asha', 'sp-x'));
    await assertFails(promote(asha(), 'asha', 'sp-x'));
  });
  it('the role must point to a speaker entry linked to that same person', async () => {
    await assertFails(promote(org(), 'asha', 'sp-x', { speakerUid: 'someone-else' }));
  });
  it('only as an organiser assignment (it can’t pretend to be the code or email way)', async () => {
    await assertFails(promote(org(), 'asha', 'sp-x', { roleExtra: { code: 'PIN' } }));
    await assertFails(promote(org(), 'asha', 'sp-x', { roleExtra: { code: 'EMAIL' } }));
  });
});
