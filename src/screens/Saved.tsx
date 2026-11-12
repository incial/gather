'use client';

import { useMyEvents } from '../lib/myEvents';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { confetti, DemoBanner, Empty, GlobalNav, Icon, Logo, Modal, Spinner, useToast } from '../components/ui';
import { AccountMenu } from '../components/AccountMenu';
import { quickJoin } from '../lib/api';
import { tidySaved, unsave, useSwipes } from '../lib/saved';
import { useAuth } from '../lib/auth';
import { fmtRange, friendlyError } from '../lib/format';
import type { AppUser, EventDoc, SwipeDoc } from '../lib/types';
import { JoinForm } from './event/Landing';

/** Saved events, with poster, date and place, open and unsave. Used on the Profile and Saved pages. */
export function SavedList({ user }: { user: AppUser }) {
  const toast = useToast();
  const swipes = useSwipes(user.uid);
  const mine = useMyEvents(user?.uid);
  const [busy, setBusy] = useState('');
  const [needsForm, setNeedsForm] = useState<EventDoc | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const joined = new Set(mine.data.map((m) => m.id));
  const saved = [...swipes.saved].sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  // Once per session: drop entries whose event was deleted; mark ones that are no longer visible.
  useEffect(() => {
    if (swipes.loading || !swipes.saved.length) return;
    tidySaved(user.uid, swipes.saved).then((r) => setHidden(r.hidden)).catch(() => {});
  }, [swipes.loading, swipes.saved, user.uid]);

  async function join(s: SwipeDoc) {
    setBusy(s.id);
    try {
      const { joined: done, event } = await quickJoin(s.id, user);
      if (done) { confetti(); toast(`You’ve joined ${s.title}`); }
      else if (event) setNeedsForm(event);
      else toast('This event is no longer available.', 'err');
    } catch (x) { toast(friendlyError(x), 'err'); }
    setBusy('');
  }
  async function remove(s: SwipeDoc) {
    setBusy(s.id);
    try { await unsave(s.id, user.uid); toast(`Removed ${s.title} from saved`); }
    catch (x) { toast(friendlyError(x), 'err'); }
    setBusy('');
  }

  if (swipes.loading) return <Spinner />;
  if (swipes.error) return <p className="error">Couldn’t load your saved events. Check your connection and try again.</p>;
  if (!saved.length) return <Empty title="No saved events yet">Tap Save on an event, or swipe right in <Link href="/explore" className="link">Explore</Link>, and it appears here.</Empty>;
  return (
    <>
      <ul className="saved-list">
        {saved.map((s) => {
          const gone = hidden.includes(s.id);
          return (
            <li key={s.id} className={`saved-row a-${s.color}${gone ? ' is-gone' : ''}`}>
              <Link href={`/e/${s.id}`} className="saved-info">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.bannerThumb ? <img className="saved-poster" src={s.bannerThumb} alt="" loading="lazy" /> : <span className="saved-poster saved-poster-blank" aria-hidden="true">{s.title.slice(0, 1)}</span>}
                <span><b>{s.title}</b><small>{gone ? 'No longer available' : `${fmtRange(s.startsAt, s.endsAt)} · ${s.venue}`}</small></span>
              </Link>
              <div className="saved-actions">
                {!gone && (joined.has(s.id)
                  ? <Link className="btn btn-ghost btn-sm" href={`/e/${s.id}`}>Open</Link>
                  : <button className="btn btn-primary btn-sm" disabled={busy === s.id} onClick={() => join(s)}>{busy === s.id ? 'Working…' : 'Join event'}</button>)}
                <button className="icon-btn" aria-label={`Remove ${s.title} from saved`} disabled={busy === s.id} onClick={() => remove(s)}><Icon name="close" size={18} /></button>
              </div>
            </li>
          );
        })}
      </ul>
      {needsForm && (
        <Modal title={`Join ${needsForm.title}`} onClose={() => setNeedsForm(null)}>
          <JoinForm event={needsForm} onDone={() => { setNeedsForm(null); toast(`You’ve joined ${needsForm.title}`); }} />
        </Modal>
      )}
    </>
  );
}

export function Saved() {
  const { user, loading } = useAuth();
  const nav = useRouter();
  useEffect(() => { if (!loading && !user) nav.replace('/login?next=/saved'); }, [loading, user, nav]);
  if (loading || !user) return <div className="center"><Spinner /></div>;
  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /><AccountMenu /></header>
      <main className="dash-main">
        <h1 className="hello">Saved events</h1>
        <SavedList user={user} />
      </main>
      <GlobalNav />
    </div>
  );
}
