'use client';

import { useRouter } from 'next/navigation';
import type { EventInfoDoc, HelpContact } from '../../lib/types';
import { cleanContacts, contactsOf, MAX_CONTACTS } from '../../lib/helpdesk';
import { Minus, Plus, Star } from 'lucide-react';
import { syncCapacityCounter } from '../../lib/api';
import { useState, type FormEvent } from 'react';
import { ErrorNote, Field, useToast } from '../../components/ui';
import { saveEventInfo, updateEvent } from '../../lib/api';
import { DeleteEventDialog } from './DeleteEvent';
import { friendlyError } from '../../lib/format';
import { useAdmin } from './context';
import { EventForm } from './EventForm';

export function Details() {
  const { event, info, isOwner } = useAdmin();
  const toast = useToast();
  const nav = useRouter();
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="narrow stack-lg">
      <h1>Event details</h1>
      <EventForm key={event.id} initial={event} eventId={event.id} bannerThumb={event.bannerThumb} submitLabel="Save changes" onSubmit={async (d) => {
        await updateEvent(event.id, { ...d, title: d.title.trim() });
        if ((d.capacity ?? 0) !== (event.capacity ?? 0)) await syncCapacityCounter(event.id);
      }} onDone={() => toast('Saved')} />
      <EventInfoForm key={info ? 'loaded' : 'empty'} eventId={event.id} info={info} />
      {isOwner && <section className="panel">
        <h2>Delete event</h2>
        <p className="muted">Permanently removes the event and all its data.</p>
        <button className="btn btn-ghost btn-sm danger" onClick={() => setDeleting(true)}>Delete event</button>
        {deleting && <DeleteEventDialog event={event} onClose={() => setDeleting(false)} onDeleted={() => nav.replace('/admin')} />}
      </section>}
    </div>
  );
}

function EventInfoForm({ eventId, info }: { eventId: string; info: EventInfoDoc | null }) {
  const toast = useToast();
  const [f, setF] = useState({ wifiName: info?.wifiName ?? '', wifiPassword: info?.wifiPassword ?? '', notes: info?.notes ?? '' });
  const start = contactsOf(info);
  const [contacts, setContacts] = useState<HelpContact[]>(start.length ? start : [{ name: '', designation: '', phone: '', primary: true }]);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const edit = (i: number, p: Partial<HelpContact>) => setContacts(contacts.map((c, j) => (j === i ? { ...c, ...p } : p.primary ? { ...c, primary: false } : c)));
  function save(e: FormEvent) {
    e.preventDefault();
    const c = cleanContacts(contacts);
    if ('error' in c) { setErr(c.error); return; }
    setErr('');
    const primary = c.value.find((x) => x.primary);
    saveEventInfo(eventId, {
      wifiName: f.wifiName.trim(), wifiPassword: f.wifiPassword, notes: f.notes.trim(), helpdesk: c.value,
      // Kept in step for older versions of the app that read a single help line.
      helplineName: primary?.name ?? '', helplinePhone: primary?.phone ?? '',
    }).then(() => toast('Event info saved')).catch((x) => toast(friendlyError(x), 'err'));
  }
  return (
    <form className="panel" onSubmit={save}>
      <h2>Info for attendees</h2>
      <p className="muted">Only people who have joined the event can see this.</p>
      <div className="two">
        <Field label="Wi-Fi name"><input value={f.wifiName} onChange={set('wifiName')} autoComplete="off" /></Field>
        <Field label="Wi-Fi password"><input value={f.wifiPassword} onChange={set('wifiPassword')} autoComplete="off" /></Field>
      </div>
      <div className="field">
        <span className="field-label">Help Desk Contacts</span>
        <span className="field-hint">Up to {MAX_CONTACTS}. Include the country code so tap-to-call and WhatsApp work, like +91 98765 43210.</span>
        {contacts.map((c, i) => (
          <div key={i} className="hd-row">
            <input aria-label={`Contact ${i + 1} name`} placeholder="Name (optional)" value={c.name} onChange={(e) => edit(i, { name: e.target.value })} />
            <input aria-label={`Contact ${i + 1} designation`} placeholder="Role (optional)" value={c.designation} onChange={(e) => edit(i, { designation: e.target.value })} />
            <input aria-label={`Contact ${i + 1} phone`} type="tel" inputMode="tel" placeholder="+91 98765 43210" value={c.phone} onChange={(e) => edit(i, { phone: e.target.value })} />
            <button type="button" className={`hd-primary${c.primary ? ' on' : ''}`} aria-pressed={c.primary} aria-label={`Make contact ${i + 1} the primary contact`} title="Primary contact" onClick={() => edit(i, { primary: true })}><Star size={15} fill={c.primary ? 'currentColor' : 'none'} /></button>
            <button type="button" className="icon-btn" aria-label={`Remove contact ${i + 1}`} disabled={contacts.length === 1} onClick={() => { const next = contacts.filter((_, j) => j !== i); if (c.primary && next[0]) next[0] = { ...next[0], primary: true }; setContacts(next); }}><Minus size={15} /></button>
          </div>
        ))}
        {contacts.length < MAX_CONTACTS && <button type="button" className="btn btn-ghost btn-sm hd-add" onClick={() => setContacts([...contacts, { name: '', designation: '', phone: '', primary: false }])}><Plus size={15} /> Add contact</button>}
      </div>
      <Field label="Know before you go" hint="Parking, food, what to bring, dress code."><textarea rows={4} value={f.notes} onChange={set('notes')} /></Field>
      <ErrorNote text={err} />
      <button className="btn btn-primary">Save info</button>
    </form>
  );
}
