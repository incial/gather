'use client';

import { useMemo } from 'react';
import { typeInfo } from '../lib/eventTypes';
import { colourOf, photoOf } from '../lib/eventPhoto';
import type { Accent, EventDoc } from '../lib/types';
import { WARP_CAROUSEL_CARDS, WarpCarousel, type WarpCard } from './ui/warp-carousel';

/* The desktop 3D carousel of upcoming events, loaded as its own chunk (phones never download it). */

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

function toCard(e: EventDoc): WarpCard {
  const d = new Date(e.startsAt);
  const type = typeInfo(e.eventType)?.label;
  return {
    ...LOOK[colourOf(e)],
    image: photoOf(e),
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

export default function EventCarousel({ events, onIndexChange }: { events: EventDoc[]; onIndexChange: (i: number) => void }) {
  const cards = useMemo(() => (events.length ? events.map(toCard) : FEATURE_CARDS), [events]);
  return (
    <WarpCarousel cards={cards} background="#F6F6F4" font={FONT} step={1} interval={4.2} onIndexChange={onIndexChange}
      ariaLabel={events.length ? 'Upcoming events' : 'What Gather does'} style={{ minHeight: 0, aspectRatio: 'auto' }} />
  );
}
