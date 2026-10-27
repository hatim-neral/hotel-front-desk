import { useEffect, useRef, useState } from 'react';
import type { Guest, Room } from '../types';
import { roomViews } from '../rooms';
import { billFor, formatDate, formatTime, isDueOutToday, matchesSearch, rupees, todayStr } from '../utils';
import GuestRows from './GuestRows';

// The front desk home: the day's work at a glance. The room chart has its own page.
export default function Dashboard({ guests, rooms }: { guests: Guest[]; rooms: Room[] }) {
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const today = todayStr();

  const inHouse = guests
    .filter((g) => g.status === 'in')
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  const dueOut = inHouse.filter(isDueOutToday);
  const views = roomViews(rooms, guests);
  const freeRooms = views.filter((v) => v.state === 'available').length;
  const dirtyRooms = views.filter((v) => v.state === 'dirty').length;
  const arrivals = guests.filter((g) => g.checkInDate === today).length;
  const departures = guests.filter((g) => g.status === 'out' && g.checkOutDate === today).length;
  const results = q.trim() ? guests.filter((g) => matchesSearch(g, q)).slice(0, 20) : [];

  // "/" jumps to search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea, select')) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="stack">
      <div className="desk-top">
        <div>
          <p className="eyebrow">{formatDate(today)}</p>
          <h1>Front Desk</h1>
        </div>
      </div>

      <div className="main-actions">
        <a className="action-tile action-in" href="#/checkin">
          <span className="action-icon">＋</span>
          <span><strong>Check-In</strong><span className="muted">New guest</span></span>
        </a>
        <a className="action-tile action-bill" href="#/bill">
          <span className="action-icon">₹</span>
          <span><strong>Add Bill</strong><span className="muted">Food, laundry…</span></span>
        </a>
        <a className="action-tile action-out" href="#/checkout">
          <span className="action-icon">→</span>
          <span><strong>Check-Out</strong><span className="muted">{dueOut.length} due today</span></span>
        </a>
      </div>

      <div className="search-wrap">
        <input
          ref={search}
          className="search"
          type="search"
          placeholder="Search guest: name, room, guest ID (HSL…), phone or ID number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
          autoFocus
        />
        <kbd className="search-kbd">/</kbd>
      </div>

      {q.trim() ? (
        <section className="card">
          <h2 className="card-title">{results.length ? `Results (${results.length})` : 'No guest found'}</h2>
          <GuestRows guests={results} />
        </section>
      ) : (
        <>
          <div className="kpis">
            <a className="kpi rs-occupied" href="#/guests/inhouse">
              <span className="kpi-num">{inHouse.length}</span>
              <span className="kpi-label">In-house guests</span>
              <span className="kpi-sub">{arrivals} checked in today</span>
            </a>
            <a className="kpi rs-dueout" href="#/guests/dueout">
              <span className="kpi-num">{dueOut.length}</span>
              <span className="kpi-label">Due out today</span>
              <span className="kpi-sub">{departures} already left</span>
            </a>
            <a className="kpi rs-available" href="#/rooms/available">
              <span className="kpi-num">{freeRooms}<span className="kpi-of"> / {rooms.length}</span></span>
              <span className="kpi-label">Rooms free</span>
              <span className="kpi-sub">Open room chart →</span>
            </a>
            <a className="kpi rs-dirty" href="#/rooms/dirty">
              <span className="kpi-num">{dirtyRooms}</span>
              <span className="kpi-label">Rooms to clean</span>
              <span className="kpi-sub">Housekeeping →</span>
            </a>
          </div>

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
                        <span className="muted">{g.guestNo} · by {formatTime(g.checkOutTime)}</span>
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

          <section className="card">
            <h2 className="card-title">In-house now · {inHouse.length}</h2>
            {inHouse.length ? <GuestRows guests={inHouse} /> : <p className="muted">No guests in-house. Tap “Check-In” to add one.</p>}
          </section>
        </>
      )}
    </div>
  );
}
