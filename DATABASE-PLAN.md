# Gather database plan (needs your approval before anything goes live)

**Current state:** Firebase project `ie-fdp-2026` (Mumbai) was created with your approval on 10 Nov 2026. Firestore started in locked production mode.

Nothing below is applied until you approve it. `firestore.rules` is a local file until someone runs `npm run deploy:rules`.

## What would be created

This is for a **new, empty** Firebase project. Collections appear as the app writes to them.

| Collection | Holds | Who can read | Who can write |
|---|---|---|---|
| `certificates/{id}` | **New.** Issued certificates (name, event, title, dates, signatures). The ID is long and random, so the verify link can be public | Anyone with the ID; listing limited to your own | Organisers |
| `organisers/{email}` | Organiser allow-list | Own entry; organisers | Organisers |
| `events/{id}` | Event details, public speaker lineup, feedback questions | Anyone if published; organisers | Organisers |
| `events/{id}/sessions/{id}` | Schedule | Anyone if published; organisers | Organisers |
| `events/{id}/speakers/{id}` | Profiles and contact details | Joined attendees; organisers | Organisers |
| `events/{id}/private/info` | Wi-Fi name and password | Joined attendees; organisers | Organisers |
| `events/{id}/directory/{uid}` | People list: name, institution, department, designation only. No email or phone, enforced by the rules | Joined attendees; organisers | Self; organisers can remove |
| `events/{id}/assets/{id}` | **New.** Event assets: title, type, session, link or file details | Joined attendees; organisers | Organisers |
| `events/{id}/assetFiles/{id}` | **New.** An uploaded file's contents (under about 700 KB), read only on download | Joined attendees, one at a time; organisers | Organisers |
| `events/{id}/certIndex/{uid}` | **New.** Which certificate belongs to whom in this event | Self; organisers | Organisers |
| `events/{id}/sessionKeys/{id}` | Rotating check-in codes | Organisers | Organisers |
| `events/{id}/preregistered/{email}` | Imported registration list | Own entry; organisers | Organisers |
| `events/{id}/attendees/{uid}` | Attendee profiles | Self; organisers | Self (validated); organisers |
| `events/{id}/attendance/{session_uid}` | Check-ins | Self; organisers | Self with a live code; organisers |
| `events/{id}/sessionFeedback/{session_uid}` | A rating and comment for one session | Self; organisers | Self, if the organiser left feedback on for that session |
| `events/{id}/feedback/{uid}` | Feedback | Self; organisers | Self while feedback is open; organisers |
| `events/{id}/connections/{uid_speaker}` | Speaker connections | Self; organisers | Self |
| `profiles/{uid}` | **New in Phase 1.** Public profile: name, photo, headline, bio, organisation, designation, education, skills, interests, location, links, visibility, a fixed profile ID. Phone and email are refused by the rules | Signed-in users if visible; owner always | Owner only; profile ID can't change |
| `users/{uid}` | Profile: name, email and Google photo, saved at each sign-in | Self | Self |
| `users/{uid}/events/{id}` | Each person's joined events | Self | Self |
| `users/{uid}/swipes/{id}` | Explore swipes: saved or skipped | Self | Self |
| `users/{uid}/profile/me` | Details from the last join, for one-tap joining. Includes phone and institution | Self | Self |
| `events/{id}/saved/{uid}` | Who saved an event: name and email | Organisers; self | Self; organisers can remove |

**Indexes:** none needed. Every query is a simple equality filter.
**Paid features:** none needed. Speaker photos are shrunk and stored on the speaker record, so Firebase Storage isn't used.

## Steps that need your go-ahead

1. Create a new Firebase project, or point me at an existing one. **If you use an existing project, I'll inspect its collections and rules first and show you any conflict.** Deploying `firestore.rules` replaces all rules in that project, which could lock out or expose another app using it, so a new project is strongly recommended.
2. Enable Authentication (Google only) and Firestore.
3. Deploy `firestore.rules`.
4. Add your email to `organisers`, the first organiser record.

## Risks

- Everyone who joins can see the Wi-Fi password. Published events can be joined by anyone with a Google account unless registration is set to invite list only, so use a guest network.
- The People list shows name, role and institution to other attendees. It's on by default, and each person can opt out when joining or later under Edit my details.

- Attendee personal data (names, emails, phones) will live in this database. Access is limited by the rules above.
- Rules changes after launch can affect people mid-event, so they should be avoided on event days.

## Rollback

