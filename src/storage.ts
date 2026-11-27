// All data access goes through this file. Data lives in the online database (Firestore) so every
// device sees the same guests, bills, rooms and logins. Screens read from an in-memory copy that live
// listeners keep up to date, so reading is instant; saving updates that copy at once and sends the
// change in the background (Firestore queues it while the internet is down).
import {
  collection, doc, getDoc, getDocFromCache, getDocsFromCache, onSnapshot, query, runTransaction, serverTimestamp,
  setDoc, Timestamp, where, writeBatch, type DocumentSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import type { CashEntry, Guest, Payment, PaymentMode, Room, RoomType, Settings, Shift, User } from './types';
import { db } from './cloud';

const SESSION_KEY = 'hotel.session.v1';
const HOTEL_NAME_KEY = 'hotel.name.v1';

export const DEFAULT_SETTINGS: Settings = {
  hotelName: 'My Hotel',
  hotelAddress: '',
  defaultCheckOutTime: '11:00',
  roomTypes: [
    { name: 'Standard', rate: '1800', ac: true },
    { name: 'Deluxe', rate: '2500', ac: true },
    { name: 'Suite', rate: '4500', ac: true },
  ],
  nextGuestNo: 1,
  gstRate: 5,
  gstHighRate: 18,
  gstSlabLimit: 7500,
  gstInclusive: false,
  gstin: '',
};

// ---------- the live copy ----------

// Collections that can grow large are synced by change: each device keeps what it has and
// listens only for records changed since. Removing a record marks it deleted, so every device
// hears about it.
const SYNCED = ['guests', 'cashbook', 'shifts', 'staff'] as const;
type Synced = (typeof SYNCED)[number];

const live = {
  guests: new Map<string, Guest>(),
  cashbook: new Map<string, CashEntry>(),
  shifts: new Map<string, Shift>(),
  staff: new Map<string, User>(),
};
let liveSettings: Settings | null = null;
let liveRooms: Room[] = [];
let unsubs: Unsubscribe[] = [];
let syncing: Promise<void> | null = null;

let changeListener: () => void = () => {};
let errorListener: (message: string) => void = () => {};
export const onDataChange = (fn: () => void) => void (changeListener = fn);
export const onSaveError = (fn: (message: string) => void) => void (errorListener = fn);

let changeTimer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => changeListener(), 30);
}

function saveFailed(e: unknown) {
  const code = (e as { code?: string })?.code ?? '';
  console.error('Save failed', e);
  errorListener(
    code === 'permission-denied'
      ? 'Not saved: this login is not allowed to change that (or has been switched off).'
      : 'Not saved to the online database — please try again.',
  );
}

// Send a change without making the screen wait for the server
function send(write: Promise<unknown>) {
  write.catch(saveFailed);
}

const stamped = <T extends object>(data: T) => ({ ...data, updatedAt: serverTimestamp() });
const millis = (d: DocumentSnapshot) => (d.get('updatedAt') as Timestamp | null)?.toMillis?.() ?? 0;

function store(name: Synced, d: DocumentSnapshot) {
  const data = d.data();
  if (!data || data.deleted) {
    live[name].delete(d.id);
    return;
  }
  const { updatedAt: _u, ...rest } = data; // eslint-disable-line @typescript-eslint/no-unused-vars
  if (name === 'guests') live.guests.set(d.id, normalizeGuest(rest as LegacyGuest));
  else if (name === 'cashbook') live.cashbook.set(d.id, rest as CashEntry);
  else if (name === 'shifts') live.shifts.set(d.id, rest as Shift);
  else live.staff.set(d.id, rest as User);
}

// Wait for the server's answer, but not for ever: offline, the device's own copy is used.
function firstAnswer(listen: (ready: () => void) => Unsubscribe): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 6000);
    unsubs.push(
      listen(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });
}

