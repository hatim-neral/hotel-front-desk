import { useCallback, useEffect, useRef, useState } from 'react';
import type { Guest, Room, Settings } from '../types';
import { findRoom, roomViews, type RoomView } from '../rooms';
import { Board, BoardSummary, RoomDrawer, type BoardFilter } from '../components/RoomBoard';
import { formatDate, matchesSearch, todayStr } from '../utils';

// Room chart: every room in the hotel at a glance.
export default function Rooms({
  guests, rooms, settings, initialFilter = 'all', onChanged,
}: {
  guests: Guest[];
  rooms: Room[];
  settings: Settings;
  initialFilter?: BoardFilter;
  onChanged: (msg: string) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<BoardFilter>(initialFilter);
  const [picked, setPicked] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const today = todayStr();
  const views = roomViews(rooms, guests);
  const query = q.trim().toLowerCase();
  const roomQuery = /^\d/.test(query);

  // A full room number opens that room straight away
  const exact = roomQuery ? findRoom(rooms, query) : undefined;
  const selectedNumber = exact?.number ?? picked ?? undefined;
  const selected = views.find((v) => v.room.number === selectedNumber);

  const matchesQuery = (v: RoomView) =>
    !query ||
    (roomQuery ? v.room.number.toLowerCase().startsWith(query) : !!v.guest && matchesSearch(v.guest, query));
  const isLit = (v: RoomView) => matchesQuery(v) && (filter === 'all' || v.state === filter);
  const guestResults = query && !roomQuery ? guests.filter((g) => matchesSearch(g, query)).slice(0, 6) : [];

  const arrivals = guests.filter((g) => g.checkInDate === today).length;
  const departures = guests.filter((g) => g.status === 'out' && g.checkOutDate === today).length;

  const close = useCallback(() => {
    setPicked(null);
    setQ('');
  }, []);

  // "/" jumps to search from anywhere on this screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') {
      const lit = views.filter(isLit);
      if (lit.length === 1) {
        setPicked(lit[0].room.number);
        setQ('');
      }
    }
  };

  return (
    <div className={`desk${selected ? ' with-drawer' : ''}`}>
      <div className="desk-main stack">
        <div className="desk-top">
          <div>
            <p className="eyebrow">{formatDate(today)}</p>
            <h1>Rooms</h1>
          </div>
        </div>

        <div className="search-wrap">
          <input
            ref={search}
            className="search"
            type="search"
            placeholder="Room number, guest name or bill ID (HSL…)"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
            }}
            onKeyDown={onSearchKey}
            autoFocus
          />
          <kbd className="search-kbd">/</kbd>
        </div>

        {guestResults.length > 0 && (
          <div className="quick-results">
            {guestResults.map((g) => (
              <a key={g.id} className="quick-result" href={`#/guest/${g.id}`}>
                <span className="room">{g.roomNumber}</span>
                <span>
                  <strong>{g.fullName}</strong>
                  <span className="muted"> · {g.status === 'in' ? 'In-house' : `Left ${formatDate(g.checkOutDate)}`}</span>
                </span>
              </a>
            ))}
          </div>
        )}
        {query && !roomQuery && !guestResults.length && <p className="muted">No guest found.</p>}

        <BoardSummary views={views} filter={filter} onFilter={setFilter} arrivals={arrivals} departures={departures} />

        {rooms.length ? (
          <Board views={views} isLit={isLit} selected={selected?.room.number} onSelect={(n) => { setQ(''); setPicked(n); }} />
        ) : (
          <p className="muted">No rooms set up yet. Add your rooms in <a href="#/settings">Settings</a>.</p>
        )}
      </div>

      {selected && <RoomDrawer key={selected.room.number} view={selected} settings={settings} onChanged={onChanged} onClose={close} />}
    </div>
  );
}
