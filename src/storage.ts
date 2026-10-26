// All data access goes through this file. Today it uses the browser's
// localStorage; to move to a server or a mobile database later, only
// these functions need to change — the screens stay the same.
import type { Guest, Settings } from './types';

const GUESTS_KEY = 'hotel.guests.v1';
const SETTINGS_KEY = 'hotel.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  hotelName: 'My Hotel',
  hotelAddress: '',
  defaultCheckOutTime: '11:00',
  roomTypes: ['Standard', 'Deluxe', 'Suite', 'Dormitory'],
  invoicePrefix: 'INV-',
  nextInvoiceNo: 1,
};

function readGuests(): Guest[] {
  try {
    const raw: Guest[] = JSON.parse(localStorage.getItem(GUESTS_KEY) || '[]');
    // Fill fields added in later versions so older records keep working
    return raw.map((g) => ({ ...g, charges: g.charges ?? [], idPhotos: g.idPhotos ?? [] }));
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
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
