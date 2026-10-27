import { useCallback, useEffect, useRef, useState } from 'react';
import type { Guest, Room, Settings } from '../types';
import { findRoom, roomViews, type RoomView } from '../rooms';
import { Board, BoardSummary, RoomDrawer, type BoardFilter } from '../components/RoomBoard';
import { billFor, formatDate, formatTime, isDueOutToday, matchesSearch, rupees, todayStr } from '../utils';

// The front desk home: the whole hotel at a glance.
export default function Dashboard({
  guests, rooms, settings, onChanged,
}: {
  guests: Guest[];
  rooms: Room[];
  settings: Settings;
  onChanged: (msg: string) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<BoardFilter>('all');
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

  const dueOut = guests
    .filter(isDueOutToday)
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
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
            <h1>Front Desk</h1>
          </div>
          <div className="actions">
            <a className="btn btn-xl btn-danger" href="#/checkout">Check-Out</a>
            <a className="btn btn-xl btn-primary" href="#/checkin">+ Check-In</a>
          </div>
        </div>

        <div className="search-wrap">
          <input
            ref={search}
            className="search"
            type="search"
            placeholder="Room number or guest name…"
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

        {dueOut.length > 0 && (
          <section className="card">
            <h2 className="card-title">Due out today · {dueOut.length}</h2>
            <ul className="due-list">
              {dueOut.map((g) => {
                const bill = billFor(g);
                return (
                  <li key={g.id}>
                    <span className="room">{g.roomNumber}</span>
                    <a className="due-name" href={`#/guest/${g.id}`}>
                      <strong>{g.fullName}</strong>
                      <span className="muted">by {formatTime(g.checkOutTime)}</span>
                    </a>
                    <span className={`due-amt${bill.balance > 0 ? ' due-text' : ''}`}>
                      {bill.balance < 0 ? `Refund ${rupees(-bill.balance)}` : rupees(bill.balance)}
                    </span>
                    <a className="btn btn-danger btn-sm" href={`#/checkout/${g.id}`}>Check Out</a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {selected && <RoomDrawer key={selected.room.number} view={selected} settings={settings} onChanged={onChanged} onClose={close} />}
    </div>
  );
}
