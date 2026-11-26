// The online database (Firestore) and logins (Firebase Authentication) shared by every device.
// Each device keeps a copy of the data (IndexedDB), so screens open instantly and work through
// short internet drops; changes are sent when the connection is back.
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { CACHE_SIZE_UNLIMITED, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig';

// (re-used when the module is loaded again, e.g. while developing)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    return getFirestore(app);
  }
})();

// Logins are Firebase accounts with a made-up email per username (no email is ever sent).
// The owner's address is also written in firestore.rules: only that account is the main admin.
export const LOGIN_DOMAIN = 'desk.example.com';
export const OWNER_USERNAME = 'abhinav';
export const OWNER_NAME = 'Abhinav';
export const loginEmail = (username: string) => `${username}@${LOGIN_DOMAIN}`;
export const OWNER_EMAIL = loginEmail(OWNER_USERNAME);
