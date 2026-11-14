import type { EventType } from './eventTypes';
export type Accent = 'blue' | 'amber' | 'violet' | 'lime' | 'rose';

export interface Question {
  id: string;
  type: 'rating' | 'text' | 'choice';
  label: string;
  options?: string[];
  required?: boolean;
}

export interface LineupItem { id: string; name: string; role: string; photo?: string }

export interface EventDoc {
  id: string;
  title: string;
  tagline: string;
  description: string;
  organiser: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  joinCode: string;
  published: boolean;
  /** open: anyone can register. invite: only people on the imported list. */
  registration: 'open' | 'invite';
  feedbackOpen: boolean;
  color: Accent;
  /** Certificate settings. Missing means certificates are off. */
  certificates?: CertConfig;
  /** A Google Maps link or an address for the venue map. */
  mapLink?: string;
  /** Private events: not listed anywhere, but anyone with the private link can open and join. */
  linkAccess?: boolean;
  /** A YouTube or Vimeo link shown on the event page. */
  videoUrl?: string;
  /** Small banner for cards (data URL). The full banner is in events/{id}/media/banner. */
  bannerThumb?: string;
  /** How many people the organiser expects. Planning only; never limits registration. */
  expectedAttendees?: number;
  /** Maximum registrations, 0 or missing for no limit. Enforced by the security rules with a counter. */
  capacity?: number;
  /** Who created the event and controls it (with the Master Admin). Older events may not have one. */
  ownerUid?: string;
  ownerEmail?: string;
  /** Co-organisers (lower-case Google emails). They manage the event like the owner, except the team itself,
   * handing the event over, and deleting it. Up to 15. */
  teamEmails?: string[];
  /** Set while the event is being permanently deleted (stays set if that was interrupted). */
  deleting?: boolean;
  /** Soft delete: the organiser deleted it. It is gone for everyone except super admins, who still see it. */
  deleted?: boolean;
  deletedAt?: string;
  deletedByEmail?: string;
  /** Who owned it and how it was shared before it was deleted (ownership and sharing are cleared on delete). */
  deletedFrom?: { ownerUid: string; teamEmails: string[]; published: boolean; linkAccess: boolean };
  /** Workshop, conference, hackathon… Older events have none. */
  eventType?: EventType;
  /** Answers to the questions for this event type (see eventTypes.ts). */
  typeDetails?: Record<string, string>;
  lineup: LineupItem[];
  questions: Question[];
  createdAt?: string;
}

export interface CertConfig {
  on: boolean;
  title: string;
  /** Minimum share of sessions (excluding breaks) a person checked in to, 0–100. */
  minAttendance: number;
  requireFeedback: boolean;
  signers: { name: string; title: string }[];
}

/** An event file or link for attendees: slides, handouts, recordings. */
export interface AssetDoc {
  id: string;
  title: string;
  description: string;
  kind: 'slides' | 'document' | 'video' | 'link' | 'other' | 'schedule';
  sessionId: string;
  /** Either a link or an uploaded file (stored in assetFiles/{id}). */
  url: string;
  fileName: string;
  fileSize: number;
  mime: string;
  createdAt?: string;
}

/** Issued certificate. The ID is random and long, so the verification link can be public without being guessable. */
export interface CertificateDoc {
  id: string;
  eventId: string;
  uid: string;
  name: string;
  eventTitle: string;
  title: string;
  organiser: string;
  dates: string;
  venue: string;
  signers: { name: string; title: string }[];
  /** The event was deleted: hidden from the person's profile (the verification link still works). */
  eventDeleted?: boolean;
  issuedAt?: string;
}

export interface SessionDoc {
  id: string;
  title: string;
  description: string;
  room: string;
  startsAt: string;
  endsAt: string;
  speakerIds: string[];
  kind: SessionKind;
  /** Organisers choose per session. Missing means on. */
  feedbackOn: boolean;
  /** The organiser lets attendees mark themselves present (for when scanning fails or people arrive late). Off by default. */
  selfCheckIn?: boolean;
}

export type SessionKind = 'talk' | 'workshop' | 'activity' | 'panel' | 'break';

export interface SessionFeedbackDoc {
  id: string;
  uid: string;
  sessionId: string;
  name: string;
  email: string;
  rating: number;
  comment: string;
  at?: string;
}

export interface SpeakerDoc {
  id: string;
  name: string;
  role: string;
  organisation: string;
  topic: string;
  /** Comma separated, shown as tags on the profile. */
  expertise: string;
  bio: string;
  photo?: string;
  email: string;
  /** Lower-case copy of email, used to match the speaker's own account. */
  emailLower?: string;
  phone: string;
  linkedin: string;
  website: string;
  /** Extra links the organiser adds: portfolio, Instagram, a booking page and so on. */
  links?: SpeakerLink[];
  /** Organiser-controlled presentation. Missing values mean Regular, not pinned, not featured. */
  category?: SpeakerCategory;
  pinned?: boolean;
  featured?: boolean;
  /** Manual order (lower first). Pinned speakers always come first. */
  order?: number;
  /** The attendee account linked to this speaker (set when they activate with the speaker code). */
  uid?: string;
}

