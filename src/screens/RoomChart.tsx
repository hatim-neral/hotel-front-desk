import { useState } from 'react';
import type { Guest, Housekeeping, Room, Settings } from '../types';
import { updateRoom } from '../storage';
import { findRoom, floorOf, rateFor, ROOM_STATE_LABEL, roomViews, type RoomState, type RoomView } from '../rooms';
import { billFor, formatDate, formatTime, formatWhen, rupees, todayStr } from '../utils';

type Filter = RoomState | 'all' | 'checkedout';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All rooms' },
  { key: 'available', label: 'Available' },
  { key: 'occupied', label: 'Occupied' },
  { key: 'dueout', label: 'Due out today' },
  { key: 'checkedout', label: 'Checked out today' },
  { key: 'dirty', label: 'Needs cleaning' },
  { key: 'out-of-order', label: 'Out of order' },
];

function matches(v: RoomView, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'checkedout') return !!v.checkedOutToday;
  if (f === 'occupied') return v.state === 'occupied' || v.state === 'dueout';
  return v.state === f;
}

export default function RoomChart({
  rooms, guests, settings, onChanged,
}: {
  rooms: Room[];
  guests: Guest[];
  settings: Settings;
  onChanged: (msg: string) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<string | null>(null);

  const views = roomViews(rooms, guests);
  const query = q.trim().toLowerCase();
  const exact = query ? findRoom(rooms, query) : undefined;
  const selected = views.find((v) => v.room.number === (exact?.number ?? picked));

  const shown = views.filter(
    (v) =>
      matches(v, filter) &&
      (!query || v.room.number.toLowerCase().startsWith(query) || v.guest?.fullName.toLowerCase().includes(query)),
  );
  const floors = [...new Set(shown.map((v) => floorOf(v.room.number)))].sort((a, b) => a - b);

  const pick = (number: string) => {
    setQ('');
    setPicked(number);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="stack">
      <div className="hero">
        <div>
          <p className="muted">{formatDate(todayStr())}</p>
          <h1>Room Chart</h1>
        </div>
      </div>

      <input
        className="search"
        type="search"
        inputMode="search"
        placeholder="Search room number (e.g. 101) or guest name…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPicked(null);
        }}
      />

      {selected && <RoomPanel view={selected} settings={settings} onChanged={onChanged} onClose={() => { setPicked(null); setQ(''); }} />}

      <div className="room-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`room-filter rf-${f.key}${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            <span className="rf-num">{views.filter((v) => matches(v, f.key)).length}</span>
            <span className="rf-label">{f.label}</span>
          </button>
        ))}
      </div>

      {!rooms.length && (
        <p className="muted">No rooms set up yet. Add your rooms in <a href="#/settings">Settings</a>.</p>
      )}
      {rooms.length > 0 && !shown.length && <p className="muted">No rooms match.</p>}

      {floors.map((floor) => (
        <section key={floor} className="card">
          <h2 className="card-title">{floor ? `Floor ${floor}` : 'Other rooms'}</h2>
          <div className="room-grid">
            {shown
              .filter((v) => floorOf(v.room.number) === floor)
              .map((v) => (
                <button
                  key={v.room.number}
                  type="button"
                  className={`room-tile rs-${v.state}${selected?.room.number === v.room.number ? ' selected' : ''}`}
                  onClick={() => pick(v.room.number)}
                >
                  <span className="rt-num">{v.room.number}</span>
                  <span className="rt-type">{v.room.type}</span>
                  <span className="rt-state">{ROOM_STATE_LABEL[v.state]}</span>
                  {v.guest && <span className="rt-guest">{v.guest.fullName}</span>}
                  {v.guest && v.room.housekeeping === 'dirty' && <span className="rt-flag">Needs cleaning</span>}
                  {!v.guest && v.checkedOutToday && <span className="rt-flag">Checked out today</span>}
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RoomPanel({
  view, settings, onChanged, onClose,
}: {
  view: RoomView;
  settings: Settings;
  onChanged: (msg: string) => void;
  onClose: () => void;
}) {
  const { room, state, guest, checkedOutToday } = view;
  const rate = rateFor(settings, room.type);
  const setHousekeeping = async (housekeeping: Housekeeping, msg: string) => {
    await updateRoom(room.number, { housekeeping });
    onChanged(msg);
  };

  return (
    <section className={`card room-panel rs-${state}`}>
      <div className="room-panel-head">
        <div className="room room-lg">{room.number}</div>
        <div className="grow">
          <h2>{room.type}{rate && <span className="muted"> · {rupees(Number(rate))}/night</span>}</h2>
          <span className={`badge rb-${state}`}>{ROOM_STATE_LABEL[state]}</span>
          {guest && room.housekeeping === 'dirty' && <span className="badge rb-dirty"> Needs cleaning</span>}
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {guest ? (
        <dl className="details">
          <div><dt>Guest</dt><dd><a href={`#/guest/${guest.id}`}>{guest.fullName}</a> · {guest.phone}</dd></div>
          <div><dt>Guests in room</dt><dd>{guest.adults} adult(s){guest.children ? `, ${guest.children} child(ren)` : ''}</dd></div>
          <div><dt>Checked in</dt><dd>{formatDate(guest.checkInDate)} {formatTime(guest.checkInTime)}</dd></div>
          <div><dt>Check-out</dt><dd>{formatWhen(guest.checkOutDate, guest.checkOutTime)}</dd></div>
          <div><dt>Balance</dt><dd>{rupees(billFor(guest).balance)}</dd></div>
        </dl>
      ) : (
        <p className="muted">
          No guest in this room.
          {checkedOutToday && ` ${checkedOutToday.fullName} checked out today at ${formatTime(checkedOutToday.checkOutTime)}.`}
        </p>
      )}

      <div className="actions">
        {guest && <a className="btn" href={`#/guest/${guest.id}`}>Open guest</a>}
        {guest && <a className="btn btn-danger" href={`#/checkout/${guest.id}`}>Check Out</a>}
        {!guest && state === 'available' && <a className="btn btn-primary" href={`#/checkin/${encodeURIComponent(room.number)}`}>Check in to this room</a>}
        {room.housekeeping === 'dirty' && (
          <button type="button" className="btn btn-primary" onClick={() => setHousekeeping('clean', `Room ${room.number} marked clean`)}>
            Mark as cleaned
          </button>
        )}
        {room.housekeeping === 'clean' && (
          <button type="button" className="btn" onClick={() => setHousekeeping('dirty', `Room ${room.number} marked for cleaning`)}>
            Needs cleaning
          </button>
        )}
        {room.housekeeping === 'out-of-order' ? (
          <button type="button" className="btn btn-primary" onClick={() => setHousekeeping('clean', `Room ${room.number} back in service`)}>
            Back in service
          </button>
        ) : (
          !guest && (
            <button type="button" className="btn btn-ghost" onClick={() => setHousekeeping('out-of-order', `Room ${room.number} marked out of order`)}>
              Out of order
            </button>
          )
        )}
      </div>
    </section>
  );
}
