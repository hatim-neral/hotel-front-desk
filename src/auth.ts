// Logins are Firebase accounts, so the same username and password work on every device and
// passwords are checked by Firebase (never stored in this app or its code).
// - Admin: the owner account (abhinav). Firestore rules recognise it by its sign-in address.
// - Reception: logins the admin creates in Settings. Each has an "access" record that the rules check,
//   so switching a login off locks it out of the data on every device at once.
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword, inMemoryPersistence, initializeAuth, signInWithEmailAndPassword, signOut, updatePassword,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, waitForPendingWrites, writeBatch } from 'firebase/firestore';
import type { Shift, User } from './types';
import { auth, db, LOGIN_DOMAIN, loginEmail, OWNER_EMAIL, OWNER_NAME, OWNER_USERNAME } from './cloud';
import { firebaseConfig } from './firebaseConfig';
import {
  cacheUser, cleanUsername, listShifts, listUsers, loadSessionRef, newId, saveSessionRef, saveShift, startSync, stopSync,
} from './storage';
import { setSession } from './session';
import { nowTime, todayStr } from './utils';

// Firebase needs at least 6 characters
export const PASSWORD_RULE = 'Password must be at least 6 characters';
export const isValidPassword = (password: string) => password.length >= 6 && password.length <= 64;

export type SignInResult = { user: User } | { error: string };
const WRONG = 'Wrong username or password';
const OFFLINE = 'No internet connection — signing in needs the internet';

function problem(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/network-request-failed' || code === 'unavailable') return OFFLINE;
  if (code === 'auth/too-many-requests') return 'Too many wrong tries — wait a few minutes and try again';
  if (code === 'auth/user-disabled') return 'This login is switched off — ask the admin';
  if (code === 'auth/weak-password') return PASSWORD_RULE;
  if (code === 'auth/requires-recent-login') return 'For safety, sign out and sign in again, then change the password';
  if (code.startsWith('auth/')) return WRONG;
  console.error(e);
  return 'Something went wrong — please try again';
}

// Reception: username -> sign-in address from the logins list, then Firebase checks the password
export async function receptionSignIn(username: string, password: string): Promise<SignInResult> {
  const name = cleanUsername(username);
  if (name === OWNER_USERNAME) return { error: WRONG };
  try {
    const login = await getDoc(doc(db, 'logins', name));
    if (!login.exists()) return { error: WRONG };
    const { user: account } = await signInWithEmailAndPassword(auth, login.get('email') as string, password);
    const access = await getDoc(doc(db, 'access', account.uid));
    if (!access.exists() || !access.get('active')) {
      await leave();
      return { error: 'This login is switched off — ask the admin' };
    }
    await startSync();
    const user = (await listUsers()).find((u) => u.id === access.get('userId'));
    if (!user || user.role !== 'staff') {
      await leave();
      return { error: WRONG };
    }
    return { user };
  } catch (e) {
    await leave();
    return { error: problem(e) };
  }
}

// Admin: the owner account. The first time it signs in, its own login records are created.
export async function adminSignIn(username: string, password: string): Promise<SignInResult> {
  if (cleanUsername(username) !== OWNER_USERNAME) return { error: WRONG };
  try {
    await signInWithEmailAndPassword(auth, OWNER_EMAIL, password);
    await startSync();
    let user = (await listUsers()).find((u) => u.role === 'admin');
    if (!user) {
      user = {
        id: previousOwnerId() ?? newId(),
        name: OWNER_NAME,
        username: OWNER_USERNAME,
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        uid: auth.currentUser?.uid,
        email: OWNER_EMAIL,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'staff', user.id), { ...user, updatedAt: serverTimestamp() });
      batch.set(doc(db, 'logins', OWNER_USERNAME), { email: OWNER_EMAIL });
      await batch.commit();
      cacheUser(user);
    }
    return { user };
  } catch (e) {
    await leave();
    return { error: problem(e) };
  }
}

// The admin record from before the online database, so the owner's old shifts stay theirs
function previousOwnerId(): string | undefined {
  try {
    const old: { id: string; role: string; createdAt: string }[] = JSON.parse(localStorage.getItem('hotel.users.v1') || '[]');
    return old.filter((u) => u.role === 'admin').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id;
  } catch {
    return undefined;
  }
}

