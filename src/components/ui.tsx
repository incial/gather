'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  ArrowRight, BadgeCheck, Bell, Bookmark, Radio, Search, CalendarDays, Check, ChevronLeft, Clock, Coffee, Compass, Download, ExternalLink, Globe, Hammer,
  House, Lock, Mail, MapPin, MessageSquareText, Mic, Phone, Plus, ScanLine, ShieldCheck, Sparkles, Star, Ticket, UserRound, Users, Wifi, X,
} from 'lucide-react';
import { isDemo } from '../lib/backend';
import { useAuth } from '../lib/auth';
import { useCol } from '../lib/live';
import { downloadCsv } from '../lib/csv';
import type { Sheet } from '../lib/exports';
import { hue, initials } from '../lib/format';

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link href={to} className="logo" aria-label="Gather home">
      <span className="logo-mark" aria-hidden="true" />gather
    </Link>
  );
}

const ICONS = {
  home: House, speakers: UserRound, people: Users, feedback: MessageSquareText, scan: ScanLine, plus: Plus,
  back: ChevronLeft, wifi: Wifi, calendar: CalendarDays, ticket: Ticket, shield: ShieldCheck, bookmark: Bookmark,
  compass: Compass, close: X, check: Check, star: Star, download: Download, external: ExternalLink, arrow: ArrowRight,
  lock: Lock, mail: Mail, phone: Phone, globe: Globe, clock: Clock, pin: MapPin, mic: Mic, tool: Hammer,
  sparkle: Sparkles, coffee: Coffee, verified: BadgeCheck, bell: Bell, live: Radio, search: Search,
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, filled }: { name: IconName; size?: number; filled?: boolean }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={1.8} fill={filled ? 'currentColor' : 'none'} aria-hidden="true" />;
}

/** LinkedIn's mark isn't in the icon set, so it's drawn here. */
export function LinkedinIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.900 21H3.300V9.200h3.600zM5.100 7.600a2.100 2.100 0 1 1 0-4.200 2.100 2.100 0 0 1 0 4.200zM21 21h-3.600v-5.700c0-1.400 0-3.100-1.900-3.100s-2.200 1.500-2.200 3V21H9.700V9.200h3.400v1.600h.1a3.800 3.800 0 0 1 3.400-1.900c3.600 0 4.300 2.400 4.300 5.500z" /></svg>;
}

/**
 * The attendee menu bar: Home, Explore, People, Live, Alerts and Profile (with your photo). Joining
 * and Pulse live on Home; organiser tools are in organiser mode.
 */
