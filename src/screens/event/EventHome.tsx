'use client';

import { TypeChip, TypeDetails } from '../../components/EventTypeInfo';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar, Icon } from '../../components/ui';
import { fmtDay, fmtRange, fmtTime } from '../../lib/format';
import { canRate } from '../../lib/session';
import { useCount } from '../../lib/live';
import { useEventCtx } from './context';
import { HelpCard, VenueCard } from './InfoCards';
import { WifiCard } from './WifiCard';
import { CertificateCard } from './CertificateCard';
import { icsFor } from '../../lib/calendar';
import { downloadBlob } from '../../lib/csv';
import { EventBanner, EventVideo, ScheduleFiles } from '../../components/EventMedia';
import { ActivitiesCard } from './Activities';
import { SaveEventButton } from '../../components/SaveEventButton';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function Countdown({ to }: { to: string }) {
  const now = useNow();
  const left = Math.max(0, Date.parse(to) - now);
  const parts: [string, number][] = [
    ['days', Math.floor(left / 864e5)], ['hrs', Math.floor(left / 36e5) % 24],
    ['min', Math.floor(left / 6e4) % 60], ['sec', Math.floor(left / 1000) % 60],
  ];
  return (
    <div className="countdown" role="timer" aria-label="Time until the event starts">
      {parts.map(([l, n]) => <div key={l}><b>{String(n).padStart(2, '0')}</b><span>{l}</span></div>)}
    </div>
  );
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
  const spotlight = live ?? next;
  const rated = new Set(sessionFeedback.map((f) => f.sessionId));
  const toRate = sessions.filter((s) => canRate(s) && !rated.has(s.id)).length;
  const stamps = attendance.length + connections.length + (feedback ? 1 : 0);
  const total = sessions.length + speakers.length + 1;
  const first = me.name.split(' ').find((w) => !/^(dr|prof|mr|ms|mrs)\.?$/i.test(w)) ?? me.name;

  return (
    <div className="stack-lg home-page">
      <EventBanner event={event} className="span-2" />
      <section className="hello-card span-2">
        <span className="kicker">{ended ? 'That’s a wrap' : started ? 'We’re live' : 'See you soon'}, {first}</span>
        <TypeChip event={event} />
        <h1>{event.title}</h1>
        <p>{event.tagline}</p>
        {!started && <Countdown to={event.startsAt} />}
        <div className="hello-meta"><span>{fmtRange(event.startsAt, event.endsAt)}</span><span>{event.venue}</span></div>
      </section>

      <nav className="quick span-2" aria-label="Shortcuts">
        <Link href={`/e/${event.id}/schedule`} className="chip"><Icon name="calendar" size={18} /> Schedule</Link>
        <Link href={`/e/${event.id}/pass`} className="chip"><Icon name="ticket" size={18} /> My pass</Link>
        <Link href={`/e/${event.id}/people`} className="chip"><Icon name="people" size={18} /> {people.n === null ? 'People' : `${people.n} ${people.n === 1 ? 'person' : 'people'}`}</Link>
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

      {spotlight && (
        <Link href={`/e/${event.id}/schedule`} className="spot card">
          <span className={live ? 'pill pill-live' : 'pill'}>{live ? 'Happening now' : 'Up next'}</span>
          <h2>{spotlight.title}</h2>
          <p>{fmtDay(spotlight.startsAt)} · {fmtTime(spotlight.startsAt)}{spotlight.room && ` · ${spotlight.room}`}</p>
        </Link>
      )}

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
