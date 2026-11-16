'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon, QrImage, useToast } from '../../components/ui';
import { updateEvent } from '../../lib/api';
import { downloadZip } from '../../lib/exports';
import { fmtRange, fmtTime, friendlyError } from '../../lib/format';
import type { EventDoc } from '../../lib/types';
import { fetchEventOverview, useSummary, type EventOverview } from '../../lib/summaries';
import { eventUrl, joinUrl } from '../../lib/qr';
import { visibilityOf, visibilityPatch, VISIBILITY_LABEL, type Visibility } from './EventForm';
import { loadEventData, useAdmin } from './context';

/** The invitation people receive when the organiser shares the event: its details, then the link (and code). */
function inviteText(e: EventDoc, link: string, code?: string) {
  const when = [fmtRange(e.startsAt, e.endsAt), fmtTime(e.startsAt)].filter(Boolean).join(', ');
  // The event's own organisation: its "Organised by" field, or the organisation given in its type details.
  const t = e.typeDetails ?? {};
  const org = (e.organiser || '').trim()
    || [t.department, t.institution].map((x) => (x || '').trim()).filter(Boolean).join(', ')
    || (t.organisation || t.host || '').trim();
  const details = [e.title, e.tagline, when && `When: ${when}`, e.venue && `Where: ${e.venue}`, org && `Organised by ${org}`];
  const join = [`Join here: ${link}`, code && `Or open Gather and enter the join code ${code}`];
  const keep = (lines: (string | undefined | false)[]) => lines.filter((l): l is string => !!l && !!l.trim());
  return [...keep(details), '', ...keep(join)].join('\n');
}

