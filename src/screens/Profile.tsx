'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { deleteMyAccount } from '../lib/account';
import { friendlyError } from '../lib/format';
import { AccountMenu } from '../components/AccountMenu';
import { ProfileDetails, ProfileHero } from '../components/ProfileCard';
import { CountUp, PeopleStack, Reveal } from '../components/Fun';
import { DemoBanner, ErrorNote, GlobalNav, Icon, LoadError, Logo, Modal, Spinner, useToast } from '../components/ui';
import type { AppUser } from '../lib/types';
import { useAuth } from '../lib/auth';
import { useCol, useDoc } from '../lib/live';
import { useMode } from '../lib/mode';
import { completion, ensureProfile, type PublicProfile } from '../lib/profile';
import { ensureUsername } from '../lib/username';
import type { CertificateDoc, MembershipDoc } from '../lib/types';
import { SavedList } from './Saved';
import { useSwipes } from '../lib/saved';
import { usePings } from '../components/MyPeople';

export function Profile() {
  const { user, loading } = useAuth();
  const { mode, setMode, canOrganise } = useMode();
  const nav = useRouter();
  const toast = useToast();
  const prof = useDoc<PublicProfile>(user ? `profiles/${user.uid}` : null);
  const me = useDoc<{ phone?: string }>(user ? `users/${user.uid}/profile/me` : null);
  const mine = useCol<MembershipDoc>(user ? `users/${user.uid}/events` : null);
  const swipes = useSwipes(user?.uid);
  const pings = usePings(user?.uid);
  const certs = useCol<CertificateDoc>(user ? 'certificates' : null, user ? [['uid', user.uid]] : []);
  useEffect(() => { if (!loading && !user) nav.replace('/login?next=/profile'); }, [loading, user, nav]);
  // If the profile record is missing (first visit on a new device, or it was removed), create it instead of waiting.
  useEffect(() => { if (user && !prof.loading && !prof.error && !prof.data) ensureProfile(user).catch(() => {}); }, [user, prof.loading, prof.error, prof.data]);
  // Older profiles get a username the first time they're opened.
  const needsName = !!prof.data && !prof.data.username;
  useEffect(() => { if (user && needsName && prof.data) ensureUsername(user, prof.data).catch(() => {}); }, [user, needsName, prof.data]);
  if (loading || !user) return <div className="center"><Spinner /></div>;

  const p = prof.data;
  const done = p ? completion(p, me.data?.phone ?? '') : null;
  const saved = swipes.saved.length;
  const share = async () => {
    if (!p) return;
    const url = `${location.origin}/p/${p.profileId}`;
    if (p.visibility === 'private') { toast('Your profile is hidden. Make it visible in Edit profile to share it.', 'err'); return; }
    try {
      if (navigator.share) await navigator.share({ title: `${p.name} on Gather`, url });
      else { await navigator.clipboard.writeText(url); toast('Profile link copied'); }
    } catch { /* closed the share sheet */ }
  };

  const activity = { events: mine.data.length, saved, people: pings.people, certificates: certs.data.length, profile: done?.percent ?? 0 };
  const friends = pings.connections.map((x) => (x.fromUid === user.uid
    ? { uid: x.toUid, name: x.toName, photo: x.toPhoto || undefined, sub: x.eventTitle }
    : { uid: x.fromUid, name: x.fromName, photo: x.fromPhoto || undefined, sub: x.eventTitle }))
    .filter((f, i, all) => all.findIndex((g) => g.uid === f.uid) === i);
  const tiles = [
    { label: 'Events joined', n: activity.events, emoji: '🎟️', tone: 'lime', href: '/' },
    { label: 'Saved events', n: saved, emoji: '🔖', tone: 'pink', href: '#saved' },
    { label: 'Connected people', n: pings.people, emoji: '🤝', tone: 'violet', href: '/people' },
    { label: 'Pending requests', n: pings.incoming.length, emoji: '📬', tone: 'sun', href: '/people?tab=incoming' },
  ];

  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /><AccountMenu photo={p?.photo} /></header>
      <main className="dash-main fun">
        {prof.error ? <LoadError /> : !p ? <Spinner label="Setting up your profile" /> : (
          <ProfileHero p={p}>
            <div className="ph-actions">
              <Link className="btn btn-ink" href="/profile/edit">Edit profile</Link>
              <button className="btn btn-outline" onClick={share}><Icon name="external" size={16} /> Share</button>
            </div>
            <p className="ph-vis"><span className="ph-id">ID · {p.profileId}</span> {p.visibility === 'public' ? 'Visible to people signed in to Gather. Email and phone stay private.' : 'Hidden: only you can see this profile.'}</p>
          </ProfileHero>
        )}

        {done && done.percent < 100 && (
          <Reveal as={Link} href="/profile/edit" className="pnudge">
            <span className="pnudge-emoji" aria-hidden="true">🚀</span>
            <span className="grow">
              <b>Your profile is {done.percent}% done</b>
              <small>Add {done.missing.slice(0, 3).join(', ').toLowerCase()}{done.missing.length > 3 ? ' and more' : ''}</small>
              <span className="pbar"><i style={{ width: `${done.percent}%` }} /></span>
            </span>
            <Icon name="arrow" size={18} />
          </Reveal>
        )}

        <div className="sbento">
          {tiles.map((t, i) => (
            <Reveal key={t.label} as={Link} href={t.href} delay={i * 70} className={`sbento-tile t-${t.tone}`}>
              <span className="sbento-emoji" aria-hidden="true">{t.emoji}</span>
              <b className="sbento-n">{pings.loading && i > 1 ? '…' : <CountUp value={t.n} />}</b>
              <span className="sbento-label">{t.label}</span>
            </Reveal>
          ))}
        </div>

        <Reveal as="section" className="people-peek">
          <div className="row-between">
            <div><small>My people</small><h2>{pings.people ? `${pings.people} ${pings.people === 1 ? 'connection' : 'connections'}` : 'No connections yet'}</h2></div>
            <Link className="btn btn-white btn-sm" href="/people">See all <Icon name="arrow" size={16} /></Link>
          </div>
          {friends.length ? <PeopleStack people={friends} /> : <p className="people-peek-empty">Open an event, go to People and send a Meet Ping. 👋</p>}
          {pings.incoming.length > 0 && <Link href="/people?tab=incoming" className="people-peek-req"><span aria-hidden="true">📬</span>{pings.incoming.length} {pings.incoming.length === 1 ? 'request is' : 'requests are'} waiting for you</Link>}
        </Reveal>

        {p && <ProfileDetails p={p} />}

        {canOrganise && (
          <section className="mode-card card">
            <div>
              <b>{mode === 'organiser' ? 'You’re in organiser mode' : 'You’re in attendee mode'}</b>
              <small>Same account for both. Switch any time.</small>
            </div>
            {mode === 'organiser'
              ? <button className="btn btn-ghost btn-sm" onClick={() => { setMode('attendee'); nav.push('/'); }}>Switch to Attendee</button>
              : <button className="btn btn-ink btn-sm" onClick={() => { setMode('organiser'); nav.push('/admin'); }}><Icon name="shield" size={16} /> Switch to Organiser</button>}
          </section>
        )}

        <Link href="/speaker" className="mode-card card speaker-entry">
          <div className="grow"><b className="with-emoji"><span aria-hidden="true">🎤</span> I’m a speaker</b><small>Turn it on with your event’s speaker code. Same account, no separate login. See feedback on your talks and run Pulse sessions.</small></div>
          <Icon name="arrow" size={20} />
        </Link>

        {certs.data.length > 0 && <>
          <h2>My certificates</h2>
          <ul className="saved-list">
            {certs.data.map((c) => (
              <li key={c.id} className="saved-row">
                <Link href={`/e/${c.eventId}/assets`} className="saved-info">
                  <span className="cert-icon"><Icon name="verified" size={22} /></span>
                  <span><b>{c.eventTitle}</b><small>{c.title} · {c.dates}</small></span>
                </Link>
                <Link className="btn btn-ghost btn-sm" href={`/verify/${c.id}`}>Verify</Link>
              </li>
            ))}
          </ul>
        </>}

        <h2 id="saved">Saved events</h2>
        <SavedList user={user} />

        <DeleteAccount user={user} />
      </main>
      <GlobalNav />
    </div>
  );
}

