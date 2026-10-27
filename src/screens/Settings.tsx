import { useState } from 'react';
import type { Guest, Settings } from '../types';
import { deleteGuest, saveGuest, saveSettings } from '../storage';
import { buildSampleGuests, isSample } from '../sampleData';
import { Field, Section } from '../components/ui';
import { toCsv, todayStr } from '../utils';

export default function SettingsScreen({
  settings, guests, onSaved,
}: {
  settings: Settings;
  guests: Guest[];
  onSaved: (msg: string) => void;
}) {
  const [s, setS] = useState(settings);
  const [roomTypes, setRoomTypes] = useState(settings.roomTypes.join(', '));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const types = roomTypes.split(',').map((t) => t.trim()).filter(Boolean);
    await saveSettings({ ...s, roomTypes: types.length ? types : settings.roomTypes });
    onSaved('Settings saved');
  };

  const sampleCount = guests.filter(isSample).length;

  const loadSamples = async () => {
    // Skip a sample if a real in-house guest already occupies its room
    const taken = new Set(guests.filter((g) => g.status === 'in' && !isSample(g)).map((g) => g.roomNumber.toLowerCase()));
    const samples = buildSampleGuests().filter((g) => g.status === 'out' || !taken.has(g.roomNumber.toLowerCase()));
    for (const g of samples) await saveGuest(g);
    onSaved(`${samples.length} sample guests added`);
  };

  const removeSamples = async () => {
    for (const g of guests.filter(isSample)) await deleteGuest(g.id);
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
    <form className="stack form" onSubmit={save}>
      <h1>Settings</h1>
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
        <Field label="Invoice number prefix">
          <input value={s.invoicePrefix} onChange={(e) => setS({ ...s, invoicePrefix: e.target.value })} />
        </Field>
        <Field label="Next invoice number" hint={`Next invoice: ${s.invoicePrefix}${String(s.nextInvoiceNo).padStart(4, '0')}`}>
          <input
            inputMode="numeric"
            value={s.nextInvoiceNo}
            onChange={(e) => setS({ ...s, nextInvoiceNo: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })}
          />
        </Field>
        <Field label="Room types" hint="Separate with commas" wide>
          <input value={roomTypes} onChange={(e) => setRoomTypes(e.target.value)} />
        </Field>
        <div className="wide">
          <button type="submit" className="btn btn-primary">Save settings</button>
        </div>
      </Section>

      <Section title="Sample guests (for practice)">
        <p className="wide muted">
          Adds 7 made-up guests so staff can practise check-in, bills and check-out. Sample records are marked and can be removed at any time.
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
    </form>
  );
}
