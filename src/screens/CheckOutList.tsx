import { useState } from 'react';
import type { Guest } from '../types';
import { StatusBadge } from '../components/ui';
import { billFor, formatWhen, isDueOutToday, matchesSearch, rupees } from '../utils';

// Quick check-out: in-house guests, those due out first, with their balance and a one-tap Check Out.
export default function CheckOutList({ guests }: { guests: Guest[] }) {
  const [q, setQ] = useState('');
  const inHouse = guests
    .filter((g) => g.status === 'in' && matchesSearch(g, q))
    .sort((a, b) =>
      Number(isDueOutToday(b)) - Number(isDueOutToday(a)) ||
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
    );

  return (
    <div className="stack">
      <h1>Check-Out</h1>
      <input
        className="search"
        type="search"
        placeholder="Room number, guest ID (HSL…), phone or name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <section className="card">
        {inHouse.length ? (
          <ul className="rows">
            {inHouse.map((g) => {
              const bill = billFor(g);
              return (
                <li key={g.id} className="checkout-row">
                  <a className="row" href={`#/guest/${g.id}`}>
                    <span className="room">{g.roomNumber}</span>
                    <span className="row-main">
                      <strong>{g.fullName}</strong>
                      <span className="muted">
                        {g.guestNo} · {g.checkOutDate ? `Due out ${formatWhen(g.checkOutDate, g.checkOutTime)}` : 'Check-out date not set'}
                      </span>
                    </span>
                    <span className="row-dates">
                      <span>{bill.balance < 0 ? 'Refund' : 'Balance'}</span>
                      <strong className={bill.balance > 0 ? 'due-text' : ''}>{rupees(Math.abs(bill.balance))}</strong>
                    </span>
                    <StatusBadge status={g.status} dueOut={isDueOutToday(g)} />
                  </a>
                  <a className="btn btn-danger" href={`#/checkout/${g.id}`}>Check Out</a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">{q ? 'No in-house guest matches.' : 'No guests are in-house.'}</p>
        )}
      </section>
    </div>
  );
}
