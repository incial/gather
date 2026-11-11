'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Avatar, Empty, Icon, Spinner, useToast } from '../components/ui';
import { swipe, useSwipes } from '../lib/saved';
import { useAuth } from '../lib/auth';
import { fmtRange, fmtTime, friendlyError } from '../lib/format';
import { useCol } from '../lib/live';
import { backend, type Where } from '../lib/backend';
import type { EventDoc, MembershipDoc, SwipeDoc } from '../lib/types';

const THRESHOLD = 90;
const FLY_MS = 420;

type Decide = (ev: EventDoc, choice: SwipeDoc['choice']) => void;

function Reel({ event, onDecide, savedIcon }: { event: EventDoc; onDecide: Decide; savedIcon: React.RefObject<HTMLAnchorElement | null> }) {
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; id: number; axis: '' | 'x' | 'y' } | null>(null);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);

  function decide(choice: SwipeDoc['choice']) {
    if (leaving || !card.current) return;
    setLeaving(true);
    const el = card.current;
    const box = el.getBoundingClientRect();
    el.style.transition = `transform ${FLY_MS}ms cubic-bezier(.5,0,.2,1), opacity ${FLY_MS}ms`;
    const target = savedIcon.current?.getBoundingClientRect();
    if (choice === 'save' && target) {
      // The card shrinks into the Saved icon.
      const tx = target.left + target.width / 2 - (box.left + box.width / 2);
      const ty = target.top + target.height / 2 - (box.top + box.height / 2);
      el.style.transform = `translate(${tx}px, ${ty}px) scale(.04)`;
      el.style.opacity = '.5';
    } else {
      el.style.transform = `translate(${choice === 'save' ? '' : '-'}130vw, 40px) rotate(${choice === 'save' ? '' : '-'}18deg)`;
      el.style.opacity = '0';
    }
    setTimeout(() => onDecide(event, choice), FLY_MS);
  }

  const down = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: '' };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x, my = e.clientY - d.y;
    if (!d.axis && Math.hypot(mx, my) > 8) {
      d.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (d.axis === 'x') card.current?.setPointerCapture(d.id);
    }
    if (d.axis === 'x') setDx(mx);
  };
  const up = () => {
    const went = dx;
    drag.current = null;
    setDx(0);
    if (Math.abs(went) > THRESHOLD) decide(went > 0 ? 'save' : 'skip');
  };

  const dragging = dx !== 0;
  return (
    <section className="reel" data-reel aria-label={event.title}>
      <div
        ref={card}
        className={`reel-card a-${event.color}`}
        style={dragging ? { transform: `translateX(${dx}px) rotate(${dx / 22}deg)`, transition: 'none' } : undefined}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      >
        <span className="stamp-label stamp-save" style={{ opacity: Math.min(1, dx / THRESHOLD) }}>Saved</span>
        <span className="stamp-label stamp-skip" style={{ opacity: Math.min(1, -dx / THRESHOLD) }}>Skip</span>
        <div className="reel-top">
          <span className="tile-tag">{fmtRange(event.startsAt, event.endsAt)} · {fmtTime(event.startsAt)}</span>
          <h2>{event.title}</h2>
          <p>{event.tagline}</p>
        </div>
        <div className="reel-bottom">
          <p className="reel-venue">{event.venue}</p>
          {event.lineup.length > 0 && (
            <div className="reel-lineup">
              {event.lineup.slice(0, 5).map((s) => <Avatar key={s.id} id={s.id} name={s.name} photo={s.photo} size={38} />)}
              <span>{event.lineup.length} {event.lineup.length === 1 ? 'speaker' : 'speakers'}</span>
            </div>
          )}
          <div className="reel-actions">
            <button className="round-btn" aria-label={`Skip ${event.title}`} onClick={() => decide('skip')}><Icon name="close" size={26} /></button>
            <Link className="btn btn-glass btn-sm" href={`/e/${event.id}`}>Details</Link>
            <button className="round-btn round-save" aria-label={`Save ${event.title}`} onClick={() => decide('save')}><Icon name="bookmark" size={26} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Explore() {
  const { user, loading } = useAuth();
  const nav = useRouter();
  const toast = useToast();
  const published = useOnce<EventDoc>('events', [['published', true]], 60);
  const swipes = useSwipes(user?.uid);
  const mine = useCol<MembershipDoc>(user ? `users/${user.uid}/events` : null);
  const savedIcon = useRef<HTMLAnchorElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [pulse, setPulse] = useState(0);

  // Undiscovered first. Saved and joined events never come back; skipped ones come back only
  // after everything new has been seen (a second round), without erasing the skip.
  const upcoming = useMemo(() => published.data.filter((e) => Date.parse(e.endsAt) > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [published.data]);
  const seen = useMemo(() => new Set([...swipes.all.map((s) => s.id), ...mine.data.map((m) => m.id), ...gone]), [swipes.all, mine.data, gone]);
  const fresh = useMemo(() => upcoming.filter((e) => !seen.has(e.id)), [upcoming, seen]);
  const skippedIds = useMemo(() => new Set(swipes.skipped.map((s) => s.id)), [swipes.skipped]);
  const joinedIds = useMemo(() => new Set(mine.data.map((m) => m.id)), [mine.data]);
  const secondRound = useMemo(() => upcoming.filter((e) => skippedIds.has(e.id) && !joinedIds.has(e.id) && !gone.includes(e.id)), [upcoming, skippedIds, joinedIds, gone]);
  const reels = fresh.length ? fresh : secondRound;
  const again = !fresh.length && secondRound.length > 0;
  // The same count as the profile and the Saved page.
  const savedCount = swipes.saved.length;

  const decide: Decide = (ev, choice) => {
    if (!user) { nav.push(`/login?next=${encodeURIComponent('/explore')}`); return; }
    setGone((g) => [...g, ev.id]);
    if (choice === 'save') setPulse((n) => n + 1);
    swipe(ev, user, choice).catch((x) => {
      setGone((g) => g.filter((id) => id !== ev.id));
      toast(friendlyError(x), 'err');
    });
  };

  // Left and right arrows act on the reel in view; up and down scroll natively.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const box = scroller.current;
      if (!box) return;
      // The reel nearest the top of the screen is the one in view.
      const current = [...box.querySelectorAll('[data-reel]')].sort((x, y) => Math.abs(x.getBoundingClientRect().top) - Math.abs(y.getBoundingClientRect().top))[0];
      current?.querySelector<HTMLButtonElement>(e.key === 'ArrowRight' ? '.round-save' : '.round-btn:not(.round-save)')?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const busy = loading || published.loading;
  return (
    <div className="explore">
      <header className="explore-top">
        <Link href="/" className="icon-btn" aria-label="Back to home"><Icon name="back" size={20} /></Link>
        <b>Explore</b>
        <Link ref={savedIcon} href="/saved" className="icon-btn saved-icon" aria-label={`Saved events, ${savedCount}`}>
          <span key={pulse} className={pulse ? 'bump' : ''}><Icon name="bookmark" size={20} /></span>
          {savedCount > 0 && <i>{savedCount}</i>}
        </Link>
      </header>
      {busy ? <div className="center"><Spinner /></div> : reels.length === 0 ? (
        <div className="center">
          <Empty title="You’re all caught up">
            New events will show up here.
            <div className="row-center">
              <Link className="btn btn-ink btn-sm" href="/saved">See saved</Link>
              {user && swipes.skipped.length > 0 && gone.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setGone([])}>Go through skipped events again</button>}
            </div>
          </Empty>
        </div>
      ) : (
        <>
          <div className="reels" ref={scroller}>
            {reels.map((e) => <Reel key={e.id} event={e} onDecide={decide} savedIcon={savedIcon} />)}
          </div>
          <p className="reel-hint">{again ? 'You’ve seen everything new. These are events you skipped earlier. · ' : ''}Scroll for more · Right to save · Left to skip</p>
        </>
      )}
    </div>
  );
}

/** Reads a list once (no live listener), capped at `max` documents. */
function useOnce<T>(path: string, where: Where, max: number) {
  const [s, set] = useState<{ data: T[]; loading: boolean; error: Error | null }>({ data: [], loading: true, error: null });
  const key = JSON.stringify(where);
  useEffect(() => {
    let live = true;
    backend.getCol<T>(path, JSON.parse(key), { limit: max })
      .then((data) => { if (live) set({ data, loading: false, error: null }); })
      .catch((error) => { if (live) set({ data: [], loading: false, error }); });
    return () => { live = false; };
  }, [path, key, max]);
  return s;
}