- **Rules:** the Firebase console keeps rule history; a previous version can be restored from the Rules tab.
- **New project:** nothing else depends on it, so disconnecting means removing the values from the app's environment settings. Deleting the project is a separate step that would need your explicit approval.
- **Data:** the app's "Download all (.zip)" gives a full CSV backup of each event. Take one before and after the event. CSV is a backup for reading, not a one-click restore.
- **In-app delete:** "Delete event" is permanent. Only organisers can use it, and they must type DELETE first.

## Phase 1 change (needs approval before publishing)

- **Adds** one collection, `profiles`. Nothing existing is renamed, moved or deleted.
- **Rules:** a new `match /profiles/{uid}` block. Every other rule stays exactly as published on 10 Nov.
- **Existing data:** untouched. Each person's profile is created the next time they sign in.
- **Risk:** low. If the rules aren't published first, the new Profile page shows "Couldn't load this" and everything else keeps working.
- **Rollback:** restore the previous rules version from Firebase's rules history; `profiles` documents can stay, since nothing else reads them.

## Assets and certificates (also needs approval)

- **Adds** `certificates`, `events/*/assets`, `events/*/assetFiles` and `events/*/certIndex`, plus a `certificates` setting on events. Nothing existing changes.
- **Files on the free plan:** uploads are stored inside Firestore, capped at about 700 KB by the rules. Bigger files are added as links (Drive, OneDrive). Real file storage would need the Blaze plan.
- **Certificates:** no files are stored. The PDF is drawn on the attendee's device from the small record.
- **Rollback:** restore the previous rules version, and delete the new collections from the console if you want them gone.

## Pending approval: Gather Pulse, private events, banners, God view (10 Nov 2026)

Nothing existing is renamed, moved or deleted. Only new collections and new optional fields.

**New collections**
| Path | What | Who can read | Who can write |
|---|---|---|---|
| `pulseCodes/{code}` | 6-character join code → presentation/survey ID | Anyone | Creator (create once) |
| `pulse/{id}` | Presentation or survey: title, settings, slides | Owner, event organisers, super admins; participants when live/published and allowed (public / signed-in / event attendees) | Owner (event ones: organisers too) |
| `pulse/{id}/private/key` | Quiz right answers, quiz timings, password vault ID | Owner only | Owner |
| `pulse/{id}/vault/{hash}` | Questions of a password-protected one, stored under the password's hash | People who know the hash | Owner |
| `pulse/{id}/live/state`, `live/results` | Presenter controls and the results summary phones read | Participants | Owner |
| `pulse/{id}/responses/{slide_uid}` | One live answer per person per slide | The person; owner | The person, only while that slide is open |
| `pulse/{id}/qa/{uid_n}` | Q&A questions (max 5 each) with upvotes | Participants (non-hidden) | Asker; upvotes once each; owner moderates |
| `pulse/{id}/submissions/{uid}` | One survey response per person | The person; owner | The person, while open and under the limit |
| `pulse/{id}/counter/main` | Response count for surveys with a limit | Participants | +1 per submission |
| `pulse/{id}/starts/{uid}` | Who opened a survey (completion rate) | Owner | The person, once |
| `events/{id}/media/banner` | Full-size event banner (≤ 420 KB) | Same as the event | Organisers |
| `superAdmins/{email}` | God view access | The person; super admins | Super admins |

**New optional fields on `events/{id}`:** `linkAccess` (private link events), `videoUrl` (YouTube/Vimeo), `bannerThumb` (≤ 26 KB card image). Existing events without them behave exactly as today.

**Rule changes to existing paths:** organisers check also accepts super admins; `users/{uid}` (name, email, last sign-in) readable by super admins (phone numbers in `users/{uid}/profile/me` stay private); private events (`linkAccess: true`) can be opened by link but never listed.

**Also needs:** Firebase Authentication → Anonymous sign-in switched on, so guests can answer public polls and surveys without a Google account (free on the Spark plan). Without it, public links ask for Google sign-in instead.

**Bootstrap:** the first super admin document (`superAdmins/<owner email>`) has to be created once by hand or with approval.

**Rollback:** republish `firestore.rules.backup-2026-11-10` or the previous version from the console history. New collections can be left in place; nothing reads them without the new app.

**Tests:** 72 rules tests on the emulator (42 existing + 30 for this change).

## Pending approval: speakers, speaker feedback, secure pass, check-in, capacity (11 Nov 2026)

Nothing existing is removed or renamed. New collections and optional fields only; old passes keep working.

