/** The dashboard summaries (../summaries/core) run against Firestore as the signed-in caller. */
import * as core from '../summaries/core';
import { aggregate, count, getDoc, getMany, query } from './firestore';

const reader = (token: string): core.Reader => ({
  count: (parent, col, filters = []) => count(token, parent, col, filters),
  average: (parent, col, field, filters = []) =>
    aggregate(token, parent, col, filters, { n: { count: true }, avg: { avg: field } }).then((a) => ({ n: a.n ?? 0, avg: a.avg ?? null })),
  query: (parent, col, opts) => query(token, parent, col, opts),
  getDoc: (path) => getDoc(token, path),
  getMany: (paths) => getMany(token, paths),
});

export const eventOverview = (t: string, id: string) => core.eventOverview(reader(t), id);
export const sessionAttendance = (t: string, id: string, s: string[]) => core.sessionAttendance(reader(t), id, s);
export const speakerConnections = (t: string, id: string, s: string[]) => core.speakerConnections(reader(t), id, s);
export const feedbackSummary = (t: string, id: string, s: string[], sp: string[]) => core.feedbackSummary(reader(t), id, s, sp);
export const eventAttendeeCounts = (t: string, ids: string[]) => core.eventAttendeeCounts(reader(t), ids);
export const platformStats = (t: string) => core.platformStats(reader(t));
export const missingEvents = (t: string, ids: string[]) => core.missingEvents(reader(t), ids);
export const pulseAnswerCounts = (t: string, ids: string[], surveys: Set<string>) => core.pulseAnswerCounts(reader(t), ids, surveys);
export const pulseResults = (t: string, id: string) => core.pulseResults(reader(t), id);
export const pulseExport = (t: string, id: string) => core.pulseExport(reader(t), id);
