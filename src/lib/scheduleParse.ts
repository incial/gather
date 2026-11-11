import type { SessionKind } from './types';

/** A piece of text from a PDF page, positioned from the top-left. */
export interface TextItem { str: string; x: number; y: number; page: number }

export interface ParsedRow {
  day: number;
  /** 24-hour "HH:MM". Empty when the PDF gave no time. */
  start: string;
  end: string;
  title: string;
  speakers: string[];
  kind: SessionKind;
  feedbackOn: boolean;
}

interface Line { page: number; y: number; cells: { x: number; str: string }[] }

/** Groups text items into visual lines (same page, nearly the same height), left to right. */
export function toLines(items: TextItem[], tolerance = 3): Line[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tolerance) last.cells.push({ x: it.x, str: it.str });
    else lines.push({ page: it.page, y: it.y, cells: [{ x: it.x, str: it.str }] });
  }
  for (const l of lines) l.cells.sort((a, b) => a.x - b.x);
  return lines;
}

const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?`;
const RANGE = new RegExp(String.raw`^\s*${T}\s*(?:-|–|—|to)\s*${T}`, 'i');
const SINGLE = new RegExp(String.raw`^\s*${T}`, 'i');
const HONORIFIC = /^(prof|dr|mr|mrs|ms|miss|shri|smt|er)\b\.?/i;

function to24(h: string, m: string | undefined, ap: string | undefined): number | null {
  let hour = Number(h);
  const min = Number(m ?? 0);
  if (hour > 23 || min > 59) return null;
  const a = ap?.toLowerCase().replace(/\./g, '');
  if (a === 'pm' && hour < 12) hour += 12;
  if (a === 'am' && hour === 12) hour = 0;
  return hour * 60 + min;
}
const fmt = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Reads "9:30 AM - 1:30 PM", "1.30 PM - 4.00 PM", "10:00-11:30" or a single "4:00 PM". */
export function parseTime(text: string): { start: number; end: number | null; rest: string } | null {
  const r = RANGE.exec(text);
  if (r) {
    if (!r[2] && !r[3] && !r[5] && !r[6]) return null; // "16 - 18" is a date range, not a time
    const apStart = r[3] ?? r[6];
    let start = to24(r[1], r[2], apStart);
    let end = to24(r[4], r[5], r[6] ?? r[3]);
    if (start === null || end === null) return null;
    // Typos like "11:30 AM - 11:45 PM": a session over 8 hours almost always has the wrong AM/PM.
    if (end - start > 8 * 60 && end - 12 * 60 > start) end -= 12 * 60;
    // "9:30 - 1:30 PM": the PM belongs to the end only.
    if (!r[3] && r[6]) { const alt = to24(r[1], r[2], undefined); if (alt !== null && start > end && alt < end) start = alt; }
    if (end < start && end + 12 * 60 > start && end + 12 * 60 - start <= 8 * 60) end += 12 * 60;
    return { start, end, rest: text.slice(r[0].length).trim() };
  }
  const s = SINGLE.exec(text);
  if (s && (s[2] || s[3])) {
    const start = to24(s[1], s[2], s[3]);
    if (start === null) return null;
    return { start, end: null, rest: text.slice(s[0].length).trim() };
  }
  return null;
}

export function guessKind(title: string, speakerCount: number): SessionKind {
  if (/\b(break|lunch|dinner|tea|snacks?|breakfast|refreshments?)\b/i.test(title)) return 'break';
  if (/\b(panel|discussion)\b/i.test(title) || speakerCount >= 3) return 'panel';
  if (/\b(workshop|drafting|hands-on|lab|bootcamp|hackathon|practical)\b/i.test(title)) return 'workshop';
  // Visits and outings without a named speaker are activities; with a speaker it's usually a talk.
  if (speakerCount === 0 && /\b(registration|visit|outing|interaction|tour|networking|activity)\b/i.test(title)) return 'activity';
  return 'talk';
}

const noFeedback = (title: string, kind: SessionKind) =>
  kind === 'break' || /\b(registration|inaug\w*|valedictory|vote of thanks|closing ceremony)\b/i.test(title);

/** "Dr. A & Prof. B" → two people. A line that doesn't start with a title continues the previous person. */
function addSpeakers(list: string[], text: string) {
  text.split(/\s+(&|and)\s+/i).forEach((raw, i, parts) => {
    if (i % 2 === 1) return; // the separator itself
    const part = raw.trim().replace(/[,;]$/, '');
    if (!part) return;
    if (list.length && !HONORIFIC.test(part)) {
      // "Engineering & Technology" keeps its "&"; a new line continues the previous person.
      const joiner = i > 0 ? ` ${parts[i - 1]} ` : ' ';
      list[list.length - 1] = `${list[list.length - 1]}${joiner}${part}`.trim();
    } else list.push(part);
  });
}

/** Turns lines from a schedule PDF into sessions. The organiser reviews the result before anything is saved. */
export function parseSchedule(lines: Line[]): ParsedRow[] {
  // Find the column positions from a header row such as "Time | Program | Resource Persons".
  let programX: number | null = null;
  let speakerX: number | null = null;
  for (const l of lines) {
    const p = l.cells.find((c) => /^(program(me)?|session|topic|title|event|activity)s?$/i.test(c.str.trim()));
    const s = l.cells.find((c) => /^(resource\s*persons?|speakers?|faculty|by|facilitators?|presenters?)$/i.test(c.str.trim()));
    if (p && l.cells.some((c) => /^time$/i.test(c.str.trim()))) { programX = p.x; speakerX = s?.x ?? null; break; }
  }
  const column = (x: number): 'time' | 'title' | 'speaker' => {
    if (programX !== null && x < programX - 8) return 'time';
    if (speakerX !== null && x >= speakerX - 8) return 'speaker';
    return 'title';
  };

  const rows: ParsedRow[] = [];
  let day = 1;
  let current: ParsedRow | null = null;
  // Lines that come before the first time of a day belong to that first session (tall table cells centre the time).
  let pending: { title: string; speaker: string }[] = [];
  const finish = () => { if (current && current.title.trim()) rows.push(current); current = null; };

  for (const l of lines) {
    const text = l.cells.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim();
    const dayMatch = /^day\s*[-–:]?\s*(\d{1,2})\b/i.exec(text);
    if (dayMatch && text.length < 40) { finish(); pending = []; day = Number(dayMatch[1]); continue; }
    if (/^time\b/i.test(text) && programX !== null) continue;

    let timePart = '';
    let titlePart = '';
    let speakerPart = '';
    if (programX !== null) {
      for (const c of l.cells) {
        const col = column(c.x);
        if (col === 'time') timePart += ` ${c.str}`;
        else if (col === 'speaker') speakerPart += ` ${c.str}`;
        else titlePart += ` ${c.str}`;
      }
    } else {
      timePart = text;
    }
    const time = parseTime(timePart);
    if (programX === null && time) titlePart = time.rest;
    titlePart = titlePart.replace(/\s+/g, ' ').trim();
    speakerPart = speakerPart.replace(/\s+/g, ' ').trim();

    if (time) {
      finish();
      if (/^day\s*\d*\s*ends?\b/i.test(titlePart)) continue;
      const before = pending;
      pending = [];
      current = { day, start: fmt(time.start), end: time.end === null ? '' : fmt(time.end), title: '', speakers: [], kind: 'talk', feedbackOn: true };
      for (const p of before) {
        if (p.title) current.title = `${current.title} ${p.title}`.trim();
        if (p.speaker) addSpeakers(current.speakers, p.speaker);
      }
      current.title = `${current.title} ${titlePart}`.trim();
      if (speakerPart) addSpeakers(current.speakers, speakerPart);
    } else if (!current) {
      if ((titlePart || speakerPart) && !/^day\s*\d*\s*ends?\b/i.test(titlePart) && programX !== null) pending.push({ title: titlePart, speaker: speakerPart });
    } else {
      if (/^day\s*\d*\s*ends?\b/i.test(titlePart)) { finish(); continue; }
      const startsNewPerson = speakerPart && HONORIFIC.test(speakerPart);
      // A row with its own title and its own speaker but no time shares the previous time slot.
      if (titlePart && startsNewPerson && current.speakers.length && current.title) {
        const prev: ParsedRow = current;
        finish();
        current = { ...prev, title: titlePart, speakers: [] };
        addSpeakers(current.speakers, speakerPart);
      } else {
        if (titlePart) current.title = `${current.title} ${titlePart}`.trim();
        if (speakerPart) addSpeakers(current.speakers, speakerPart);
      }
    }
  }
  finish();

  // Fill missing end times from the next session that day, else one hour.
  rows.forEach((r, i) => {
    if (!r.end) {
      const next = rows.slice(i + 1).find((n) => n.day === r.day && n.start > r.start);
      const [h, m] = r.start.split(':').map(Number);
      r.end = next?.start ?? fmt(h * 60 + m + 60);
    }
    r.title = r.title.replace(/\s+/g, ' ').trim();
    r.speakers = r.speakers.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    r.kind = guessKind(r.title, r.speakers.length);
    r.feedbackOn = !noFeedback(r.title, r.kind);
  });
  return rows;
}

/** "Prof. X, Rajagiri School of Engineering - Kochi" → name and organisation. */
export function splitSpeaker(entry: string): { name: string; organisation: string } {
  const i = entry.indexOf(',');
  if (i > 0 && /(college|school|university|institute|engineering|technology|ltd|inc|foundation|centre|center|mission)/i.test(entry.slice(i))) {
    return { name: entry.slice(0, i).trim(), organisation: entry.slice(i + 1).trim().replace(/^[-–]\s*/, '') };
  }
  return { name: entry.trim(), organisation: '' };
}

export const normName = (s: string) => s.toLowerCase().replace(/\b(prof|dr|mr|mrs|ms)\b\.?/g, '').replace(/[^a-z]/g, '');