| Path | What | Read | Write |
|---|---|---|---|
| `speakerCodes/{code}` | The event's shared speaker code (expiring, can be changed or switched off) | Looked up by exact code only (no listing) | Organisers create, change, switch off |
| `events/{id}/roles/{uid}` | Event-specific speaker role on the same account (speakerId, Pulse permission, active) | The person; organisers | Created only with the current code and a speaker profile linked to the same account; organisers revoke |
| `events/{id}/speakers/{sid}.uid` | Links a listed speaker to the attendee account that claimed it (once). Speakers not on the list add `speakers/{uid}` from their own profile | Attendees | The speaker (link once, edit own bio/topic/links); organisers everything |
| `users/{uid}/speaking/{eventId}` | The person's own list of events they speak at | The person | The person; organisers remove on revoke/delete |
| `events/{id}/speakerFeedback/{fid}` | Attendee → speaker rating and comment. Anonymous ones store no name, photo or account ID | Organisers; the named speaker (visible/reported only) | Joined attendees who aren't speakers, once per speaker; speakers may only report; organisers moderate |
| `events/{id}/speakerFeedbackOwners/{speaker_uid}` | Who wrote which feedback (one per attendee per speaker) | Organisers; the writer | The writer, in the same write as the feedback |
| `events/{id}/counters/attendees` | Registration count, only when a capacity is set | Signed-in | +1 per self-registration, never past capacity; organisers resync |

**New optional fields**
- `events/{id}`: `expectedAttendees`, `capacity`
- `events/{id}/attendees/{uid}`: `regId` (random pass ID), `checkedIn`, `checkedInAt` (server time only), `checkInMethod`
- `events/{id}/private/info`: `helpdesk` (≤ 3 contacts; the old single help line is kept in step)
- `events/{id}/speakers/{sid}`: `category`, `pinned`, `featured`, `order`

**Rule changes to existing paths:** attendees can't set check-in fields or change a pass ID; self-registration respects capacity; speakers with Pulse permission can manage their event's Pulse sessions.

**Tests:** 93 rules tests on the emulator (74 existing + 19 new).

## Pending approval: Meet Ping, notifications, WhatsApp opt-in (11 Nov 2026)

New collections only; nothing existing changes.

| Path | What | Read | Write |
|---|---|---|---|
| `pings/{eventId}_{from}_{to}` | A Meet Ping (message, status, names, web photos). The ID allows one per pair per event | The two people; organisers (for event clean-up) | The sender creates (both must be registered at the event, never to themselves); only the recipient accepts/declines once; the sender may withdraw while pending |
| `users/{uid}/notifications/{id}` | In-app notification (new ping, or ping accepted) | Only that person | Created only in the same write as a new ping or an acceptance; the person marks read |
| `waMessages/{messageId}` | WhatsApp message → ping lookup for delivery updates | Nobody (server only) | Server only (Admin SDK) |
| `users/{uid}/profile/me` + `whatsappOptIn`, `whatsappPhone` | WhatsApp opt-in, private | Only that person (and the server) | Only that person |
| `pings/{id}.wa` | WhatsApp result (sent / skipped / failed / delivered / read) | The two people | Server only |

**Tests:** 106 rules tests (93 existing + 13 new).

## Pending approval: saved-events fix, My People (11 Nov 2026)

**Root cause of the saved-events bug:** the app stores emails in lower case, but the rules compared
the saved record's email with the email exactly as it appears in the Google sign-in token. Any account
whose Google email contains capital letters had every save refused (and the same mismatch affected
joining, invite lists and organiser checks). Fixed by lower-casing in the rules: `myEmail()`.

