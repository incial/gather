/** Turning stored responses into the answers a summary counts. Pure, so the server can use it too. */
import type { Answer } from './engine';
import type { PulseResponse, PulseSubmission } from './types';

export const answersFor = (slideId: string, rows: PulseResponse[]): Answer[] =>
  rows.filter((r) => r.slideId === slideId).map((r) => ({ id: r.id, value: r.value, name: r.name, hidden: r.hidden }));

export const surveyAnswers = (slideId: string, subs: PulseSubmission[]): Answer[] =>
  subs.filter((s) => s.answers && s.answers[slideId] !== undefined).map((s) => ({ id: s.id, value: s.answers[slideId], name: s.name }));
