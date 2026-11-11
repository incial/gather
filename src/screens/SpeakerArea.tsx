'use client';

import { BarChart3, ClipboardList, Flag, Pencil, Play, Presentation, Star, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AccountMenu } from '../components/AccountMenu';
import { Avatar, confetti, DemoBanner, Empty, ErrorNote, GlobalNav, Logo, Spinner, StarRow, useToast } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtDateTime, friendlyError } from '../lib/format';
import { useCol, useDoc } from '../lib/live';
import type { PulseDoc } from '../lib/pulse/types';
import { becomeSpeaker, checkSpeakerCode, cleanCode, feedbackStats, saveMySpeakerProfile, setFeedbackStatus, showCode, type CodeCheck, type OwnSpeakerProfile } from '../lib/speakers';
import { backend } from '../lib/backend';
import type { PublicProfile } from '../lib/profile';
import type { SpeakerDoc, SpeakerFeedbackDoc, SpeakingDoc } from '../lib/types';
import { STATUS_LABEL } from './pulse/PulseHome';

/** /speaker: activate with a code, then see feedback and Pulse sessions for each event you speak at. */
export function SpeakerArea() {
  const { user, loading } = useAuth();
  const nav = useRouter();
  useEffect(() => { if (!loading && !user) nav.replace('/login?next=/speaker'); }, [loading, user, nav]);
  const speaking = useCol<SpeakingDoc>(user ? `users/${user.uid}/speaking` : null);
  if (loading || !user) return <div className="center"><Spinner /></div>;
  const list = [...speaking.data].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return (
    <div className="dash">
      <DemoBanner />
      <header className="top"><Logo /><AccountMenu /></header>
      <main className="dash-main sp-main">
        <div>
          <span className="kicker">Speaker area</span>
          <h1>Your talks and feedback</h1>
          <p className="muted">Same account as always. Speaking access is given per event by the organiser.</p>
        </div>
        <ActivateCard />
        {speaking.loading ? <Spinner /> : list.length === 0 ? (
          <Empty title="No speaking events yet">Turn on “I’m a speaker” above and enter your event’s speaker code.</Empty>
        ) : list.map((s) => <SpeakerEvent key={s.id} s={s} />)}
      </main>
      <GlobalNav />
    </div>
  );
}

function ActivateCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [chk, setChk] = useState<Extract<CodeCheck, { ok: true }> | null>(null);
  const [own, setOwn] = useState<OwnSpeakerProfile | null>(null);

  async function check(e: FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const r = await checkSpeakerCode(code);
    setBusy(false);
    if (!r.ok) { setErr(r.reason); return; }
    setChk(r);
  }
  async function finish(choice: Parameters<typeof becomeSpeaker>[2]) {
    if (!chk) return;
    setErr(''); setBusy(true);
    const r = await becomeSpeaker(user!, chk, choice);
    setBusy(false);
    if (!r.ok) { setErr(r.reason); return; }
    confetti(); toast(`You’re a speaker at ${chk.event.title}`);
    setChk(null); setOwn(null); setCode(''); setOn(false);
  }
  async function startOwn() {
    // Start from the person's own public profile, so they don't type everything again.
    const p = await backend.getDoc<PublicProfile>(`profiles/${user!.uid}`).catch(() => null);
    setOwn({ name: p?.name || user!.name, role: p?.designation || '', organisation: p?.organisation || '', topic: '', bio: p?.bio || '', photo: p?.photo || user!.photo || '', linkedin: p?.linkedin || '', website: p?.website || '' });
  }
  const shown = cleanCode(code);
  const listed = chk ? chk.event.lineup ?? [] : [];

  return (
    <section className="card sp-activate">
      <label className="sfb-toggle sp-toggle">
        <input type="checkbox" role="switch" checked={on} onChange={(e) => { setOn(e.target.checked); setErr(''); setChk(null); setOwn(null); }} />
        <span className="sfb-switch" aria-hidden="true" />
        <span><b>I’m a speaker</b><small className="muted">Turn on if you’re speaking at an event. You keep using this same account.</small></span>
      </label>

      {on && !chk && (
        <form className="stack" onSubmit={check}>
          <small className="muted">Enter the speaker code from the organiser.</small>
          <div className="row">
            <input className="sp-code" value={shown.length > 5 ? showCode(shown) : shown} maxLength={11} placeholder="ABCDE-23456" aria-label="Speaker code" autoCapitalize="characters" autoComplete="off" autoFocus onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || shown.length !== 10}>{busy ? 'Checking…' : 'Continue'}</button>
          </div>
        </form>
      )}

      {on && chk && !own && (
        <div className="stack">
          <b>Which speaker are you at {chk.event.title}?</b>
          {listed.length > 0 ? (
            <ul className="sp-pick">
              {listed.map((l) => (
                <li key={l.id}><button className="sp-pick-btn" disabled={busy} onClick={() => finish({ speakerId: l.id, name: l.name })}>
                  <Avatar id={l.id} name={l.name} photo={l.photo} size={40} /><span><b>{l.name}</b><small className="muted">{l.role}</small></span>
                </button></li>
              ))}
            </ul>
          ) : <p className="muted">The organiser hasn’t listed speakers yet.</p>}
          <button className="btn btn-ghost" disabled={busy} onClick={startOwn}>I’m not on the list: use my own profile</button>
          <button className="link" onClick={() => setChk(null)}>Use a different code</button>
        </div>
      )}

      {on && chk && own && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!own.name.trim()) { setErr('Add your name.'); return; } finish({ own }); }}>
          <b>Your speaker profile at {chk.event.title}</b>
          <small className="muted">Attendees see this on the speaker list. You can change it later.</small>
          <div className="row"><Avatar id={user!.uid} name={own.name || '?'} photo={own.photo} size={52} /><small className="muted">Your profile photo is used.</small></div>
          <label className="field"><span className="field-label">Name</span><input required value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} /></label>
          <div className="two">
            <label className="field"><span className="field-label">Role</span><input value={own.role} placeholder="Professor" onChange={(e) => setOwn({ ...own, role: e.target.value })} /></label>
            <label className="field"><span className="field-label">Organisation</span><input value={own.organisation} onChange={(e) => setOwn({ ...own, organisation: e.target.value })} /></label>
          </div>
          <label className="field"><span className="field-label">Talk topic</span><input value={own.topic} onChange={(e) => setOwn({ ...own, topic: e.target.value })} /></label>
          <label className="field"><span className="field-label">Short bio</span><textarea rows={3} value={own.bio} onChange={(e) => setOwn({ ...own, bio: e.target.value })} /></label>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Become a speaker'}</button>
          <button type="button" className="link" onClick={() => setOwn(null)}>Back</button>
        </form>
      )}
      <ErrorNote text={err} />
    </section>
  );
}

/** A speaker edits their own public speaker details for one event. */
function MySpeakerProfile({ s }: { s: SpeakingDoc }) {
  const toast = useToast();
  const sp = useDoc<SpeakerDoc>(`events/${s.eventId}/speakers/${s.speakerId}`);
  const [f, setF] = useState<{ role: string; organisation: string; topic: string; bio: string; linkedin: string; website: string } | null>(null);
  if (!sp.data) return null;
  const d = sp.data;
  if (!f) return <button className="btn btn-ghost btn-sm sp-edit-btn" onClick={() => setF({ role: d.role, organisation: d.organisation, topic: d.topic, bio: d.bio, linkedin: d.linkedin, website: d.website })}><Pencil size={14} /> Edit my speaker profile</button>;
  return (
    <form className="stack sp-edit" onSubmit={(e) => { e.preventDefault(); saveMySpeakerProfile(s.eventId, s.speakerId, f).then(() => { toast('Speaker profile saved'); setF(null); }).catch((x) => toast(friendlyError(x), 'err')); }}>
      <div className="two">
        <label className="field"><span className="field-label">Role</span><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></label>
        <label className="field"><span className="field-label">Organisation</span><input value={f.organisation} onChange={(e) => setF({ ...f, organisation: e.target.value })} /></label>
      </div>
      <label className="field"><span className="field-label">Talk topic</span><input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label>
      <label className="field"><span className="field-label">Bio</span><textarea rows={4} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
      <div className="two">
        <label className="field"><span className="field-label">LinkedIn</span><input value={f.linkedin} onChange={(e) => setF({ ...f, linkedin: e.target.value })} /></label>
        <label className="field"><span className="field-label">Website</span><input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></label>
      </div>
      <div className="row"><button className="btn btn-primary btn-sm">Save</button><button type="button" className="link" onClick={() => setF(null)}>Cancel</button></div>
    </form>
  );
}

