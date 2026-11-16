'use client';

import { TypeDetails } from '../../components/EventTypeInfo';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar, Icon } from '../../components/ui';
import { fmtRange, fmtTime } from '../../lib/format';
import { canRate } from '../../lib/session';
import { useCount } from '../../lib/live';
import { useEventCtx } from './context';
import { HelpCard, VenueCard } from './InfoCards';
import { WifiCard } from './WifiCard';
import { CertificateCard } from './CertificateCard';
import { icsFor } from '../../lib/calendar';
import { downloadBlob } from '../../lib/csv';
import { EventVideo, ScheduleFiles } from '../../components/EventMedia';
import { ActivitiesCard } from './Activities';
import { SaveEventButton } from '../../components/SaveEventButton';
import { useEventPings } from '../../components/MeetPing';
import { EventLiveFeed } from './EventLive';
import { useAuth } from '../../lib/auth';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** "Starts in 2d 4h" — a one-line countdown for the compact header. */
function StartsIn({ to }: { to: string }) {
  const now = useNow(30000);
  const left = Math.max(0, Date.parse(to) - now);
  const d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, m = Math.floor(left / 6e4) % 60;
  return <span className="ev-head-count">Starts in {d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m} min`}</span>;
}

export function EventHome() {
  const { event, me, sessions, speakers, attendance, connections, feedback, info, sessionFeedback, role } = useEventCtx();
  // A count, not the whole list: 1 read instead of one per attendee.
  const people = useCount(`events/${event.id}/directory`);
  const now = useNow(30000);
  const started = Date.parse(event.startsAt) <= Date.now();
  const ended = Date.parse(event.endsAt) < now;
  const live = sessions.find((s) => Date.parse(s.startsAt) <= now && Date.parse(s.endsAt) >= now);
  const next = sessions.find((s) => Date.parse(s.startsAt) > now);
  const rated = new Set(sessionFeedback.map((f) => f.sessionId));
  const toRate = sessions.filter((s) => canRate(s) && !rated.has(s.id)).length;
  const stamps = attendance.length + connections.length + (feedback ? 1 : 0);
  const total = sessions.length + speakers.length + 1;
  const first = (me.name ?? '').split(' ').find((w) => !/^(dr|prof|mr|ms|mrs)\.?$/i.test(w)) ?? me.name;
  const { user } = useAuth();
  // People I'm connected with here: accepted Meet Pings, both directions.
  const pings = useEventPings(event.id, me.uid);
  const met = pings.filter((p) => p.status === 'accepted').map((p) => (p.fromUid === me.uid
    ? { uid: p.toUid, name: p.toName, photo: p.toPhoto } : { uid: p.fromUid, name: p.fromName, photo: p.fromPhoto }));
  const metCount = met.length + connections.length;

  return (
    <div className="stack-lg home-page">
      {/* Compact header: the event at a glance, so the useful things fit above the fold */}
      <section className="ev-head span-2">
        {event.bannerThumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="ev-head-art" src={event.bannerThumb} alt="" />
          : <span className="ev-head-art ev-head-blank" aria-hidden="true">{(event.title ?? '').slice(0, 1)}</span>}
        <div className="ev-head-text">
          <span className="ev-head-kicker">{ended ? 'That’s a wrap' : started ? <><i className="live-dot" aria-hidden="true" /> We’re live</> : 'See you soon'}, {first}</span>
          <h1>{event.title}</h1>
          <p>{fmtRange(event.startsAt, event.endsAt)}{event.venue && ` · ${event.venue}`}</p>
        </div>
        {!started && <StartsIn to={event.startsAt} />}
      </section>

      {/* The four things people open most, at the top */}
      <nav className="ev-tiles span-2" aria-label="Your event">
        <Link href={`/e/${event.id}/schedule`} className="ev-tile t-blue">
          <span className="ev-tile-ic"><Icon name="calendar" size={20} /></span>
          <b>Schedule</b>
          <small>{live ? `Now: ${live.title}` : next ? `Next: ${next.title} · ${fmtTime(next.startsAt)}` : `${sessions.length} session${sessions.length === 1 ? '' : 's'}`}</small>
        </Link>
        <Link href={`/e/${event.id}/pass`} className="ev-tile t-lime">
          <span className="ev-tile-me"><Avatar id={me.uid} name={me.name} photo={me.photo || user?.photo || undefined} size={40} /></span>
          <b>My pass</b>
          <small>{me.checkedIn ? 'Checked in' : 'Show it at the door'}</small>
        </Link>
        <Link href={`/e/${event.id}/people`} className="ev-tile t-violet">
          <span className="ev-tile-faces">
            {met.slice(0, 3).map((p) => <Avatar key={p.uid} id={p.uid} name={p.name} photo={p.photo || undefined} size={30} />)}
            {!met.length && <span className="ev-tile-ic"><Icon name="people" size={20} /></span>}
          </span>
          <b>People</b>
          <small>{metCount ? `${metCount} connected` : people.n ? `${people.n} here · say hi` : 'Find people to meet'}</small>
        </Link>
        <Link href={`/e/${event.id}/speakers`} className="ev-tile t-amber">
          <span className="ev-tile-ic"><Icon name="mic" size={20} /></span>
          <b>Speakers</b>
          <small>{speakers.length ? `${speakers.length} · send a Meet Ping` : 'Coming soon'}</small>
        </Link>
      </nav>

      <div className="span-2"><EventLiveFeed limit={4} /></div>

      <nav className="quick span-2" aria-label="More">
        <Link href={`/e/${event.id}/feedback`} className="chip"><Icon name="feedback" size={18} /> Feedback</Link>
        <Link href={`/e/${event.id}/assets`} className="chip"><Icon name="download" size={18} /> Assets</Link>
        <SaveEventButton event={event} compact />
        {role
          ? <Link href="/speaker" className="chip chip-speaker"><Icon name="mic" size={18} /> Speaker area</Link>
          : <Link href={`/speaker?event=${event.id}`} className="chip"><Icon name="mic" size={18} /> I’m a speaker</Link>}
        <button className="chip" onClick={() => downloadBlob(`${event.title}.ics`, new Blob([icsFor(event)], { type: 'text/calendar' }))}><Icon name="calendar" size={18} /> Add to calendar</button>
      </nav>

      <ActivitiesCard />
      <TypeDetails event={event} className="span-2" />
      <div className="span-2"><CertificateCard /></div>
      <div className="span-2"><ScheduleFiles eventId={event.id} compact /></div>
      {info?.wifiName && <WifiCard info={info} />}
      <HelpCard info={info} />

      <Link href={`/e/${event.id}/pass`} className="progress-card">
        <div><b>{stamps}<small> / {total}</small></b><span>stamps collected</span></div>
        <div className="progress-track"><i style={{ width: `${total ? (stamps / total) * 100 : 0}%` }} /></div>
      </Link>

      {toRate > 0 && (
        <Link href={`/e/${event.id}/feedback`} className="nudge card">
          <span><b>{toRate} {toRate === 1 ? 'session' : 'sessions'} to rate.</b> Tell the organisers how it went.</span><Icon name="arrow" size={20} />
        </Link>
      )}
      {event.feedbackOpen && !feedback && (
        <Link href={`/e/${event.id}/feedback?tab=overall`} className="nudge card">
          <span><b>How was the event?</b> Share your feedback and earn a stamp.</span><Icon name="arrow" size={20} />
        </Link>
      )}

      {speakers.length > 0 && (
        <section className="span-2">
          <div className="row-between"><h2>Speakers</h2><Link href={`/e/${event.id}/speakers`} className="link">See all</Link></div>
          <div className="stories">
            {speakers.map((s) => (
              <Link key={s.id} href={`/e/${event.id}/speakers/${s.id}`} className="story">
                <span className="story-ring"><Avatar id={s.id} name={s.name} photo={s.photo} size={64} /></span>
                <b>{s.name}</b>
              </Link>
            ))}
          </div>
        </section>
      )}

      <VenueCard event={event} />

      {event.description && (
        <section className="about card span-2">
          <h2>About this event</h2>
          <p>{event.description}</p>
          {event.organiser && <p className="muted">Organised by {event.organiser}</p>}
        </section>
      )}
      {event.videoUrl && <div className="span-2"><EventVideo url={event.videoUrl} title={event.title} /></div>}
    </div>
  );
}
