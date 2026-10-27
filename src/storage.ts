// All data access goes through this file. Today it uses the browser's
// localStorage; to move to a server or a mobile database later, only
// these functions need to change — the screens stay the same.
import type { Guest, Room, RoomType, Settings } from './types';

const GUESTS_KEY = 'hotel.guests.v1';
const SETTINGS_KEY = 'hotel.settings.v1';
const ROOMS_KEY = 'hotel.rooms.v1';

export const DEFAULT_SETTINGS: Settings = {
  hotelName: 'My Hotel',
  hotelAddress: '',
  defaultCheckOutTime: '11:00',
  roomTypes: [
    { name: 'Standard', rate: '1800' },
    { name: 'Deluxe', rate: '2500' },
    { name: 'Suite', rate: '4500' },
  ],
  invoicePrefix: 'INV-',
  nextInvoiceNo: 1,
};

function readGuests(): Guest[] {
  try {
    const raw: Guest[] = JSON.parse(localStorage.getItem(GUESTS_KEY) || '[]');
    // Fill fields added in later versions so older records keep working
    return raw.map((g) => {
      const guestDefaults = {
        passportIssueDate: '', passportPlaceOfIssue: '', visaIssueDate: '', visaPlaceOfIssue: '',
        addressCountry: g.nationality === 'Foreign' ? g.country : 'India',
      };
      const companionDefaults = { nationality: g.nationality, country: g.country, passportExpiry: '', visaNumber: '', visaExpiry: '' };
      return {
        ...guestDefaults,
        ...g,
        charges: g.charges ?? [],
        idPhotos: g.idPhotos ?? [],
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
  return readGuests().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  await Promise.all((guest?.idPhotos ?? []).map(deletePhoto));
  writeGuests(readGuests().filter((g) => g.id !== id));
}

// Takes the next invoice number from settings and advances the counter.
export async function takeInvoiceNumber(): Promise<string> {
  const s = await loadSettings();
  await saveSettings({ ...s, nextInvoiceNo: s.nextInvoiceNo + 1 });
  return s.invoicePrefix + String(s.nextInvoiceNo).padStart(4, '0');
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
    // Older versions stored room types as plain names without prices
    s.roomTypes = (s.roomTypes as (string | RoomType)[]).map((t) => (typeof t === 'string' ? { name: t, rate: '' } : t));
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