// Start after signing in (the database only answers signed-in staff). Safe to call again.
export function startSync(): Promise<void> {
  syncing ??= (async () => {
    const answers = SYNCED.map(async (name) => {
      let since = 0;
      try {
        (await getDocsFromCache(collection(db, name))).forEach((d) => {
          store(name, d);
          since = Math.max(since, millis(d));
        });
      } catch {
        // nothing kept on this device yet
      }
      // a few minutes' overlap so nothing written around the last sync is missed
      const from = Timestamp.fromMillis(Math.max(0, since - 10 * 60 * 1000));
      await firstAnswer((ready) =>
        onSnapshot(
          query(collection(db, name), where('updatedAt', '>', from)),
          { includeMetadataChanges: true },
          (snap) => {
            snap.docChanges().forEach((c) => (c.type === 'removed' ? live[name].delete(c.doc.id) : store(name, c.doc)));
            if (snap.docChanges().length) changed();
            if (!snap.metadata.fromCache) ready();
          },
          (e) => {
            console.error(`Sync of ${name} stopped`, e);
            ready();
          },
        ),
      );
    });
    const settingsAnswer = firstAnswer((ready) =>
      onSnapshot(
        doc(db, 'settings', 'hotel'),
        { includeMetadataChanges: true },
        (d) => {
          liveSettings = d.exists() ? normalizeSettings(d.data()) : null;
          rememberHotelName(liveSettings?.hotelName);
          changed();
          if (!d.metadata.fromCache) ready();
        },
        () => ready(),
      ),
    );
    const roomsAnswer = firstAnswer((ready) =>
      onSnapshot(
        collection(db, 'rooms'),
        { includeMetadataChanges: true },
        (snap) => {
          liveRooms = sortRooms(snap.docs.map((d) => d.data() as Room).map(({ number, type, housekeeping }) => ({ number, type, housekeeping })));
          changed();
          if (!snap.metadata.fromCache) ready();
        },
        () => ready(),
      ),
    );
    await Promise.all([...answers, settingsAnswer, roomsAnswer]);
  })();
  return syncing;
}

// On sign-out: stop listening and forget the in-memory copy
export function stopSync() {
  unsubs.forEach((u) => u());
  unsubs = [];
  syncing = null;
  Object.values(live).forEach((m) => m.clear());
  liveSettings = null;
  liveRooms = [];
}

// ---------- guests ----------

// Fields from earlier versions, converted when records are read
export type LegacyGuest = Guest & { advancePaid?: string; paymentMode?: PaymentMode; finalPayment?: { amount: number; mode: PaymentMode } };

function legacyPayments(g: LegacyGuest): Payment[] {
  const out: Payment[] = [];
  if (Number(g.advancePaid) > 0) {
    out.push({ id: `${g.id}-adv`, amount: Number(g.advancePaid), mode: g.paymentMode ?? 'Cash', kind: 'advance', date: g.checkInDate, time: g.checkInTime });
  }
  if (g.finalPayment?.amount) {
    out.push({ id: `${g.id}-out`, amount: g.finalPayment.amount, mode: g.finalPayment.mode, kind: 'checkout', date: g.checkOutDate, time: g.checkOutTime });
  }
  return out;
}

export const GUEST_ID_PREFIX = 'HSL';
export const formatGuestNo = (n: number) => GUEST_ID_PREFIX + String(n).padStart(6, '0');
export const guestNoValue = (no: string) => Number(no.slice(GUEST_ID_PREFIX.length)) || 0;

// Fill fields added in later versions so older records keep working
export function normalizeGuest(g: LegacyGuest): Guest {
  const guestDefaults = {
    passportIssueDate: '', passportPlaceOfIssue: '', visaIssueDate: '', visaPlaceOfIssue: '',
    addressCountry: g.nationality === 'Foreign' ? g.country : 'India',
    guestNo: '',
  };
  const companionDefaults = { nationality: g.nationality, country: g.country, passportExpiry: '', visaNumber: '', visaExpiry: '' };
  const { advancePaid: _a, paymentMode: _m, finalPayment: _f, ...rest } = g; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    ...guestDefaults,
    ...rest,
    gstRate: g.gstRate ?? DEFAULT_SETTINGS.gstRate,
    payments: g.payments ?? legacyPayments(g),
    // Bills saved before bills had their own IDs get one under the stay's bill ID
    charges: (g.charges ?? []).map((c, i) => ({ ...c, chargeNo: c.chargeNo || (g.guestNo ? `${g.guestNo}-${String(i + 1).padStart(2, '0')}` : '') })),
    idPhotos: g.idPhotos ?? [],
    guestPhoto: g.guestPhoto ?? '',
    billTo: g.billTo && Object.assign({ contactPerson: '', phone: '', email: '' }, g.billTo), // company contact fields came later
    roomMoves: g.roomMoves ?? [],
    companions: (g.companions ?? []).map((c) => ({ ...companionDefaults, ...c })),
  };
}

