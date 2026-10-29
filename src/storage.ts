// All data access goes through this file. Today it uses the browser's
// localStorage; to move to a server or a mobile database later, only
// these functions need to change — the screens stay the same.
import type { Guest, Payment, PaymentMode, Room, RoomType, Settings } from './types';

const GUESTS_KEY = 'hotel.guests.v1';
const SETTINGS_KEY = 'hotel.settings.v1';
const ROOMS_KEY = 'hotel.rooms.v1';

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
  gstin: '',
};

// Fields from earlier versions, converted when records are read
type LegacyGuest = Guest & { advancePaid?: string; paymentMode?: PaymentMode; finalPayment?: { amount: number; mode: PaymentMode } };

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
const formatGuestNo = (n: number) => GUEST_ID_PREFIX + String(n).padStart(6, '0');
const guestNoValue = (no: string) => Number(no.slice(GUEST_ID_PREFIX.length)) || 0;



function readGuests(): Guest[] {
  try {
    const raw: LegacyGuest[] = JSON.parse(localStorage.getItem(GUESTS_KEY) || '[]');
    // Fill fields added in later versions so older records keep working
    return raw.map((g) => {
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
        companions: (g.companions ?? []).map((c) => ({ ...companionDefaults, ...c })),
      };
    });
  } catch {
    return [];
  }
}

function writeGuests(guests: Guest[]) {
  localStorage.setItem(GUESTS_KEY, JSON.stringify(guests));
}

export async function listGuests(): Promise<Guest[]> {
  let guests = readGuests();
  const ids = guests.map((g) => g.guestNo);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) guests = await numberOldGuests(guests);
  return guests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Every stay needs its own bill ID. Records without one (or sharing one, from an earlier version
// that reused IDs for returning guests) get the next numbers, oldest first.
async function numberOldGuests(guests: Guest[]): Promise<Guest[]> {
  const s = await loadSettings();
  let next = Math.max(s.nextGuestNo, ...guests.map((g) => guestNoValue(g.guestNo) + 1));
  const used = new Set<string>();
  const numbered = [...guests]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((g) => {
      if (g.guestNo && !used.has(g.guestNo)) {
        used.add(g.guestNo);
        return g;
      }
      const guestNo = formatGuestNo(next++);
      used.add(guestNo);
      return { ...g, guestNo, charges: g.charges.map((c, i) => ({ ...c, chargeNo: `${guestNo}-${String(i + 1).padStart(2, '0')}` })) };
    });
  writeGuests(numbered);
  await saveSettings({ ...s, nextGuestNo: next });
  return numbered;
}

// A new bill ID for a check-in. Numbers are never reused, even after the guest checks out.
export async function assignGuestNo(): Promise<string> {
  const s = await loadSettings();
  await saveSettings({ ...s, nextGuestNo: s.nextGuestNo + 1 });
  return formatGuestNo(s.nextGuestNo);
}

// After removing guests (e.g. practice samples), continue numbering from the highest ID still in use.
export async function resetGuestCounter(): Promise<void> {
  const s = await loadSettings();
  const max = Math.max(0, ...readGuests().map((g) => guestNoValue(g.guestNo)));
  await saveSettings({ ...s, nextGuestNo: max + 1 });
}

export async function getGuest(id: string): Promise<Guest | undefined> {
  return readGuests().find((g) => g.id === id);
}

export async function saveGuest(guest: Guest): Promise<void> {
  const guests = readGuests();
  const i = guests.findIndex((g) => g.id === guest.id);
  if (i >= 0) guests[i] = guest;
  else guests.push(guest);
  writeGuests(guests);
}

export async function deleteGuest(id: string): Promise<void> {
  const guest = readGuests().find((g) => g.id === id);
  await Promise.all([...(guest?.idPhotos ?? []), ...(guest?.guestPhoto ? [guest.guestPhoto] : [])].map(deletePhoto));
  writeGuests(readGuests().filter((g) => g.id !== id));
}

// ID photos are stored in IndexedDB (as JPEG data URLs) because localStorage is too small for images.
function photoStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('hotel-photos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => resolve(req.result.transaction('photos', mode).objectStore('photos'));
    req.onerror = () => reject(req.error);
  });
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePhoto(id: string, dataUrl: string): Promise<void> {
  await done((await photoStore('readwrite')).put(dataUrl, id));
}

export async function getPhoto(id: string): Promise<string | undefined> {
  return done((await photoStore('readonly')).get(id));
}

export async function deletePhoto(id: string): Promise<void> {
  await done((await photoStore('readwrite')).delete(id));
}

export async function loadSettings(): Promise<Settings> {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    // Older versions stored room types as plain names without prices, and without AC / Non-AC
    s.roomTypes = (s.roomTypes as (string | RoomType)[]).map((t) => (typeof t === 'string' ? { name: t, rate: '', ac: true } : { ...t, ac: t.ac ?? true }));
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// A starting room list of 70 rooms (7 floors x 10): x01-x06 Standard, x07-x09 Deluxe, x10 Suite.
// The hotel edits it in Settings.
const DEFAULT_ROOMS: Room[] = Array.from({ length: 70 }, (_, i) => {
  const floor = Math.floor(i / 10) + 1;
  const n = (i % 10) + 1;
  return {
    number: String(floor * 100 + n),
    type: n <= 6 ? 'Standard' : n <= 9 ? 'Deluxe' : 'Suite',
    housekeeping: 'clean' as const,
  };
});

// The 10-room list shipped by an earlier version; upgraded to DEFAULT_ROOMS keeping cleaning status.
const OLD_DEFAULT_NUMBERS = '101,102,103,104,105,106,201,202,203,204';

export function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

export async function listRooms(): Promise<Room[]> {
  try {
    const raw = localStorage.getItem(ROOMS_KEY);
    if (!raw) return DEFAULT_ROOMS;
    const rooms: Room[] = sortRooms(JSON.parse(raw));
    if (rooms.map((r) => r.number).join(',') === OLD_DEFAULT_NUMBERS) {
      const upgraded = DEFAULT_ROOMS.map((d) => ({ ...d, housekeeping: findHousekeeping(rooms, d.number) }));
      await saveRooms(upgraded);
      return upgraded;
    }
    return rooms;
  } catch {
    return DEFAULT_ROOMS;
  }
}

function findHousekeeping(rooms: Room[], number: string): Room['housekeeping'] {
  return rooms.find((r) => r.number === number)?.housekeeping ?? 'clean';
}

export async function saveRooms(rooms: Room[]): Promise<void> {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(sortRooms(rooms)));
}

export async function updateRoom(number: string, patch: Partial<Room>): Promise<void> {
  const key = number.trim().toLowerCase();
  await saveRooms((await listRooms()).map((r) => (r.number.toLowerCase() === key ? { ...r, ...patch } : r)));
}

export async function saveSettings(settings: Settings): Promise<void> {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
