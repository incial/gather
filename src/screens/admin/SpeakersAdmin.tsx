'use client';

import { ArrowDown, ArrowUp, BadgeCheck, KeyRound, Pin, Sparkles } from 'lucide-react';
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Avatar, CsvButton, Empty, ErrorNote, Field, Icon, Modal, QrImage, useToast } from '../../components/ui';
import { webUrl } from '../../lib/links';
import { encodeSmall } from '../../lib/profile';
import { deleteSpeaker, saveSpeaker } from '../../lib/api';
import { speakersSheet } from '../../lib/exports';
import { friendlyError } from '../../lib/format';
import { speakerUrl } from '../../lib/qr';
import type { RoleDoc, SpeakerCategory, SpeakerCodeDoc, SpeakerDoc } from '../../lib/types';
import { CATEGORIES, MAX_TRIES, resetTries, revokeCode, revokeSpeaker, saveSpeakerOrder, setSpeakerPin, showCode, sortSpeakers, switchOffPin, type SpeakerPinDoc, type SpeakerTryDoc } from '../../lib/speakers';
import { loadEventData, useAdmin } from './context';
import { useCol, useDoc } from '../../lib/live';
import { useRowCount } from '../../lib/summaries';

const blank: SpeakerDoc = { id: '', name: '', role: '', organisation: '', topic: '', expertise: '', bio: '', email: '', phone: '', linkedin: '', website: '', links: [] };

/** Photos are shrunk and stored on the speaker record, so Firebase Storage (a paid add-on) isn't needed. */
function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const side = Math.min(img.width, img.height);
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(encodeSmall(canvas));
    };
    img.onerror = () => reject(new Error('That file couldn’t be read as an image.'));
    img.src = url;
  });
}

export function SpeakersAdmin() {
  const base = useAdmin();
  const { event, speakers, prefix } = base;
  const toast = useToast();
  const [editing, setEditing] = useState<SpeakerDoc | null>(null);
  const [qrFor, setQrFor] = useState<SpeakerDoc | null>(null);
  const ordered = useMemo(() => sortSpeakers(speakers), [speakers]);
  const roles = useCol<RoleDoc>(`events/${event.id}/roles`);
  const codes = useCol<SpeakerCodeDoc>('speakerCodes', useMemo<[string, unknown][]>(() => [['eventId', event.id]], [event.id]));
  const roleOf = (sid: string) => roles.data.find((r) => r.speakerId === sid && r.active);

  // Manual order is the main control. Pinned speakers stay on top.
  function move(i: number, d: number) {
    const list = [...ordered];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    saveSpeakerOrder(event.id, list).catch((x) => toast(friendlyError(x), 'err'));
  }
  const patch = (s: SpeakerDoc, p: Partial<SpeakerDoc>) => saveSpeaker(event.id, { ...s, ...p }, speakers).catch((x) => toast(friendlyError(x), 'err'));

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div>
          <h1>Speakers</h1>
          <p className="muted">Order, categories and featured speakers appear the same way everywhere attendees see speakers.</p>
        </div>
        <div className="row">
          <CsvButton load={async () => speakersSheet(await loadEventData(base))} prefix={prefix} />
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...blank, order: speakers.length })}>+ Add speaker</button>
        </div>
      </div>
      <SpeakerCodePanel codes={codes.data} roles={roles.data} />
      {!speakers.length && <Empty title="No speakers yet">Add speakers here, or share the speaker code: speakers who aren’t listed can add themselves from their own profile.</Empty>}
      <div className="table-list">
        {ordered.map((s, i) => {
          const r = roleOf(s.id);
          return (
            <div key={s.id} className="list-row spk-row">
              <div className="spk-order">
                <button className="icon-btn" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                <button className="icon-btn" aria-label={`Move ${s.name} down`} disabled={i === ordered.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
              </div>
              <Avatar id={s.id} name={s.name} photo={s.photo} size={48} />
              <div className="grow">
                <b>{s.name} {s.pinned && <Pin size={14} aria-label="Pinned" />}{s.featured && <span className="speaker-badge featured">Featured</span>}</b>
                <small>{[s.role, s.organisation].filter(Boolean).join(', ')} · <ConnCount eventId={event.id} speakerId={s.id} /> connections</small>
                <small className={r ? 'spk-verified' : 'muted'}>
                  {r ? <><BadgeCheck size={13} aria-hidden="true" /> Linked to {r.email}{r.pulse ? ' · can run Pulse' : ''}{s.id === r.uid ? ' · added themselves' : ''}</> : 'Not linked to an account yet'}
                </small>
              </div>
              <select aria-label={`Category for ${s.name}`} value={s.category ?? 'regular'} onChange={(e) => patch(s, { category: e.target.value as SpeakerCategory })}>
                {Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className={`btn btn-sm ${s.pinned ? 'btn-ink' : 'btn-ghost'}`} aria-pressed={!!s.pinned} onClick={() => patch(s, { pinned: !s.pinned })}><Pin size={14} /> {s.pinned ? 'Pinned' : 'Pin'}</button>
              <button className={`btn btn-sm ${s.featured ? 'btn-ink' : 'btn-ghost'}`} aria-pressed={!!s.featured} onClick={() => patch(s, { featured: !s.featured })}><Sparkles size={14} /> {s.featured ? 'Featured' : 'Feature'}</button>
              {r
                ? <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm(`Remove ${s.name}’s speaker access? They stay registered as an attendee.`)) revokeSpeaker(event.id, r).then(() => toast('Speaker access removed')).catch((x) => toast(friendlyError(x), 'err')); }}>Revoke access</button>
                : null}
              <button className="btn btn-ghost btn-sm" onClick={() => setQrFor(s)}>QR</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
              <button className="link danger" onClick={() => {
                if (confirm(`Remove ${s.name} from this event?`)) deleteSpeaker(event.id, s.id, speakers).then(() => r && revokeSpeaker(event.id, r)).catch((x) => toast(friendlyError(x), 'err'));
              }}>Delete</button>
            </div>
          );
        })}
      </div>
      {editing && (
        <Modal title={editing.id ? 'Edit speaker' : 'Add speaker'} onClose={() => setEditing(null)}>
          <SpeakerForm initial={editing} onSave={async (s) => { await saveSpeaker(event.id, s, speakers); setEditing(null); toast('Speaker saved'); }} />
        </Modal>
      )}
      {qrFor && (
        <Modal title="Speaker QR" onClose={() => setQrFor(null)}>
          <div className="print-card">
            <h2>{qrFor.name}</h2>
            <QrImage text={speakerUrl(event.id, qrFor.id)} size={260} label={`QR code to connect with ${qrFor.name}`} />
            <p>Scan to connect at {event.title}</p>
          </div>
          <button className="btn btn-ink btn-block no-print" onClick={() => window.print()}>Print card</button>
        </Modal>
      )}
    </div>
  );
}

