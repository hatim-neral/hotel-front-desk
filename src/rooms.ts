import type { Guest, Room, RoomType, Settings } from './types';
import { isDueOutToday, todayStr } from './utils';

export type RoomState = 'available' | 'occupied' | 'dueout' | 'dirty' | 'out-of-order';

export const ROOM_STATE_LABEL: Record<RoomState, string> = {
  available: 'Available',
  occupied: 'Occupied',
  dueout: 'Due out today',
  dirty: 'Needs cleaning',
  'out-of-order': 'Out of order',
};

export interface RoomView {
  room: Room;
  state: RoomState;
  guest?: Guest; // current in-house guest
  checkedOutToday?: Guest; // most recent guest who left today
}

const key = (n: string) => n.trim().toLowerCase();

export function findRoom(rooms: Room[], number: string): Room | undefined {
  return rooms.find((r) => key(r.number) === key(number));
}

export function rateFor(settings: Settings, type: string): string {
  return settings.roomTypes.find((t) => t.name === type)?.rate ?? '';
}

// "Deluxe · AC", "Standard · Non-AC"
export function typeLabel(settings: Settings, type: string): string {
  const t = settings.roomTypes.find((x) => x.name === type);
  if (!t || /\b(non[- ]?)?ac\b/i.test(t.name)) return type; // name already says it
  return `${t.name} · ${t.ac ? 'AC' : 'Non-AC'}`;
}

export interface RoomImport {
  rooms: Room[]; // full new room list (existing rooms kept, imported ones added or updated)
  roomTypes: RoomType[]; // full new room type list
  added: number;
  updated: number;
  newTypes: string[];
  problems: string[]; // lines that were skipped, with the reason
}

// Reads a room list pasted from Excel or a CSV file. One room per line:
//   Room no, Room type, AC / Non-AC, Tariff     e.g.  101, Deluxe, AC, 2500
// AC and tariff are optional. A header line is skipped. Unknown room types are created; when the
// same type name comes with both AC and Non-AC, they become two types ("Deluxe AC", "Deluxe Non-AC").
export function parseRoomList(text: string, settings: Settings, rooms: Room[]): RoomImport {
  const problems: string[] = [];
  const lines: { number: string; type: string; ac?: boolean; rate: string; line: number }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = raw.split(raw.includes('\t') ? '\t' : ',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const [number = '', type = '', acCell = '', rateCell = ''] = cells;
    if (i === 0 && /room|no/i.test(number) && !/\d/.test(number)) return; // header
    if (!number) return problems.push(`Line ${i + 1}: no room number`);
    if (!type) return problems.push(`Line ${i + 1} (room ${number}): no room type`);
    const acText = acCell.toLowerCase().replace(/[\s-]/g, '');
    const ac = acText === 'ac' || acText === 'yes' ? true : acText === 'nonac' || acText === 'no' ? false : undefined;
    if (acCell && ac === undefined) return problems.push(`Line ${i + 1} (room ${number}): write AC or Non-AC, not "${acCell}"`);
    const rate = rateCell.replace(/[^\d.]/g, '');
    lines.push({ number, type, ac, rate, line: i + 1 });
  });

  // Same type name with both AC and Non-AC -> split into two types
  const hasAc = (type: string, ac: boolean) => lines.some((l) => l.type.toLowerCase() === type && l.ac === ac);
  const mixed = new Set(lines.map((l) => l.type.toLowerCase()).filter((t) => hasAc(t, true) && hasAc(t, false)));
  const roomTypes = settings.roomTypes.map((t) => ({ ...t }));
  const newTypes: string[] = [];
  const typeFor = (l: (typeof lines)[number]) => {
    const name = mixed.has(l.type.toLowerCase()) ? `${l.type} ${l.ac ? 'AC' : 'Non-AC'}` : l.type;
    let t = roomTypes.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!t) {
      t = { name, rate: l.rate, ac: l.ac ?? true };
      roomTypes.push(t);
      newTypes.push(name);
    } else {
      if (l.rate) t.rate = l.rate;
      if (l.ac !== undefined) t.ac = l.ac;
    }
    return t.name;
  };

  const next = rooms.map((r) => ({ ...r }));
  let added = 0;
  let updated = 0;
  const seen = new Set<string>();
  for (const l of lines) {
    const k = key(l.number);
    if (seen.has(k)) {
      problems.push(`Line ${l.line}: room ${l.number} is listed twice — used the first`);
      continue;
    }
    seen.add(k);
    const type = typeFor(l);
    const existing = next.find((r) => key(r.number) === k);
    if (existing) {
      if (existing.type !== type) updated++;
      existing.type = type;
    } else {
      next.push({ number: l.number, type, housekeeping: 'clean' });
      added++;
    }
  }
  return { rooms: next, roomTypes, added, updated, newTypes, problems };
}

// Combines the room list with guests to give each room its current state.
export function roomViews(rooms: Room[], guests: Guest[]): RoomView[] {
  const today = todayStr();
  return rooms.map((room) => {
    const guest = guests.find((g) => g.status === 'in' && key(g.roomNumber) === key(room.number));
    const checkedOutToday = guests
      .filter((g) => g.status === 'out' && g.checkOutDate === today && key(g.roomNumber) === key(room.number))
      .sort((a, b) => (b.checkedOutAt ?? '').localeCompare(a.checkedOutAt ?? ''))[0];
    let state: RoomState = 'available';
    if (room.housekeeping === 'out-of-order') state = 'out-of-order';
    else if (guest) state = isDueOutToday(guest) ? 'dueout' : 'occupied';
    else if (room.housekeeping === 'dirty') state = 'dirty';
    return { room, state, guest, checkedOutToday };
  });
}

// Floor from the room number: 101 -> 1, 1203 -> 12; anything else -> 0
export function floorOf(number: string): number {
  const n = parseInt(number, 10);
  return Number.isFinite(n) && n >= 100 ? Math.floor(n / 100) : 0;
}
