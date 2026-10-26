import { useState } from 'react';
import type { Guest } from '../types';
import { isDueOutToday, matchesSearch } from '../utils';
import GuestRows from './GuestRows';

export type ListFilter = 'inhouse' | 'dueout' | 'out' | 'all';

const TABS: { key: ListFilter; label: string; test: (g: Guest) => boolean }[] = [
  { key: 'inhouse', label: 'In-house', test: (g) => g.status === 'in' },
  { key: 'dueout', label: 'Due out', test: isDueOutToday },
  { key: 'out', label: 'Checked out', test: (g) => g.status === 'out' },
  { key: 'all', label: 'All', test: () => true },
];

export default function GuestList({ guests, filter }: { guests: Guest[]; filter: ListFilter }) {
  const [q, setQ] = useState('');
  const tab = TABS.find((t) => t.key === filter) ?? TABS[0];
  const shown = guests.filter((g) => tab.test(g) && matchesSearch(g, q));
  if (tab.key === 'inhouse' || tab.key === 'dueout') {
    shown.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  }

  return (
    <div className="stack">
      <h1>Guests</h1>
      <div className="tabs">
        {TABS.map((t) => (
          <a key={t.key} href={`#/guests/${t.key}`} className={t.key === tab.key ? 'active' : ''}>
            {t.label} <span className="count">{guests.filter(t.test).length}</span>
          </a>
        ))}
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search by name, mobile, room no. or ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <section className="card">
        {shown.length ? <GuestRows guests={shown} /> : <p className="muted">No guests here.</p>}
      </section>
    </div>
  );
}
