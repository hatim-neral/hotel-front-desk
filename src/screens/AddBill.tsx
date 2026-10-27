import { useRef, useState } from 'react';
import type { Charge, Guest } from '../types';
import { saveGuest } from '../storage';
import { ChargeForm } from '../components/ChargeForm';
import { billFor, formatDate, matchesSearch, rupees } from '../utils';

// Put a bill (food, laundry…) on an in-house guest's account, found by room number,
// guest ID (HSL…), phone, name or ID document number.
export default function AddBill({
  guests, guestId, onChanged,
}: {
  guests: Guest[];
  guestId?: string; // opened from a room or guest: skip the search
  onChanged: (msg: string) => void;
}) {
  const [q, setQ] = useState('');
  const [chosenId, setChosenId] = useState<string | undefined>(guestId);
  const [lastAdded, setLastAdded] = useState('');
  const search = useRef<HTMLInputElement>(null);

  const inHouse = guests.filter((g) => g.status === 'in');
  const query = q.trim().toLowerCase();
  const matches = query ? inHouse.filter((g) => matchesSearch(g, query)) : [];

  // An exact room number, guest ID or full phone number picks the guest straight away
  const exact = query
    ? inHouse.find(
        (g) =>
          g.roomNumber.toLowerCase() === query ||
          g.guestNo.toLowerCase() === query ||
          (query.replace(/\D/g, '').length >= 10 && g.phone.replace(/\D/g, '').endsWith(query.replace(/\D/g, ''))),
      )
    : undefined;
  const guest = inHouse.find((g) => g.id === chosenId) ?? exact;

  const add = async (g: Guest, c: Charge) => {
    await saveGuest({ ...g, charges: [...g.charges, c] });
    const msg = `Bill ${c.billNo} (${rupees(Number(c.amount))}) added to Room ${g.roomNumber} — ${g.fullName}`;
    setLastAdded(msg);
    onChanged(msg);
    // Ready for the next bill
    setChosenId(undefined);
    setQ('');
    setTimeout(() => search.current?.focus());
  };

  const reset = () => {
    setChosenId(undefined);
    setQ('');
    setTimeout(() => search.current?.focus());
  };

  return (
    <div className="stack narrow">
      <div>
        <p className="eyebrow">Food · laundry · minibar · room service</p>
        <h1>Add Bill</h1>
      </div>

      {lastAdded && <p className="last-added">✓ {lastAdded}</p>}

      {!guest && (
        <>
          <div className="search-wrap">
            <input
              ref={search}
              className="search"
              placeholder="Room no., guest ID (HSL…), phone or name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && matches[0] && setChosenId(matches[0].id)}
              autoFocus
              autoComplete="off"
            />
          </div>
          {query && !matches.length && <p className="muted">No in-house guest matches “{q}”.</p>}
          {matches.length > 0 && (
            <div className="quick-results">
              {matches.slice(0, 8).map((g) => (
                <button key={g.id} type="button" className="quick-result" onClick={() => setChosenId(g.id)}>
                  <span className="room">{g.roomNumber}</span>
                  <span className="grow">
                    <strong>{g.fullName}</strong>
                    <span className="muted"> · {g.guestNo} · {g.phone}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {!query && <p className="muted small">{inHouse.length} guests in-house. Type a room number to start.</p>}
        </>
      )}

      {guest && (
        <>
          <section className="bill-guest">
            <span className="room room-lg">{guest.roomNumber}</span>
            <div className="grow">
              <strong className="bill-guest-name">{guest.fullName}</strong>
              <div className="muted">
                {guest.guestNo} · {guest.phone} · since {formatDate(guest.checkInDate)}
              </div>
              <div className="muted">
                {guest.charges.length} bill(s) so far · balance {rupees(billFor(guest).balance)}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={reset}>Change guest</button>
          </section>
          <ChargeForm
            key={guest.id}
            existingBillNos={guest.charges.map((c) => c.billNo.toLowerCase())}
            onAdd={(c) => add(guest, c)}
            onCancel={reset}
            submitLabel={`Add to Room ${guest.roomNumber}`}
          />
        </>
      )}
    </div>
  );
}
