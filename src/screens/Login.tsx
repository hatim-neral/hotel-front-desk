import { useEffect, useState } from 'react';
import type { Settings, User } from '../types';
import { isValidUsername, listUsers, suggestUsername, USERNAME_RULE } from '../storage';
import { checkRecoveryCode, createUser, isValidPassword, newRecoveryCode, PASSWORD_RULE, setPin, signIn, startShift } from '../auth';
import { Field } from '../components/ui';

// Who is at the desk. Sign in with the username and password the admin gave you, and your shift starts.
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
          <SignIn admins={users.filter((u) => u.role === 'admin')} onLoggedIn={onLoggedIn} />
        ) : (
          <OwnerSetup onLoggedIn={onLoggedIn} />
        )}
      </div>
    </div>
  );
}

// A masked text box, not a password field, so the browser never offers to save or autofill a password
// (anyone at the desk could otherwise sign in as someone else).
function PasswordInput({ value, onChange, label = 'Password', autoFocus }: { value: string; onChange: (v: string) => void; label?: string; autoFocus?: boolean }) {
  return (
    <input
      className="pin-mask"
      type="text"
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      data-lpignore="true"
      maxLength={64}
      aria-label={label}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function UsernameInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input
      value={value}
      autoFocus={autoFocus}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      maxLength={20}
      onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s/g, ''))}
    />
  );
}

function OwnerSetup({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [owner, setOwner] = useState<User | null>(null);
  const [code, setCode] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name');
    if (!isValidUsername(username)) return setError(USERNAME_RULE);
    if (!isValidPassword(password)) return setError(PASSWORD_RULE);
    if (password !== password2) return setError('The two passwords do not match');
    setError('');
    setOwner(await createUser(name, username, 'admin', password));
    setCode(await newRecoveryCode());
  };

  if (owner) {
    return (
      <div className="stack">
        <h1>Write down your recovery code</h1>
        <p className="muted">If you ever forget your password, this code lets you set a new one. Keep it somewhere safe, away from the desk. It is shown only once.</p>
        <div className="recovery-code mono">{code}</div>
        <p className="muted small">You sign in as <strong>{owner.username}</strong>.</p>
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
        You'll be the main admin: you give each person at the desk their own username and password (as many as you need), change
        settings and can void entries. Their name then goes on the bills and reports of their shift.
      </p>
      <Field label="Your name" required>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!usernameTouched) setUsername(suggestUsername(e.target.value, []));
          }}
          autoFocus
          autoComplete="name"
        />
      </Field>
      <Field label="Username" required hint="What you type to sign in">
        <UsernameInput value={username} onChange={(v) => { setUsername(v); setUsernameTouched(true); }} />
      </Field>
      <Field label="Choose a password" required hint="At least 4 characters">
        <PasswordInput value={password} onChange={setPassword} />
      </Field>
      <Field label="Enter the password again" required>
        <PasswordInput value={password2} onChange={setPassword2} label="Confirm password" />
      </Field>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-xl">Create account</button>
    </form>
  );
}

// Sign in with the username and password the admin gave you. Starting a shift is part of signing in.
function SignIn({ admins, onLoggedIn }: { admins: User[]; onLoggedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);

  if (recovering) return <Recover admins={admins} onDone={() => setRecovering(false)} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim()) return setError('Enter your username');
    if (!password) return setError('Enter your password');
    setBusy(true);
    const result = await signIn(username, password);
    if ('user' in result) {
      await startShift(result.user);
      onLoggedIn();
      return;
    }
    setBusy(false);
    setPassword('');
    setError(result.error);
  };

  return (
    <form className="stack form" onSubmit={submit} noValidate>
      <h1>Sign in</h1>
      <p className="muted">Use the username and password the admin gave you. Your shift starts when you sign in.</p>
      <Field label="Username">
        <UsernameInput value={username} onChange={(v) => { setUsername(v); setError(''); }} autoFocus />
      </Field>
      <Field label="Password">
        <PasswordInput value={password} onChange={(v) => { setPassword(v); setError(''); }} />
      </Field>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-xl" disabled={busy}>Sign in</button>
      <button type="button" className="link" onClick={() => setRecovering(true)}>Forgot password?</button>
    </form>
  );
}

// Users who forget their password ask the admin to reset it in Settings; the admin uses the recovery code.
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
    if (!isValidPassword(pin)) return setError(PASSWORD_RULE);
    if (!(await checkRecoveryCode(code))) return setError('That recovery code is not right');
    await setPin(admin, pin);
    setDone(true);
  };

  if (done) {
    return (
      <div className="stack">
        <h1>Password changed</h1>
        <button className="btn btn-primary btn-xl" onClick={() => location.reload()}>Log in</button>
      </div>
    );
  }

  return (
    <form className="stack form" onSubmit={submit} noValidate>
      <h1>Reset the admin password</h1>
      <p className="muted">Users: ask the main admin to reset your password. Main admin: use the recovery code you wrote down at setup.</p>
      <Field label="Recovery code">
        <input className="mono" value={code} placeholder="XXXX-XXXX-XXXX" onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus />
      </Field>
      {admins.length > 1 && (
        <Field label="Admin account">
          <select value={adminId} onChange={(e) => setAdminId(e.target.value)}>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.username})</option>)}
          </select>
        </Field>
      )}
      <Field label="New password" hint="At least 4 characters">
        <PasswordInput value={pin} onChange={setPinValue} label="New password" />
      </Field>
      {error && <p className="field-error">{error}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Back</button>
        <button type="submit" className="btn btn-primary">Set new password</button>
      </div>
    </form>
  );
}
