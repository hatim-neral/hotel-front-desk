import { useEffect, useState } from 'react';
import type { Guest, Room, RoomType, Settings, User } from '../types';
import { assignGuestNo, deleteGuest, isValidUsername, listUsers, resetGuestCounter, saveGuest, saveRooms, saveSettings, suggestUsername, updateRoom, USERNAME_RULE } from '../storage';
import { createReceptionLogin, isValidPassword, PASSWORD_RULE, resetPassword, setLoginActive } from '../auth';
import { OWNER_USERNAME } from '../cloud';
import { localData, skipLocalData, uploadLocalData } from '../importLocal';
import { getSession } from '../session';
import { buildSampleGuests, isSample } from '../sampleData';
import { findRoom, parseRoomList, type RoomImport } from '../rooms';
import { Field, Section, Segmented } from '../components/ui';
import { isValidGstin } from '../validation';
import { rupees, toCsv, todayStr } from '../utils';

const pct = (v: string) => Math.min(100, Number(v.replace(/[^\d.]/g, '')) || 0);

export default function SettingsScreen({
  settings, guests, rooms, onSaved,
}: {
  settings: Settings;
  guests: Guest[];
  rooms: Room[];
  onSaved: (msg: string) => void;
}) {
  const [s, setS] = useState(settings);
  const [users, setUsers] = useState<User[]>([]);
  // logins change on other devices too; re-read whenever the app refreshes
  useEffect(() => {
    listUsers().then(setUsers);
  }, [guests, rooms, settings]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (s.gstin && !isValidGstin(s.gstin)) return;
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
          <Field label={`GST on rooms up to ${rupees(s.gstSlabLimit)}/night (%)`}>
            <input inputMode="decimal" value={s.gstRate} onChange={(e) => setS({ ...s, gstRate: pct(e.target.value) })} />
          </Field>
          <Field label={`GST on rooms above ${rupees(s.gstSlabLimit)}/night (%)`}>
            <input inputMode="decimal" value={s.gstHighRate} onChange={(e) => setS({ ...s, gstHighRate: pct(e.target.value) })} />
          </Field>
          <Field label="GST price limit (₹ per night)" hint="GST is charged on room charges only — extra bills and cover charges have none">
            <input
              inputMode="numeric"
              value={s.gstSlabLimit}
              onChange={(e) => setS({ ...s, gstSlabLimit: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            />
          </Field>
          <Field
            label="Hotel GST number (GSTIN)"
            hint="Printed on every bill"
            error={s.gstin && !isValidGstin(s.gstin) ? 'GST number should be 15 characters, e.g. 27ABCDE1234F1Z5' : undefined}
          >
            <input value={s.gstin} maxLength={15} onChange={(e) => setS({ ...s, gstin: e.target.value.toUpperCase() })} />
          </Field>
          <div className="wide">
            <button type="submit" className="btn btn-primary">Save hotel details</button>
          </div>
        </Section>
      </form>

      <LocalUpload onSaved={onSaved} />
      <StaffLogins users={users} onSaved={onSaved} />
      <RoomTypesEditor key={JSON.stringify(settings.roomTypes)} settings={settings} rooms={rooms} onSaved={onSaved} />
      <RoomsEditor settings={settings} rooms={rooms} guests={guests} onSaved={onSaved} />
      <RoomListUpload settings={settings} rooms={rooms} onSaved={onSaved} />

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
    const clean = types.map((t) => ({ name: t.name.trim(), rate: t.rate.trim(), ac: t.ac })).filter((t) => t.name);
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
                <Field label="Cooling">
                  <Segmented options={['AC', 'Non-AC'] as const} value={t.ac ? 'AC' : 'Non-AC'} onChange={(v) => setType(i, { ac: v === 'AC' })} />
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
          <button type="button" className="btn" onClick={() => setTypes([...types, { name: '', rate: '', ac: true }])}>+ Add room type</button>
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
          const t = settings.roomTypes.find((x) => x.name === r.type);
          const rate = t?.rate;
          return (
            <div key={r.number} className="room-list-row">
              <span className="room">{r.number}</span>
              <select value={r.type} onChange={(e) => changeType(r.number, e.target.value)} aria-label={`Type of room ${r.number}`}>
                {!typeNames.includes(r.type) && <option>{r.type}</option>}
                {typeNames.map((t) => <option key={t}>{t}</option>)}
              </select>
              <span className="muted small">
                {t && (t.ac ? 'AC' : 'Non-AC')} · {rate ? `${rupees(Number(rate))}/night` : 'No price set'}
              </span>
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

// Upload or paste the whole room list at once: room number, type, AC / Non-AC, tariff.
function RoomListUpload({ settings, rooms, onSaved }: { settings: Settings; rooms: Room[]; onSaved: (msg: string) => void }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<RoomImport | null>(null);
  const [fileError, setFileError] = useState('');

  const read = (value: string) => {
    setText(value);
    setPreview(value.trim() ? parseRoomList(value, settings, rooms) : null);
  };

  const readFile = async (file?: File) => {
    setFileError('');
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setFileError('Excel files: choose File → Save As → CSV in Excel first, or copy the cells and paste them in the box.');
      return;
    }
    read(await file.text());
  };

  const apply = async () => {
    if (!preview) return;
    await saveSettings({ ...settings, roomTypes: preview.roomTypes });
    await saveRooms(preview.rooms);
    setText('');
    setPreview(null);
    onSaved(`Room list uploaded: ${preview.added} added, ${preview.updated} changed`);
  };

  return (
    <Section title="Upload room list">
      <p className="wide muted small">
        One room per line: <strong>Room no, Room type, AC or Non-AC, Tariff</strong> — e.g. <code>101, Deluxe, AC, 2500</code>.
        Copy the columns from Excel and paste them here, or upload a CSV file. Rooms already in the list get the new type;
        new rooms are added; nothing is deleted.
      </p>
      <Field label="Paste room list" wide>
        <textarea
          rows={6}
          className="mono"
          value={text}
          placeholder={'101, Standard, Non-AC, 1500\n102, Standard, Non-AC, 1500\n201, Deluxe, AC, 2500'}
          onChange={(e) => read(e.target.value)}
        />
      </Field>
      <Field label="…or upload a CSV file" error={fileError} wide>
        <input type="file" accept=".csv,.txt,.xls,.xlsx,text/csv" onChange={(e) => readFile(e.target.files?.[0])} />
      </Field>
      {preview && (
        <div className="wide settle">
          <strong>
            {preview.added} new room(s), {preview.updated} room(s) change type
            {preview.newTypes.length > 0 && `, new room type(s): ${preview.newTypes.join(', ')}`}
          </strong>
          {preview.problems.length > 0 && (
            <ul className="field-error import-problems">
              {preview.problems.slice(0, 10).map((p) => <li key={p}>{p}</li>)}
              {preview.problems.length > 10 && <li>…and {preview.problems.length - 10} more</li>}
            </ul>
          )}
          <div className="actions">
            <button type="button" className="btn btn-ghost" onClick={() => read('')}>Clear</button>
            <button type="button" className="btn btn-primary" onClick={apply} disabled={!text.trim()}>
              Save room list
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// The main admin adds as many logins as needed, resets forgotten passwords and switches off people who leave.
function StaffLogins({ users, onSaved }: { users: User[]; onSaved: (msg: string) => void }) {
  const me = getSession()?.user;
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [rowError, setRowError] = useState('');

  // main admin first, then everyone else by name
  const sorted = [...users].sort((a, b) => (a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : a.name.localeCompare(b.name)));
  const taken = [OWNER_USERNAME, ...users.map((u) => u.username)];

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Enter the name');
    if (users.some((u) => u.name.trim().toLowerCase() === name.trim().toLowerCase())) return setError('Someone with this name already has a login');
    if (!isValidUsername(username)) return setError(USERNAME_RULE);
    if (taken.includes(username)) return setError(`The username “${username}” is taken — pick another`);
    if (!isValidPassword(password)) return setError(PASSWORD_RULE);
    setError('');
    setBusy(true);
    const result = await createReceptionLogin(name, username, password);
    setBusy(false);
    if ('error' in result) return setError(result.error);
    setCreated({ name: name.trim(), username, password });
    setName('');
    setUsername('');
    setUsernameTouched(false);
    setPassword('');
    onSaved(`Login created for ${name.trim()}`);
  };

  const act = async (job: Promise<string | null>, msg: string) => {
    setBusy(true);
    const problem = await job;
    setBusy(false);
    setRowError(problem ?? '');
    if (!problem) {
      setResetting(null);
      setNewPassword('');
      onSaved(msg);
    }
  };

  return (
    <Section title={`Staff logins (${users.length})`}>
      <p className="wide muted small">
        Add a login for each person at the desk — as many as you need — and give them the username and password. They sign in on the
        Reception tab on any device (computer or phone); a shift starts at sign-in and ends at “End shift”, and the person's name goes
        on every bill, payment and report from their shift. Only you, the main admin, can change settings, manage logins and remove
        payments or records. Switching a login off locks it out on every device.
      </p>
      <div className="wide user-list">
        {sorted.map((u) => (
          <div key={u.id} className={`user-row${u.active ? '' : ' user-off'}`}>
            <span className="login-avatar" aria-hidden>{u.name.trim()[0]?.toUpperCase()}</span>
            <span className="grow">
              <strong>{u.name}{u.id === me?.id && <span className="muted small"> (you)</span>}</strong>
              <span className="user-name muted small">Username: <span className="mono">{u.username}</span></span>
            </span>
            <span className={`badge ${u.role === 'admin' ? 'badge-in' : 'badge-out'}`}>{u.role === 'admin' ? 'Main admin' : 'Reception'}</span>
            {resetting === u.id ? (
              <span className="user-reset">
                <input
                  type="text"
                  className="pin-mask"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={64}
                  placeholder="New password"
                  aria-label={`New password for ${u.name}`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isValidPassword(newPassword) || busy}
                  onClick={() => act(resetPassword(u, newPassword), `Password changed for ${u.name}`)}
                >
                  Save
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setResetting(null); setRowError(''); }}>Cancel</button>
              </span>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => { setResetting(u.id); setNewPassword(''); setRowError(''); }}>
                {u.id === me?.id ? 'Change my password' : 'Reset password'}
              </button>
            )}
            {u.role !== 'admin' && (
              <button
                type="button"
                className={`btn btn-ghost${u.active ? ' danger-text' : ''}`}
                disabled={busy}
                onClick={() => act(setLoginActive(u, !u.active), u.active ? `${u.name} can no longer sign in` : `${u.name} can sign in again`)}
              >
                {u.active ? 'Switch off' : 'Switch on'}
              </button>
            )}
          </div>
        ))}
        {rowError && <p className="field-error">{rowError}</p>}
      </div>
      <form className="form wide add-rooms" onSubmit={add} noValidate>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!usernameTouched) setUsername(suggestUsername(e.target.value, taken));
            }}
            placeholder="e.g. Mahesh"
          />
        </Field>
        <Field label="Username" hint="They type this to sign in">
          <input
            value={username}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={20}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase().replace(/\s/g, ''));
              setUsernameTouched(true);
            }}
          />
        </Field>
        <Field label="Password" hint="At least 6 characters">
          <input type="text" className="pin-mask" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Add login'}</button>
        {error && <p className="field-error wide">{error}</p>}
      </form>
      {created && (
        <div className="wide login-made">
          <span>
            Give these to <strong>{created.name}</strong> — Username: <strong className="mono">{created.username}</strong> · Password:{' '}
            <strong className="mono">{created.password}</strong>
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setCreated(null)}>Done</button>
        </div>
      )}
    </Section>
  );
}

// Data this computer saved before the online database: moved online once, by the admin
function LocalUpload({ onSaved }: { onSaved: (msg: string) => void }) {
  const [data, setData] = useState(localData);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;

  const upload = async () => {
    setBusy(true);
    try {
      const msg = await uploadLocalData(data, setStatus);
      setData(null);
      onSaved(msg);
    } catch (e) {
      console.error(e);
      setStatus('Upload stopped — check the internet connection and press Upload again. Nothing is lost.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Data saved only on this computer">
      <p className="wide">
        This computer has <strong>{data.guests.length} guests</strong>, {data.cash.length} cash entries and {data.shifts.length} shifts
        from before the online database. Upload them once so every device sees them. Nothing online is overwritten, and this
        computer keeps its copy as a backup. Old staff logins can't be moved — add them again under Staff logins.
      </p>
      {status && <p className="wide muted">{status}</p>}
      <div className="wide actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload to online database'}</button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            skipLocalData();
            setData(null);
          }}
        >
          Don't upload
        </button>
      </div>
    </Section>
  );
}
