'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DemoBanner, Icon, Logo } from '../components/ui';

const WORDS = ['Join', 'Explore', 'Check in', 'Connect', 'Give feedback'];

/** The rolling word list: the centre word is sharp and the rest fade out above and below.
 * A copy of the first word sits at the end so the loop rolls forward forever instead of rewinding. */
function WordWheel() {
  const [i, setI] = useState(0);
  const [snap, setSnap] = useState(false);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => { if (!document.hidden) setI((n) => Math.min(n + 1, WORDS.length)); }, 1900);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!snap) return;
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)));
    return () => cancelAnimationFrame(f);
  }, [snap]);
  // After rolling onto the copy (the roll takes 0.6s), jump back to the real first word without animating.
  useEffect(() => {
    if (i !== WORDS.length) return;
    const t = setTimeout(() => { setSnap(true); setI(0); }, 700);
    return () => clearTimeout(t);
  }, [i]);
  const list = [...WORDS, WORDS[0]];
  return (
    <div className="wheel" role="img" aria-label={WORDS.join(', ')}>
      <div className={`wheel-track${snap ? ' snap' : ''}`} style={{ transform: `translateY(${-i * 1.22}em)` }} aria-hidden="true">
        {list.map((w, n) => <span key={n} className={n === i || (i === WORDS.length && n === 0) ? 'on' : ''}>{w}</span>)}
      </div>
    </div>
  );
}

export function Site() {
  return (
    <div className="site">
      <DemoBanner />
      <header className="site-nav">
        <Logo />
        <nav aria-label="Website">
          <Link href="/explore">Explore</Link>
          <Link href="/pulse/join">Pulse</Link>
          <a href="#features">Features</a>
          <a href="#organisers">For organisers</a>
        </nav>
        <Link href="/login" className="btn btn-ink btn-sm">Log in</Link>
      </header>

      <section className="site-hero">
        <div className="hero-copy">
          <WordWheel />
          <h1>Your event,<br />all in one place.</h1>
          <p>Find events you’ll love, join in seconds, and get everything for the day on your phone.</p>
          <div className="hero-actions">
            <Link href="/login" className="btn btn-white">Attendee login</Link>
            <Link href="/organiser/login" className="btn btn-glass">Organiser login</Link>
          </div>
        </div>
        <div className="hero-phone" aria-hidden="true">
          <div className="hero-reel a-lime"><small>Sat, 14 Nov</small><b>Event of the week</b><span>Swipe right to save</span></div>
          <div className="hero-reel hero-reel-2 a-violet"><small>Next up</small><b>Your next event</b></div>
        </div>
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
            <div className="mini-stars" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={30} filled />)}</div>
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
