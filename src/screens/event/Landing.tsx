'use client';

import { TypeChip, TypeDetails } from '../../components/EventTypeInfo';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Avatar, confetti, DemoBanner, ErrorNote, Field, Logo, Spinner } from '../../components/ui';
import { getMyProfile, getPrereg, joinEvent, type Profile } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { backend } from '../../lib/backend';
import type { PublicProfile } from '../../lib/profile';
import { fmtRange, fmtTime, friendlyError } from '../../lib/format';
import type { EventDoc, PreregDoc } from '../../lib/types';
import { EventBanner, EventVideo } from '../../components/EventMedia';
import { SaveEventButton } from '../../components/SaveEventButton';

export function Landing({ event }: { event: EventDoc }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const next = encodeURIComponent(pathname + (search ? `?${search}` : ''));
  return (
    <div className="landing">
      <DemoBanner />
      <header className="top"><Logo /></header>
      <EventBanner event={event} className="landing-banner" />
      <section className="ticket">
        <div className="ticket-main">
          <span className="kicker">{event.organiser}</span>
          <TypeChip event={event} />
          <h1>{event.title}</h1>
          <p className="ticket-tag">{event.tagline}</p>
          <dl className="ticket-facts">
            <div><dt>When</dt><dd>{fmtRange(event.startsAt, event.endsAt)}<small>{fmtTime(event.startsAt)}</small></dd></div>
            <div><dt>Where</dt><dd>{event.venue}</dd></div>
          </dl>
        </div>
        <div className="ticket-stub"><span>JOIN</span></div>
      </section>

      <section className="landing-body">
        {user && <div className="landing-save"><SaveEventButton event={event} /></div>}
        {event.description && <p className="lede">{event.description}</p>}
        <TypeDetails event={event} />
        <EventVideo url={event.videoUrl} title={event.title} />
        {event.lineup.length > 0 && <>
          <h2>Speakers</h2>
          <div className="lineup">
            {event.lineup.map((s) => (
              <div key={s.id} className="lineup-item">
                <Avatar id={s.id} name={s.name} photo={s.photo} size={72} />
                <b>{s.name}</b><small>{s.role}</small>
              </div>
            ))}
          </div>
        </>}
        {user
          ? <JoinForm event={event} />
          : <div className="join-cta">
              <Link className="btn btn-primary btn-block" href={`/login?next=${next}`}>
                Log in with Google to join
              </Link>
            </div>}
      </section>
    </div>
  );
}

export function JoinForm({ event, onDone }: { event: EventDoc; onDone?: () => void }) {
  const { user } = useAuth();
  const [prereg, setPrereg] = useState<PreregDoc | null | undefined>(undefined);
  const [form, setForm] = useState<Profile>({ name: user!.name, phone: '', institution: '', department: '', designation: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [listed, setListed] = useState(true);

  useEffect(() => {
    getPrereg(event.id, user!.email).then((p) => {
      setPrereg(p);
      if (p) setForm({ name: p.name || user!.name, phone: p.phone, institution: p.institution, department: p.department, designation: p.designation });
      else Promise.all([getMyProfile(user!.uid), backend.getDoc<PublicProfile>(`profiles/${user!.uid}`)]).then(([m, pub]) => {
        // Fill in from earlier registrations first, then from the person's profile.
        setForm({
          name: m?.name || pub?.name || user!.name, phone: m?.phone ?? '',
          institution: m?.institution || pub?.organisation || '', department: m?.department ?? '',
          designation: m?.designation || pub?.designation || '', shareContact: m?.shareContact ?? false,
        });
      }).catch(() => {});
    }).catch(() => setPrereg(null));
  }, [event.id, user]);

  if (prereg === undefined) return <Spinner />;
  if (!prereg && event.registration === 'invite') {
    return (
      <div className="notice">
        <strong>{user!.email} isn’t on the list</strong>
        <p>This event is invite-only. Sign in with the email you registered with, or ask the organiser to add you.</p>
      </div>
    );
  }

  const set = (k: keyof Profile) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await joinEvent(event, user!, form, prereg ? 'list' : 'app', listed);
      confetti();
      onDone?.();
    } catch (x) { setErr(friendlyError(x)); setBusy(false); }
  }
  return (
    <form className="join-form stack" onSubmit={submit}>
      <h2>{prereg ? 'You’re on the list' : 'Join this event'}</h2>
      {prereg && <p className="muted">Check your details and you’re in.</p>}
      <Field label="Full name"><input required value={form.name} onChange={set('name')} autoComplete="name" /></Field>
      <Field label="Phone"><input required type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
      <Field label="Institution"><input required value={form.institution} onChange={set('institution')} autoComplete="organization" /></Field>
      <div className="two">
        <Field label="Department"><input value={form.department} onChange={set('department')} /></Field>
        <Field label="Designation"><input value={form.designation} onChange={set('designation')} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} /><span><b>Show me in People</b><small>Other attendees see your name, role and institution.</small></span></label>
      <label className={`check${listed ? '' : ' check-off'}`}><input type="checkbox" disabled={!listed} checked={listed && !!form.shareContact} onChange={(e) => setForm({ ...form, shareContact: e.target.checked })} /><span><b>Share my contact details with other attendees</b><small>{listed ? 'Other attendees see your email and phone on your People card. Off: they stay private (you still see them in your pass).' : 'Turn on “Show me in People” first.'}</small></span></label>
      <ErrorNote text={err} />
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Joining…' : 'Join event'}</button>
    </form>
  );
}
