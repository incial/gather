import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/** Deleting a Pulse session (and everything in it), exactly as the app does. */
let env: RulesTestEnvironment;
const ctx = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const owner = () => ctx('owner', 'own@x.test');
const org = () => ctx('org', 'boss@org.test');
const other = () => ctx('ben', 'ben@x.test');
type Db = ReturnType<typeof owner>;
const SUBS = ['responses', 'qa', 'submissions', 'starts', 'live', 'private', 'vault', 'counter'];
const pulse = (extra = {}) => ({ kind: 'presentation', title: 'T', ownerUid: 'owner', eventId: '', eventTitle: '', status: 'closed', code: 'ABC234', access: 'public', slides: [], ...extra });

async function seed(fn: (db: Db) => Promise<unknown>) {
  await env.withSecurityRulesDisabled((c) => fn(c.firestore() as never) as Promise<void>);
}
/** What deletePulse does: list each part (skipping any it can't list), then delete it all in one batch. */
async function deleteLikeApp(db: Db, pid: string, code: string) {
  const paths: string[] = [];
  for (const s of SUBS) {
    try { (await getDocs(collection(db, `pulse/${pid}/${s}`))).docs.forEach((d) => paths.push(`pulse/${pid}/${s}/${d.id}`)); } catch { /* skipped like the app */ }
  }
  const b = writeBatch(db);
  for (const p of paths) b.delete(doc(db, p));
  b.delete(doc(db, `pulseCodes/${code}`));
  b.delete(doc(db, `pulse/${pid}`));
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gather-delpulse',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'organisers/boss@org.test'), {});
    await setDoc(doc(db, 'events/e1'), { ownerUid: 'org', published: true, title: 'E' });
    for (const [pid, extra] of [['p1', {}], ['p2', { eventId: 'e1', code: 'EVT234' }], ['p3', { code: 'NOCODE' }]] as const) {
      await setDoc(doc(db, `pulse/${pid}`), pulse(extra));
      for (const s of SUBS) await setDoc(doc(db, `pulse/${pid}/${s}/x1`), { uid: 'ben', slideId: 'q1', hidden: false, n: 1 });
    }
    await setDoc(doc(db, 'pulseCodes/ABC234'), { pid: 'p1', ownerUid: 'owner' });
    await setDoc(doc(db, 'pulseCodes/EVT234'), { pid: 'p2', ownerUid: 'owner' });
    // p3's code record is missing (older or half-created sessions).
  });
});

describe('deleting Pulse sessions', () => {
  it('the owner can delete their session and everything in it', async () => {
    await assertSucceeds(deleteLikeApp(owner(), 'p1', 'ABC234'));
  });
  it('even when its join-code record is missing', async () => {
    await assertSucceeds(deleteLikeApp(owner(), 'p3', 'NOCODE'));
  });
  it('an organiser can delete an event’s session made by someone else (also when deleting the event)', async () => {
    await assertSucceeds(deleteLikeApp(org(), 'p2', 'EVT234'));
  });
  it('nobody else can delete it', async () => {
    await assertFails(deleteLikeApp(other(), 'p1', 'ABC234'));
  });
});
