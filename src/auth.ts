// Reception passwords are kept only as salted SHA-256 hashes; the admin login is built into the site (adminLogin.ts).
// This identifies who is working at the desk; it is not protection against someone with access to the
// device's browser data (everything is stored on this device).
import type { Role, Shift, User } from './types';
import { cleanUsername, listShifts, listUsers, newId, saveSessionRef, saveShift, saveUser } from './storage';
import { builtInAdmin, checkBuiltInAdmin } from './adminLogin';
import { setSession } from './session';
import { nowTime, todayStr } from './utils';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

// The admin gives each person a username and a password. Older 4-8 digit PINs keep working as passwords.
export const PASSWORD_RULE = 'Password must be at least 4 characters';
export const isValidPassword = (password: string) => password.length >= 4 && password.length <= 64;

export async function hashPin(pin: string): Promise<{ pinHash: string; salt: string }> {
  const salt = randomHex(16);
  return { salt, pinHash: await sha256(salt + pin) };
}

export async function checkPin(user: User, pin: string): Promise<boolean> {
  return (await sha256(user.salt + pin)) === user.pinHash;
}

export async function createUser(name: string, username: string, role: Role, password: string): Promise<User> {
  const user: User = {
    id: newId(),
    name: name.trim(),
    username: cleanUsername(username),
    role,
    active: true,
    createdAt: new Date().toISOString(),
    ...(await hashPin(password)),
  };
  await saveUser(user);
  return user;
}

export type SignInResult = { user: User } | { error: string };
const WRONG = 'Wrong username or password';

// Reception: only the logins the admin made in Settings
export async function receptionSignIn(username: string, password: string): Promise<SignInResult> {
  const user = (await listUsers()).find((u) => u.role === 'staff' && u.username === cleanUsername(username));
  if (!user || !(await checkPin(user, password))) return { error: WRONG };
  if (!user.active) return { error: 'This login is switched off — ask the admin' };
  return { user };
}

// Admin: the login built into the site. On a device where it has not signed in before, its user record
// is made here; on a device that already has an admin, that record is kept so its history stays the same.
// A site without a built-in admin falls back to the admin made earlier on this device.
export async function adminSignIn(username: string, password: string): Promise<SignInResult> {
  const local = (await listUsers()).find((u) => u.role === 'admin');
  if (!builtInAdmin) {
    if (!local) return { error: 'The admin login is not set up for this site yet' };
    if (local.username !== cleanUsername(username) || !(await checkPin(local, password))) return { error: WRONG };
    return { user: local };
  }
  if (builtInAdmin.username !== cleanUsername(username) || !(await checkBuiltInAdmin(builtInAdmin, password))) return { error: WRONG };
  const user: User = local
    ? { ...local, name: builtInAdmin.name, username: builtInAdmin.username, active: true }
    : {
        id: newId(),
        name: builtInAdmin.name,
        username: builtInAdmin.username,
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        pinHash: '',
        salt: '',
      };
  await saveUser(user);
  return { user };
}

export async function setPin(user: User, pin: string): Promise<void> {
  await saveUser({ ...user, ...(await hashPin(pin)) });
}

// Login starts a new shift. A shift left open on this device (browser closed without "End shift")
// is closed at this moment.
export async function startShift(user: User): Promise<Shift> {
  for (const open of (await listShifts()).filter((s) => !s.endDate)) {
    await saveShift({ ...open, endDate: todayStr(), endTime: nowTime() });
  }
  const shift: Shift = { id: newId(), userId: user.id, userName: user.name, startDate: todayStr(), startTime: nowTime() };
  await saveShift(shift);
  saveSessionRef({ userId: user.id, shiftId: shift.id });
  setSession({ user, shift });
  return shift;
}

export async function endShift(shift: Shift): Promise<void> {
  await saveShift({ ...shift, endDate: todayStr(), endTime: nowTime() });
  saveSessionRef(null);
  setSession(null);
}

// Restore the logged-in user after a page reload
export async function resumeSession(ref: { userId: string; shiftId: string } | null): Promise<{ user: User; shift: Shift } | null> {
  if (!ref) return null;
  const user = (await listUsers()).find((u) => u.id === ref.userId && u.active);
  const shift = (await listShifts()).find((s) => s.id === ref.shiftId && !s.endDate);
  if (!user || !shift) {
    saveSessionRef(null);
    return null;
  }
  setSession({ user, shift });
  return { user, shift };
}
