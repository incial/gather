/** Gather Pulse: live presentations and surveys. */

export type PulseKind = 'presentation' | 'survey';
export type PulseStatus = 'draft' | 'live' | 'published' | 'closed';
/** public: anyone with the link (no account needed). signedIn: Google sign-in required. event: joined attendees of the linked event. */
export type PulseAccess = 'public' | 'signedIn' | 'event';

export type SlideType = 'mc' | 'yesno' | 'wordcloud' | 'open' | 'rating' | 'opinion' | 'ranking' | 'qa' | 'quiz' | 'content';

export interface SlideOption { id: string; label: string; image?: string }

export interface Slide {
  id: string;
  type: SlideType;
  title: string;
  /** Instructions or supporting text. */
  body: string;
  /** A link or a small uploaded image (data URL). */
  image: string;
  options: SlideOption[];
  /** Multiple choice: allow more than one answer. */
  multi: boolean;
  /** Rating scale range and end labels. */
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  /** Word cloud: how many words each person can send. */
  maxEntries: number;
  /** Quiz: seconds to answer, 0 for no limit. */
  timeLimit: number;
  /** Quiz only, never stored on the public slide: the right option IDs. Kept in pulse/{id}/private/key. */
  correct?: string[];
  /** Survey: an answer is needed to continue. */
  required: boolean;
  /** Survey: show this question only when an earlier answer included this option. */
  condition: { slideId: string; optionId: string } | null;
}

export interface SurveySettings {
  welcome: string;
  thanks: string;
  /** Maximum number of responses, 0 for no limit. */
  limit: number;
  /** Optional window. Stored as ISO strings for screens, with timestamps alongside for the security rules. */
  opensAt: string;
  closesAt: string;
  opensAtTs: unknown;
  closesAtTs: unknown;
  /** One question per screen (true) or all on one page. */
  oneByOne: boolean;
}

export interface PulseDoc {
  id: string;
  kind: PulseKind;
  title: string;
  description: string;
  ownerUid: string;
  ownerName: string;
  /** Linked Gather event, or '' for a standalone presentation or survey. */
  eventId: string;
  eventTitle: string;
  status: PulseStatus;
  /** Six-character join code. */
  code: string;
  access: PulseAccess;
  /** Names are never collected and never shown. */
  anonymous: boolean;
  /** Ask for a display name before joining (ignored when anonymous). */
  askName: boolean;
  /** Participants see results on their phones when the presenter shows them. */
  audienceResults: boolean;
  /** Password protected: the questions live in pulse/{id}/vault/{key}. */
  locked: boolean;
  slides: Slide[];
  survey: SurveySettings;
  createdAt?: string;
  updatedAt?: string;
}

/** The presenter's live controls, in pulse/{id}/live/state. Participants listen to this one document. */
export interface PulseState {
  id: string;
  slideId: string;
  index: number;
  /** Accepting answers for the current slide. */
  open: boolean;
  paused: boolean;
  showResults: boolean;
  ended: boolean;
  /** Quiz: answers count only before this time. */
  closesAt: string | null;
  openedAt: string | null;
  /** Quiz: correct option IDs revealed with the results. */
  reveal: string[];
  updatedAt?: string;
}

/** Summary of the current slide for participants' phones, written by the presenter, in pulse/{id}/live/results. */
export interface PulseLiveResults {
  id: string;
  slideId: string;
  total: number;
  summary: Summary;
  leaderboard: { name: string; score: number }[];
}

export type AnswerValue = number | string | number[] | string[];

export interface PulseResponse {
  id: string;
  slideId: string;
  uid: string;
  name: string;
  value: AnswerValue;
  /** Password key, for locked presentations. */
  k?: string;
  hidden?: boolean;
  at?: string;
}

export interface PulseSubmission {
  id: string;
  uid: string;
  name: string;
  email: string;
  answers: Record<string, AnswerValue>;
  k?: string;
  at?: string;
}

export interface PulseQuestion {
  id: string;
  slideId: string;
  uid: string;
  name: string;
  text: string;
  votes: number;
  voters: string[];
  answered: boolean;
  hidden: boolean;
  k?: string;
  at?: string;
}

/** Aggregated results in a shape every chart understands. */
export type Summary =
  | { kind: 'bars'; bars: { id: string; label: string; count: number; correct?: boolean }[] }
  | { kind: 'scale'; min: number; max: number; minLabel: string; maxLabel: string; counts: number[]; average: number | null }
  | { kind: 'words'; words: { text: string; count: number }[] }
  | { kind: 'texts'; texts: { id: string; text: string; name: string }[] }
  | { kind: 'ranking'; items: { id: string; label: string; score: number; avgPosition: number }[] }
  | { kind: 'none' };
