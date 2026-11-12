import { readFileSync } from 'node:fs';
import { assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Deleting an event as an organiser removes everything about it, exactly as the app does. */
let env: RulesTestEnvironment;
const E = 'events/e1';
const org = () => env.authenticatedContext('org', { email: 'boss@org.test', email_verified: true }).firestore();
type Db = ReturnType<typeof org>;
const SUBS = ['sessions', 'speakers', 'sessionKeys', 'preregistered', 'attendees', 'directory', 'private', 'attendance', 'feedback', 'connections', 'saved', 'sessionFeedback', 'assets', 'assetFiles', 'certIndex', 'media', 'roles', 'speakerFeedback', 'speakerFeedbackOwners', 'counters', 'announcements', 'checkinLog', 'speakerTries'];

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-delete',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'organisers/boss@org.test'), {});
    await setDoc(doc(db, E), { published: true, registration: 'open', title: 'E', joinCode: '123456' });
    for (const s of SUBS) await setDoc(doc(db, `${E}/${s}/x1`), { uid: 'asha', eventId: 'e1', sessionId: 's1', a: 1 });
    await setDoc(doc(db, `${E}/attendees/asha`), { uid: 'asha', email: 'asha@x.test', name: 'Asha' });
    await setDoc(doc(db, `${E}/saved/asha`), { uid: 'asha' });
    await setDoc(doc(db, 'users/asha/events/e1'), { title: 'E' });
    await setDoc(doc(db, 'users/asha/speaking/e1'), { eventId: 'e1' });
    await setDoc(doc(db, 'users/asha/swipes/e1'), { choice: 'save' });
    await setDoc(doc(db, 'speakerCodes/ABCDE23456'), { eventId: 'e1' });
    await setDoc(doc(db, 'speakerPins/e1'), { pin: '1234', revoked: false, expiresAt: Timestamp.now(), eventTitle: 'E' });
    await setDoc(doc(db, 'pings/e1_asha_ben'), { eventId: 'e1', fromUid: 'asha', toUid: 'ben' });
    await setDoc(doc(db, 'users/ben/notifications/e1_asha_ben'), { eventId: 'e1', type: 'ping', fromUid: 'asha' });
    await setDoc(doc(db, 'users/asha/notifications/e1_asha_ben_ok'), { eventId: 'e1', type: 'accepted', fromUid: 'ben' });
    await setDoc(doc(db, 'users/ben/notifications/other'), { eventId: 'e2', type: 'ping', fromUid: 'zed' });
    await setDoc(doc(db, 'certificates/c1'), { eventId: 'e1', uid: 'asha' });
  });
});

describe('deleting an event', () => {
  it('every step the app takes is allowed for an organiser, and nothing is left behind', async () => {
    const db = org();
    const step = async (name: string, p: Promise<unknown>) => { try { return await assertSucceeds(p); } catch (e) { throw new Error(`Refused at: ${name}`); } };
    await step('mark deleting', setDoc(doc(db, E), { deleting: true }, { merge: true }));
    const paths: string[] = ['speakerPins/e1'];
    const joined = await step('list attendees', getDocs(collection(db, `${E}/attendees`))) as Awaited<ReturnType<typeof getDocs>>;
    await step('list saved', getDocs(collection(db, `${E}/saved`)));
    for (const a of joined.docs) paths.push(`users/${a.id}/events/e1`, `users/${a.id}/speaking/e1`, `users/${a.id}/swipes/e1`);
    const codes = await step('list speaker codes', getDocs(query(collection(db, 'speakerCodes'), where('eventId', '==', 'e1')))) as Awaited<ReturnType<typeof getDocs>>;
    paths.push(...codes.docs.map((d) => `speakerCodes/${d.id}`));
    const pings = await step('list pings', getDocs(query(collection(db, 'pings'), where('eventId', '==', 'e1')))) as Awaited<ReturnType<typeof getDocs>>;
    paths.push(...pings.docs.map((d) => `pings/${d.id}`));
    for (const s of SUBS) {
      const docs = await step(`list ${s}`, getDocs(collection(db, `${E}/${s}`))) as Awaited<ReturnType<typeof getDocs>>;
      paths.push(...docs.docs.map((d) => `${E}/${s}/${d.id}`));
    }
    const certs = await step('list certificates', getDocs(query(collection(db, 'certificates'), where('eventId', '==', 'e1')))) as Awaited<ReturnType<typeof getDocs>>;
    paths.push(...certs.docs.map((d) => `certificates/${d.id}`));
    paths.push(E);
    // One delete at a time first, to name any refused path.
    for (const p of paths.slice(0, -1)) await step(`delete ${p}`, writeBatch(db).delete(doc(db, p)).commit());
    await step('delete event', writeBatch(db).delete(doc(db, E)).commit());
    await seed(async (raw) => {
      expect((await getDoc(doc(raw, E))).exists()).toBe(false);
      expect((await getDoc(doc(raw, 'users/asha/events/e1'))).exists()).toBe(false);
      expect((await getDoc(doc(raw, 'pings/e1_asha_ben'))).exists()).toBe(false);
    });
  });
  it('also works as one batched delete, the way the app sends it', async () => {
    const db = org();
    await assertSucceeds(setDoc(doc(db, E), { deleting: true }, { merge: true }));
    const b = writeBatch(db);
    for (const s of SUBS) b.delete(doc(db, `${E}/${s}/x1`));
    for (const p of ['users/ben/notifications/e1_asha_ben', 'users/asha/notifications/e1_asha_ben_ok', 'users/asha/events/e1', 'users/asha/speaking/e1', 'users/asha/swipes/e1', 'speakerCodes/ABCDE23456', 'speakerPins/e1', 'pings/e1_asha_ben', 'certificates/c1', `${E}/attendees/asha`, `${E}/saved/asha`, E]) b.delete(doc(db, p));
    await assertSucceeds(b.commit());
  });
  it('notifications can only be removed for an event that is being deleted', async () => {
    const db = org();
    const { assertFails } = await import('@firebase/rules-unit-testing');
    await assertFails(writeBatch(db).delete(doc(db, 'users/ben/notifications/e1_asha_ben')).commit());
    await assertFails(writeBatch(db).delete(doc(db, 'users/ben/notifications/other')).commit());
    await assertSucceeds(setDoc(doc(db, E), { deleting: true }, { merge: true }));
    await assertSucceeds(writeBatch(db).delete(doc(db, 'users/ben/notifications/e1_asha_ben')).commit());
  });
});
