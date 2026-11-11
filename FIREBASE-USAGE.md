# Firebase usage report: Gather

Checked 10 Nov 2026. Project `ie-fdp-2026` (display name Gather), **Spark (free) plan, no billing account**.

## Services

| Service | In use? | Why / notes |
|---|---|---|
| Authentication (Google) | Yes | Sign-in. Free on Spark for Google sign-in. |
| Cloud Firestore | Yes | All app data. Free daily quota: 50,000 reads, 20,000 writes, 20,000 deletes, 1 GiB stored, 10 GiB/month network. |
| Storage | **No** | Needs the Blaze plan. Photos are shrunk to about 200 px WebP/JPEG (roughly 8–20 KB) and kept in the record instead. |
| Hosting | No | The website is on Vercel. Firebase Hosting isn't used, so there aren't two systems doing the same job. |
| Realtime Database, Cloud Functions, Messaging, Analytics | No | Not enabled. Analytics was switched off when the project was created. |

Actual usage, last 24 hours (Firebase console): **404 reads, 50 writes, 4 deletes**, all from setup and testing. That's under 1% of the free daily quota.

## Before and after, measured

Measured in Gather's demo mode with a realistic event of **300 attendees**: 20 sessions, about 4,200 check-ins, about 1,800 session ratings and 150 overall feedback forms. The meter counts reads the way Firestore bills them: one per document when a screen opens, one per 1,000 for counts. React's development double-mounting was switched off so the numbers match the live site. Later live updates aren't included in either column.

| Journey | Reads before | Reads after | Live listeners before → after | Writes before → after |
|---|---|---|---|---|
| Attendee opens an event | 368 | **64** | 10 → 9 | 1 → 1 the first visit of the day, then 0 |
| Attendee opens People | 368 | **93** (30 people; +30 per "Show more") | 10 → 9 | 0 → 0 |
| Explore | 9 | **8** | 3 → 2 | 0 → 0 |
| Profile | 8 | **5** | 6 → 4 | 1 → 0 |
| Organiser opens event Overview | 6,612 | **46** | 11 → 4 | 1 → 0 |
| Organiser opens Schedule tab | 0 (already loaded) | 20 (one count per session) | – | – |
| Organiser opens Attendance tab | 0 (already loaded) | about 510 (one session + attendees) | – | – |
| Organiser opens Feedback tab | 0 (already loaded) | about 1,960 (all ratings) | – | – |
| Organiser downloads CSV or ZIP | 0 (already loaded) | about 6,575, read once per visit to the Data page | – | – |

What this means at 300 attendees: each attendee opening an event about 10 times a day uses about 640 reads. All 300 together use about 190,000 reads before the changes, against the 50,000 free daily limit, and about 19,000 after. The biggest saving is the organiser area, which used to read every check-in and rating on every visit.

## What changed

1. **Shared, closing listeners.** A screen that needs a list shares one Firestore listener with any other screen that needs the same list. When nothing uses it, it stops after 15 seconds, which avoids re-reading when you move between tabs.
2. **Counts instead of downloads.** Totals use Firestore count queries: the event's people count, organiser stats, check-ins per session and connections per speaker.
3. **Organiser data loads per tab.** Only event details, sessions, speakers and info stay live. Attendees, check-ins and feedback load only on the tab that shows them. Attendance loads one session at a time.
4. **Exports read once, on demand.** CSV and ZIP downloads fetch the full data when you click, and reuse it for other downloads on the same page.
5. **People is paged.** 30 at a time, in name order, with a cursor that never skips people who share a name.
6. **Explore reads once.** It used to keep a live listener on every published event; now it reads up to 60 once.
7. **No write on every page load.** The profile used to be saved on every visit. Now it's at most once a day per device, or straight away if your Google name or photo changes.
8. **Smaller records.** The speaker lineup on the event record, which everyone reads, no longer carries embedded photo data. Uploaded photos are 200 px WebP with a JPEG fallback.

Already in place before this pass:
- **Stable document IDs**, so repeats update instead of duplicating: check-ins `session_user`, feedback `user`, session ratings `session_user`, connections `user_speaker`, saved `user`.
- **Check-in codes** are checked by the security rules, so attendance can't be faked from the browser.
- **Offline cache** on the device, so the schedule and speakers stay readable on weak Wi-Fi.

## Assets and certificates

- **Asset lists** read only titles and details. A file's contents (up to about 700 KB) are read only when someone taps Download: 1 read each, plus that much network transfer. The free plan allows 10 GiB a month of transfer, about 15,000 downloads of a 700 KB file.
- **Certificates:** no stored files. Each is a small record of about 0.5 KB, and the PDF is drawn on the attendee's phone. Issuing reads the event's attendance once, then writes 2 small records per person (600 writes for 300 people).

## Limits and what would need a paid plan

- **Feedback summaries** still read every rating when the Feedback tab opens, about 2,000 at 300 attendees. Pre-computed totals that attendees can't tamper with need server code (Cloud Functions, Blaze plan). For now this is fine: one organiser opening the tab a few times a day stays far inside the quota.
- **File uploads** for certificates, banners, galleries and documents need Storage, which needs the Blaze plan. Videos should be YouTube or Vimeo links, not uploads.
- **Gather Pulse** (live polls) doesn't exist yet. When it's built: one listener on the active question only, votes stored once per person per question, and totals either recounted on demand or kept by a server function (Blaze).
- **Check-in display:** the projector screen writes a new code every 30 seconds while open, about 120 writes an hour. That's fine on the free plan, but close it when check-in ends.

## Monitoring checklist

- Firebase console → Firestore → **Usage**: reads, writes and deletes per day. Keep reads under about 40,000/day for headroom.
- Firebase console → **Usage and billing**: confirm the plan still shows **Spark**.
- On event day, if a "quota exceeded" error appears, it resets at midnight Pacific time (1:30 pm IST). Data isn't lost: the app shows "Couldn't load this" and actions can be retried.
- Before turning on Storage or Functions: both need Blaze. Set a budget alert first.

## Files

No Storage bucket exists, so there are no stored files to clean up. Firestore holds the `organisers` and `users` collections and **2 events** you created on the live site. One is published (join code 345037) with attendees, People entries, speakers and connections. Nothing was changed or deleted during this review; the data was only read in the console.
