import type { AnswerValue, Slide, SlideOption, SlideType, Summary } from './types';

/**
 * The question engine. Each type declares its defaults, how an answer is checked and
 * how answers add up. Screens only talk to these functions, so a new type is one entry here
 * plus its editor, answer input and chart.
 */
export interface TypeInfo {
  label: string;
  hint: string;
  group: 'Popular' | 'Opinion' | 'Quiz' | 'Content';
  /** Accepts answers. Content slides don't. */
  interactive: boolean;
}

export const TYPES: Record<SlideType, TypeInfo> = {
  mc: { label: 'Multiple choice', hint: 'Pick one or more options', group: 'Popular', interactive: true },
  wordcloud: { label: 'Word cloud', hint: 'Short words that grow as more people say them', group: 'Popular', interactive: true },
  open: { label: 'Open ended', hint: 'Written answers', group: 'Popular', interactive: true },
  yesno: { label: 'Yes / No', hint: 'Two options with live percentages', group: 'Popular', interactive: true },
  rating: { label: 'Rating scale', hint: 'A number from 1–5, 1–10 or your own range', group: 'Opinion', interactive: true },
  opinion: { label: 'Opinion scale', hint: 'Agreement or satisfaction with labels', group: 'Opinion', interactive: true },
  ranking: { label: 'Ranking', hint: 'Put options in order', group: 'Opinion', interactive: true },
  qa: { label: 'Q&A', hint: 'Audience questions with upvotes', group: 'Opinion', interactive: true },
  quiz: { label: 'Quiz question', hint: 'Right answer, timer, points and a leaderboard', group: 'Quiz', interactive: true },
  content: { label: 'Text slide', hint: 'A heading, instructions or an image', group: 'Content', interactive: false },
};

export const TYPE_ORDER: SlideType[] = ['mc', 'wordcloud', 'open', 'yesno', 'rating', 'opinion', 'ranking', 'qa', 'quiz', 'content'];

export const OPINION_PRESETS: Record<string, string[]> = {
  Agreement: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
  Satisfaction: ['Very unsatisfied', 'Unsatisfied', 'Neutral', 'Satisfied', 'Very satisfied'],
  Likelihood: ['Very unlikely', 'Unlikely', 'Not sure', 'Likely', 'Very likely'],
  Frequency: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
};

export const LIMITS = { title: 200, body: 600, option: 120, options: 12, open: 500, word: 25, qa: 280, image: 160_000, optionImage: 40_000 };

let seq = 0;
export const uid = (p = 's') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const opt = (label: string): SlideOption => ({ id: uid('o'), label });

export function newSlide(type: SlideType): Slide {
  const base: Slide = {
    id: uid('s'), type, title: '', body: '', image: '', options: [], multi: false, min: 1, max: 5, minLabel: '', maxLabel: '',
    maxEntries: 1, timeLimit: 0, required: false, condition: null,
  };
  switch (type) {
    case 'mc': return { ...base, options: [opt('Option 1'), opt('Option 2'), opt('Option 3')] };
    case 'yesno': return { ...base, options: [opt('Yes'), opt('No')] };
    case 'ranking': return { ...base, options: [opt('First item'), opt('Second item'), opt('Third item')] };
    case 'quiz': { const o = [opt('Answer A'), opt('Answer B'), opt('Answer C'), opt('Answer D')]; return { ...base, options: o, correct: [o[0].id], timeLimit: 20 }; }
    case 'rating': return { ...base, min: 1, max: 5, minLabel: 'Not at all', maxLabel: 'Very much' };
    case 'opinion': return { ...base, options: OPINION_PRESETS.Agreement.map(opt) };
    case 'wordcloud': return { ...base, maxEntries: 3 };
    default: return base;
  }
}

/** Copy of a slide with fresh IDs, so a duplicate never shares answers with the original. */
export function duplicateSlide(s: Slide): Slide {
  const map = new Map(s.options.map((o) => [o.id, uid('o')]));
  return { ...s, id: uid('s'), title: s.title ? `${s.title} (copy)` : '', options: s.options.map((o) => ({ ...o, id: map.get(o.id)! })), correct: s.correct?.map((c) => map.get(c) ?? c) };
}

