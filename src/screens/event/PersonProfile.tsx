'use client';

import { ChevronLeft, Globe, Link2, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MeetButton, useEventPings } from '../../components/MeetPing';
import { Avatar, Empty, LinkedinIcon, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { webUrl } from '../../lib/links';
import { useDoc } from '../../lib/live';
import { relation } from '../../lib/meetping';
import type { PublicProfile } from '../../lib/profile';
import type { DirectoryDoc } from '../../lib/types';
import { useEventCtx } from './context';

/**
 * Someone's profile as other attendees see it: what's on the event's People list, plus whatever
 * they made public on their Gather profile. Email and phone are never shown.
 */
export function PersonProfile() {
  const { uid } = useParams<{ uid: string }>();
  const { event, me, speakers, role: myRole } = useEventCtx();
  const { user } = useAuth();
  const dir = useDoc<DirectoryDoc>(`events/${event.id}/directory/${uid}`);
  const pub = useDoc<PublicProfile>(`profiles/${uid}`);
  const pings = useEventPings(event.id, me.uid);
  const speaker = speakers.find((s) => s.uid === uid);
  const back = <Link href={`/e/${event.id}/people`} className="pp-back"><ChevronLeft size={16} /> People</Link>;

  if (dir.loading || pub.loading) return <Spinner />;
  // A profile is visible if they're on the event's People list, or they're a speaker here.
  const p = pub.data && pub.data.visibility === 'public' ? pub.data : null;
  if (!dir.data && !speaker) return <div className="stack-lg">{back}<Empty title="Profile not available">This person isn’t on the People list for this event, or has hidden their profile.</Empty></div>;
  const name = dir.data?.name || speaker?.name || p?.name || 'Attendee';
  const photo = p?.photo || dir.data?.photo || speaker?.photo;
  const role = speaker ? 'Speaker' : 'Attendee';
  const work = [dir.data?.designation || p?.designation, dir.data?.institution || p?.organisation].filter(Boolean).join(', ');
  const rel = relation(me.uid, uid, pings);
  const links = p ? [
    p.linkedin && { label: 'LinkedIn', url: p.linkedin.startsWith('http') ? p.linkedin : `https://www.linkedin.com/in/${p.linkedin.replace(/^.*in\//, '')}`, icon: <LinkedinIcon size={17} /> },
    p.website && { label: 'Website', url: webUrl(p.website), icon: <Globe size={17} /> },
    p.portfolio && { label: 'Portfolio', url: webUrl(p.portfolio), icon: <Link2 size={17} /> },
    ...(p.links ?? []).map((l) => ({ label: l.label, url: webUrl(l.url), icon: <Link2 size={17} /> })),
  ].filter((x): x is { label: string; url: string; icon: React.JSX.Element } => !!x && !!x.url) : [];

  return (
    <div className="stack-lg">
      {back}
      <article className="pp card">
        <div className={`pp-cover a-${event.color}`} aria-hidden="true" />
        <div className="pp-id">
          <Avatar id={uid} name={name} photo={photo} size={112} />
          <h1>{name}{uid === me.uid && <span className="you">You</span>}</h1>
          <span className={`role-chip${speaker ? ' speaker' : ''}`}>{role} at {event.title}</span>
          {p?.headline && <p className="pp-headline">{p.headline}</p>}
          {work && <p className="muted">{work}</p>}
          {p?.location && <p className="muted pp-loc"><MapPin size={14} aria-hidden="true" /> {p.location}</p>}
          <div className="pp-actions">
            <MeetButton event={event} me={{ uid: me.uid, name: me.name || user?.name || '', photo: user?.photo ?? me.photo, role: myRole ? 'Speaker' : 'Attendee' }} other={{ uid, name, photo, role }} pings={pings} />
            {speaker && <Link className="btn btn-ghost" href={`/e/${event.id}/speakers/${speaker.id}`}>Speaker page</Link>}
          </div>
          {rel.kind === 'incoming' && rel.ping && <blockquote className="pp-msg">“{rel.ping.message}”</blockquote>}
        </div>
      </article>

      {p?.bio && <section className="card pp-sec"><h2>About</h2><p className="prose">{p.bio}</p></section>}
      {p && (p.skills.length > 0 || p.interests.length > 0) && (
        <section className="card pp-sec">
          {p.skills.length > 0 && <><h2>Skills</h2><div className="tags">{p.skills.map((t) => <span key={t}>{t}</span>)}</div></>}
          {p.interests.length > 0 && <><h2>Interests</h2><div className="tags">{p.interests.map((t) => <span key={t}>{t}</span>)}</div></>}
        </section>
      )}
      {p?.education && <section className="card pp-sec"><h2>Education</h2><p>{p.education}</p></section>}
      {links.length > 0 && (
        <section className="card pp-sec">
          <h2>Links</h2>
          <div className="link-tray">{links.map((l) => <a key={l.label + l.url} href={l.url} target="_blank" rel="noopener noreferrer"><span>{l.icon}</span><b>{l.label}</b></a>)}</div>
        </section>
      )}
      {!p && <p className="muted">{name} hasn’t made more of their profile public.</p>}
      <p className="muted pp-privacy">Email addresses and phone numbers are never shown here.</p>
    </div>
  );
}
