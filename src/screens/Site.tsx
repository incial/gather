'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DemoBanner, Icon, Logo } from '../components/ui';
import { WARP_CAROUSEL_CARDS, WarpCarousel, type WarpCard } from '../components/ui/warp-carousel';
import { backend } from '../lib/backend';
import { typeInfo } from '../lib/eventTypes';
import { fmtDate, fmtTime, hue } from '../lib/format';
import type { Accent, EventDoc } from '../lib/types';

/* ---------- Upcoming events, readable without signing in (published events only) ---------- */

function useUpcoming(max = 8) {
  const [s, set] = useState<{ data: EventDoc[]; loading: boolean }>({ data: [], loading: true });
  useEffect(() => {
    let live = true;
    backend.getCol<EventDoc>('events', [['published', true]], { limit: 60 })
      .then((all) => {
        if (!live) return;
        const now = Date.now();
        const data = all.filter((e) => !e.deleting && Date.parse(e.endsAt ?? e.startsAt) > now)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, max);
        set({ data, loading: false });
      })
      .catch(() => { if (live) set({ data: [], loading: false }); });
    return () => { live = false; };
  }, [max]);
  return s;
}

function useWide(query = '(min-width: 760px)') {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

/* ---------- Event → carousel card, in the event's own colour ---------- */

const [W_BLUE, W_VIOLET, W_AMBER, W_ROSE] = WARP_CAROUSEL_CARDS;
const LIME_MESH = ['#0b0f00', '#1d2600', '#3d5200', '#6f9400', '#a6d600', '#c8ff00', '#e6ff7a', '#c8ff00', '#7aa300', '#2b3a00'];
const LOOK: Record<Accent, Pick<WarpCard, 'mesh' | 'numeral' | 'accent' | 'glow' | 'detail'>> = {
  blue: { mesh: W_BLUE.mesh, numeral: W_BLUE.numeral, accent: W_BLUE.accent, glow: W_BLUE.glow, detail: 'ring' },
  violet: { mesh: W_VIOLET.mesh, numeral: W_VIOLET.numeral, accent: W_VIOLET.accent, glow: W_VIOLET.glow, detail: 'wave' },
  amber: { mesh: W_AMBER.mesh, numeral: W_AMBER.numeral, accent: W_AMBER.accent, glow: W_AMBER.glow, detail: 'ring' },
  rose: { mesh: W_ROSE.mesh, numeral: W_ROSE.numeral, accent: W_ROSE.accent, glow: W_ROSE.glow, detail: 'wave' },
  lime: { mesh: LIME_MESH, numeral: ['#f4ff9e', '#c8ff00'], accent: '#c8ff00', glow: '#b8e600', detail: 'ring' },
};

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Splits a title over the card's two small lines, without breaking words. */
function twoLines(title: string, n = 24) {
  const words = title.trim().split(/\s+/);
  let a = '';
  while (words.length && (a + ' ' + words[0]).trim().length <= n) a = `${a} ${words.shift()}`.trim();
  if (!a) a = cut(words.shift() ?? '', n);
  return words.length ? `${a}\n${cut(words.join(' '), n)}` : a;
}

const colourOf = (e: EventDoc): Accent => e.color ?? hue(e.id);

function toCard(e: EventDoc): WarpCard {
  const d = new Date(e.startsAt);
  const type = typeInfo(e.eventType)?.label;
  return {
    ...LOOK[colourOf(e)],
    title: twoLines(e.title),
    value: String(d.getDate()).padStart(2, '0'),
    unit: d.toLocaleString('en-IN', { month: 'short' }),
    footer: cut([type, e.venue].filter(Boolean).join(' · '), 34),
  };
}

/** What the carousel shows when nothing is listed yet: what Gather does, in numbers. */
const FEATURE_CARDS: WarpCard[] = [
  { ...LOOK.blue, title: 'Join any event\nwith a code', value: '6', unit: 'digits', footer: 'Nothing to install' },
  { ...LOOK.violet, title: 'Check-in code\nrefreshes every', value: '30', unit: 's', footer: 'Attendance stays honest' },
  { ...LOOK.amber, title: 'Live polls\nanswered in', value: '1', unit: 'tap', footer: 'Right from your phone' },
  { ...LOOK.rose, title: 'Feedback for\nevery session', value: '5', unit: 'stars', footer: 'Speakers see it live' },
];

const FONT = "'Geist Variable', system-ui, -apple-system, sans-serif";

/* ---------- Showcase: 3D carousel on wide screens, a swipeable reel on phones ---------- */

function Showcase({ events, loading }: { events: EventDoc[]; loading: boolean }) {
  const wide = useWide();
  const [i, setI] = useState(0);
  const cards = useMemo(() => (events.length ? events.map(toCard) : FEATURE_CARDS), [events]);
  const front = events[i % Math.max(1, events.length)];

  if (loading) return <div className="hx-stage hx-loading" aria-hidden="true" />;

  if (!wide) {
    return (
      <div className="hx-rail-wrap">
        {events.length ? (
          <div className="hx-rail" aria-label="Upcoming events">
            {events.map((e) => {
              const type = typeInfo(e.eventType);
              return (
                <Link key={e.id} href={`/e/${e.id}`} className={`hx-card a-${colourOf(e)}`}>
                  <span className="hx-card-top">
                    {type && <span className="hx-tag">{type.label}</span>}
                    <span className="hx-date"><b>{String(new Date(e.startsAt).getDate()).padStart(2, '0')}</b>{new Date(e.startsAt).toLocaleString('en-IN', { month: 'short' })}</span>
                  </span>
                  <span className="hx-card-body">
                    <b>{e.title}</b>
                    <small>{fmtDate(e.startsAt)} · {fmtTime(e.startsAt)}</small>
                    {e.venue && <small><Icon name="pin" size={14} /> {e.venue}</small>}
                  </span>
                  <span className="hx-card-go">View event <Icon name="arrow" size={16} /></span>
                </Link>
              );
            })}
            <Link href="/explore" className="hx-card hx-card-more">
              <Icon name="compass" size={30} />
              <b>Swipe through them all</b>
              <small>Right to save, left to skip</small>
            </Link>
          </div>
        ) : (
          <div className="hx-empty">
            <Icon name="calendar" size={22} />
            <span>New events are on their way. Have a code from an organiser? <Link href="/join">Join with it</Link>.</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="hx-show">
      <div className="hx-stage">
        <WarpCarousel cards={cards} background="#F6F6F4" font={FONT} step={1} interval={4.2} onIndexChange={setI}
          ariaLabel={events.length ? 'Upcoming events' : 'What Gather does'} style={{ minHeight: 0, aspectRatio: 'auto' }} />
      </div>
      {front ? (
        <div className="hx-caption" aria-live="polite">
          <div>
            <small>{[typeInfo(front.eventType)?.label, fmtDate(front.startsAt), fmtTime(front.startsAt)].filter(Boolean).join(' · ')}</small>
            <b>{front.title}</b>
            {front.venue && <span><Icon name="pin" size={15} /> {front.venue}</span>}
          </div>
          <div className="hx-caption-actions">
            <Link href={`/e/${front.id}`} className="btn btn-ink btn-sm">View event</Link>
            <Link href="/explore" className="btn btn-white btn-sm">All events</Link>
          </div>
        </div>
      ) : (
        <p className="hx-note">Drag the cards. New events appear here as soon as organisers publish them.</p>
      )}
    </div>
  );
}

export function Site() {
  const upcoming = useUpcoming();
  const n = upcoming.data.length;
  return (
    <div className="site">
      <DemoBanner />
      <header className="site-nav">
        <Logo />
        <nav aria-label="Website">
          <Link href="/explore">Explore</Link>
          <Link href="/join">Join with code</Link>
          <Link href="/pulse/join">Pulse</Link>
          <a href="#organisers">For organisers</a>
        </nav>
        <Link href="/login" className="btn btn-ink btn-sm">Log in</Link>
      </header>

      <section className="hx" aria-labelledby="hx-h">
        <div className="hx-copy">
          <span className="hx-pill"><i className="live-dot" aria-hidden="true" />{upcoming.loading ? 'Events, made simple' : n ? `${n} event${n === 1 ? '' : 's'} coming up` : 'Events, made simple'}</span>
          <h1 id="hx-h">Events worth<br />showing up for.</h1>
          <p>Find an event, join with a six-digit code, and keep your pass, schedule, people and feedback in one place.</p>
          <div className="hx-actions">
            <Link href="/explore" className="btn btn-ink">Explore events <Icon name="arrow" size={18} /></Link>
            <Link href="/login" className="btn btn-white">Log in</Link>
          </div>
          <ul className="hx-facts">
            <li><Icon name="ticket" size={17} /> Join in seconds</li>
            <li><Icon name="scan" size={17} /> One-scan check-in</li>
            <li><Icon name="live" size={17} /> Live polls &amp; feedback</li>
          </ul>
        </div>
        <Showcase events={upcoming.data} loading={upcoming.loading} />
      </section>

      <section id="features" className="bento">
        <h2>Everything an event needs.<br />Nothing it doesn’t.</h2>
        <div className="bento-grid">
          <Link href="/explore" className="tile tile-lime tile-wide">
            <span className="tile-tag">Explore</span>
            <h3>Swipe through events like reels.</h3>
            <p>Right to save. Left to skip. Join from your saved list in one tap.</p>
            <div className="mini-swipe" aria-hidden="true"><i /><i /><i /></div>
          </Link>
          <div className="tile tile-ink">
            <span className="tile-tag">Check in</span>
            <h3>One scan and you’re in.</h3>
            <p>The room’s code changes every 30 seconds, so attendance stays honest.</p>
          </div>
          <div className="tile tile-blue">
            <span className="tile-tag">Join</span>
            <h3>Six digits. That’s it.</h3>
            <div className="mini-code" aria-hidden="true">{'482913'.split('').map((d, i) => <b key={i}>{d}</b>)}</div>
          </div>
          <div className="tile tile-white">
            <span className="tile-tag">In the room</span>
            <h3>Wi-Fi, people and speakers.</h3>
            <p>Connect with a speaker by scanning their code, and keep their details.</p>
          </div>
          <div className="tile tile-white">
            <span className="tile-tag">After</span>
            <h3>Feedback for every session.</h3>
            <div className="mini-stars" aria-hidden="true">{[1, 2, 3, 4, 5].map((k) => <Icon key={k} name="star" size={30} filled />)}</div>
          </div>
        </div>
      </section>

      <section id="organisers" className="organisers">
        <div>
          <span className="tile-tag">For organisers</span>
          <h2>Run the day. Keep the data.</h2>
          <p>Add events, import your registration list, run check-in on the big screen and see attendance live.</p>
          <Link href="/organiser/login" className="btn btn-lime">Organiser login</Link>
        </div>
        <ul>
          {['Attendance register with P/A for every session', 'Feedback with speaker ratings', 'Registration lists, connections and saves', 'Download any of it as CSV, or all of it at once'].map((t) => (
            <li key={t}><Icon name="check" size={18} />{t}</li>
          ))}
        </ul>
      </section>

      <section className="site-cta">
        <h2>See what’s coming up.</h2>
        <Link href="/explore" className="btn btn-ink">Explore events</Link>
      </section>
      <footer className="site-foot"><Logo /><span>Made for people who show up.</span></footer>
    </div>
  );
}
