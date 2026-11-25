import { useEffect, useState } from 'react';
import type { Settings, User } from '../types';
import { listUsers } from '../storage';
import { checkPin, checkRecoveryCode, createUser, isValidPin, newRecoveryCode, PIN_RULE, setPin, startShift } from '../auth';
import { Field } from '../components/ui';

// Who is at the desk. Tap your name, enter your PIN, and your shift starts.
// The very first time, the owner creates the admin account.
export default function Login({ settings, onLoggedIn }: { settings: Settings; onLoggedIn: () => void }) {
  const [users, setUsers] = useState<User[] | null>(null);
  useEffect(() => {
    listUsers().then(setUsers);
  }, []);
  if (!users) return null;

  return (
    <div className="login-wrap">
      <div className="login card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden>{settings.hotelName.trim()[0]?.toUpperCase() || 'H'}</span>
          <strong>{settings.hotelName}</strong>
        </div>
        {users.length ? (
          <SignIn users={users.filter((u) => u.active)} onLoggedIn={onLoggedIn} />
        ) : (
          <OwnerSetup onLoggedIn={onLoggedIn} />
        )}
      </div>
    </div>
  );
}

// A masked number box, not a password field, so the browser never offers to save or autofill a PIN
// (anyone at the desk could otherwise log in as someone else).
function PinInput({ value, onChange, label = 'PIN', autoFocus }: { value: string; onChange: (v: string) => void; label?: string; autoFocus?: boolean }) {
  return (
    <input
      className="pin-input pin-mask"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      data-lpignore="true"
      maxLength={8}
      aria-label={label}
      placeholder="••••"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  );
}

function OwnerSetup({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [name, setName] = useState('');
  const [pin, setPinValue] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [owner, setOwner] = useState<User | null>(null);
  const [code, setCode] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    if (!isValidPin(pin)) return setError(PIN_RULE);
    if (pin !== pin2) return setError('The two PINs do not match');
    setError('');
    setOwner(await createUser(name, 'admin', pin));
    setCode(await newRecoveryCode());
  };

  if (owner) {
    return (
      <div className="stack">
        <h1>Write down your recovery code</h1>
        <p className="muted">If you ever forget your PIN, this code lets you set a new one. Keep it somewhere safe, away from the desk. It is shown only once.</p>
        <div className="recovery-code mono">{code}</div>
        <button
          className="btn btn-primary btn-xl"
          onClick={async () => {
            await startShift(owner);
            onLoggedIn();
          }}
        >
          I've written it down — start my shift
        </button>
      </div>
    );
  }

  return (
    <form className="stack form" onSubmit={create} noValidate>
      <h1>Set up the owner account</h1>
      <p className="muted">
        You'll be the main admin: you create a login for each person at the desk (as many as you need), change settings and can
        void entries. Everyone then logs in with their own PIN, and their name goes on the bills and reports of their shift.
      </p>
      <Field label="Your name" required>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" />
      </Field>
      <Field label="Choose a PIN" required hint="4 to 8 digits">
        <PinInput value={pin} onChange={setPinValue} />
      </Field>
      <Field label="Enter the PIN again" required>
        <PinInput value={pin2} onChange={setPin2} label="Confirm PIN" />
      </Field>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-xl">Create account</button>
    </form>
  );
}

function SignIn({ users, onLoggedIn }: { users: User[]; onLoggedIn: () => void }) {
  const [picked, setPicked] = useState<User | null>(users.length === 1 ? users[0] : null);
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);

  if (recovering) return <Recover admins={users.filter((u) => u.role === 'admin')} onDone={() => setRecovering(false)} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked || busy) return;
    setBusy(true);
    if (await checkPin(picked, pin)) {
      await startShift(picked);
      onLoggedIn();
      return;
    }
    setBusy(false);
    setPinValue('');
    setError('Wrong PIN — try again');
  };

  return (
    <div className="stack">
      <h1>Who's at the desk?</h1>
      <div className="login-users">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            className={`login-user${picked?.id === u.id ? ' active' : ''}`}
            onClick={() => {
              setPicked(u);
              setPinValue('');
              setError('');
            }}
          >
            <span className="login-avatar" aria-hidden>{u.name.trim()[0]?.toUpperCase()}</span>
            <span>{u.name}</span>
            <span className="muted small">{u.role === 'admin' ? 'Main admin' : 'User'}</span>
          </button>
        ))}
      </div>
      {picked && (
        <form className="stack" onSubmit={submit}>
          <Field label={`PIN for ${picked.name}`} error={error}>
            <PinInput key={picked.id} value={pin} onChange={setPinValue} autoFocus />
          </Field>
          <button type="submit" className="btn btn-primary btn-xl" disabled={pin.length < 4 || busy}>Start shift</button>
        </form>
      )}
      <button type="button" className="link" onClick={() => setRecovering(true)}>Forgot PIN?</button>
    </div>
  );
}

// Staff who forget their PIN ask an admin to reset it in Settings; an admin uses the recovery code.
function Recover({ admins, onDone }: { admins: User[]; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [adminId, setAdminId] = useState(admins[0]?.id ?? '');
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const admin = admins.find((a) => a.id === adminId);
    if (!admin) return setError('No admin account found');
    if (!isValidPin(pin)) return setError(PIN_RULE);
    if (!(await checkRecoveryCode(code))) return setError('That recovery code is not right');
    await setPin(admin, pin);
    setDone(true);
  };

  if (done) {
    return (
      <div className="stack">
        <h1>PIN changed</h1>
        <button className="btn btn-primary btn-xl" onClick={() => location.reload()}>Log in</button>
      </div>
    );
  }

  return (
    <form className="stack form" onSubmit={submit} noValidate>
      <h1>Reset a PIN</h1>
      <p className="muted">Users: ask the main admin to reset your PIN. Main admin: use the recovery code you wrote down at setup.</p>
      <Field label="Recovery code">
        <input className="mono" value={code} placeholder="XXXX-XXXX-XXXX" onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus />
      </Field>
      {admins.length > 1 && (
        <Field label="Admin account">
          <select value={adminId} onChange={(e) => setAdminId(e.target.value)}>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="New PIN" hint="4 to 8 digits">
        <PinInput value={pin} onChange={setPinValue} label="New PIN" />
      </Field>
      {error && <p className="field-error">{error}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Back</button>
        <button type="submit" className="btn btn-primary">Set new PIN</button>
      </div>
    </form>
  );
}