// A Firebase account is made in a separate, throwaway connection so the admin stays signed in
async function newAccount(username: string, password: string): Promise<{ uid: string; email: string }> {
  const helper = initializeApp(firebaseConfig, `new-login-${newId()}`);
  try {
    const helperAuth = initializeAuth(helper, { persistence: inMemoryPersistence });
    // plain username@ the first time; a fresh address when the username was used before (password reset)
    for (const email of [loginEmail(username), `${username}.${newId()}@${LOGIN_DOMAIN}`]) {
      try {
        const { user } = await createUserWithEmailAndPassword(helperAuth, email, password);
        await signOut(helperAuth);
        return { uid: user.uid, email };
      } catch (e) {
        if ((e as { code?: string }).code !== 'auth/email-already-in-use') throw e;
      }
    }
    throw new Error('Could not create the login');
  } finally {
    await deleteApp(helper);
  }
}

// Admin: give a person a reception login
export async function createReceptionLogin(name: string, username: string, password: string): Promise<SignInResult> {
  const clean = cleanUsername(username);
  try {
    if (clean === OWNER_USERNAME || (await getDoc(doc(db, 'logins', clean))).exists()) {
      return { error: `The username “${clean}” is taken — pick another` };
    }
    const account = await newAccount(clean, password);
    const user: User = {
      id: newId(), name: name.trim(), username: clean, role: 'staff', active: true, createdAt: new Date().toISOString(), ...account,
    };
    const batch = writeBatch(db);
    batch.set(doc(db, 'staff', user.id), { ...user, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'access', account.uid), { userId: user.id, active: true, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'logins', clean), { email: account.email });
    await batch.commit();
    cacheUser(user);
    return { user };
  } catch (e) {
    return { error: problem(e) };
  }
}

// Admin: a new password. Firebase does not let one account change another's password, so a reception
// login gets a fresh account behind the same username and the old one is locked out.
export async function resetPassword(user: User, password: string): Promise<string | null> {
  try {
    if (user.role === 'admin') {
      if (!auth.currentUser) return 'Sign in again first';
      await updatePassword(auth.currentUser, password);
      return null;
    }
    const account = await newAccount(user.username, password);
    const updated: User = { ...user, ...account };
    const batch = writeBatch(db);
    if (user.uid) batch.set(doc(db, 'access', user.uid), { userId: user.id, active: false, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'access', account.uid), { userId: user.id, active: user.active, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'staff', user.id), { ...updated, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'logins', user.username), { email: account.email });
    await batch.commit();
    cacheUser(updated);
    return null;
  } catch (e) {
    return problem(e);
  }
}

// Admin: switch a reception login off (locked out on every device at once) or back on
export async function setLoginActive(user: User, active: boolean): Promise<string | null> {
  try {
    const updated = { ...user, active };
    const batch = writeBatch(db);
    batch.set(doc(db, 'staff', user.id), { ...updated, updatedAt: serverTimestamp() });
    if (user.uid) batch.set(doc(db, 'access', user.uid), { userId: user.id, active, updatedAt: serverTimestamp() });
    await batch.commit();
    cacheUser(updated);
    return null;
  } catch (e) {
    return problem(e);
  }
}

// Sign out of Firebase. The device's last shift is remembered, so the next sign-in can close it if it
// was left open.
async function leave() {
  // let changes still being sent (e.g. the shift's end) reach the server first; offline, they are sent
  // the next time this login signs in on this device
  await Promise.race([waitForPendingWrites(db), new Promise((r) => setTimeout(r, 5000))]).catch(() => {});
  stopSync();
  setSession(null);
  await signOut(auth).catch(() => {});
}

// Signing in starts a new shift. A shift this device left open (browser closed without
// "End shift") is closed at this moment. Shifts open on other devices are left alone.
export async function startShift(user: User, previous = loadSessionRef()?.shiftId): Promise<Shift> {
  const open = (await listShifts()).find((s) => s.id === previous && !s.endDate);
  if (open) await saveShift({ ...open, endDate: todayStr(), endTime: nowTime() });
  const shift: Shift = { id: newId(), userId: user.id, userName: user.name, startDate: todayStr(), startTime: nowTime() };
  await saveShift(shift);
  saveSessionRef({ userId: user.id, shiftId: shift.id });
  setSession({ user, shift });
  return shift;
}

export async function endShift(shift: Shift): Promise<void> {
  await saveShift({ ...shift, endDate: todayStr(), endTime: nowTime() });
  saveSessionRef(null);
  await leave();
}

// After a page reload: the Firebase login is remembered on the device; pick up the open shift
export async function resumeSession(ref: { userId: string; shiftId: string } | null): Promise<{ user: User; shift: Shift } | null> {
  await auth.authStateReady();
  if (!auth.currentUser || !ref) {
    if (auth.currentUser) await leave();
    return null;
  }
  await startSync();
  const user = (await listUsers()).find((u) => u.id === ref.userId && u.active);
  const shift = (await listShifts()).find((s) => s.id === ref.shiftId && !s.endDate);
  if (!user || !shift) {
    await leave();
    return null;
  }
  setSession({ user, shift });
  return { user, shift };
}