export async function listGuests(): Promise<Guest[]> {
  return [...live.guests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getGuest(id: string): Promise<Guest | undefined> {
  return live.guests.get(id);
}

export async function saveGuest(guest: Guest): Promise<void> {
  live.guests.set(guest.id, guest);
  send(setDoc(doc(db, 'guests', guest.id), stamped(guest)));
}

// Admin only. The record is emptied and marked deleted so every device removes it.
export async function deleteGuest(id: string): Promise<void> {
  const guest = live.guests.get(id);
  await Promise.all([...(guest?.idPhotos ?? []), ...(guest?.guestPhoto ? [guest.guestPhoto] : [])].map(deletePhoto));
  live.guests.delete(id);
  send(setDoc(doc(db, 'guests', id), stamped({ id, deleted: true })));
}

// A new bill ID for a check-in, from one counter shared by all devices so no two stays get the same
// number. Numbers are never reused, even after the guest checks out. Needs the internet.
export async function assignGuestNo(): Promise<string> {
  const floor = Math.max(liveSettings?.nextGuestNo ?? 1, highestGuestNo() + 1);
  try {
    const n = await runTransaction(db, async (tx) => {
      const ref = doc(db, 'meta', 'counter');
      const snap = await tx.get(ref);
      const next = Math.max(snap.exists() ? Number(snap.get('next')) || 1 : 1, floor);
      tx.set(ref, { next: next + 1, updatedAt: serverTimestamp() });
      return next;
    });
    return formatGuestNo(n);
  } catch (e) {
    console.error('Bill number', e);
    throw new Error('A new bill number needs the internet. Check the connection and save again.');
  }
}

const highestGuestNo = () => Math.max(0, ...[...live.guests.values()].map((g) => guestNoValue(g.guestNo)));

// After removing guests (e.g. practice samples), continue numbering from the highest ID still in use.
export async function resetGuestCounter(): Promise<void> {
  send(setDoc(doc(db, 'meta', 'counter'), { next: highestGuestNo() + 1, updatedAt: serverTimestamp() }));
}

// ---------- photos ----------

// ID and guest photos (JPEG data URLs), one record each, fetched only when shown
const photoMemo = new Map<string, string>();

export async function savePhoto(id: string, dataUrl: string): Promise<void> {
  photoMemo.set(id, dataUrl);
  send(setDoc(doc(db, 'photos', id), stamped({ data: dataUrl })));
}

export async function getPhoto(id: string): Promise<string | undefined> {
  if (photoMemo.has(id)) return photoMemo.get(id);
  const ref = doc(db, 'photos', id);
  let d = await getDocFromCache(ref).catch(() => null);
  if (!d?.exists()) d = await getDoc(ref).catch(() => null);
  const data = d?.exists() ? (d.get('data') as string) : undefined;
  if (data) photoMemo.set(id, data);
  return data;
}

export async function deletePhoto(id: string): Promise<void> {
  photoMemo.delete(id);
  send(setDoc(doc(db, 'photos', id), stamped({ deleted: true })));
}

// ---------- settings and rooms ----------

function normalizeSettings(raw: object): Settings {
  const s = { ...DEFAULT_SETTINGS, ...raw } as Settings;
  // Older versions stored room types as plain names without prices, and without AC / Non-AC
  s.roomTypes = (s.roomTypes as (string | RoomType)[]).map((t) => (typeof t === 'string' ? { name: t, rate: '', ac: true } : { ...t, ac: t.ac ?? true }));
  delete (s as { updatedAt?: unknown }).updatedAt;
  return s;
}

export const hasSavedSettings = () => liveSettings !== null;

export async function loadSettings(): Promise<Settings> {
  return liveSettings ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  liveSettings = settings;
  rememberHotelName(settings.hotelName);
  send(setDoc(doc(db, 'settings', 'hotel'), stamped(settings)));
}

// The sign-in screen shows the hotel name before anyone is signed in
function rememberHotelName(name?: string) {
  try {
    if (name) localStorage.setItem(HOTEL_NAME_KEY, name);
  } catch {
    // only a convenience
  }
}

export function cachedHotelName(): string {
  try {
    // before the first sign-in on this device: the name saved by the earlier single-device version
    const old = JSON.parse(localStorage.getItem('hotel.settings.v1') || '{}')?.hotelName;
    return localStorage.getItem(HOTEL_NAME_KEY) || old || DEFAULT_SETTINGS.hotelName;
  } catch {
    return DEFAULT_SETTINGS.hotelName;
  }
}

// A starting room list of 70 rooms (7 floors x 10): x01-x06 Standard, x07-x09 Deluxe, x10 Suite.
// The hotel edits it in Settings.
export const DEFAULT_ROOMS: Room[] = Array.from({ length: 70 }, (_, i) => {
  const floor = Math.floor(i / 10) + 1;
  const n = (i % 10) + 1;
  return {
    number: String(floor * 100 + n),
    type: n <= 6 ? 'Standard' : n <= 9 ? 'Deluxe' : 'Suite',
    housekeeping: 'clean' as const,
  };
});

export function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

const roomRef = (number: string) => doc(db, 'rooms', encodeURIComponent(number.trim().toLowerCase()));

export async function listRooms(): Promise<Room[]> {
  return liveRooms.length ? liveRooms : DEFAULT_ROOMS;
}

export async function saveRooms(rooms: Room[]): Promise<void> {
  const keep = new Set(rooms.map((r) => roomRef(r.number).id));
  const removed = (await listRooms()).filter((r) => !keep.has(roomRef(r.number).id));
  liveRooms = sortRooms(rooms);
  // a batch holds at most 500 changes
  const changes = [...rooms.map((r) => ({ r, del: false })), ...removed.map((r) => ({ r, del: true }))];
  for (let i = 0; i < changes.length; i += 450) {
    const batch = writeBatch(db);
    for (const { r, del } of changes.slice(i, i + 450)) {
      if (del) batch.delete(roomRef(r.number));
      else batch.set(roomRef(r.number), stamped(r));
    }
    send(batch.commit());
  }
}

export async function updateRoom(number: string, patch: Partial<Room>): Promise<void> {
  const key = number.trim().toLowerCase();
  const rooms = (await listRooms()).map((r) => (r.number.toLowerCase() === key ? { ...r, ...patch } : r));
  // The starting room list is not saved until something changes; then the whole list is saved once
  if (!liveRooms.length) return saveRooms(rooms);
  liveRooms = rooms;
  const room = rooms.find((r) => r.number.toLowerCase() === key);
  if (room) send(setDoc(roomRef(room.number), stamped(room)));
}

// ---------- cash book ----------

export async function listCashEntries(): Promise<CashEntry[]> {
  return [...live.cashbook.values()];
}

export async function saveCashEntry(entry: CashEntry): Promise<void> {
  live.cashbook.set(entry.id, entry);
  send(setDoc(doc(db, 'cashbook', entry.id), stamped(entry)));
}

export async function deleteCashEntry(id: string): Promise<void> {
  live.cashbook.delete(id);
  send(setDoc(doc(db, 'cashbook', id), stamped({ id, deleted: true })));
}

// ---------- logins and shifts ----------

// The owner (main admin) first, then everyone else
export async function listUsers(): Promise<User[]> {
  return [...live.staff.values()];
}

// Usernames: 3 to 20 lowercase letters, digits, dots, dashes or underscores
export const USERNAME_RULE = 'Username: 3 to 20 letters or digits (a dot, dash or underscore is fine), no spaces';
export const cleanUsername = (text: string) => text.trim().toLowerCase();
export const isValidUsername = (username: string) => /^[a-z0-9._-]{3,20}$/.test(username);

// First name in lowercase, with a number added when it is taken: mahesh, mahesh2 ...
export function suggestUsername(name: string, taken: string[]): string {
  let base = (name.trim().toLowerCase().split(/\s+/)[0] ?? '').replace(/[^a-z0-9]/g, '').slice(0, 16);
  if (base.length < 3) base = (base + 'user').slice(0, 16);
  let candidate = base;
  for (let n = 2; taken.includes(candidate); n++) candidate = base + n;
  return candidate;
}

export async function listShifts(): Promise<Shift[]> {
  return [...live.shifts.values()].sort((a, b) => (b.startDate + b.startTime).localeCompare(a.startDate + a.startTime));
}

export async function saveShift(shift: Shift): Promise<void> {
  live.shifts.set(shift.id, shift);
  send(setDoc(doc(db, 'shifts', shift.id), stamped(shift)));
}

// Used by auth.ts, which writes a login's records together
export const cacheUser = (user: User) => void live.staff.set(user.id, user);

// Who is signed in on this device, and their open shift
export interface SessionRef {
  userId: string;
  shiftId: string;
}

export function loadSessionRef(): SessionRef | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSessionRef(ref: SessionRef | null): void {
  try {
    if (ref) localStorage.setItem(SESSION_KEY, JSON.stringify(ref));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // the session then lasts until the page is closed
  }
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
