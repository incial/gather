'use client';

import { ArrowDown, ArrowUp, BarChart3, ChevronLeft, ChevronRight, Copy, Eye, Lock, Play, Plus, Send, Share2, Trash2, Unlock } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Empty, ErrorNote, Field, Modal, Spinner, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { friendlyError, fromLocalInput, toLocalInput } from '../../lib/format';
import { loadForOwner, publishSurvey, savePulse, setStatus, type PulseKey } from '../../lib/pulse/api';
import { duplicateSlide, LIMITS, newSlide, TYPE_ORDER, TYPES } from '../../lib/pulse/engine';
import type { AnswerValue, PulseDoc, Slide, SlideType } from '../../lib/pulse/types';
import { AnswerInput, ImagePicker, SlideSettings } from './questions';
import { PulseTop, STATUS_LABEL } from './PulseHome';
import { ShareModal } from './share';
import { TypeIcon } from './icons';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

/** What must be fixed before going live or publishing. */
export function problems(p: PulseDoc): string[] {
  const out: string[] = [];
  if (!p.slides.length) out.push('Add at least one slide.');
  p.slides.forEach((s, i) => {
    const n = `Slide ${i + 1}`;
    if (!s.title.trim()) out.push(`${n} needs a ${s.type === 'content' ? 'heading' : 'question'}.`);
    if (s.options.some((o) => !o.label.trim())) out.push(`${n} has an empty option.`);
    if (s.type === 'quiz' && !(s.correct ?? []).length) out.push(`${n}: tick the right answer.`);
  });
  if (p.kind === 'survey' && !p.slides.some((s) => TYPES[s.type].interactive)) out.push('Add at least one question.');
  return out;
}

