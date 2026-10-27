import type { Guest, Room, Settings } from './types';
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