/** The event's four-digit speaker code: show, share, change, switch off, and reset anyone locked out. */
function SpeakerCodePanel({ codes, roles }: { codes: SpeakerCodeDoc[]; roles: RoleDoc[] }) {
  const { event } = useAdmin();
  const toast = useToast();
  const pinDoc = useDoc<SpeakerPinDoc>(`speakerPins/${event.id}`);
  const tries = useCol<SpeakerTryDoc>(`events/${event.id}/speakerTries`);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const p = pinDoc.data;
  const live = p && !p.revoked && Date.parse(p.expiresAt) > Date.now() ? p : null;
  const legacy = codes.filter((c) => c.common && !c.revoked && Date.parse(c.expiresAt) > Date.now());
  const locked = tries.data.filter((t) => t.n >= MAX_TRIES && !t.ok);
  const active = roles.filter((r) => r.active).length;
  async function make() {
    setBusy(true);
    try { await setSpeakerPin(event, days); toast(live ? 'New code made. The old one no longer works.' : 'Speaker code made'); }
    catch (x) { toast(friendlyError(x), 'err'); }
    setBusy(false);
  }
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/speaker?event=${event.id}`;
  const msg = live ? `You're a speaker at ${event.title} on Gather. Open ${link} with your usual account and enter the speaker code ${live.pin}.` : '';
  return (
    <section className="panel spk-code-panel">
      <div className="row-between">
        <div><h2><KeyRound size={18} aria-hidden="true" /> Speaker code</h2><p className="muted">One 4-digit code for all speakers of this event. Speakers use their normal account: they tap “I’m a speaker”, enter this code once, then pick their name from your list or use their own profile. They can run Gather Pulse straight away.</p></div>
        <span className="pill">{active} {active === 1 ? 'speaker' : 'speakers'} linked</span>
      </div>
      {pinDoc.loading ? null : live ? (
        <div className="spk-code-box">
          <b className="spk-code spk-pin" aria-label={`Speaker code ${live.pin.split('').join(' ')}`}>{live.pin}</b>
          <small className="muted">Valid until {new Date(live.expiresAt).toLocaleDateString()} · 10 tries per person</small>
          <div className="row-center">
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(msg).then(() => toast('Message copied'))}>Copy message</button>
            <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (confirm('Make a new code? The current one stops working; speakers already linked stay linked.')) make(); }}>Change code</button>
            <button className="link danger" onClick={() => { if (confirm('Switch the speaker code off? Nobody new can become a speaker until you make a new one.')) switchOffPin(event.id).then(() => toast('Speaker code switched off')).catch((x) => toast(friendlyError(x), 'err')); }}>Switch off</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <label className="field"><span className="field-label">Valid for</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[3, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
          </label>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={make}><KeyRound size={15} /> {busy ? 'Making…' : 'Make 4-digit speaker code'}</button>
        </div>
      )}
      {locked.length > 0 && (
        <div className="row-between spk-locked">
          <small><b>{locked.length}</b> {locked.length === 1 ? 'person has' : 'people have'} used all 10 tries.</small>
          <button className="btn btn-ghost btn-sm" onClick={() => resetTries(event.id, locked.map((t) => t.id)).then(() => toast('Tries reset')).catch((x) => toast(friendlyError(x), 'err'))}>Reset their tries</button>
        </div>
      )}
      {legacy.length > 0 && (
        <div className="row-between spk-locked">
          <small className="muted">An older 10-letter code ({showCode(legacy[0].id)}) still works until {new Date(legacy[0].expiresAt).toLocaleDateString()}.</small>
          <button className="link danger" onClick={() => Promise.all(legacy.map((c) => revokeCode(c.id))).then(() => toast('Old code switched off')).catch((x) => toast(friendlyError(x), 'err'))}>Switch it off</button>
        </div>
      )}
    </section>
  );
}

