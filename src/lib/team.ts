import { useMemo } from 'react';
import { backend } from './backend';
import { useCol } from './live';
import type { AppUser, EventDoc } from './types';

/** Most co-organisers one event can have (also enforced by the security rules). */
export const MAX_TEAM = 15;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const normEmail = (e: string) => e.trim().toLowerCase();

/** Is this person the event's owner (who created it)? Owners manage the team, hand the event over and delete it. */
export const isEventOwner = (e: Pick<EventDoc, 'ownerUid'>, user: AppUser | null) => !!user && e.ownerUid === user.uid;

/** Is this person on the event's team (a co-organiser)? Needs a verified Google email, like the rules. */
export const isOnTeam = (e: Pick<EventDoc, 'teamEmails'>, user: AppUser | null) =>
  !!user?.email && !!user.emailVerified && (e.teamEmails ?? []).includes(normEmail(user.email));

/** Splits a pasted list ("a@x.com, b@y.com" or one per line) into clean, unique emails, and the ones that aren't emails. */
export function parseEmails(text: string) {
  const parts = text.split(/[\s,;]+/).map(normEmail).filter(Boolean);
  const ok = [...new Set(parts.filter((p) => EMAIL.test(p)))];
  const bad = parts.filter((p) => !EMAIL.test(p));
  return { ok, bad };
}

/** Sets the whole team list (owner only). The owner's own email is never kept on the list. */
async function setTeam(ev: EventDoc, emails: string[]) {
  const owner = normEmail(ev.ownerEmail ?? '');
  const list = [...new Set(emails.map(normEmail))].filter((e) => e && e !== owner);
  if (list.length > MAX_TEAM) throw new Error(`An event can have up to ${MAX_TEAM} team members.`);
  await backend.write([{ type: 'set', path: `events/${ev.id}`, merge: true, data: { teamEmails: list } }]);
  return list;
}

export const addToTeam = (ev: EventDoc, emails: string[]) => setTeam(ev, [...(ev.teamEmails ?? []), ...emails]);
export const removeFromTeam = (ev: EventDoc, email: string) => setTeam(ev, (ev.teamEmails ?? []).filter((e) => e !== normEmail(email)));
/** The same people run several events: copy another event's team into this one (added to anyone already there). */
export const copyTeam = (from: EventDoc, to: EventDoc) => setTeam(to, [...(to.teamEmails ?? []), ...(from.teamEmails ?? []), ...(from.ownerEmail ? [from.ownerEmail] : [])]);

/**
 * Every event this person manages: the ones they created plus the ones they're on the team for.
 * The Master Admin sees every event.
 */
export function useManagedEvents(user: AppUser | null, isSuper: boolean) {
  const email = user?.email && user.emailVerified ? normEmail(user.email) : '';
  const own = useCol<EventDoc>(user ? 'events' : null, useMemo<[string, unknown][]>(() => (isSuper ? [] : [['ownerUid', user?.uid]]), [isSuper, user?.uid]));
  const team = useCol<EventDoc>(user && email && !isSuper ? 'events' : null, useMemo<[string, unknown][]>(() => [['teamEmails[]', email]], [email]));
  return useMemo(() => {
    const seen = new Set<string>();
    // Deleted events (soft-deleted, or a permanent delete that didn't finish) show only to super admins.
    const data = [...own.data, ...team.data].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), isSuper || !(e.deleted || e.deleting))));
    return { data, loading: own.loading || (!!email && !isSuper && team.loading), error: own.error };
  }, [own.data, team.data, own.loading, team.loading, own.error, email, isSuper]);
}