export type SpeakerCategory = 'featured' | 'keynote' | 'guest' | 'panelist' | 'regular';

/** A person's roles at one event, in events/{id}/roles/{uid}. Attendee is implied by joining. */
export interface RoleDoc { id: string; uid: string; name: string; email: string; roles: 'speaker'[]; speakerId: string; status: 'verified'; active: boolean; pulse: boolean; code: string; at?: string }

/** A single-use speaker activation code, in speakerCodes/{code}. Never listed; only looked up by its exact value. */
export interface SpeakerCodeDoc { id: string; eventId: string; eventTitle: string; common: boolean; speakerId: string; speakerName: string; pulse: boolean; expiresAt: string; used: boolean; usedBy: string; revoked: boolean; createdAt?: string }

/** Feedback an attendee gives a speaker. Anonymous feedback stores no name, photo or account ID at all. */
export interface SpeakerFeedbackDoc { id: string; speakerId: string; rating: number; text: string; anonymous: boolean; uid: string; name: string; photo: string; status: 'visible' | 'reported' | 'hidden'; at?: string }

/** Who wrote which speaker feedback: organisers and the writer only. One per attendee per speaker. */
export interface FeedbackOwnerDoc { id: string; uid: string; speakerId: string; fid: string; at?: string }

/** Events where someone speaks, mirrored on their account for the speaker area. */
export interface SpeakingDoc { id: string; eventId: string; speakerId: string; speakerName: string; eventTitle: string; startsAt: string; pulse: boolean }

/** Up to three help desk contacts per event. */
export interface HelpContact { name: string; designation: string; phone: string; primary: boolean }

export interface SpeakerLink { label: string; url: string }

export interface AttendeeDoc {
  id: string;
  uid: string;
  name: string;
  email: string;
  phone: string;
  institution: string;
  department: string;
  designation: string;
  source: 'app' | 'list';
  /** Google profile photo, when the person has one. */
  photo?: string;
  /** Appears in the People list other attendees can see. */
  listed: boolean;
  joinedAt?: string;
  /** Random registration ID shown on the pass and in its QR code (no personal details in the QR). */
  regId?: string;
  /** Event check-in at the door. Time comes from the server. */
  /** Shares email and phone with other attendees on the People list. */
  shareContact?: boolean;
  checkedIn?: boolean;
  checkedInAt?: string;
  checkInMethod?: 'pass' | 'manual' | 'self';
  /** Who checked them in: the organiser's account, or their own for a self scan. */
  checkedInBy?: string;
  checkInSession?: string;
}

/** Attendee-only event details, kept apart from the public event record. */
/** Attendee-only details: Wi-Fi, who to call for help, and notes for the day. */
export interface EventInfoDoc { id: string; wifiName: string; wifiPassword: string; helplineName?: string; helplinePhone?: string; notes?: string; helpdesk?: HelpContact[] }

/** What other attendees can see about a person. Never includes email or phone. */
export interface DirectoryDoc { id: string; uid: string; name: string; institution: string; department: string; designation: string; photo?: string; /** Only when they chose to share contact details. */ email?: string; phone?: string }

/** One swipe in Explore, kept with enough event detail to list it without another read. */
export interface SwipeDoc { id: string; choice: 'save' | 'skip'; title: string; tagline: string; startsAt: string; endsAt: string; venue: string; color: Accent; bannerThumb?: string; at?: string }

/** Who saved an event, so organisers can see the interest. */
export interface SavedDoc { id: string; uid: string; name: string; email: string; at?: string }

export interface PreregDoc {
  id: string; // lower-case email
  name: string;
  email: string;
  phone: string;
  institution: string;
  department: string;
  designation: string;
}

export interface AttendanceDoc {
  id: string;
  uid: string;
  sessionId: string;
  name: string;
  email: string;
  /** qr: scanned or typed the room code · staff: pass scanned · manual: ticked by an organiser · self: marked themselves (when the organiser allowed it) */
  method: 'qr' | 'staff' | 'manual' | 'self';
  key?: string;
  at?: string;
}

export interface FeedbackDoc {
  id: string;
  uid: string;
  name: string;
  email: string;
  answers: Record<string, string | number>;
  speakerRatings: Record<string, number>;
  at?: string;
}

export interface ConnectionDoc {
  id: string;
  uid: string;
  speakerId: string;
  speakerName: string;
  name: string;
  email: string;
  method: 'scan' | 'app';
  at?: string;
}

export interface MembershipDoc { id: string; title: string; startsAt: string; endsAt?: string; venue: string; color: Accent }

export interface AppUser { uid: string; email: string; name: string; emailVerified: boolean; photo?: string; /** A guest session (no Google account). */ guest?: boolean }

export interface SessionKeyDoc { id: string; key: string; prev: string; open: boolean; expiresAt: unknown }