function SpeakerEvent({ s }: { s: SpeakingDoc }) {
  const base = `events/${s.eventId}`;
  const visibleW = useMemo<[string, unknown][]>(() => [['speakerId', s.speakerId], ['status', 'visible']], [s.speakerId]);
  const reportedW = useMemo<[string, unknown][]>(() => [['speakerId', s.speakerId], ['status', 'reported']], [s.speakerId]);
  const a = useCol<SpeakerFeedbackDoc>(`${base}/speakerFeedback`, visibleW);
  const b = useCol<SpeakerFeedbackDoc>(`${base}/speakerFeedback`, reportedW);
  const fb = useMemo(() => [...a.data, ...b.data].sort((x, y) => (y.at ?? '').localeCompare(x.at ?? '')), [a.data, b.data]);
  const stats = feedbackStats(fb);
  const toast = useToast();
  const pulseW = useMemo<[string, unknown][]>(() => [['eventId', s.eventId]], [s.eventId]);
  const pulses = useCol<PulseDoc>(s.pulse ? 'pulse' : null, pulseW);
  return (
    <section className="sp-event card">
      <div className="row-between">
        <div><h2>{s.eventTitle}</h2><p className="muted">{fmtDate(s.startsAt)} · speaking as {s.speakerName}</p></div>
        <Link className="btn btn-ghost btn-sm" href={`/e/${s.eventId}`}>Open event</Link>
      </div>
      <MySpeakerProfile s={s} />

      <div className="sp-stats">
        <div><span>Feedback</span><b>{stats.n}</b></div>
        <div><span>Average</span><b>{stats.average ?? '–'}{stats.average !== null && <Star size={18} fill="currentColor" aria-hidden="true" />}</b></div>
        <div><span>Anonymous</span><b>{fb.filter((f) => f.anonymous).length}</b></div>
      </div>

      <h3>My feedback</h3>
      {a.error ? <p className="error">Couldn’t load feedback. Your speaker access may have been changed.</p> : !fb.length ? <p className="muted">No feedback yet. Attendees can rate you from your speaker profile.</p> : (
        <ul className="sp-feedback">
          {fb.map((f) => (
            <li key={f.id}>
              {f.anonymous ? <span className="sp-anon" aria-hidden="true"><UserRound size={20} /></span> : <Avatar id={f.uid || f.id} name={f.name || '?'} photo={f.photo} size={40} />}
              <div>
                <div className="row-between"><b>{f.anonymous ? 'Anonymous' : f.name || 'Attendee'}</b><StarRow value={f.rating} /></div>
                {f.text && <p>{f.text}</p>}
                <small className="muted">{fmtDateTime(f.at)}{f.status === 'reported' ? ' · reported to organisers' : ''}</small>
              </div>
              {f.status === 'visible' && <button className="icon-btn" aria-label="Report this feedback to organisers" title="Report to organisers" onClick={() => { if (confirm('Report this feedback to the organisers for review?')) setFeedbackStatus(s.eventId, f.id, 'reported').then(() => toast('Reported to organisers')).catch((x) => toast(friendlyError(x), 'err')); }}><Flag size={16} /></button>}
            </li>
          ))}
        </ul>
      )}

      {s.pulse && (
        <>
          <div className="row-between"><h3>Pulse sessions</h3>
            <div className="row">
              <Link className="btn btn-primary btn-sm" href={`/pulse/create?kind=presentation&event=${s.eventId}`}><Presentation size={15} /> New presentation</Link>
              <Link className="btn btn-ghost btn-sm" href={`/pulse/create?kind=survey&event=${s.eventId}`}><ClipboardList size={15} /> New survey</Link>
            </div>
          </div>
          {!pulses.data.length ? <p className="muted">No Pulse sessions for this event yet.</p> : (
            <ul className="sp-pulses">
              {pulses.data.map((p) => (
                <li key={p.id}>
                  <div><b>{p.title}</b><small className="muted">{p.kind === 'survey' ? 'Survey' : 'Presentation'} · {STATUS_LABEL[p.status]} · code {p.code}</small></div>
                  <div className="row">
                    <Link className="icon-btn" href={`/pulse/edit/${p.id}`} aria-label={`Edit ${p.title}`}><Pencil size={15} /></Link>
                    {p.kind === 'presentation' && <Link className="icon-btn" href={`/pulse/presentation/${p.id}`} aria-label={`Present ${p.title}`}><Play size={15} /></Link>}
                    <Link className="icon-btn" href={`/pulse/results/${p.id}`} aria-label={`Results of ${p.title}`}><BarChart3 size={15} /></Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
