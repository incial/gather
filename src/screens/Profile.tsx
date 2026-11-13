'use client';

import { useMyEvents } from '../lib/myEvents';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { deleteMyAccount } from '../lib/account';
import { friendlyError } from '../lib/format';
import { AccountMenu } from '../components/AccountMenu';
import { ProfileDetails } from '../components/ProfileCard';
import { BadgeCheck, Bookmark, CalendarDays, ChevronRight, Globe, Inbox, Lock, MapPin, Mic, Pencil, Share2, Users } from 'lucide-react';
import { Avatar, DemoBanner, ErrorNote, GlobalNav, LoadError, Logo, Modal, Spinner, useToast } from '../components/ui';
import type { AppUser } from '../lib/types';
import { useAuth } from '../lib/auth';
import { useCol, useDoc } from '../lib/live';
import { useMode } from '../lib/mode';
import { completion, ensureProfile, type PublicProfile } from '../lib/profile';
import { ensureUsername } from '../lib/username';
import type { CertificateDoc } from '../lib/types';
import { useSwipes } from '../lib/saved';
import { usePings } from '../components/MyPeople';
import { RoleToggle } from '../components/RoleToggle';

export function Profile() {
  const { user, loading } = useAuth();
  const { canOrganise } = useMode();
  const nav = useRouter();
  const toast = useToast();
  const prof = useDoc<PublicProfile>(user ? `profiles/${user.uid}` : null);
  const me = useDoc<{ phone?: string }>(user ? `users/${user.uid}/profile/me` : null);
  const mine = useMyEvents(user?.uid);
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

  const stats = [
    { label: 'Events', n: mine.data.length, href: '/', icon: CalendarDays },
    { label: 'Saved', n: saved, href: '/saved', icon: Bookmark },
    { label: 'Connections', n: pings.people, href: '/people', icon: Users },
    { label: 'Requests', n: pings.incoming.length, href: '/people?tab=incoming', icon: Inbox },
  ];
  const line = p ? [p.designation, p.organisation].filter(Boolean).join(' · ') : '';

  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /><AccountMenu photo={p?.photo} /></header>
      <main className="dash-main prof">
        {prof.error ? <LoadError /> : !p ? <Spinner label="Setting up your profile" /> : (
          <section className="prof-id" aria-label="Your profile">
            <Avatar id={user.uid} name={p.name} photo={p.photo || undefined} size={88} />
            <div className="prof-who">
              <h1>{p.name}</h1>
              {p.username && <p className="prof-handle">@{p.username}</p>}
              {p.headline && <p className="prof-headline">{p.headline}</p>}
              {line && <p className="muted">{line}</p>}
              {p.location && <p className="muted prof-meta"><MapPin size={14} aria-hidden="true" /> {p.location}</p>}
            </div>
            <div className="prof-actions">
              <Link className="btn btn-ink btn-sm" href="/profile/edit"><Pencil size={15} /> Edit profile</Link>
              <button className="btn btn-ghost btn-sm" onClick={share}><Share2 size={15} /> Share</button>
            </div>
            <p className="prof-vis muted">
              {p.visibility === 'public' ? <Globe size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}
              {p.visibility === 'public' ? ' Visible to people on Gather. Email and phone stay private.' : ' Hidden: only you can see this profile.'}
              <span className="prof-id-code">ID {p.profileId}</span>
            </p>
          </section>
        )}

        {done && done.percent < 100 && (
          <Link href="/profile/edit" className="prof-complete">
            <div className="row-between"><b>Profile {done.percent}% complete</b><span className="muted small">Add {done.missing.slice(0, 2).join(', ').toLowerCase()}{done.missing.length > 2 ? '…' : ''}</span></div>
            <span className="prof-bar"><i style={{ width: `${done.percent}%` }} /></span>
          </Link>
        )}

        <dl className="prof-stats">
          {stats.map((st) => (
            <Link key={st.label} href={st.href}>
              <st.icon size={18} aria-hidden="true" />
              <dd>{pings.loading && (st.label === 'Connections' || st.label === 'Requests') ? '…' : st.n}</dd>
              <dt>{st.label}</dt>
            </Link>
          ))}
        </dl>

        <nav className="prof-list" aria-label="Your Gather">
          <Link href="/people"><Users size={19} aria-hidden="true" /><span className="grow"><b>My people</b><small>Connections and Meet Ping requests</small></span>{pings.incoming.length > 0 && <span className="count-badge">{pings.incoming.length}</span>}<ChevronRight size={18} aria-hidden="true" /></Link>
          <Link href="/saved"><Bookmark size={19} aria-hidden="true" /><span className="grow"><b>Saved events</b><small>{saved ? `${saved} saved` : 'Events you saved in Explore'}</small></span><ChevronRight size={18} aria-hidden="true" /></Link>
          <Link href="/speaker"><Mic size={19} aria-hidden="true" /><span className="grow"><b>Speaker area</b><small>Enter your event’s speaker code, see feedback, run Pulse</small></span><ChevronRight size={18} aria-hidden="true" /></Link>
          {certs.data.map((c) => (
            <Link key={c.id} href={`/verify/${c.id}`}><BadgeCheck size={19} aria-hidden="true" /><span className="grow"><b>{c.eventTitle}</b><small>Certificate · {c.title}</small></span><ChevronRight size={18} aria-hidden="true" /></Link>
          ))}
        </nav>

        {canOrganise && <section className="prof-mode"><RoleToggle /></section>}

        {p && <ProfileDetails p={p} />}

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
    <section className="prof-danger">
      <div><b>Delete account</b><small>Removes your profile, saved events and Pulse activities, and closes your Gather account.</small></div>
      <button className="btn btn-ghost btn-sm danger" onClick={() => setOpen(true)}>Delete</button>
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