function DeleteAccount({ user }: { user: AppUser }) {
  const nav = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  async function go() {
    setErr('');
    try { await deleteMyAccount(user, setStep); nav.replace('/?deleted=1'); }
    catch (x) { setErr(/popup|cancel/i.test(String(x)) ? 'Google sign-in was closed, so the account wasn’t deleted. Your profile data was removed; try again to finish.' : friendlyError(x)); setStep(''); }
  }
  return (
    <section className="danger-zone card">
      <div>
        <b>Delete my profile and account</b>
        <small>Removes your profile, your saved events and your Pulse activities, and closes your Gather account.</small>
      </div>
      <button className="btn btn-ghost btn-sm danger" onClick={() => setOpen(true)}>Delete account</button>
      {open && (
        <Modal title="Delete your account?" onClose={() => { if (!step) setOpen(false); }}>
          <div className="stack">
            <p>This permanently deletes:</p>
            <ul className="plain-bullets">
              <li>Your public profile and private details (phone)</li>
              <li>Your entry in each event’s People list, and your saved events</li>
              <li>Presentations and surveys you created in Gather Pulse, with their responses</li>
              <li>Your Gather sign-in ({user.email})</li>
            </ul>
            <p className="muted">Attendance, feedback and certificates stay in the organisers’ event records. Ask an organiser if you want those removed too.</p>
            <label className="field"><span className="field-label">Type DELETE to confirm</span><input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
            <ErrorNote text={err} />
            <button className="btn btn-primary btn-block danger-btn" disabled={typed !== 'DELETE' || !!step} onClick={go}>{step || 'Delete everything'}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
