const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** An .ics file most calendar apps can open. */
export function icsFor(e: { id: string; title: string; description?: string; venue?: string; startsAt: string; endsAt: string }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gather//Events//EN', 'BEGIN:VEVENT',
    `UID:${e.id}@gather`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${esc(e.title)}`, e.venue ? `LOCATION:${esc(e.venue)}` : '', e.description ? `DESCRIPTION:${esc(e.description)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/** Google Maps embed and directions from a pasted link or a typed address. */
export function mapFor(mapLink: string | undefined, venue: string) {
  const link = (mapLink ?? '').trim();
  const isUrl = /^https?:\/\//i.test(link) || /^(maps\.app\.goo\.gl|goo\.gl|maps\.google\.|www\.google\.[^/]+\/maps)/i.test(link);
  const query = isUrl || !link ? venue : link;
  if (!query.trim() && !link) return null;
  const open = isUrl ? (/^https?:\/\//i.test(link) ? link : `https://${link}`) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return { embed: `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`, open, label: query };
}