function SpeakerForm({ initial, onSave }: { initial: SpeakerDoc; onSave: (s: SpeakerDoc) => Promise<void> }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState('');
  const set = (k: keyof SpeakerDoc) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function photo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setF({ ...f, photo: await shrinkPhoto(file) }); } catch (x) { setErr(friendlyError(x)); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const links = (f.links ?? []).filter((l) => l.label.trim() || l.url.trim());
    const bad = links.find((l) => !l.label.trim() || !webUrl(l.url));
    if (bad) { setErr(bad.label.trim() ? `“${bad.label}” needs a valid web link.` : 'Give each extra link a name.'); return; }
    if (f.website.trim() && !webUrl(f.website)) { setErr('The website link doesn’t look right.'); return; }
    try { await onSave({ ...f, links: links.map((l) => ({ label: l.label.trim(), url: webUrl(l.url) })) }); } catch (x) { setErr(friendlyError(x)); }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="row">
        <Avatar id={f.id || f.name || 'new'} name={f.name || '?'} photo={f.photo} size={64} />
        <Field label="Photo"><input type="file" accept="image/*" onChange={photo} /></Field>
      </div>
      <Field label="Name"><input required value={f.name} onChange={set('name')} /></Field>
      <div className="two">
        <Field label="Role"><input value={f.role} onChange={set('role')} placeholder="Professor" /></Field>
        <Field label="Organisation"><input value={f.organisation} onChange={set('organisation')} /></Field>
      </div>
      <Field label="Topic"><input value={f.topic} onChange={set('topic')} /></Field>
      <Field label="Expertise" hint="Separate with commas. These show as tags on their profile."><input value={f.expertise ?? ''} onChange={set('expertise')} /></Field>
      <Field label="Bio"><textarea rows={4} value={f.bio} onChange={set('bio')} /></Field>
      <p className="muted">Contact details are shown only to attendees who connect. Leave blank anything the speaker doesn’t want shared.</p>
      <div className="two">
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input type="tel" value={f.phone} onChange={set('phone')} /></Field>
      </div>
      <Field label="LinkedIn" hint="Paste their profile link or just the ID, like jane-doe."><input value={f.linkedin} onChange={set('linkedin')} placeholder="linkedin.com/in/…" /></Field>
      <Field label="Website"><input value={f.website} onChange={set('website')} placeholder="example.com" /></Field>
      <div className="field">
        <span className="field-label">More links</span>
        <span className="field-hint">Any other profile or page: Instagram, X, YouTube, a portfolio, a booking page.</span>
        {(f.links ?? []).map((l, i) => (
          <div key={i} className="link-edit">
            <input aria-label={`Link ${i + 1} name`} placeholder="Name, e.g. Instagram" value={l.label} onChange={(e) => setF({ ...f, links: (f.links ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input aria-label={`Link ${i + 1} address`} placeholder="Link" value={l.url} onChange={(e) => setF({ ...f, links: (f.links ?? []).map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
            <button type="button" className="icon-btn" aria-label={`Remove link ${i + 1}`} onClick={() => setF({ ...f, links: (f.links ?? []).filter((_, j) => j !== i) })}><Icon name="close" size={16} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, links: [...(f.links ?? []), { label: '', url: '' }] })}><Icon name="plus" size={16} /> Add link</button>
      </div>
      <ErrorNote text={err} />
      <button className="btn btn-primary btn-block">Save speaker</button>
    </form>
  );
}

function ConnCount({ eventId, speakerId }: { eventId: string; speakerId: string }) {
  const c = useRowCount('connections', eventId, speakerId);
  return <>{c.error ? '–' : c.n ?? '…'}</>;
}