export function Builder() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useRouter();
  const toast = useToast();
  const [p, setP] = useState<PulseDoc | null>(null);
  const [key, setKey] = useState<PulseKey | null>(null);
  const [missing, setMissing] = useState(false);
  const [sel, setSel] = useState(0);
  const [save, setSave] = useState<SaveState>('saved');
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(false);
  const [share, setShare] = useState(false);
  const [tab, setTab] = useState<'slide' | 'settings'>('slide');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<{ p: PulseDoc; key: PulseKey } | null>(null);

  useEffect(() => {
    loadForOwner(id).then((r) => { if (!r) { setMissing(true); return; } setP(r.pulse); setKey(r.key); }).catch(() => setMissing(true));
  }, [id]);

  const flush = useCallback(async (password?: string | null) => {
    const cur = latest.current;
    if (!cur) return;
    clearTimeout(timer.current);
    setSave('saving');
    try {
      const k = await savePulse(cur.p, cur.key, password);
      latest.current = { p: { ...cur.p, locked: password === null ? false : typeof password === 'string' ? true : cur.p.locked }, key: k };
      setKey(k);
      if (password !== undefined) setP((x) => (x ? { ...x, locked: password !== null } : x));
      setSave('saved');
    } catch (x) { setSave('error'); toast(friendlyError(x), 'err'); }
  }, [toast]);

  // Saves a moment after the last change, and when leaving the page.
  const change = (next: PulseDoc) => {
    setP(next);
    latest.current = { p: next, key: latest.current?.key ?? key! };
    setSave('unsaved');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 1200);
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === 'unsaved' || save === 'saving') { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  if (missing) return <div className="center"><Empty title="Not found">This presentation or survey doesn’t exist, or you don’t have access to edit it. <Link href="/pulse">Back to Pulse</Link></Empty></div>;
  if (!p || !key) return <div className="center"><Spinner /></div>;
  if (user && p.ownerUid !== user.uid && !p.eventId) return <div className="center"><Empty title="Not yours to edit">Only the person who created this can change it.</Empty></div>;

  const slide = p.slides[Math.min(sel, p.slides.length - 1)];
  const survey = p.kind === 'survey';
  const setSlide = (s: Slide) => change({ ...p, slides: p.slides.map((x) => (x.id === s.id ? s : x)) });
  const addSlide = (t: SlideType) => {
    const s = newSlide(t);
    const at = Math.min(sel + 1, p.slides.length);
    change({ ...p, slides: [...p.slides.slice(0, at), s, ...p.slides.slice(at)] });
    setSel(at); setAdding(false); setTab('slide');
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= p.slides.length) return;
    const s = [...p.slides]; const [x] = s.splice(i, 1); s.splice(j, 0, x);
    change({ ...p, slides: s }); setSel(j);
  };
  const remove = (i: number) => {
    if (p.slides.length === 1) { toast('Keep at least one slide.', 'err'); return; }
    const gone = p.slides[i].id;
    change({ ...p, slides: p.slides.filter((_, j) => j !== i).map((s) => (s.condition?.slideId === gone ? { ...s, condition: null } : s)) });
    setSel(Math.max(0, i - 1));
  };
  const changeType = (t: SlideType) => {
    const fresh = newSlide(t);
    setSlide({ ...fresh, id: slide.id, title: slide.title, body: slide.body, image: slide.image, required: slide.required, condition: slide.condition });
  };

  async function start() {
    const issues = problems(p!);
    if (issues.length) { toast(issues[0], 'err'); return; }
    await flush();
    nav.push(`/pulse/presentation/${p!.id}`);
  }
  async function publish() {
    const issues = problems(p!);
    if (issues.length) { toast(issues[0], 'err'); return; }
    await flush();
    try { await publishSurvey(latest.current?.p ?? p!); setP({ ...p!, status: 'published' }); latest.current = { p: { ...p!, status: 'published' }, key: latest.current?.key ?? key! }; setShare(true); }
    catch (x) { toast(friendlyError(x), 'err'); }
  }
  async function closeSurvey() {
    await flush();
    await setStatus(p!.id, p!.status === 'closed' ? 'published' : 'closed').then(() => {
      const status = p!.status === 'closed' ? 'published' : 'closed';
      setP({ ...p!, status }); latest.current = { p: { ...p!, status }, key: latest.current?.key ?? key! };
      toast(status === 'closed' ? 'Survey closed. No more responses.' : 'Survey reopened');
    }).catch((x) => toast(friendlyError(x), 'err'));
  }

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      if (e.altKey) move(sel, d); else setSel(Math.min(p.slides.length - 1, Math.max(0, sel + d)));
    }
  };

  return (
    <div className="pl pl-builder-page">
      <PulseTop>
        <span className={`pl-save ${save}`} role="status">{save === 'saved' ? 'Saved' : save === 'saving' ? 'Saving…' : save === 'unsaved' ? 'Unsaved changes' : 'Not saved'}</span>
      </PulseTop>
      <div className="pl-bar">
        <Link href="/pulse" className="icon-btn" aria-label="Back to Pulse"><ChevronLeft size={20} /></Link>
        <input className="pl-title-input" value={p.title} maxLength={120} aria-label="Title" onChange={(e) => change({ ...p, title: e.target.value })} />
        <span className={`pill pl-status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
        <div className="row pl-bar-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setPreview(true)}><Eye size={15} /> Preview</button>
          <Link className="btn btn-ghost btn-sm" href={`/pulse/results/${p.id}`}><BarChart3 size={15} /> Results</Link>
          {survey ? (
            <>
              {p.status !== 'draft' && <button className="btn btn-ghost btn-sm" onClick={() => setShare(true)}><Share2 size={15} /> Share</button>}
              {p.status === 'draft' ? <button className="btn btn-primary btn-sm" onClick={publish}><Send size={15} /> Publish</button>
                : <button className="btn btn-ghost btn-sm" onClick={closeSurvey}>{p.status === 'closed' ? 'Reopen' : 'Close survey'}</button>}
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setShare(true)}><Share2 size={15} /> Share</button>
              <button className="btn btn-primary btn-sm" onClick={start}><Play size={15} /> {p.status === 'live' ? 'Resume' : 'Present'}</button>
            </>
          )}
        </div>
      </div>

      <div className="pl-builder">
        <aside className="pl-slides" aria-label={survey ? 'Questions' : 'Slides'}>
          <ol role="listbox" tabIndex={0} aria-activedescendant={`sl-${slide.id}`} onKeyDown={onListKey}>
            {p.slides.map((s, i) => (
              <li key={s.id} id={`sl-${s.id}`} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onClick={() => { setSel(i); setTab('slide'); }}>
                <span className="pl-slide-n">{i + 1}</span>
                <div className="pl-slide-thumb"><TypeIcon type={s.type} /><b>{s.title || TYPES[s.type].label}</b><small>{TYPES[s.type].label}{s.condition ? ' · conditional' : ''}</small></div>
                {i === sel && (
                  <div className="pl-slide-tools" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                    <button className="icon-btn" aria-label="Move down" disabled={i === p.slides.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                    <button className="icon-btn" aria-label="Duplicate" onClick={() => { const d = duplicateSlide(s); change({ ...p, slides: [...p.slides.slice(0, i + 1), d, ...p.slides.slice(i + 1)] }); setSel(i + 1); }}><Copy size={15} /></button>
                    <button className="icon-btn" aria-label="Delete" onClick={() => remove(i)}><Trash2 size={15} /></button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button className="btn btn-primary btn-block" onClick={() => setAdding(true)}><Plus size={17} /> Add {survey ? 'question' : 'slide'}</button>
          <small className="muted hide-sm">↑ ↓ to move between slides, Alt + ↑ ↓ to reorder.</small>
        </aside>

        <section className="pl-canvas" aria-label="Slide editor">
          <div className="pl-stage">
            <span className="pl-stage-type"><TypeIcon type={slide.type} size={15} /> {TYPES[slide.type].label}</span>
            <textarea className="pl-q-input" rows={2} maxLength={LIMITS.title} value={slide.title} placeholder={slide.type === 'content' ? 'Heading' : 'Ask your question'} aria-label="Question"
              onChange={(e) => setSlide({ ...slide, title: e.target.value })} />
            <textarea className="pl-body-input" rows={2} maxLength={LIMITS.body} value={slide.body} placeholder={slide.type === 'content' ? 'Text, instructions or a note for the audience' : 'Instructions or extra details (optional)'} aria-label="Supporting text"
              onChange={(e) => setSlide({ ...slide, body: e.target.value })} />
            <ImagePicker value={slide.image} onChange={(v) => setSlide({ ...slide, image: v })} max={LIMITS.image} />
            {TYPES[slide.type].interactive && slide.type !== 'qa' && (
              <div className="pl-stage-preview" aria-label="How it looks on phones">
                <small className="muted">On people’s phones</small>
                <PreviewAnswer slide={slide} />
              </div>
            )}
          </div>
        </section>

        <aside className="pl-settings" aria-label="Settings">
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={tab === 'slide'} className={tab === 'slide' ? 'on' : ''} onClick={() => setTab('slide')}>{survey ? 'Question' : 'Slide'}</button>
            <button role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>{survey ? 'Survey' : 'Presentation'}</button>
          </div>
          {tab === 'slide' ? (
            <div className="stack">
              <Field label="Question type">
                <select value={slide.type} onChange={(e) => changeType(e.target.value as SlideType)}>
                  {TYPE_ORDER.filter((t) => !(survey && (t === 'qa' || t === 'quiz'))).map((t) => <option key={t} value={t}>{TYPES[t].label}</option>)}
                </select>
              </Field>
              <SlideSettings slide={slide} survey={survey} earlier={p.slides.slice(0, sel)} onChange={setSlide} />
            </div>
          ) : <PulseSettings p={p} onChange={change} onPassword={(pw) => flush(pw)} />}
        </aside>
      </div>

      {adding && <TypePicker survey={survey} onPick={addSlide} onClose={() => setAdding(false)} />}
      {preview && <Preview p={p} start={sel} onClose={() => setPreview(false)} />}
      {share && <ShareModal p={p} onClose={() => setShare(false)} />}
    </div>
  );
}

function PreviewAnswer({ slide }: { slide: Slide }) {
  const [v, setV] = useState<AnswerValue | undefined>(undefined);
  return <AnswerInput slide={slide} value={v} onChange={setV} />;
}

function TypePicker({ survey, onPick, onClose }: { survey: boolean; onPick: (t: SlideType) => void; onClose: () => void }) {
  const groups = ['Popular', 'Opinion', 'Quiz', 'Content'] as const;
  return (
    <Modal title={survey ? 'Add a question' : 'Add a slide'} onClose={onClose}>
      <div className="stack">
        {groups.map((g) => {
          const types = TYPE_ORDER.filter((t) => TYPES[t].group === g && !(survey && (t === 'qa' || t === 'quiz')));
          if (!types.length) return null;
          return (
            <div key={g}>
              <span className="field-label">{g}</span>
              <div className="pl-type-grid">
                {types.map((t) => <button key={t} className="pl-type" onClick={() => onPick(t)}><TypeIcon type={t} size={22} /><b>{TYPES[t].label}</b><small>{TYPES[t].hint}</small></button>)}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function PulseSettings({ p, onChange, onPassword }: { p: PulseDoc; onChange: (p: PulseDoc) => void; onPassword: (pw: string | null) => void }) {
  const [pw, setPw] = useState('');
  const survey = p.kind === 'survey';
  const s = p.survey;
  const setSurvey = (patch: Partial<PulseDoc['survey']>) => onChange({ ...p, survey: { ...s, ...patch } });
  return (
    <div className="stack">
      <Field label="Description"><textarea rows={2} maxLength={600} value={p.description} onChange={(e) => onChange({ ...p, description: e.target.value })} /></Field>
      <Field label="Who can answer">
        <select value={p.access} onChange={(e) => onChange({ ...p, access: e.target.value as PulseDoc['access'] })}>
          <option value="public">Anyone with the link or code (no account)</option>
          <option value="signedIn">People signed in with Google</option>
          {p.eventId && <option value="event">Only people who joined {p.eventTitle || 'the event'}</option>}
        </select>
      </Field>
      <label className="check"><input type="checkbox" checked={p.anonymous} onChange={(e) => onChange({ ...p, anonymous: e.target.checked })} /><span><b>Anonymous</b><small>No names are collected or shown, including in exports.</small></span></label>
      {!p.anonymous && <label className="check"><input type="checkbox" checked={p.askName} onChange={(e) => onChange({ ...p, askName: e.target.checked })} /><span><b>Ask for a name</b><small>Guests type a display name before answering. Signed-in people use their Google name.</small></span></label>}
      {!survey && <label className="check"><input type="checkbox" checked={p.audienceResults} onChange={(e) => onChange({ ...p, audienceResults: e.target.checked })} /><span><b>Show results on phones</b><small>When you reveal results, the audience sees them too.</small></span></label>}

      <div className="field">
        <span className="field-label">Password</span>
        {p.locked ? (
          <div className="row"><span className="pill"><Lock size={13} aria-hidden="true" /> Protected</span><button className="btn btn-ghost btn-sm" onClick={() => onPassword(null)}><Unlock size={15} /> Remove password</button></div>
        ) : (
          <div className="row"><input type="text" value={pw} maxLength={40} placeholder="Optional" aria-label="Password" onChange={(e) => setPw(e.target.value)} /><button className="btn btn-ghost btn-sm" disabled={pw.trim().length < 4} onClick={() => { onPassword(pw); setPw(''); }}>Set</button></div>
        )}
        <small className="muted">At least 4 characters. People enter it once to see the questions.</small>
      </div>

      {survey && (
        <>
          <Field label="Welcome message"><textarea rows={2} maxLength={600} value={s.welcome} placeholder="Shown before the first question (optional)" onChange={(e) => setSurvey({ welcome: e.target.value })} /></Field>
          <Field label="Thank-you message"><textarea rows={2} maxLength={600} value={s.thanks} onChange={(e) => setSurvey({ thanks: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={s.oneByOne} onChange={(e) => setSurvey({ oneByOne: e.target.checked })} /><span><b>One question at a time</b><small>Off shows all questions on one page.</small></span></label>
          <Field label="Response limit" hint="0 means no limit."><input type="number" min={0} max={100000} value={s.limit} disabled={p.status !== 'draft'} onChange={(e) => setSurvey({ limit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></Field>
          <div className="two">
            <Field label="Opens"><input type="datetime-local" value={toLocalInput(s.opensAt)} onChange={(e) => setSurvey({ opensAt: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Closes"><input type="datetime-local" value={toLocalInput(s.closesAt)} onChange={(e) => setSurvey({ closesAt: fromLocalInput(e.target.value) })} /></Field>
          </div>
        </>
      )}
      {p.eventId && <p className="muted">Linked to {p.eventTitle || 'an event'}. It shows in the event’s Activities for attendees.</p>}
    </div>
  );
}

/** Steps through the slides as an audience member would see them. Nothing is sent. */
function Preview({ p, start, onClose }: { p: PulseDoc; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const slide = p.slides[i];
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') setI((x) => Math.min(p.slides.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [p.slides.length]);
  return (
    <Modal title={`Preview · ${i + 1} of ${p.slides.length}`} onClose={onClose}>
      <div className="pl-phone-preview">
        <SlideHead slide={slide} />
        {TYPES[slide.type].interactive && slide.type !== 'qa' && <AnswerInput slide={slide} value={answers[slide.id]} onChange={(v) => setAnswers({ ...answers, [slide.id]: v })} />}
        {slide.type === 'qa' && <p className="muted">People type questions here and upvote others.</p>}
      </div>
      <div className="row-between">
        <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={16} /> Back</button>
        <small className="muted">Preview only, nothing is sent</small>
        <button className="btn btn-ghost btn-sm" disabled={i === p.slides.length - 1} onClick={() => setI(i + 1)}>Next <ChevronRight size={16} /></button>
      </div>
      <ErrorNote text={problems(p)[0] ?? ''} />
    </Modal>
  );
}

export function SlideHead({ slide, big }: { slide: Slide; big?: boolean }) {
  return (
    <div className={`pl-slide-head${big ? ' big' : ''}`}>
      <h2>{slide.title || (slide.type === 'content' ? '' : 'Untitled question')}</h2>
      {slide.body && <p>{slide.body}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {slide.image && <img className="pl-slide-img" src={slide.image} alt="" />}
    </div>
  );
}