export function GlobalNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const unread = useCol<{ id: string }>(user ? `users/${user.uid}/notifications` : null, useMemo<[string, unknown][]>(() => [['read', false]], []));
  const n = unread.data.length;
  const homeish = pathname === '/' || ['/join', '/saved', '/pulse'].some((p) => pathname.startsWith(p));
  const items: { href: string; label: string; icon?: IconName; on: boolean; badge?: number; avatar?: boolean }[] = [
    { href: '/', label: 'Home', icon: 'home', on: homeish },
    { href: '/explore', label: 'Explore', icon: 'compass', on: pathname.startsWith('/explore') },
    { href: '/people', label: 'People', icon: 'people', on: pathname.startsWith('/people') },
    { href: '/activity', label: 'Live', icon: 'live', on: pathname.startsWith('/activity') },
    { href: '/inbox', label: 'Alerts', icon: 'bell', on: pathname.startsWith('/inbox'), badge: n },
    { href: '/profile', label: 'Profile', on: pathname.startsWith('/profile'), avatar: true },
  ];
  // Visitors who aren't signed in (e.g. browsing Explore from the website) don't get the app's menu bar.
  if (!user) return null;
  return (
    <nav className="global-nav" aria-label="Main">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={i.on ? 'on' : ''} aria-current={i.on ? 'page' : undefined}
          aria-label={i.badge ? `${i.label}, ${i.badge} unread` : i.label}>
          <span className="gn-ic">
            {i.avatar && user ? <Avatar id={user.uid} name={user.name || user.email} photo={user.photo} size={24} /> : <Icon name={i.icon ?? 'home'} size={21} />}
            {!!i.badge && <i className="gn-badge">{i.badge > 9 ? '9+' : i.badge}</i>}
          </span>
          <span className="gn-label">{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div className="spinner" role="status"><span className="spinner-dot" /><span className="spinner-dot" /><span className="spinner-dot" /><span className="sr">{label}</span></div>;
}

export function DemoBanner() {
  if (!isDemo) return null;
  return <div className="demo-banner">Demo mode: everything stays in this browser until Firebase is connected.</div>;
}

export function Avatar({ id, name, photo, size = 56 }: { id: string; name: string; photo?: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.36 };
  if (photo) return <img className="avatar" src={photo} alt="" style={style} referrerPolicy="no-referrer" />;
  return <span className={`avatar c-${hue(id)}`} style={style} aria-hidden="true">{initials(name)}</span>;
}

export function QrImage({ text, size = 240, label }: { text: string; size?: number; label: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    // Loaded on first use, so pages without a QR code (the home page included) don't download the library.
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(text, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1B1530', light: '#FFFFFF' } }))
      .then((u) => { if (live) setSrc(u); }).catch(() => {});
    return () => { live = false; };
  }, [text, size]);
  return <div className="qr" style={{ width: size, height: size }}>{src && <img src={src} alt={label} />}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Drawn at the top of the page, so styles of whatever opened it (a card, a list row) never leak in.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: string; n: number } | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast((t) => ({ msg, kind, n: (t?.n ?? 0) + 1 }));
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div key={toast.n} className={`toast toast-${toast.kind}`} role="status">{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}

const CONFETTI = ['#0047FF', '#2BD4FF', '#C8FF00', '#0B0B0F', '#FFFFFF'];

/** A short burst from the bottom corners. Skipped for people who prefer reduced motion. */
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.width = innerWidth; canvas.height = innerHeight;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const bits = Array.from({ length: 110 }, (_, i) => {
    const left = i % 2 === 0;
    return {
      x: left ? 0 : canvas.width, y: canvas.height * 0.8,
      vx: (left ? 1 : -1) * (4 + Math.random() * 11), vy: -(9 + Math.random() * 13),
      s: 6 + Math.random() * 8, r: Math.random() * 6, vr: Math.random() * 0.4 - 0.2,
      c: CONFETTI[i % CONFETTI.length],
    };
  });
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.vy += 0.42; b.vx *= 0.99; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 3, b.s, b.s * 0.66); ctx.restore();
    }
    if (++frame < 130) requestAnimationFrame(tick); else canvas.remove();
  };
  tick();
}

export function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} out of 5`}
          className={n <= value ? 'star on' : 'star'} onClick={() => onChange(n)}><Icon name="star" size={30} filled={n <= value} /></button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

/** Shown when data couldn't load, so a network or permission problem never looks like an empty list. */
export function LoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="empty load-error" role="alert">
      <strong>Couldn’t load this</strong>
      <div>Check your internet connection and try again.</div>
      <div><button className="btn btn-ghost btn-sm" onClick={onRetry ?? (() => location.reload())}>Try again</button></div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}

export function ErrorNote({ text }: { text: string }) {
  return text ? <p className="error" role="alert">{text}</p> : null;
}

/** Downloads a CSV. With `load`, the full data is read once when clicked rather than kept loaded. */
export function CsvButton({ sheet, load, prefix, label = 'CSV' }: { sheet?: Sheet; load?: () => Promise<Sheet>; prefix: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function go() {
    setBusy(true);
    try {
      const s = sheet ?? (await load!());
      downloadCsv(`${prefix}-${s.name}.csv`, s.rows, s.columns);
    } catch { toast('Couldn’t prepare the download. Check your connection and try again.', 'err'); }
    setBusy(false);
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={go} disabled={busy}>
      <Icon name="download" size={16} /> {busy ? 'Preparing…' : label}
    </button>
  );
}

export function SpeakerChip({ id, name, role, photo, href }: { id: string; name: string; role?: string; photo?: string; href: string }) {
  return (
    <Link className="speaker-chip" href={href}>
      <Avatar id={id} name={name} photo={photo} size={30} />
      <span><b>{name}</b>{role && <small>{role}</small>}</span>
    </Link>
  );
}

/** Read-only star row for showing a rating. */
export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="star-row" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= value ? 'on' : ''}><Icon name="star" size={size} filled={n <= value} /></span>)}
    </span>
  );
}