**Rule changes**
- `myEmail()` compares in lower case everywhere.
- `events/{id}/saved/{uid}`: private-link events can be saved too (drafts still can't).
- `pings`: `fromRole` / `toRole` allowed; the sender can cancel a pending request (status `cancelled`,
  record kept) and send a cancelled one again; pings are no longer deleted by users (organisers still can,
  for event deletion).
- `users/{uid}/notifications/{id}`: on re-send, the sender may mark the recipient's notification unread
  again (only together with the re-send).

**No new collections.** Saved events still use `users/{uid}/swipes/{eventId}` (choice `save`, now with the
event's small banner) and `events/{id}/saved/{uid}`. My People reads the existing `pings` records.

**Tests:** 115 rules tests (106 + 9 new: saving with capitalised emails, duplicates, private/draft events,
other users, organisers with capitals, cancel, resend, roles).

## Approved and built (12 Nov 2026): GatherUp complete update

All additions; existing accounts, events, passes and old speaker codes keep working. Tested on the emulator (154 rules tests).

- **D. 4-digit speaker code:** `speakerPins/{eventId}` (organisers only) and `events/{e}/speakerTries/{uid}` (each guess saved first, max 10 per person per event; only a saved guess matching the code can be marked correct). Roles from the new code require `code: 'PIN'` and give Pulse access. Old 10-character `speakerCodes` still work until they expire.
- **F. Check-in history:** attendee records gain `checkedInBy`, `checkInSession`, method `self`. New `events/{e}/checkinLog/{id}` (add-only; removable only while the whole event is being deleted). A session self-scan also marks event attendance in the same step.
- **E. Event types:** `eventType` and `typeDetails` on events (no rule change).
- **B. Usernames:** `usernames/{handle}` = `{uid, at}`; `profiles.username`. Claim + profile update + release of the old name in one step; unique by document ID.
- **C. Contact sharing:** `attendees.shareContact`; `directory` may hold `email`/`phone` only when it's on and they match the registration. Pings gain `fromPhone`/`toPhone`, each set only by its owner after acceptance.
- **Announcements:** `events/{e}/announcements/{id}` (organisers post/delete; attendees, speakers read).
- **Pulse:** creating sessions now needs an organiser, or a speaker for that event. Existing items stay editable by their owners.
- **Not built (agreed for after 16 Nov):** per-event organisers (Main Organiser, invites, revoke).

## Proposed (12 Nov 2026): one identity, speaker assignments linked by verified email

Inspection of the live database found **no duplicate users or duplicate speaker entries** (FDP: 13 listed speakers, 2 linked roles, each on its own account; codex hack: 1 listed speaker, no roles). No migration needed.

Mapping to the requested structure: Users = `users/{uid}` + `profiles/{uid}`; EventMembers = `events/{e}/attendees/{uid}` + `events/{e}/roles/{uid}`; SpeakerAssignments = `events/{e}/speakers/{id}` with `uid` (empty until claimed); Attendance = one `attendees/{uid}` record per event; Connections/pings use account IDs.

Changes:
- Speaker entries store `emailLower`. A signed-in person with that verified email can find their own entry (only theirs).
- Claiming a listed entry that has an email requires that verified email (closes impersonation with the code). Entries without an email can still be claimed with the code, first come only.
- New `EMAIL` role path: listed with your verified email = speaker role on your account, no code; joins the event if needed.
- One speaker entry per person per event: a role can only be re-made after removal, and only with the code (removal isn't undone by email).

## Proposed (13 Nov 2026): open organisers, per-event ownership, Master Admin

- **Master Admin** `toincial@gmail.com` is built into the rules (`isSuper()`), with full control of every event, account and platform list. `superAdmins/{email}` still adds more super admins (Master Admin only).
- **Open organiser registration:** any signed-in, verified Google account can create events (`canOrganise()`); no approval. The legacy `organisers` list no longer grants anything (Master Admin manages it).
- **Ownership:** events gain `ownerUid` / `ownerEmail`. Every event-level permission (`ownsEvent(e)`) = owner or Master Admin: the event, attendees, check-ins, speakers, codes, certificates, announcements, Pulse, deletion. Ownership can only be changed by the Master Admin.
- Existing events without `ownerUid` can only be managed by the Master Admin.
- Dual role: same account; attendee data unchanged; mode toggle only changes the dashboard.

## Organiser teams (co-organisers) — 14 Nov 2026

**New optional field** on `events/{id}`: `teamEmails: string[]` (lower-case Google emails, max 15). No existing data changes; events without it behave exactly as before.

**Rules change** (`firestore.rules`):
- `onTeam(d)`: signed in, verified email, and that email (lower-cased) is in `d.teamEmails`.
- `ownsEvent(e)` now also allows `onTeam` — team members manage everything under the event (sessions, speakers, attendees, check-in, attendance, announcements, assets, pulse, exports).
- `events/{id}` get/list: also team members (so they see drafts and find the event with `teamEmails array-contains me`).
- `events/{id}` update: owner and Master Admin as before; team members too, but they can't change `ownerUid`, `ownerEmail` or `teamEmails`. `teamEmails` must be a list of at most 15.
- `events/{id}` delete: unchanged — owner or Master Admin only.

Note: like `ownerEmail`, `teamEmails` is readable by anyone who can read a public event.

Tests: `rules-tests/team.rules.test.ts` (8 tests); full suite 190/190 passing.

## Session overview and self check-in — 13 Nov 2026

**New optional field** on `events/{id}/sessions/{sid}`: `selfCheckIn: boolean` (organisers only; off when missing).
**New attendance method** `'self'` on `events/{id}/attendance/{sid}_{uid}`.

**Rules change** (`attendance` create): a third way in, besides organisers and the live room code — a registered attendee may create their own record with `method == 'self'` (fields `uid, sessionId, name, email, method, at` only, `at == request.time`) **only if** that session's `selfCheckIn == true`. Door check-in from a session check-in keeps working unchanged (it only needs the matching attendance record written in the same batch).

No existing data changes. Tests: `rules-tests/selfcheckin.rules.test.ts` (5); full suite 195/195.
