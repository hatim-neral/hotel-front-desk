// One-time move of data saved in this browser by the earlier, single-device version into the online
// database. Nothing already online is overwritten, and the local copy is left in place as a backup.
// Old logins can't be moved (their passwords are unknown); the admin adds them again in Settings.
import { doc, runTransaction, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './cloud';
import type { CashEntry, Guest, Room, Shift } from './types';
import { nowTime, todayStr } from './utils';
import {
  formatGuestNo, guestNoValue, hasSavedSettings, listGuests, listRooms, normalizeGuest, saveRooms, saveSettings, DEFAULT_SETTINGS,
  DEFAULT_ROOMS, type LegacyGuest,
} from './storage';

const DONE_KEY = 'hotel.uploaded.v1';

function readOld<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export interface LocalData {
  guests: Guest[];
  cash: CashEntry[];
  shifts: Shift[];
  rooms: Room[] | null;
  settings: object | null;
}

export function localData(): LocalData | null {
  try {
    if (localStorage.getItem(DONE_KEY)) return null;
  } catch {
    return null;
  }
  const guests = readOld<LegacyGuest[]>('hotel.guests.v1', []).map(normalizeGuest);
  const cash = readOld<CashEntry[]>('hotel.cashbook.v1', []);
  const shifts = readOld<Shift[]>('hotel.shifts.v1', []);
  const rooms = readOld<Room[] | null>('hotel.rooms.v1', null);
  const settings = readOld<object | null>('hotel.settings.v1', null);
  if (!guests.length && !cash.length && !rooms && !settings) return null;
  return { guests, cash, shifts, rooms, settings };
}

function oldPhotos(): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    const out = new Map<string, string>();
    try {
      const req = indexedDB.open('hotel-photos', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onerror = () => resolve(out);
      req.onsuccess = () => {
        const tx = req.result.transaction('photos', 'readonly');
        const cursor = tx.objectStore('photos').openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return resolve(out);
          out.set(String(c.key), String(c.value));
          c.continue();
        };
        cursor.onerror = () => resolve(out);
      };
    } catch {
      resolve(out);
    }
  });
}

export async function uploadLocalData(data: LocalData, progress: (msg: string) => void): Promise<string> {
  const online = new Set((await listGuests()).map((g) => g.id));
  const onlineNos = new Set((await listGuests()).map((g) => g.guestNo));
  const guests = data.guests.filter((g) => !online.has(g.id));

  // every stay needs its own bill number: give missing or clashing ones the next free numbers
  let next = Math.max(1, ...[...onlineNos, ...guests.map((g) => g.guestNo)].map((n) => guestNoValue(n || '') + 1));
  const used = new Set(onlineNos);
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

  const records: [string, string, object][] = [
    ...numbered.map((g): [string, string, object] => ['guests', g.id, g]),
    ...data.cash.map((c): [string, string, object] => ['cashbook', c.id, c]),
    ...data.shifts.map((s): [string, string, object] => ['shifts', s.id, { ...s, endDate: s.endDate || todayStr(), endTime: s.endTime || nowTime() }]),
  ];
  for (let i = 0; i < records.length; i += 400) {
    progress(`Uploading records ${i + 1}–${Math.min(i + 400, records.length)} of ${records.length}…`);
    const batch = writeBatch(db);
    for (const [col, id, value] of records.slice(i, i + 400)) batch.set(doc(db, col, id), { ...value, updatedAt: serverTimestamp() });
    await batch.commit();
  }

  if (data.settings && !hasSavedSettings()) await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  const roomsOnline = (await listRooms()) !== DEFAULT_ROOMS;
  if (data.rooms?.length && !roomsOnline) await saveRooms(data.rooms);

  // the shared bill-number counter continues after the highest number now in use
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'meta', 'counter');
    const snap = await tx.get(ref);
    tx.set(ref, { next: Math.max(snap.exists() ? Number(snap.get('next')) || 1 : 1, next), updatedAt: serverTimestamp() });
  });

  const wanted = new Set(numbered.flatMap((g) => [...g.idPhotos, g.guestPhoto].filter(Boolean)));
  const photos = [...(await oldPhotos())].filter(([id]) => wanted.has(id));
  let n = 0;
  for (const [id, url] of photos) {
    progress(`Uploading photos ${++n} of ${photos.length}…`);
    await setDoc(doc(db, 'photos', id), { data: url, updatedAt: serverTimestamp() });
  }

  try {
    localStorage.setItem(DONE_KEY, new Date().toISOString());
  } catch {
    // the card would show again; uploading twice changes nothing
  }
  return `${numbered.length} guests, ${data.cash.length} cash entries, ${data.shifts.length} shifts and ${photos.length} photos are now online`;
}

export function skipLocalData() {
  try {
    localStorage.setItem(DONE_KEY, 'skipped ' + new Date().toISOString());
  } catch {
    // nothing to do
  }
}
