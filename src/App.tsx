import { useCallback, useEffect, useState } from 'react';
import type { Guest, Room, Settings } from './types';
import { DEFAULT_SETTINGS, listGuests, listRooms, loadSettings } from './storage';
import Dashboard from './screens/Dashboard';
import CheckInForm from './screens/CheckInForm';
import GuestList, { type ListFilter } from './screens/GuestList';
import GuestDetail from './screens/GuestDetail';
import SettingsScreen from './screens/Settings';
import CheckOutList from './screens/CheckOutList';
import Rooms from './screens/Rooms';
import AddBill from './screens/AddBill';
import type { BoardFilter } from './components/RoomBoard';

// Tiny hash router: #/, #/checkin, #/checkin/:room, #/again/:id, #/checkout, #/rooms, #/rooms/:filter, #/bill, #/bill/:guestId, #/checkout/:id, #/edit/:id, #/guests/:filter, #/guest/:id, #/settings
function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
}

type Theme = 'dark' | 'light';

// Theme is a per-device preference; index.html applies it before first paint to avoid a flash.
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('hotel.theme', next);
    } catch {
      // storage unavailable; theme just won't be remembered
    }
    setTheme(next);
  };
  return [theme, toggle];
}

export default function App() {
  const [page, param] = useRoute();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [toast, setToast] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [theme, toggleTheme] = useTheme();

  const refresh = useCallback(async () => {
    setGuests(await listGuests());
    setSettings(await loadSettings());
    setRooms(await listRooms());
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = (msg: string) => {
    setToast(msg);
    refresh();
  };

  let screen;
  if (!loaded) return null;
  switch (page) {
    case 'checkin':
      screen = (
        <CheckInForm key={param} guests={guests} rooms={rooms} settings={settings} initialRoom={param && decodeURIComponent(param)} onSaved={notify} />
      );
      break;
    case 'again':
      screen = (
        <CheckInForm key={`again-${param}`} guests={guests} rooms={rooms} settings={settings} from={guests.find((g) => g.id === param)} onSaved={notify} />
      );
      break;
    case 'edit':
      screen = (
        <CheckInForm
          key={param}
          guests={guests}
          rooms={rooms}
          settings={settings}
          existing={guests.find((g) => g.id === param)}
          onSaved={notify}
        />
      );
      break;
    case 'guests':
      screen = <GuestList guests={guests} filter={(param as ListFilter) || 'inhouse'} />;
      break;
    case 'guest':
      screen = <GuestDetail key={param} guest={guests.find((g) => g.id === param)} settings={settings} onChanged={notify} />;
      break;
    case 'checkout':
      screen = param ? (
        <GuestDetail key={`checkout-${param}`} guest={guests.find((g) => g.id === param)} settings={settings} onChanged={notify} startCheckout />
      ) : (
        <CheckOutList guests={guests} />
      );
      break;
    case 'rooms':
      screen = (
        <Rooms key={param} guests={guests} rooms={rooms} settings={settings} initialFilter={(param as BoardFilter) || 'all'} onChanged={notify} />
      );
      break;
    case 'bill':
      screen = <AddBill key={param} guests={guests} guestId={param} onChanged={notify} />;
      break;
    case 'settings':
      screen = <SettingsScreen settings={settings} guests={guests} rooms={rooms} onSaved={notify} />;
      break;
    default:
      screen = <Dashboard guests={guests} rooms={rooms} />;
  }

  const nav = [
    { path: '', label: 'Front Desk', active: !page },
    { path: 'checkin', label: '+ Check-In', active: page === 'checkin' || page === 'again', primary: true },
    { path: 'bill', label: 'Add Bill', active: page === 'bill' },
    { path: 'checkout', label: 'Check-Out', active: page === 'checkout' },
    { path: 'rooms', label: 'Rooms', active: page === 'rooms' },
    { path: 'guests/inhouse', label: 'Guests', active: page === 'guests' || page === 'guest' },
    { path: 'settings', label: 'Settings', active: page === 'settings' },
  ];

  return (
    <>
      <header className="topbar no-print">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden>{settings.hotelName.trim()[0]?.toUpperCase() || 'H'}</span>
          {settings.hotelName}
        </a>
        <nav>
          {nav.map((n) => (
            <a
              key={n.path}
              href={'#/' + n.path}
              className={`nav-link${n.active ? ' active' : ''}${n.primary ? ' primary' : ''}`}
            >
              {n.label}
            </a>
          ))}
          <button
            type="button"
            className="nav-link theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀︎' : '☾'}
          </button>
        </nav>
      </header>
      <main className="container">{screen}</main>
      {toast && <div className="toast no-print" role="status">{toast}</div>}
    </>
  );
}
