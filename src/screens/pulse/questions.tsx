'use client';

import { ArrowDown, ArrowUp, Check, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Field } from '../../components/ui';
import { shrinkImage } from '../../lib/image';
import { LIMITS, OPINION_PRESETS, TYPES, uid } from '../../lib/pulse/engine';
import type { AnswerValue, Slide, SlideOption, Summary } from '../../lib/pulse/types';

/* ---------- Builder: settings for one slide ---------- */

export function ImagePicker({ value, onChange, max, label = 'Image' }: { value: string; onChange: (v: string) => void; max: number; label?: string }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function pick(f: File | undefined) {
    if (!f) return;
    setErr(''); setBusy(true);
    try { onChange(await shrinkImage(f, max > 60_000 ? 1200 : 480, max)); } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  return (
    <div className="pl-image">
      {value ? (
        <div className="pl-image-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" />
          <button type="button" className="icon-btn" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => onChange('')}><X size={16} /></button>
        </div>
      ) : (
        <label className="pl-image-add">
          <ImagePlus size={18} aria-hidden="true" /> {busy ? 'Preparing…' : `Add ${label.toLowerCase()}`}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => pick(e.target.files?.[0])} hidden />
        </label>
      )}
      {err && <small className="error">{err}</small>}
    </div>
  );
}

function OptionsEditor({ slide, set, withImages, quiz }: { slide: Slide; set: (p: Partial<Slide>) => void; withImages?: boolean; quiz?: boolean }) {
  const update = (i: number, p: Partial<SlideOption>) => set({ options: slide.options.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const move = (i: number, d: number) => { const o = [...slide.options]; const [x] = o.splice(i, 1); o.splice(i + d, 0, x); set({ options: o }); };
  const toggleCorrect = (id: string) => {
    const c = slide.correct ?? [];
    set({ correct: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
  };
  return (
    <div className="pl-options">
      <span className="field-label">{quiz ? 'Answers (tick the right one)' : 'Options'}</span>
      {slide.options.map((o, i) => (
        <div key={o.id} className="pl-option-row">
          {quiz && (
            <button type="button" className={`pl-correct${slide.correct?.includes(o.id) ? ' on' : ''}`} aria-pressed={!!slide.correct?.includes(o.id)} aria-label={`Mark “${o.label}” as correct`} onClick={() => toggleCorrect(o.id)}><Check size={16} /></button>
          )}
          <input value={o.label} maxLength={LIMITS.option} aria-label={`Option ${i + 1}`} onChange={(e) => update(i, { label: e.target.value })} />
          {withImages && <ImagePicker value={o.image ?? ''} onChange={(v) => update(i, { image: v })} max={LIMITS.optionImage} label="Picture" />}
          <button type="button" className="icon-btn" disabled={i === 0} aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
          <button type="button" className="icon-btn" disabled={i === slide.options.length - 1} aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
          <button type="button" className="icon-btn" disabled={slide.options.length <= 2} aria-label={`Remove option ${i + 1}`} onClick={() => set({ options: slide.options.filter((_, j) => j !== i), correct: slide.correct?.filter((c) => c !== o.id) })}><Trash2 size={16} /></button>
        </div>
      ))}
      {slide.options.length < LIMITS.options && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ options: [...slide.options, { id: uid('o'), label: `Option ${slide.options.length + 1}` }] })}><Plus size={16} /> Add option</button>
      )}
    </div>
  );
}