/* ---------- Words ---------- */

/** A short list of words that are never shown. Moderators can also hide any answer. */
const BLOCKED = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'slut', 'whore', 'nigger', 'faggot', 'retard', 'motherfucker', 'pussy'];
export function isBlocked(text: string) {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, ' ');
  return BLOCKED.some((w) => new RegExp(`(^|\\s)${w}`).test(t));
}
export const normWord = (w: string) => w.trim().replace(/\s+/g, ' ').slice(0, LIMITS.word);

/* ---------- Answers ---------- */

/** Checks and tidies an answer before it is sent. Returns the clean value or an error to show. */
export function cleanAnswer(slide: Slide, raw: unknown): { value: AnswerValue } | { error: string } {
  const ids = slide.options.map((o) => o.id);
  switch (slide.type) {
    case 'mc': case 'yesno': case 'quiz': case 'opinion': {
      const list = (Array.isArray(raw) ? raw : [raw]).map(String).filter((x) => ids.includes(x));
      const unique = [...new Set(list)];
      if (!unique.length) return { error: 'Choose an option.' };
      if (unique.length > 1 && !(slide.type === 'mc' && slide.multi)) return { error: 'Choose one option.' };
      return { value: unique };
    }
    case 'rating': {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < slide.min || n > slide.max) return { error: `Pick a number from ${slide.min} to ${slide.max}.` };
      return { value: n };
    }
    case 'ranking': {
      const list = (Array.isArray(raw) ? raw : []).map(String);
      if (list.length !== ids.length || new Set(list).size !== ids.length || !list.every((x) => ids.includes(x))) return { error: 'Put every item in order.' };
      return { value: list };
    }
    case 'wordcloud': {
      const words = (Array.isArray(raw) ? raw : [raw]).map((w) => normWord(String(w ?? ''))).filter(Boolean).slice(0, Math.max(1, slide.maxEntries));
      if (!words.length) return { error: 'Type a word.' };
      if (words.some(isBlocked)) return { error: 'Please keep it friendly.' };
      return { value: words };
    }
    case 'open': {
      const t = String(raw ?? '').trim().slice(0, LIMITS.open);
      if (!t) return { error: 'Write an answer.' };
      if (isBlocked(t)) return { error: 'Please keep it friendly.' };
      return { value: t };
    }
    default: return { error: 'This slide doesn’t take answers.' };
  }
}

const asList = (v: AnswerValue | undefined): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === '' ? [] : [String(v)]);

/** An answer as readable text, for tables and CSV files. */
export function formatAnswer(slide: Slide, v: AnswerValue | undefined): string {
  if (v === undefined) return '';
  const label = (id: string) => slide.options.find((o) => o.id === id)?.label ?? '';
  switch (slide.type) {
    case 'mc': case 'yesno': case 'quiz': case 'opinion': return asList(v).map(label).filter(Boolean).join('; ');
    case 'ranking': return asList(v).map((id, i) => `${i + 1}. ${label(id)}`).join('; ');
    case 'wordcloud': return asList(v).join('; ');
    default: return String(v);
  }
}

/* ---------- Results ---------- */

export interface Answer { id: string; value: AnswerValue; name: string; hidden?: boolean }

