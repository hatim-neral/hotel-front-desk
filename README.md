# Hotel Front Desk

Guest check-in / check-out app for hotel reception.

## Run

```bash
npm install
npm run dev      # open http://localhost:5173
npm run build    # production build in dist/
```

## Structure

- `src/types.ts` — guest record fields
- `src/storage.ts` — **all data access** (currently browser localStorage). Swap this file for a server API or a mobile database; nothing else needs to change.
- `src/validation.ts` — Aadhaar (12 digits + checksum), PAN, Voter ID, passport, mobile, date checks
- `src/screens/` — Dashboard, CheckInForm, GuestList, GuestDetail, Settings

## Turning it into a mobile app

The UI is already responsive and installable (PWA manifest). To ship to the Play Store / App Store, wrap it with Capacitor:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Front Desk" com.yourhotel.frontdesk --web-dir dist
npm run build && npx cap add android && npx cap open android
```