export function SlideSettings({ slide, onChange, survey, earlier }: { slide: Slide; onChange: (s: Slide) => void; survey: boolean; earlier: Slide[] }) {
  const set = (p: Partial<Slide>) => onChange({ ...slide, ...p });
  const choiceSlides = earlier.filter((s) => ['mc', 'yesno', 'opinion'].includes(s.type));
  return (
    <div className="stack">
      {(slide.type === 'mc' || slide.type === 'ranking') && <OptionsEditor slide={slide} set={set} withImages={slide.type === 'mc'} />}
      {slide.type === 'mc' && <label className="check"><input type="checkbox" checked={slide.multi} onChange={(e) => set({ multi: e.target.checked })} /> Allow more than one answer</label>}
      {slide.type === 'yesno' && (
        <div className="two">
          <Field label="First option"><input value={slide.options[0]?.label ?? ''} onChange={(e) => set({ options: slide.options.map((o, i) => (i === 0 ? { ...o, label: e.target.value } : o)) })} /></Field>
          <Field label="Second option"><input value={slide.options[1]?.label ?? ''} onChange={(e) => set({ options: slide.options.map((o, i) => (i === 1 ? { ...o, label: e.target.value } : o)) })} /></Field>
        </div>
      )}
      {slide.type === 'quiz' && (
        <>
          <OptionsEditor slide={slide} set={set} quiz />
          {!(slide.correct ?? []).length && <small className="error">Tick at least one right answer.</small>}
          <Field label="Time to answer">
            <select value={slide.timeLimit} onChange={(e) => set({ timeLimit: Number(e.target.value) })}>
              {[0, 10, 15, 20, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n ? `${n} seconds` : 'No limit'}</option>)}
            </select>
          </Field>
        </>
      )}
      {slide.type === 'opinion' && (
        <>
          <Field label="Scale">
            <select value="" onChange={(e) => e.target.value && set({ options: OPINION_PRESETS[e.target.value].map((label) => ({ id: uid('o'), label })) })}>
              <option value="">Use a ready-made scale…</option>
              {Object.keys(OPINION_PRESETS).map((k) => <option key={k} value={k}>{k}: {OPINION_PRESETS[k][0]} → {OPINION_PRESETS[k][4]}</option>)}
            </select>
          </Field>
          <OptionsEditor slide={slide} set={set} />
        </>
      )}
      {slide.type === 'rating' && (
        <>
          <div className="two">
            <Field label="From"><select value={slide.min} onChange={(e) => set({ min: Number(e.target.value) })}>{[0, 1].map((n) => <option key={n}>{n}</option>)}</select></Field>
            <Field label="To"><select value={slide.max} onChange={(e) => set({ max: Number(e.target.value) })}>{[3, 4, 5, 6, 7, 10].map((n) => <option key={n}>{n}</option>)}</select></Field>
          </div>
          <div className="two">
            <Field label="Low end label"><input value={slide.minLabel} maxLength={40} onChange={(e) => set({ minLabel: e.target.value })} /></Field>
            <Field label="High end label"><input value={slide.maxLabel} maxLength={40} onChange={(e) => set({ maxLabel: e.target.value })} /></Field>
          </div>
        </>
      )}
      {slide.type === 'wordcloud' && (
        <Field label="Words per person"><select value={slide.maxEntries} onChange={(e) => set({ maxEntries: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></Field>
      )}
      {slide.type === 'qa' && <p className="muted">People send questions and upvote each other’s. You can hide questions and mark them answered while presenting.</p>}
      {slide.type === 'open' && <p className="muted">Answers appear as cards. You can hide any answer while presenting.</p>}
      {survey && TYPES[slide.type].interactive && slide.type !== 'qa' && (
        <>
          <label className="check"><input type="checkbox" checked={slide.required} onChange={(e) => set({ required: e.target.checked })} /> Required</label>
          {choiceSlides.length > 0 && (
            <Field label="Show this question" hint="Only ask it when someone picked a certain answer earlier.">
              <select value={slide.condition ? `${slide.condition.slideId}|${slide.condition.optionId}` : ''} onChange={(e) => {
                const [slideId, optionId] = e.target.value.split('|');
                set({ condition: e.target.value ? { slideId, optionId } : null });
              }}>
                <option value="">Always</option>
                {choiceSlides.map((s) => s.options.map((o) => <option key={s.id + o.id} value={`${s.id}|${o.id}`}>If “{(s.title || 'Untitled').slice(0, 40)}” = {o.label}</option>))}
              </select>
            </Field>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Participant: answering ---------- */

export function AnswerInput({ slide, value, onChange, disabled }: { slide: Slide; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void; disabled?: boolean }) {
  const list = Array.isArray(value) ? value.map(String) : [];
  switch (slide.type) {
    case 'mc': case 'yesno': case 'quiz': case 'opinion': {
      const multi = slide.type === 'mc' && slide.multi;
      const pick = (id: string) => onChange(multi ? (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]) : [id]);
      return (
        <div className={`pl-choices${slide.type === 'yesno' ? ' yesno' : ''}${slide.options.some((o) => o.image) ? ' with-images' : ''}`} role={multi ? 'group' : 'radiogroup'} aria-label={slide.title}>
          {slide.options.map((o, i) => (
            <button type="button" key={o.id} disabled={disabled} role={multi ? 'checkbox' : 'radio'} aria-checked={list.includes(o.id)} className={`pl-choice${list.includes(o.id) ? ' on' : ''}`} onClick={() => pick(o.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {o.image && <img src={o.image} alt="" />}
              {slide.type === 'quiz' && <span className="pl-letter">{String.fromCharCode(65 + i)}</span>}
              <span>{o.label}</span>
              {list.includes(o.id) && <Check size={18} aria-hidden="true" />}
            </button>
          ))}
          {multi && <small className="muted">Choose all that apply.</small>}
        </div>
      );
    }
    case 'rating': {
      const nums = Array.from({ length: slide.max - slide.min + 1 }, (_, i) => slide.min + i);
      return (
        <div>
          <div className="pl-scale" role="radiogroup" aria-label={slide.title}>
            {nums.map((n) => <button type="button" key={n} disabled={disabled} role="radio" aria-checked={value === n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>)}
          </div>
          {(slide.minLabel || slide.maxLabel) && <div className="pl-scale-labels"><span>{slide.minLabel}</span><span>{slide.maxLabel}</span></div>}
        </div>
      );
    }
    case 'ranking': {
      const order = list.length === slide.options.length ? list : slide.options.map((o) => o.id);
      const move = (i: number, d: number) => { const o = [...order]; const [x] = o.splice(i, 1); o.splice(i + d, 0, x); onChange(o); };
      return (
        <ol className="pl-rank">
          {order.map((id, i) => (
            <li key={id}>
              <span className="pl-rank-n">{i + 1}</span>
              <span>{slide.options.find((o) => o.id === id)?.label}</span>
              <button type="button" className="icon-btn" disabled={disabled || i === 0} aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp size={18} /></button>
              <button type="button" className="icon-btn" disabled={disabled || i === order.length - 1} aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown size={18} /></button>
            </li>
          ))}
        </ol>
      );
    }
    case 'wordcloud': {
      const words = Array.from({ length: Math.max(1, slide.maxEntries) }, (_, i) => list[i] ?? '');
      return (
        <div className="stack">
          {words.map((w, i) => (
            <input key={i} value={w} maxLength={LIMITS.word} disabled={disabled} placeholder={i === 0 ? 'Type a word' : 'Another word (optional)'} aria-label={`Word ${i + 1}`}
              onChange={(e) => onChange(words.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
        </div>
      );
    }
    case 'open':
      return (
        <div className="stack">
          <textarea rows={4} maxLength={LIMITS.open} disabled={disabled} value={typeof value === 'string' ? value : ''} placeholder="Your answer" aria-label={slide.title} onChange={(e) => onChange(e.target.value)} />
          <small className="muted">{(typeof value === 'string' ? value.length : 0)}/{LIMITS.open}</small>
        </div>
      );
    default: return null;
  }
}

/** Whether an answer has anything in it yet (for enabling Send). */
export function hasAnswer(slide: Slide, v: AnswerValue | undefined) {
  if (v === undefined) return slide.type === 'ranking';
  if (Array.isArray(v)) return v.some((x) => String(x).trim());
  return String(v).trim() !== '';
}

/* ---------- Results ---------- */

const COLORS = ['#0047FF', '#C8FF00', '#FF6B4A', '#2BD4FF', '#8B5CF6', '#FFB800', '#16A34A', '#EC4899'];
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export function ResultView({ summary, total, big }: { summary: Summary; total: number; big?: boolean }) {
  const cls = `pl-results${big ? ' big' : ''}`;
  switch (summary.kind) {
    case 'bars': {
      const max = Math.max(1, ...summary.bars.map((b) => b.count));
      const votes = summary.bars.reduce((a, b) => a + b.count, 0);
      return (
        <div className={cls}>
          <ul className="pl-bars">
            {summary.bars.map((b, i) => (
              <li key={b.id} className={b.correct === true ? 'correct' : b.correct === false ? 'wrong' : ''}>
                <div className="pl-bar-label"><span>{b.label}{b.correct && <Check size={16} aria-label="correct answer" />}</span><b>{pct(b.count, votes)}%</b></div>
                <div className="pl-bar-track"><i style={{ width: `${(b.count / max) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                <small>{b.count} {b.count === 1 ? 'vote' : 'votes'}</small>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'scale': {
      const max = Math.max(1, ...summary.counts);
      return (
        <div className={cls}>
          <div className="pl-avg"><b>{summary.average ?? '–'}</b><span>average of {total} {total === 1 ? 'response' : 'responses'}</span></div>
          <div className="pl-cols" role="img" aria-label={`Distribution from ${summary.min} to ${summary.max}`}>
            {summary.counts.map((c, i) => (
              <div key={i} className="pl-col"><small>{c}</small><i style={{ height: `${(c / max) * 100}%` }} /><span>{summary.min + i}</span></div>
            ))}
          </div>
          {(summary.minLabel || summary.maxLabel) && <div className="pl-scale-labels"><span>{summary.minLabel}</span><span>{summary.maxLabel}</span></div>}
        </div>
      );
    }
    case 'words': {
      if (!summary.words.length) return <Waiting />;
      const max = summary.words[0].count;
      // A stable mixed order so big words don't all bunch at the start.
      const shuffled = [...summary.words].sort((a, b) => hash(a.text) - hash(b.text));
      return (
        <div className={`${cls} pl-cloud`} aria-label="Word cloud">
          {shuffled.map((w, i) => {
            const s = 0.9 + (w.count / max) * (big ? 3.4 : 2.2);
            return <span key={w.text} style={{ fontSize: `${s}em`, color: COLORS[i % COLORS.length] === '#C8FF00' ? '#4D6600' : COLORS[i % COLORS.length], fontWeight: w.count === max ? 700 : 550 }} title={`${w.count}`}>{w.text}</span>;
          })}
        </div>
      );
    }
    case 'texts':
      if (!summary.texts.length) return <Waiting />;
      return <div className={`${cls} pl-cards`}>{summary.texts.map((t) => <blockquote key={t.id}><p>{t.text}</p>{t.name && <cite>{t.name}</cite>}</blockquote>)}</div>;
    case 'ranking': {
      const max = Math.max(1, ...summary.items.map((i) => i.score));
      return (
        <ol className={`${cls} pl-ranking`}>
          {summary.items.map((it, i) => (
            <li key={it.id}><span className="pl-rank-n">{i + 1}</span><div><b>{it.label}</b><div className="pl-bar-track"><i style={{ width: `${(it.score / max) * 100}%`, background: COLORS[i % COLORS.length] }} /></div><small>average position {it.avgPosition || '–'}</small></div></li>
          ))}
        </ol>
      );
    }
    default: return <Waiting />;
  }
}

function Waiting() { return <p className="pl-waiting">Waiting for responses…</p>; }
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };

export function Leaderboard({ rows, me }: { rows: { name: string; score: number; uid?: string }[]; me?: string }) {
  if (!rows.length) return <p className="pl-waiting">No scores yet.</p>;
  return (
    <ol className="pl-leader">
      {rows.slice(0, 10).map((r, i) => (
        <li key={`${r.name}${i}`} className={me && r.uid === me ? 'me' : ''}><span className="pl-rank-n">{i + 1}</span><b>{r.name}</b><span>{r.score.toLocaleString()} pts</span></li>
      ))}
    </ol>
  );
}
