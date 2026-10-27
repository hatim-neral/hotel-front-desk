import { useEffect } from 'react';
import type { Housekeeping, Settings } from '../types';
import { updateRoom } from '../storage';
import { floorOf, rateFor, ROOM_STATE_LABEL, type RoomState, type RoomView } from '../rooms';
import { billFor, formatDate, formatTime, formatWhen, rupees } from '../utils';

export type BoardFilter = RoomState | 'all';

const STATES: RoomState[] = ['available', 'occupied', 'dueout', 'dirty', 'out-of-order'];

// Short word under the room number on a tile
const TILE_WORD: Record<RoomState, string> = {
  available: 'Free',
  occupied: '',
  dueout: '',
  dirty: 'To clean',
  'out-of-order': 'Blocked',
};

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

// Occupancy and a clickable count for every room state.
export function BoardSummary({
  views, filter, onFilter, arrivals, departures,
}: {
  views: RoomView[];
  filter: BoardFilter;
  onFilter: (f: BoardFilter) => void;
  arrivals: number;
  departures: number;
}) {
  const count = (s: RoomState) => views.filter((v) => v.state === s).length;
  const sellable = views.length - count('out-of-order');
  const occupied = count('occupied') + count('dueout');
  const pct = sellable ? Math.round((occupied / sellable) * 100) : 0;

  return (
    <section className="summary-strip">
      <div className="occupancy">
        <div className="occ-head">
          <span className="occ-pct">{pct}%</span>
          <span className="occ-label">occupied · {occupied} of {sellable} rooms</span>
        </div>
        <div className="occ-bar" aria-hidden>
          {STATES.map((s) => {
            const n = count(s);
            return n ? <span key={s} className={`occ-seg rs-${s}`} style={{ flexGrow: n }} /> : null;
          })}
        </div>
        <div className="occ-sub">
          <span>{arrivals} checked in today</span>
          <span>{departures} checked out today</span>
        </div>
      </div>
      <div className="state-chips" role="group" aria-label="Filter rooms">
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            className={`state-chip rs-${s}${filter === s ? ' active' : ''}`}
            aria-pressed={filter === s}
            onClick={() => onFilter(filter === s ? 'all' : s)}
          >
            <span className="chip-dot" />
            <span className="chip-num">{count(s)}</span>
            <span className="chip-label">{ROOM_STATE_LABEL[s]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// Every room on one screen: one row per floor. Filters and search dim rooms rather than hide them,
// so each room always stays in the same place.
export function Board({
  views, isLit, selected, onSelect,
}: {
  views: RoomView[];
  isLit: (v: RoomView) => boolean;
  selected?: string;
  onSelect: (number: string) => void;
}) {
  const floors = [...new Set(views.map((v) => floorOf(v.room.number)))].sort((a, b) => a - b);
  return (
    <section className="board">
      {floors.map((floor) => (
        <div key={floor} className="floor">
          <div className="floor-label">{floor ? floor : '–'}</div>
          <div className="floor-rooms">
            {views
              .filter((v) => floorOf(v.room.number) === floor)
              .map((v) => {
                const lit = isLit(v);
                return (
                  <button
                    key={v.room.number}
                    type="button"
                    className={`tile rs-${v.state}${lit ? '' : ' dim'}${selected === v.room.number ? ' selected' : ''}`}
                    onClick={() => onSelect(v.room.number)}
                    title={`${v.room.number} · ${v.room.type} · ${ROOM_STATE_LABEL[v.state]}${v.guest ? ` · ${v.guest.fullName}` : ''}`}
                  >
                    <span className="tile-num">{v.room.number}</span>
                    <span className="tile-sub">{v.guest ? shortName(v.guest.fullName) : TILE_WORD[v.state]}</span>
                    {v.guest && v.room.housekeeping === 'dirty' && <span className="tile-flag" title="Needs cleaning" />}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}

// Details and one-tap actions for the selected room. Side drawer on wide screens, bottom sheet on phones.
export function RoomDrawer({
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bill = guest && billFor(guest);

  return (
    <aside className={`drawer rs-${state}`} aria-label={`Room ${room.number}`}>
      <div className="drawer-head">
        <div>
          <div className="drawer-num">{room.number}</div>
          <div className="muted">{room.type}{rate && ` · ${rupees(Number(rate))}/night`}</div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="drawer-state">
        <span className="chip-dot" />
        <strong>{ROOM_STATE_LABEL[state]}</strong>
        {guest && room.housekeeping === 'dirty' && <span className="muted"> · needs cleaning</span>}
      </div>

      {guest ? (
        <dl className="drawer-facts">
          <div><dt>Guest</dt><dd><a href={`#/guest/${guest.id}`}>{guest.fullName}</a></dd></div>
          <div><dt>Bill ID</dt><dd>{guest.guestNo}</dd></div>
          <div><dt>Mobile</dt><dd>{guest.phone}</dd></div>
          <div><dt>People</dt><dd>{guest.adults} adult(s){guest.children ? `, ${guest.children} child(ren)` : ''}</dd></div>
          <div><dt>In</dt><dd>{formatDate(guest.checkInDate)} {formatTime(guest.checkInTime)}</dd></div>
          <div><dt>Out</dt><dd>{formatWhen(guest.checkOutDate, guest.checkOutTime)}</dd></div>
          {bill && (
            <div>
              <dt>{bill.balance < 0 ? 'Refund' : 'Balance'}</dt>
              <dd className={bill.balance > 0 ? 'due-text' : ''}>{rupees(Math.abs(bill.balance))}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="muted drawer-note">
          {checkedOutToday
            ? `${checkedOutToday.fullName} checked out today at ${formatTime(checkedOutToday.checkOutTime)}.`
            : 'No guest in this room.'}
        </p>
      )}

      <div className="drawer-actions">
        {guest && <a className="btn btn-danger btn-block" href={`#/checkout/${guest.id}`}>Check Out</a>}
        {!guest && state === 'available' && (
          <a className="btn btn-primary btn-block" href={`#/checkin/${encodeURIComponent(room.number)}`}>Check In to {room.number}</a>
        )}
        {room.housekeeping === 'dirty' && (
          <button type="button" className="btn btn-clean btn-block" onClick={() => setHousekeeping('clean', `Room ${room.number} is clean`)}>
            ✓ Mark as cleaned
          </button>
        )}
        {!guest && state === 'dirty' && (
          <a className="btn btn-block" href={`#/checkin/${encodeURIComponent(room.number)}`}>Check in anyway</a>
        )}
        {guest && <a className="btn btn-primary btn-block" href={`#/bill/${guest.id}`}>+ Add bill</a>}
        {guest && <a className="btn btn-block" href={`#/guest/${guest.id}`}>Guest details & bill</a>}
        <div className="drawer-minor">
          {room.housekeeping === 'clean' && (
            <button type="button" className="link" onClick={() => setHousekeeping('dirty', `Room ${room.number} marked for cleaning`)}>
              Mark for cleaning
            </button>
          )}
          {room.housekeeping === 'out-of-order' ? (
            <button type="button" className="link" onClick={() => setHousekeeping('clean', `Room ${room.number} back in service`)}>
              Back in service
            </button>
          ) : (
            !guest && (
              <button type="button" className="link danger-text" onClick={() => setHousekeeping('out-of-order', `Room ${room.number} blocked`)}>
                Block room (out of order)
              </button>
            )
          )}
        </div>
      </div>
    </aside>
  );
}
