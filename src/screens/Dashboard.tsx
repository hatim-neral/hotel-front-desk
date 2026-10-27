import { useState } from 'react';
import type { Guest } from '../types';
import { formatDate, isDueOutToday, matchesSearch, todayStr } from '../utils';
import GuestRows from './GuestRows';

export default function Dashboard({ guests }: { guests: Guest[] }) {
  const [q, setQ] = useState('');
  const today = todayStr();
  const inHouse = guests.filter((g) => g.status === 'in');
  const dueOut = inHouse.filter(isDueOutToday);
  const arrivedToday = guests.filter((g) => g.checkInDate === today);
  const departedToday = guests.filter((g) => g.checkedOutAt?.startsWith(today));
  const results = q.trim() ? guests.filter((g) => matchesSearch(g, q)).slice(0, 20) : [];

  return (
    <div className="stack">
      <div className="hero">
        <div>
          <p className="muted">{formatDate(today)}</p>
          <h1>Front Desk</h1>
        </div>
        <div className="actions">
          <a className="btn btn-danger btn-xl" href="#/checkout">Check-Out</a>
          <a className="btn btn-primary btn-xl" href="#/checkin">+ New Check-In</a>
        </div>
      </div>

      <input
        className="search"
        type="search"
        placeholder="Search guest by name, mobile, room no. or ID number…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />

      {q.trim() ? (
        <section className="card">
          <h2 className="card-title">{results.length ? `Results (${results.length})` : 'No guest found'}</h2>
          <GuestRows guests={results} />
        </section>
      ) : (
        <>
          <div className="stats">
            <a className="stat" href="#/guests/inhouse">
              <span className="stat-num">{inHouse.length}</span>
              <span className="stat-label">In-house guests</span>
            </a>
            <a className={`stat${dueOut.length ? ' stat-warn' : ''}`} href="#/guests/dueout">
              <span className="stat-num">{dueOut.length}</span>
              <span className="stat-label">Due out today</span>
            </a>
            <a className="stat" href="#/guests/all">
              <span className="stat-num">{arrivedToday.length}</span>
              <span className="stat-label">Checked in today</span>
            </a>
            <a className="stat" href="#/guests/out">
              <span className="stat-num">{departedToday.length}</span>
              <span className="stat-label">Checked out today</span>
            </a>
          </div>

          {dueOut.length > 0 && (
            <section className="card">
              <h2 className="card-title">Due out today</h2>
              <GuestRows guests={dueOut} />
            </section>
          )}

          <section className="card">
            <h2 className="card-title">In-house now</h2>
            {inHouse.length ? <GuestRows guests={inHouse} /> : <p className="muted">No guests in-house. Tap “New Check-In” to add one.</p>}
          </section>
        </>
      )}
    </div>
  );
}