export function Overview() {
  const base = useAdmin();
  const { event, sessions } = base;
  const toast = useToast();
  // All of this screen's numbers in one request; the server counts them inside Firestore.
  const summary = useSummary(`overview|${event.id}`, () => fetchEventOverview(event.id));
  const pick = (k: keyof EventOverview) => ({ n: summary.data ? summary.data[k] : null, error: !!summary.error && !summary.data });
  const attendees = pick('attendees');
  const prereg = pick('preregistered');
  const checkins = pick('checkins');
  const feedback = pick('feedback');
  const connections = pick('connections');
  const saved = pick('saved');
  const checkedIn = pick('checkedIn');
  const [exporting, setExporting] = useState(false);
  const toggle = (patch: Parameters<typeof updateEvent>[1], msg: string) =>
    updateEvent(event.id, patch).then(() => toast(msg)).catch((x) => toast(friendlyError(x), 'err'));
  const vis = visibilityOf(event);
  const privateLink = eventUrl(event.id);
  const [qrFor, setQrFor] = useState<'code' | 'link'>(vis === 'public' ? 'code' : 'link');
  const url = qrFor === 'code' && vis === 'public' ? joinUrl(event.joinCode) : privateLink;
  // What Copy, WhatsApp and Share send: the event details, then the link (the join code too, for the code QR).
  const shareCode = qrFor === 'code' && vis === 'public' ? event.joinCode : undefined;
  const share = inviteText(event, url, shareCode);
  const n = (c: { n: number | null; error: boolean }) => (c.error ? '–' : c.n ?? '…');
  const refresh = summary.refresh;

  const stats = [
    ['Expected', event.expectedAttendees ? event.expectedAttendees : '–', 'organiser’s estimate'],
    ['Capacity', event.capacity ? event.capacity : '∞', event.capacity ? `${Math.max(0, event.capacity - (attendees.n ?? 0))} places left` : 'no limit'],
    ['Registered', n(attendees), prereg.n ? `${Math.max(prereg.n, attendees.n ?? 0)} on the invite list` : 'joined in the app'],
    ['Attended', n(checkedIn), attendees.n ? `${Math.round(((checkedIn.n ?? 0) / attendees.n) * 100)}% checked in at the door` : 'checked in at the door'],
    ['Check-ins', n(checkins), `across ${sessions.length} sessions`],
    ['Feedback', n(feedback), attendees.n ? `${Math.round(((feedback.n ?? 0) / attendees.n) * 100)}% of attendees` : 'responses'],
    ['Connections', n(connections), 'with speakers'],
    ['Saved', n(saved), 'in Explore'],
  ] as const;

  // Uses the phone's share sheet where there is one, otherwise copies the link.
  async function shareEvent() {
    const link = vis === 'public' ? joinUrl(event.joinCode) : privateLink;
    const text = inviteText(event, link, vis === 'public' ? event.joinCode : undefined);
    if (navigator.share) {
      // The link is part of the text, so apps that drop the separate link field still get it.
      try { await navigator.share({ title: event.title, text }); return; }
      catch (x) { if ((x as { name?: string }).name === 'AbortError') return; }
    }
    navigator.clipboard.writeText(text).then(() => toast(vis === 'draft' ? 'Invitation copied. The link opens once the event is public or private.' : 'Invitation copied: event details and link')).catch(() => toast('Couldn’t copy the link', 'err'));
  }

  async function exportAll() {
    setExporting(true);
    try { await downloadZip(await loadEventData(base)); } catch { toast('Couldn’t prepare the export. Check your connection and try again.', 'err'); }
    setExporting(false);
  }

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div>
          <h1>{event.title}</h1>
          <p className="muted">{fmtRange(event.startsAt, event.endsAt)} · {event.venue}</p>
        </div>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={refresh}>Refresh</button>
          <button className="btn btn-ink btn-sm" onClick={exportAll} disabled={exporting}><Icon name="download" size={16} /> {exporting ? 'Preparing…' : 'Export everything'}</button>
        </div>
      </div>
      {/* The things organisers reach for first: get people in, tell them about it, run the door, fix the details. */}
      <nav className="quick-actions" aria-label="Quick actions">
        <Link href={`/admin/e/${event.id}/people`}><span className="qa-ic qa-blue"><Icon name="people" size={20} /></span><b>Invite guests</b><small>Import your guest list</small></Link>
        <button type="button" onClick={shareEvent}><span className="qa-ic qa-lime"><Icon name="external" size={20} /></span><b>Share event</b><small>{vis === 'draft' ? 'Publish it first' : 'Send the link'}</small></button>
        <Link href={`/admin/e/${event.id}/attendance`}><span className="qa-ic qa-violet"><Icon name="scan" size={20} /></span><b>Check in</b><small>Run the door</small></Link>
        <Link href={`/admin/e/${event.id}/details`}><span className="qa-ic qa-amber"><Icon name="feedback" size={20} /></span><b>Edit details</b><small>Time, place, cover</small></Link>
      </nav>
      <div className="stat-row">
        {stats.map(([label, v, sub]) => <div key={label} className="stat"><span>{label}</span><b>{v}</b><small>{sub}</small></div>)}
      </div>
      <div className="admin-split">
        <section className="panel share">
          <h2>Let people in</h2>
          {vis === 'public' && (
            <div className="seg" role="tablist" aria-label="QR code for">
              <button role="tab" aria-selected={qrFor === 'code'} className={qrFor === 'code' ? 'on' : ''} onClick={() => setQrFor('code')}>Join code</button>
              <button role="tab" aria-selected={qrFor === 'link'} className={qrFor === 'link' ? 'on' : ''} onClick={() => setQrFor('link')}>Private link</button>
            </div>
          )}
          <QrImage text={url} size={180} label={`QR code to join ${event.title}`} />
          {qrFor === 'code' && vis === 'public' ? (
            <><div className="join-code">{event.joinCode}</div><small className="muted">People type this in Join, or scan the QR code.</small></>
          ) : (
            <>
              <input readOnly className="private-link" value={privateLink} aria-label="Private link" onFocus={(e) => e.target.select()} />
              <small className="muted">{vis === 'draft' ? 'This is a draft, so the link won’t open for attendees yet. Switch to Public or Private link below.' : 'Anyone with this link can open the event and join. It isn’t listed anywhere.'}</small>
            </>
          )}
          <div className="row-center">
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(share).then(() => toast('Invitation copied: event details and link')).catch(() => toast('Couldn’t copy the link', 'err'))}>Copy invitation</button>
            <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
          <details className="invite-preview">
            <summary>What people receive</summary>
            <pre>{share}</pre>
          </details>
        </section>
        <section className="panel">
          <h2>Switches</h2>
          <div className="switches">
            <div className="field">
              <span className="field-label">Who can find it</span>
              <select value={vis} onChange={(e) => { const v = e.target.value as Visibility; toggle(visibilityPatch(v), `Event is now ${VISIBILITY_LABEL[v].toLowerCase()}`); }}>
                <option value="public">Public: listed in Explore, join code works</option>
                <option value="private">Private link: only people with the link</option>
                <option value="draft">Draft: hidden from attendees</option>
              </select>
            </div>
            <label className="check"><input type="checkbox" checked={event.registration === 'open'} onChange={(e) => toggle({ registration: e.target.checked ? 'open' : 'invite' }, e.target.checked ? 'Anyone can join now' : 'Only people on your list can join')} /><span><b>Anyone can join</b><small>Off means only people on your imported list can join, even when the event is public.</small></span></label>
            {vis !== 'draft' && event.registration === 'invite' && (
              <div className="warn-note" role="alert">
                <b>Only people on your list can join</b>
                <p>This event is {vis === 'public' ? 'public' : 'shared by link'}, but registration is invite-only, so anyone not on your imported list sees “You’re not on the list”.</p>
                <button className="btn btn-ink btn-sm" onClick={() => toggle({ registration: 'open' }, 'Anyone can join now')}>Let anyone join</button>
              </div>
            )}
            <label className="check"><input type="checkbox" checked={event.feedbackOpen} onChange={(e) => toggle({ feedbackOpen: e.target.checked }, e.target.checked ? 'Feedback is open' : 'Feedback closed')} /><span><b>Feedback open</b><small>Attendees can send overall feedback now.</small></span></label>
          </div>
          {!sessions.length && <p className="muted">Next: <Link href={`/admin/e/${event.id}/agenda`}>add the schedule</Link> so check-in can start.</p>}
        </section>
      </div>
    </div>
  );
}
