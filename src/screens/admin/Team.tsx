'use client';

import { Copy, Crown, UserPlus, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorNote, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { friendlyError } from '../../lib/format';
import { addToTeam, copyTeam, MAX_TEAM, normEmail, parseEmails, removeFromTeam, useManagedEvents } from '../../lib/team';
import { useAdmin } from './context';

/**
 * The people who run this event together. Team members manage everything the owner does (details, schedule,
 * speakers, check-in, attendance, updates, polls and exports), except the team itself, handing the event over,
 * and deleting it. They're added by their Google email and see the event in their organiser dashboard.
 */
export function Team() {
  const { event, isOwner } = useAdmin();
  const { user, isSuper } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const team = event.teamEmails ?? [];
  // Other events this person owns, to copy their team from (same people often run several events).
  const managed = useManagedEvents(isOwner ? user : null, isSuper);
  const sources = managed.data.filter((e) => e.id !== event.id && (isSuper || e.ownerUid === user?.uid) && (e.teamEmails?.length ?? 0) > 0);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr('');
    const { ok, bad } = parseEmails(text);
    if (bad.length) { setErr(`These don’t look like emails: ${bad.join(', ')}`); return; }
    if (!ok.length) { setErr('Add at least one Google email.'); return; }
    setBusy(true);
    try {
      const list = await addToTeam(event, ok);
      setText('');
      toast(`${ok.length === 1 ? ok[0] : `${ok.length} people`} added. They’ll see this event under Organiser when they sign in with that email. Team: ${list.length}`);
    } catch (x) { setErr(friendlyError(x)); }
    setBusy(false);
  }

  async function remove(email: string) {
    if (!confirm(`Remove ${email} from the team? They’ll lose access to manage this event.`)) return;
    try { await removeFromTeam(event, email); toast(`${email} removed`); } catch (x) { toast(friendlyError(x), 'err'); }
  }

  async function copyFrom(id: string) {
    const from = sources.find((s) => s.id === id);
    if (!from) return;
    try { const list = await copyTeam(from, event); toast(`Team copied from ${from.title}. Team: ${list.length}`); } catch (x) { toast(friendlyError(x), 'err'); }
  }

  const link = typeof window !== 'undefined' ? `${window.location.origin}/login?next=${encodeURIComponent(`/admin/e/${event.id}`)}` : '';

  return (
    <div className="narrow stack-lg">
      <div>
        <h1>Team</h1>
        <p className="muted">Running this event with others? Add them by their Google email. They can manage everything here: details, schedule, speakers, check-in, attendance, updates, polls and downloads. Only the owner can change the team or delete the event.</p>
      </div>

      <section className="panel team-list">
        <h2><Users size={18} aria-hidden="true" /> {team.length + 1} {team.length ? 'people' : 'person'}</h2>
        <ul>
          <li><span className="team-av"><Crown size={16} /></span><span className="grow"><b>{event.ownerEmail || 'Owner'}</b><small>Owner{event.ownerUid === user?.uid ? ' · you' : ''}</small></span></li>
          {team.map((email) => (
            <li key={email}>
              <span className="team-av">{email.slice(0, 1).toUpperCase()}</span>
              <span className="grow"><b>{email}</b><small>Team{user?.email && normEmail(user.email) === email ? ' · you' : ''}</small></span>
              {isOwner && <button className="icon-btn" aria-label={`Remove ${email}`} onClick={() => remove(email)}><X size={18} /></button>}
            </li>
          ))}
        </ul>
      </section>

      {isOwner ? (
        <>
          <form className="panel stack" onSubmit={add}>
            <h2><UserPlus size={18} aria-hidden="true" /> Add people</h2>
            <label className="field">
              <span>Google emails</span>
              <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={'asha@college.edu\nben@gmail.com'} />
              <span className="field-hint">One per line or separated by commas. Up to {MAX_TEAM} people. They must sign in with this exact email.</span>
            </label>
            <ErrorNote text={err} />
            <button className="btn btn-primary" disabled={busy || team.length >= MAX_TEAM}>{busy ? 'Adding…' : 'Add to team'}</button>
          </form>

          {sources.length > 0 && (
            <section className="panel stack">
              <h2><Copy size={18} aria-hidden="true" /> Same team as another event?</h2>
              <p className="muted">Copy everyone from one of your other events in one go.</p>
              <select defaultValue="" onChange={(e) => { if (e.target.value) { copyFrom(e.target.value); e.target.value = ''; } }}>
                <option value="" disabled>Choose an event…</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.teamEmails?.length} people)</option>)}
              </select>
            </section>
          )}

          <section className="panel stack">
            <h2>Send them this link</h2>
            <p className="muted">They open it, sign in with the email you added, and land on this event.</p>
            <div className="row">
              <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Team link" />
              <button className="btn btn-ink btn-sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copied'))}>Copy</button>
            </div>
          </section>
        </>
      ) : (
        <p className="muted">You’re on this event’s team. Ask the owner if someone else needs access.</p>
      )}
    </div>
  );
}
