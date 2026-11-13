'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { confetti, Empty, Icon, LinkedinIcon, useToast } from '../../components/ui';
import { EmojiAvatar } from '../../components/Fun';
import { connect } from '../../lib/api';
import { downloadBlob } from '../../lib/csv';
import { fmtDay, fmtTime, friendlyError, hue } from '../../lib/format';
import { speakerLinks } from '../../lib/links';
import { KIND_ICON, KIND_LABEL } from '../../lib/session';
import type { SpeakerDoc } from '../../lib/types';
import { useEventCtx } from './context';
import { SpeakerFeedbackForm } from './SpeakerFeedback';
import { MeetButton, useEventPings } from '../../components/MeetPing';
import { useAuth } from '../../lib/auth';
import { CATEGORIES } from '../../lib/speakers';

export function Speakers() {
  const { event, me, speakers, connections, role: myRole } = useEventCtx();
  const { user } = useAuth();
  const pings = useEventPings(event.id, me.uid);
  const mine = new Set(connections.map((c) => c.speakerId));
  const meP = { uid: me.uid, name: me.name || user?.name || '', photo: user?.photo ?? me.photo, role: myRole ? 'Speaker' : 'Attendee' };
  if (!speakers.length) return <Empty title="Speakers coming soon">The lineup will appear here.</Empty>;
  return (
    <div className="stack-lg">
      <div>
        <h1>Speakers</h1>
        <p className="muted">Want to talk to a speaker? Send a Meet Ping. Met one already? Scan the code on their card to save their details.</p>
      </div>
      <div className="speaker-grid">
        {speakers.map((s) => (
          <div key={s.id} className="speaker-cell">
          <Link href={`/e/${event.id}/speakers/${s.id}`} className="speaker-card">
            <span className={`speaker-cover a-${hue(s.id)}`} aria-hidden="true" />
            {mine.has(s.id) && <span className="sticker" title="Connected"><Icon name="check" size={15} /></span>}
            <EmojiAvatar id={s.uid || s.id} photo={s.photo || undefined} size={84} />
            <h3>{s.name}</h3>
            <p>{s.role}</p>
            {s.topic && <span className="pill">{s.topic}</span>}
            {(s.featured || (s.category && s.category !== 'regular')) && <span className={`speaker-badge${s.featured ? ' featured' : ''}`}>{s.featured ? 'Featured' : CATEGORIES[s.category!]}</span>}
          </Link>
          {/* Meet Ping, right on the card (outside the link, so the button and the card each get their own tap) */}
          {s.uid && s.uid !== me.uid && (
            <div className="speaker-meet"><MeetButton compact event={event} me={meP} other={{ uid: s.uid, name: s.name, photo: s.photo, role: 'Speaker' }} pings={pings} /></div>
          )}
          </div>
        ))}
      </div>
    </div>
  );
}

