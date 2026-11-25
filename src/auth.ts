// Passwords and the recovery code are kept only as salted SHA-256 hashes.
// This identifies who is working at the desk; it is not protection against someone with access to the
// device's browser data (everything is stored on this device).
import type { Role, Shift, User } from './types';
import { cleanUsername, listShifts, listUsers, loadRecovery, newId, saveRecovery, saveSessionRef, saveShift, saveUser } from './storage';
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

// Sign in with the username and password the admin gave out
export type SignInResult = { user: User } | { error: string };
export async function signIn(username: string, password: string): Promise<SignInResult> {
  const user = (await listUsers()).find((u) => u.username === cleanUsername(username));
  if (!user || !(await checkPin(user, password))) return { error: 'Wrong username or password' };
  if (!user.active) return { error: 'This login is switched off — ask the admin' };
  return { user };
}

export async function setPin(user: User, pin: string): Promise<void> {
  await saveUser({ ...user, ...(await hashPin(pin)) });
}

// Recovery code like 7KQ2-M9XD-4TWP, shown once when the owner account is created
export async function newRecoveryCode(): Promise<string> {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const chars = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => alphabet[b % alphabet.length]);
  const code = [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-');
  const salt = randomHex(16);
  saveRecovery({ salt, hash: await sha256(salt + code) });
  return code;
}

export async function checkRecoveryCode(code: string): Promise<boolean> {
  const r = loadRecovery();
  if (!r) return false;
  return (await sha256(r.salt + code.trim().toUpperCase())) === r.hash;
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
