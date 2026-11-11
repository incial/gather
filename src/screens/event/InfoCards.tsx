'use client';

import { Icon } from '../../components/ui';
import { mapFor } from '../../lib/calendar';
import { contactsOf, waLink } from '../../lib/helpdesk';
import type { EventDoc, EventInfoDoc } from '../../lib/types';

export function VenueCard({ event }: { event: EventDoc }) {
  const map = mapFor(event.mapLink, event.venue);
  if (!map) return null;
  return (
    <section className="venue card span-2">
      <div className="venue-head">
        <span className="venue-icon"><Icon name="pin" size={20} /></span>
        <div className="grow"><small>Venue</small><b>{event.venue || map.label}</b></div>
        <a className="btn btn-primary btn-sm" href={map.open} target="_blank" rel="noopener noreferrer">Directions</a>
      </div>
      <iframe className="venue-map" title={`Map of ${event.venue}`} src={map.embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
    </section>
  );
}

export function HelpCard({ info }: { info: EventInfoDoc | null }) {
  const contacts = contactsOf(info);
  if (!contacts.length && !info?.notes) return null;
  return (
    <section className="help card">
      {contacts.length > 0 && <small className="help-head">Help Desk Contacts</small>}
      {contacts.map((c) => (
        <div key={c.phone} className="help-call">
          <span className="venue-icon"><Icon name="phone" size={20} /></span>
          <span className="grow"><b>{c.name || 'Event desk'}{c.primary && contacts.length > 1 ? ' · main' : ''}</b><small>{[c.designation, c.phone].filter(Boolean).join(' · ')}</small></span>
          <a className="pill" href={`tel:${c.phone}`} aria-label={`Call ${c.name || 'the event desk'}`}>Call</a>
          <a className="pill help-wa" href={waLink(c.phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.name || 'the event desk'}`}>WhatsApp</a>
        </div>
      ))}
      {info?.notes && (
        <div className="help-notes">
          <small>Know before you go</small>
          <p className="prose">{info.notes}</p>
        </div>
      )}
    </section>
  );
}