function vcard(s: SpeakerDoc) {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(s.name)}`];
  if (s.organisation) lines.push(`ORG:${esc(s.organisation)}`);
  if (s.role) lines.push(`TITLE:${esc(s.role)}`);
  if (s.email) lines.push(`EMAIL:${esc(s.email)}`);
  if (s.phone) lines.push(`TEL:${esc(s.phone)}`);
  for (const l of speakerLinks(s)) lines.push(`URL:${esc(l.url)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function SpeakerDetail() {
  const { sid } = useParams<{ sid: string }>();
  const { event, me, speakers, sessions, connections, role: myRole } = useEventCtx();
  const toast = useToast();
  const isNew = useSearchParams().get('new') === '1';
  const speaker = speakers.find((s) => s.id === sid);
  const connected = connections.some((c) => c.speakerId === sid);
  const celebrated = useRef(false);
  const { user } = useAuth();
  const pings = useEventPings(event.id, me.uid);

  useEffect(() => {
    if (isNew && !celebrated.current) { celebrated.current = true; confetti(); }
  }, [isNew]);

  if (!speaker) return <Empty title="Speaker not found"><Link href={`/e/${event.id}/speakers`}>Back to speakers</Link></Empty>;
  const talks = sessions.filter((x) => x.speakerIds.includes(speaker.id));
  const tags = (speaker.expertise ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const tray = speakerLinks(speaker);
  const links = [
    speaker.email && { href: `mailto:${speaker.email}`, label: speaker.email, icon: <Icon name="mail" size={19} /> },
    speaker.phone && { href: `tel:${speaker.phone}`, label: speaker.phone, icon: <Icon name="phone" size={19} /> },
  ].filter((x) => !!x);

  async function doConnect() {
    try { await connect(event.id, me, speaker!, 'app'); confetti(); toast(`Connected with ${speaker!.name}`); }
    catch (x) { toast(friendlyError(x), 'err'); }
  }

  return (
    <article className="profile">
      <aside className="profile-card">
        <div className={`profile-cover a-${hue(speaker.id)}`} aria-hidden="true" />
        <div className="profile-id">
          <span className="profile-photo"><EmojiAvatar id={speaker.uid || speaker.id} photo={speaker.photo || undefined} size={124} /></span>
          <h1>{speaker.name}</h1>
          <p className="profile-role">{[speaker.role, speaker.organisation].filter(Boolean).join(' · ')}</p>
          {tags.length > 0 && <div className="tags">{tags.map((t) => <span key={t}>{t}</span>)}</div>}
          <dl className="profile-stats">
            <div><dt>Sessions</dt><dd>{talks.length}</dd></div>
            <div><dt>Status</dt><dd>{connected ? 'Connected' : 'Not yet'}</dd></div>
          </dl>
          {speaker.uid && speaker.uid !== me.uid && (
            <div className="profile-meet"><MeetButton event={event} me={{ uid: me.uid, name: me.name || user?.name || '', photo: user?.photo ?? me.photo, role: myRole ? 'Speaker' : 'Attendee' }} other={{ uid: speaker.uid, name: speaker.name, photo: speaker.photo, role: 'Speaker' }} pings={pings} /></div>
          )}
          {!speaker.uid && (
            <p className="meet-later">Meet Ping opens once {speaker.name.split(' ')[0]} signs in to Gather. Until then, scan their code or use Connect here.</p>
          )}
          {connected
            ? (links.length > 0 || tray.length > 0) && <button className="btn btn-ink btn-block" onClick={() => downloadBlob(`${speaker.name}.vcf`, new Blob([vcard(speaker)], { type: 'text/vcard' }))}><Icon name="download" size={18} /> Save to contacts</button>
            : <div className="profile-cta">
                <Link href={`/e/${event.id}/scan`} className="btn btn-primary"><Icon name="scan" size={18} /> Scan to connect</Link>
                <button className="btn btn-ghost" onClick={doConnect}>Connect here</button>
              </div>}
        </div>
      </aside>

      <div className="profile-main">
        {speaker.topic && (
          <section className={`topic-card a-${hue(speaker.id)}`}>
            <span>Speaking on</span>
            <h2>{speaker.topic}</h2>
          </section>
        )}
        {speaker.bio && <section className="card profile-sec"><h2>About</h2><p className="prose">{speaker.bio}</p></section>}
        <SpeakerFeedbackForm speaker={speaker} />
        {tray.length > 0 && (
          <section className="card profile-sec">
            <h2>Links</h2>
            <div className="link-tray">
              {tray.map((l) => (
                <a key={l.label + l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                  <span>{l.label === 'LinkedIn' ? <LinkedinIcon size={18} /> : <Icon name={l.label === 'Website' ? 'globe' : 'external'} size={18} />}</span>
                  <b>{l.label}</b>
                  <Icon name="arrow" size={16} />
                </a>
              ))}
            </div>
          </section>
        )}
        <section className="card profile-sec">
          <h2>Contact</h2>
          {!connected ? (
            <div className="locked"><Icon name="lock" size={20} /><span>Connect with {speaker.name} to see their email and phone.</span></div>
          ) : links.length ? (
            <ul className="contact-list">
              {links.map((l) => <li key={l.label}><a href={l.href}><span>{l.icon}</span>{l.label}</a></li>)}
            </ul>
          ) : <p className="muted">This speaker hasn’t shared an email or phone number.</p>}
        </section>
        {talks.length > 0 && (
          <section className="card profile-sec">
            <h2>Sessions</h2>
            <ul className="talks">
              {talks.map((t) => {
                const kind = t.kind ?? 'talk';
                return (
                  <li key={t.id}>
                    <span className={`kind-icon kind-${kind}`}><Icon name={KIND_ICON[kind]} size={20} /></span>
                    <span><b>{t.title}</b><small>{KIND_LABEL[kind]} · {fmtDay(t.startsAt)} · {fmtTime(t.startsAt)}</small></span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
