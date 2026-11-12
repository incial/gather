import { backend, type WriteOp } from './backend';
import { deletePulse } from './pulse/api';
import type { PulseDoc } from './pulse/types';
import type { AppUser } from './types';

/**
 * Deletes a person's profile and account: public and private profile, the People-list
 * entries and Explore saves in each event, their Pulse presentations and surveys, and
 * finally the Google sign-in for Gather. Attendance, feedback and certificates stay with
 * the organisers' event records, as the organisers' own data.
 */
export async function deleteMyAccount(user: AppUser, onStep?: (s: string) => void) {
  const uid = user.uid;
  const ops: WriteOp[] = [];
  onStep?.('Finding your data…');
  const [events, swipes, pulses] = await Promise.all([
    backend.getCol<{ id: string }>(`users/${uid}/events`).catch(() => []),
    backend.getCol<{ id: string }>(`users/${uid}/swipes`).catch(() => []),
    backend.getCol<PulseDoc>('pulse', [['ownerUid', uid]]).catch(() => []),
  ]);
  for (const e of events) ops.push({ type: 'delete', path: `events/${e.id}/directory/${uid}` });
  for (const s of swipes) ops.push({ type: 'delete', path: `events/${s.id}/saved/${uid}` }, { type: 'delete', path: `users/${uid}/swipes/${s.id}` });
  for (const e of events) ops.push({ type: 'delete', path: `users/${uid}/events/${e.id}` });
  const prof = await backend.getDoc<{ username?: string }>(`profiles/${uid}`).catch(() => null);
  ops.push({ type: 'delete', path: `users/${uid}/profile/me` }, { type: 'delete', path: `users/${uid}` });
  if (!prof?.username) ops.push({ type: 'delete', path: `profiles/${uid}` });

  onStep?.('Removing your Pulse activities…');
  for (const p of pulses) await deletePulse(p);
  onStep?.('Removing your profile…');
  // One by one, so an entry that is already gone doesn't stop the rest.
  for (let i = 0; i < ops.length; i += 20) await Promise.all(ops.slice(i, i + 20).map((op) => backend.write([op]).catch(() => {})));
  // The profile and its username go together, so the username is free for someone else afterwards.
  if (prof?.username) await backend.write([{ type: 'delete', path: `profiles/${uid}` }, { type: 'delete', path: `usernames/${prof.username}` }]).catch(() => {});
  try { localStorage.removeItem(`gather-synced-${uid}`); } catch { /* fine */ }
  onStep?.('Closing your account…');
  await backend.deleteAccount();
}