export function summarize(slide: Slide, answers: Answer[], reveal: string[] = []): Summary {
  const shown = answers.filter((a) => !a.hidden);
  switch (slide.type) {
    case 'mc': case 'yesno': case 'quiz': case 'opinion': {
      const counts = new Map(slide.options.map((o) => [o.id, 0]));
      for (const a of shown) for (const id of asList(a.value)) if (counts.has(id)) counts.set(id, counts.get(id)! + 1);
      return { kind: 'bars', bars: slide.options.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id)!, ...(reveal.length ? { correct: reveal.includes(o.id) } : {}) })) };
    }
    case 'rating': {
      const size = Math.max(1, slide.max - slide.min + 1);
      const counts = Array(size).fill(0) as number[];
      let sum = 0; let n = 0;
      for (const a of shown) { const v = Number(a.value); if (Number.isFinite(v) && v >= slide.min && v <= slide.max) { counts[v - slide.min]++; sum += v; n++; } }
      return { kind: 'scale', min: slide.min, max: slide.max, minLabel: slide.minLabel, maxLabel: slide.maxLabel, counts, average: n ? Math.round((sum / n) * 10) / 10 : null };
    }
    case 'wordcloud': {
      const counts = new Map<string, { text: string; count: number }>();
      for (const a of shown) for (const w of asList(a.value)) {
        if (isBlocked(w)) continue;
        const key = w.toLowerCase();
        const e = counts.get(key) ?? { text: w, count: 0 };
        e.count++; counts.set(key, e);
      }
      return { kind: 'words', words: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 80) };
    }
    case 'open':
      return { kind: 'texts', texts: shown.filter((a) => !isBlocked(String(a.value))).map((a) => ({ id: a.id, text: String(a.value), name: a.name })).slice(-60).reverse() };
    case 'ranking': {
      // Borda count: first place gets n points, last gets 1.
      const n = slide.options.length;
      const score = new Map(slide.options.map((o) => [o.id, { pts: 0, pos: 0, k: 0 }]));
      for (const a of shown) asList(a.value).forEach((id, i) => { const e = score.get(id); if (e) { e.pts += n - i; e.pos += i + 1; e.k++; } });
      return { kind: 'ranking', items: slide.options.map((o) => { const e = score.get(o.id)!; return { id: o.id, label: o.label, score: e.pts, avgPosition: e.k ? Math.round((e.pos / e.k) * 10) / 10 : 0 }; }).sort((a, b) => b.score - a.score) };
    }
    default: return { kind: 'none' };
  }
}

/* ---------- Quiz ---------- */

/** 1,000 points for a right answer, losing up to half for slow answers when there's a timer. */
export function quizPoints(value: AnswerValue | undefined, correct: string[], elapsedMs: number, timeLimit: number): number {
  const picked = asList(value);
  const right = picked.length > 0 && picked.length === correct.length && picked.every((p) => correct.includes(p));
  if (!right) return 0;
  if (!timeLimit) return 1000;
  const share = Math.min(1, Math.max(0, elapsedMs / (timeLimit * 1000)));
  return Math.round(1000 - 500 * share);
}

export interface QuizRow { uid: string; name: string; slideId: string; value: AnswerValue; at?: string }

export function leaderboard(rows: QuizRow[], key: Record<string, string[]>, openedAt: Record<string, string>, limits: Record<string, number>, anonymous: boolean) {
  const totals = new Map<string, { name: string; score: number; right: number }>();
  for (const r of rows) {
    const correct = key[r.slideId];
    if (!correct) continue;
    const elapsed = r.at && openedAt[r.slideId] ? Date.parse(r.at) - Date.parse(openedAt[r.slideId]) : 0;
    const pts = quizPoints(r.value, correct, elapsed, limits[r.slideId] ?? 0);
    const t = totals.get(r.uid) ?? { name: anonymous ? '' : r.name, score: 0, right: 0 };
    t.score += pts; if (pts > 0) t.right++;
    totals.set(r.uid, t);
  }
  return [...totals.entries()].map(([id, t], i) => ({ uid: id, name: t.name || `Player ${i + 1}`, score: t.score, right: t.right })).sort((a, b) => b.score - a.score);
}

/* ---------- Surveys ---------- */

/** Which questions to show, given the answers so far (conditional questions). */
export function visibleSlides(slides: Slide[], answers: Record<string, AnswerValue>): Slide[] {
  return slides.filter((s) => !s.condition || asList(answers[s.condition.slideId]).includes(s.condition.optionId));
}

export const totalFrom = (s: Summary, fallback: number) => fallback || (s.kind === 'bars' ? s.bars.reduce((a, b) => a + b.count, 0) : 0);

/** Short, readable code: no 0/O or 1/I. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** The password check key: the questions of a locked presentation sit under this hash. */
export async function lockKey(pulseId: string, password: string) {
  const bytes = new TextEncoder().encode(`${pulseId}:${password.trim()}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
