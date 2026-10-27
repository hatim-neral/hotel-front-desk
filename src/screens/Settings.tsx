import { useState } from 'react';
import type { Guest, Room, RoomType, Settings } from '../types';
import { assignGuestNo, deleteGuest, resetGuestCounter, saveGuest, saveRooms, saveSettings, updateRoom } from '../storage';
import { buildSampleGuests, isSample } from '../sampleData';
import { findRoom } from '../rooms';
import { Field, Section } from '../components/ui';
import { rupees, toCsv, todayStr } from '../utils';

export default function SettingsScreen({
  settings, guests, rooms, onSaved,
}: {
  settings: Settings;
  guests: Guest[];
  rooms: Room[];
  onSaved: (msg: string) => void;
}) {
  const [s, setS] = useState(settings);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({ ...s, roomTypes: settings.roomTypes });
    onSaved('Settings saved');
  };

  const sampleCount = guests.filter(isSample).length;

  const loadSamples = async () => {
    // Skip a sample if its room isn't in the room list, or a real in-house guest already occupies it
    const taken = new Set(guests.filter((g) => g.status === 'in' && !isSample(g)).map((g) => g.roomNumber.toLowerCase()));
    const samples = buildSampleGuests().filter(
      (g) => findRoom(rooms, g.roomNumber) && (g.status === 'out' || !taken.has(g.roomNumber.toLowerCase())),
    );
    for (const g of samples) {
      const previousNo = guests.find((x) => x.id === g.id)?.guestNo; // resetting keeps the same IDs
      const guestNo = previousNo || (await assignGuestNo());
      await saveGuest({ ...g, guestNo, charges: g.charges.map((c, i) => ({ ...c, chargeNo: `${guestNo}-${String(i + 1).padStart(2, '0')}` })) });
    }
    // The sample guest who checked out yesterday left their room for cleaning
    for (const g of samples.filter((x) => x.status === 'out')) await updateRoom(g.roomNumber, { housekeeping: 'dirty' });
    onSaved(`${samples.length} sample guests added`);
  };

  const removeSamples = async () => {
    for (const g of guests.filter(isSample)) await deleteGuest(g.id);
    await resetGuestCounter();
    onSaved('Sample guests removed');
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(guests)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `guest-register-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      <h1>Settings</h1>

      <form className="form" onSubmit={save}>
        <Section title="Hotel">
          <Field label="Hotel name" wide>
            <input value={s.hotelName} onChange={(e) => setS({ ...s, hotelName: e.target.value })} />
          </Field>
          <Field label="Hotel address (printed on registration card)" wide>
            <textarea rows={2} value={s.hotelAddress} onChange={(e) => setS({ ...s, hotelAddress: e.target.value })} />
          </Field>
          <Field label="Default check-out time">
            <input type="time" value={s.defaultCheckOutTime} onChange={(e) => setS({ ...s, defaultCheckOutTime: e.target.value })} />
          </Field>
          <div className="wide">
            <button type="submit" className="btn btn-primary">Save hotel details</button>
          </div>
        </Section>
      </form>

      <RoomTypesEditor settings={settings} rooms={rooms} onSaved={onSaved} />
      <RoomsEditor settings={settings} rooms={rooms} guests={guests} onSaved={onSaved} />

      <Section title="Sample guests (for practice)">
        <p className="wide muted">
          Fills the hotel with about 40 made-up guests so staff can practise check-in, bills and check-out. Sample records are marked and can be removed at any time.
          {sampleCount > 0 && ` ${sampleCount} sample guest(s) loaded now.`}
        </p>
        <div className="wide actions">
          <button type="button" className="btn btn-primary" onClick={loadSamples}>
            {sampleCount ? 'Reset sample guests' : 'Load sample guests'}
          </button>
          {sampleCount > 0 && (
            <button type="button" className="btn btn-ghost danger-text" onClick={removeSamples}>Remove sample guests</button>
          )}
        </div>
      </Section>

      <Section title="Guest register">
        <p className="wide muted">
          {guests.length} guest record(s) are stored on this device. Download them as a spreadsheet (CSV) for backup or police records.
        </p>
        <div className="wide">
          <button type="button" className="btn" onClick={exportCsv} disabled={!guests.length}>
            Download register (CSV)
          </button>
        </div>
      </Section>
    </div>
  );
}

function RoomTypesEditor({ settings, rooms, onSaved }: { settings: Settings; rooms: Room[]; onSaved: (msg: string) => void }) {
  // `orig` remembers each row's saved name so renames can move its rooms along
  const [types, setTypes] = useState<(RoomType & { orig?: string })[]>(settings.roomTypes.map((t) => ({ ...t, orig: t.name })));
  const [error, setError] = useState('');
  const inUse = (name?: string) => (name ? rooms.filter((r) => r.type === name).length : 0);
  const setType = (i: number, patch: Partial<RoomType>) => setTypes(types.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = types.map((t) => ({ name: t.name.trim(), rate: t.rate.trim() })).filter((t) => t.name);
    const names = clean.map((t) => t.name.toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) return setError('Two room types have the same name.');
    if (!clean.length) return setError('Add at least one room type.');
    setError('');
    // Renamed types: move rooms from the old name to the new one
    const renames = new Map(
      types.filter((t) => t.orig && t.name.trim() && t.orig !== t.name.trim()).map((t) => [t.orig!, t.name.trim()]),
    );
    if (renames.size) await saveRooms(rooms.map((r) => (renames.has(r.type) ? { ...r, type: renames.get(r.type)! } : r)));
    await saveSettings({ ...settings, roomTypes: clean });
    onSaved('Room prices saved');
  };

  return (
    <form className="form" onSubmit={save}>
      <Section title="Room types & prices">
        <p className="wide muted small">
          The price per night is filled in automatically at check-in. Staff can still change it for a discount.
        </p>
        <div className="wide type-rows">
          {types.map((t, i) => {
            const used = inUse(t.orig);
            return (
              <div key={i} className="type-row">
                <Field label="Room type">
                  <input value={t.name} onChange={(e) => setType(i, { name: e.target.value })} />
                </Field>
                <Field label="Price per night (₹)">
                  <input inputMode="decimal" value={t.rate} onChange={(e) => setType(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} />
                </Field>
                <span className="muted small type-used">{used} room(s)</span>
                <button
                  type="button"
                  className="btn btn-ghost danger-text"
                  disabled={used > 0}
                  title={used ? 'Move these rooms to another type first' : 'Remove'}
                  onClick={() => setTypes(types.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        {error && <p className="wide field-error">{error}</p>}
        <div className="wide actions">
          <button type="button" className="btn" onClick={() => setTypes([...types, { name: '', rate: '' }])}>+ Add room type</button>
          <button type="submit" className="btn btn-primary">Save prices</button>
        </div>
      </Section>
    </form>
  );
}

function RoomsEditor({
  settings, rooms, guests, onSaved,
}: {
  settings: Settings;
  rooms: Room[];
  guests: Guest[];
  onSaved: (msg: string) => void;
}) {
  const typeNames = settings.roomTypes.map((t) => t.name);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState(typeNames[0] ?? '');
  const [error, setError] = useState('');
  const occupied = (n: string) => guests.some((g) => g.status === 'in' && g.roomNumber.toLowerCase() === n.toLowerCase());

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = from.trim();
    const end = to.trim();
    let numbers: string[] = [start];
    if (end) {
      const a = Number(start);
      const b = Number(end);
      if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) return setError('For a range, use numbers like 301 to 310.');
      if (b - a > 200) return setError('That range is too large (max 200 rooms at once).');
      numbers = Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
    }
    if (!start) return setError('Enter a room number.');
    const fresh = numbers.filter((n) => !findRoom(rooms, n));
    if (!fresh.length) return setError('These rooms already exist.');
    setError('');
    await saveRooms([...rooms, ...fresh.map((number) => ({ number, type, housekeeping: 'clean' as const }))]);
    setFrom('');
    setTo('');
    onSaved(fresh.length === 1 ? `Room ${fresh[0]} added` : `${fresh.length} rooms added`);
  };

  const changeType = async (number: string, newType: string) => {
    await updateRoom(number, { type: newType });
    onSaved(`Room ${number} is now ${newType}`);
  };

  const remove = async (number: string) => {
    if (!confirm(`Remove room ${number} from the room list?`)) return;
    await saveRooms(rooms.filter((r) => r.number !== number));
    onSaved(`Room ${number} removed`);
  };

  return (
    <Section title={`Rooms (${rooms.length})`}>
      <form className="form wide add-rooms" onSubmit={add} noValidate>
        <Field label="Room number">
          <input value={from} placeholder="e.g. 301" onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To (optional, for a range)">
          <input value={to} placeholder="e.g. 310" inputMode="numeric" onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Room type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {typeNames.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <button type="submit" className="btn btn-primary">Add room(s)</button>
        {error && <p className="field-error wide">{error}</p>}
      </form>

      <div className="wide form room-list">
        {rooms.map((r) => {
          const rate = settings.roomTypes.find((t) => t.name === r.type)?.rate;
          return (
            <div key={r.number} className="room-list-row">
              <span className="room">{r.number}</span>
              <select value={r.type} onChange={(e) => changeType(r.number, e.target.value)} aria-label={`Type of room ${r.number}`}>
                {!typeNames.includes(r.type) && <option>{r.type}</option>}
                {typeNames.map((t) => <option key={t}>{t}</option>)}
              </select>
              <span className="muted small">{rate ? `${rupees(Number(rate))}/night` : 'No price set'}</span>
              <button
                type="button"
                className="btn btn-ghost danger-text"
                disabled={occupied(r.number)}
                title={occupied(r.number) ? 'A guest is in this room' : 'Remove room'}
                onClick={() => remove(r.number)}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
