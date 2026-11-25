import { useState } from 'react';
import type { Settings } from '../types';
import { adminSignIn, receptionSignIn, startShift } from '../auth';
import { Field } from '../components/ui';

type Desk = 'reception' | 'admin';
const TAB_KEY = 'hotel.loginTab.v1';

function savedTab(): Desk {
  try {
    return localStorage.getItem(TAB_KEY) === 'admin' ? 'admin' : 'reception';
  } catch {
    return 'reception';
  }
}

// Sign in as reception (a login the admin made in Settings) or as the admin (built into the site).
// Nobody can create an account here. Signing in starts the person's shift.
export default function Login({ settings, onLoggedIn }: { settings: Settings; onLoggedIn: () => void }) {
  const [desk, setDesk] = useState<Desk>(savedTab);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (d: Desk) => {
    setDesk(d);
    setPassword('');
    setError('');
    try {
      localStorage.setItem(TAB_KEY, d);
    } catch {
      /* remembering the tab is only a convenience */
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim()) return setError('Enter your username');
    if (!password) return setError('Enter your password');
    setBusy(true);
    const result = await (desk === 'admin' ? adminSignIn : receptionSignIn)(username, password);
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
    <div className="login-wrap">
      <div className="login card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden>{settings.hotelName.trim()[0]?.toUpperCase() || 'H'}</span>
          <strong>{settings.hotelName}</strong>
        </div>
        <form className="stack form" onSubmit={submit} noValidate>
          <h1>Sign in</h1>
          <div className="segmented login-desk" role="tablist" aria-label="Sign in as">
            {(['reception', 'admin'] as const).map((d) => (
              <button key={d} type="button" role="tab" aria-selected={desk === d} className={desk === d ? 'active' : ''} onClick={() => pick(d)}>
                {d === 'admin' ? 'Admin' : 'Reception'}
              </button>
            ))}
          </div>
          <p className="muted">
            {desk === 'admin' ? 'Admin login.' : 'Use the username and password the admin gave you. Your shift starts when you sign in.'}
          </p>
          <Field label="Username">
            <input
              key={desk}
              value={username}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase().replace(/\s/g, ''));
                setError('');
              }}
            />
          </Field>
          <Field label="Password">
            {/* A masked text box, not a password field, so the browser never offers to save or fill in a password */}
            <input
              className="pin-mask"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              maxLength={64}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
            />
          </Field>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-xl" disabled={busy}>
            {desk === 'admin' ? 'Sign in as admin' : 'Sign in'}
          </button>
          {desk === 'reception' && <p className="muted small">Forgot your password? Ask the admin to reset it.</p>}
        </form>
      </div>
    </div>
  );
}
