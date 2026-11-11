'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { deleteMyAccount } from '../lib/account';
import { friendlyError } from '../lib/format';
import { AccountMenu } from '../components/AccountMenu';
import { ProfileCard } from '../components/ProfileCard';
import { DemoBanner, ErrorNote, GlobalNav, Icon, LoadError, Logo, Modal, Spinner, useToast } from '../components/ui';
import type { AppUser } from '../lib/types';
import { useAuth } from '../lib/auth';
import { useCol, useDoc } from '../lib/live';
import { useMode } from '../lib/mode';
import { completion, type PublicProfile } from '../lib/profile';
import type { CertificateDoc, MembershipDoc } from '../lib/types';
import { SavedList } from './Saved';
import { useSwipes } from '../lib/saved';
import { MyPeople, usePings } from '../components/MyPeople';

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

  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /><AccountMenu photo={p?.photo} /></header>
      <main className="dash-main">
        {prof.error ? <LoadError /> : !p ? <Spinner label="Setting up your profile" /> : (
          <ProfileCard p={p}>
            <span className="pid">Profile ID · {p.profileId}</span>
            <div className="row-center">
              <Link className="btn btn-primary btn-sm" href="/profile/edit">Edit profile</Link>
              <button className="btn btn-ghost btn-sm" onClick={share}><Icon name="external" size={16} /> Share</button>
            </div>
            <p className="pcard-vis">{p.visibility === 'public' ? 'Visible to people signed in to Gather. Your email and phone stay private.' : 'Hidden: only you can see this profile.'}</p>
          </ProfileCard>
        )}

        {done && done.percent < 100 && (
          <Link href="/profile/edit" className="complete card">
            <div className="row-between"><b>Profile {done.percent}% complete</b><Icon name="arrow" size={18} /></div>
            <div className="progress-track light"><i style={{ width: `${done.percent}%` }} /></div>
            <small>Add: {done.missing.slice(0, 4).join(', ')}{done.missing.length > 4 ? '…' : ''}</small>
          </Link>
        )}

        <dl className="me-stats wide">
          <div><dt>Events joined</dt><dd>{mine.data.length}</dd></div>
          <div><dt>Saved events</dt><dd>{saved}</dd></div>
          <div><dt>Connected people</dt><dd>{pings.loading ? '…' : pings.people}</dd></div>
          <div><dt>Pending requests</dt><dd>{pings.loading ? '…' : pings.incoming.length}</dd></div>
        </dl>

        <MyPeople user={user} />

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
          <div><b>I’m a speaker</b><small>Turn it on with your event’s speaker code. Same account, no separate login. See feedback on your talks and run Pulse sessions.</small></div>
          <Icon name="mic" size={22} />
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
