'use client';

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { emojiFor, toneFor } from '../lib/persona';

const still = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A person as a big emoji on a coloured squircle, like a sticker. With a photo, the photo fills the
 * squircle and the emoji sits on it as a small badge.
 */
export function EmojiAvatar({ id, photo, size = 56, name }: { id: string; photo?: string; size?: number; name?: string }) {
  const style = { '--s': `${size}px` } as CSSProperties;
  return (
    <span className={`emo t-${toneFor(id)}`} style={style} role={name ? 'img' : undefined} aria-label={name} aria-hidden={name ? undefined : true}>
      {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <span className="emo-face">{emojiFor(id)}</span>}
      {photo && <span className="emo-badge">{emojiFor(id)}</span>}
    </span>
  );
}

/** Fades and lifts its content in as it scrolls into view, with a small stagger between siblings. */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }: { as?: ElementType; delay?: number; className?: string; children: ReactNode } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || still() || !('IntersectionObserver' in window)) { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal${shown ? ' in' : ''} ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties} {...rest}>{children}</Tag>;
}

/** Counts up to a number with an ease-out, the first time it's shown. */
export function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (still()) { setN(value); return; }
    const start = performance.now(); const a = from.current; const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 4);
      setN(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

/** A fanned stack of person cards, like a hand of playing cards. */
export function PeopleStack({ people }: { people: { uid: string; name: string; photo?: string; sub: string }[] }) {
  return (
    <div className="pstack" aria-hidden="true">
      {people.slice(0, 3).map((p, i) => (
        <div key={p.uid} className={`pstack-card t-${toneFor(p.uid)}`} style={{ '--i': i } as CSSProperties}>
          <EmojiAvatar id={p.uid} photo={p.photo} size={44} />
          <span className="grow"><b>{p.name}</b><small>{p.sub}</small></span>
          <span className="pstack-pill">Connected</span>
        </div>
      ))}
    </div>
  );
}
