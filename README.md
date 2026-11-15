# Gather

Event app for attendees and organisers. Next.js, TypeScript and Firebase (Google login and Firestore).

**Attendees** log in with Google, swipe through events in Explore (right to save, left to skip), join from Saved in one tap or with a 6-digit code or the host's QR, then get the event's Wi-Fi, people, speakers, schedule and feedback. They check in by scanning the code on the room's screen and collect stamps in their pass.

**Organisers** log in on a separate page to add events, speakers, sessions and Wi-Fi, import registration lists, run check-in and download everything as CSV.

## Try it now (no setup)

```bash
npm install
npm run dev
```

Open http://localhost:5191. With no Firebase settings it runs in demo mode: both logins work and data stays in your browser.

## Live

- Code: https://github.com/incial/gather (`main` is the source of truth)
- Website (Vercel project `gatherapp-ten`): https://gatherapp-ten.vercel.app
- Database and Google login (Firebase project `ie-fdp-2026`, display name Gather, Mumbai)
- Update the live site: push to `main`, then the owner of the `gatherapp-ten` Vercel project deploys it (or run `npm run deploy` from a copy linked to that project)

## Going live (how it was set up)

Read [DATABASE-PLAN.md](DATABASE-PLAN.md) first. Nothing touches a real database until that plan is approved.

1. **Firebase:** at https://console.firebase.google.com create a new project, add a Web app, turn on Authentication with Google, and create a Firestore database.
2. **Settings:** copy `.env.example` to `.env.local` and paste the web app's values. Don't set `NEXT_PUBLIC_USE_EMULATOR` on a live site.
3. **Security rules:** after approval, run `npx firebase login`, `npx firebase use <project-id>`, then `npm run deploy:rules`.
4. **First organiser:** in Firestore, add a document to the `organisers` collection with your Google email as the document ID. Add more people from the Team button.
5. **Hosting:** import this folder to https://vercel.com, set its Root Directory to `gather` if it's in a larger repo, and add the same `NEXT_PUBLIC_FIREBASE_*` values as environment variables.
6. **Allow the domain:** in Firebase, go to Authentication > Settings > Authorized domains and add your Vercel domain.

## Event day

- Open **Schedule > Run check-in** on the room's laptop and leave that tab in front. Codes change every 30 seconds and stop working if the page is closed or the tab is left in the background.
- Camera scanning needs HTTPS, which Vercel provides.
- Use a guest Wi-Fi network. Everyone who joins can see the password.
- Download **Data & CSV > Download all** after the event as a backup.

## Tests

```bash
npm test
```

```bash
npm run test:rules
```

`test:rules` runs the security rules on a local emulator and needs Java 21+. It can't reach a real project.
