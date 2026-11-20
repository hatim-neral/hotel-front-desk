// The logged-in user and their shift, so any saved record can be stamped with who made it.
import type { Shift, Stamp, User } from './types';

let current: { user: User; shift: Shift } | null = null;

export function setSession(s: { user: User; shift: Shift } | null) {
  current = s;
}

export function getSession() {
  return current;
}

export function actor(): Stamp {
  return current ? { by: current.user.name, shiftId: current.shift.id } : {};
}

export const isAdmin = () => current?.user.role === 'admin';
