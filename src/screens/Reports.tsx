import { useCallback, useEffect, useState } from 'react';
import type { CashEntry, Guest, Room, Settings, Shift } from '../types';
import { deleteCashEntry, listCashEntries, listShifts, newId, saveCashEntry } from '../storage';
import {
  dayPeriod, monthPeriod, rangePeriod, reportCsv, REPORTS, shiftLabel, shiftPeriod, type Period, type PeriodKind,
} from '../reports';
import ReportView from '../components/ReportView';
import { Field, Segmented } from '../components/ui';
import { actor, getSession, isAdmin } from '../session';
import { addDays, formatDate, formatTime, nowTime, rupees, todayStr } from '../utils';

const PERIOD_KINDS = ['Shift', 'Day', 'Month', 'Date range'] as const;
type PeriodChoice = (typeof PERIOD_KINDS)[number];
const KIND_OF: Record<PeriodChoice, PeriodKind> = { Shift: 'shift', Day: 'day', Month: 'month', 'Date range': 'range' };

const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// All reports, for a shift, a day, a month or any dates. The logged-in user's name goes on the printout.
export default function Reports({
  guests, rooms, settings, reportId, onChanged,
}: {
  guests: Guest[];
  rooms: Room[];
  settings: Settings;
  reportId?: string;
  onChanged: (msg: string) => void;
}) {
  const today = todayStr();
  const def = REPORTS.find((r) => r.id === reportId) ?? REPORTS[0];
  const [cash, setCash] = useState<CashEntry[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [choice, setChoice] = useState<PeriodChoice>('Day');
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [shiftId, setShiftId] = useState(getSession()?.shift.id ?? '');
  const [adding, setAdding] = useState(false);
  const preparedBy = getSession()?.user.name ?? '';

  const load = useCallback(async () => {
    setCash(await listCashEntries());
    setShifts(await listShifts());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shift = shifts.find((s) => s.id === shiftId) ?? shifts[0];
  const kind = KIND_OF[choice];
  const period: Period =
    kind === 'shift' && shift ? shiftPeriod(shift)
      : kind === 'month' ? monthPeriod(month)
        : kind === 'range' ? rangePeriod(from, to)
          : dayPeriod(day);
  const result = def.build({ guests, cash, rooms, settings, shifts, period });
  const periodText = def.snapshot ? `As of ${formatDate(today)}, ${formatTime(nowTime())}` : period.label;

  const download = () => {
    const blob = new Blob([reportCsv(def, period, result, preparedBy)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${def.id}-${def.snapshot ? today : `${period.from}${period.to !== period.from ? `-to-${period.to}` : ''}`}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const periodCash = def.id === 'payments'
    ? cash.filter((e) => (kind === 'shift' ? e.shiftId === shift?.id : e.date >= period.from && e.date <= period.to))
    : [];

  return (
    <div className="stack report-page">
      <div className="print-only print-head">
        <h2>{settings.hotelName}</h2>
        {settings.hotelAddress && <p>{settings.hotelAddress}</p>}
        {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
        <h3>{def.name} Report</h3>
        <p className="report-meta">
          <span>{periodText}</span>
          <span>Prepared by: {preparedBy}</span>
          <span>Printed: {formatDate(today)}, {formatTime(nowTime())}</span>
        </p>
      </div>

      <div className="no-print">
        <h1>Reports</h1>
      </div>

      <nav className="report-tabs no-print" aria-label="Report type">
        {REPORTS.map((r) => (
          <a key={r.id} href={`#/reports/${r.id}`} className={r.id === def.id ? 'active' : ''}>{r.name}</a>
        ))}
      </nav>

      <div className="card form report-controls no-print">
        <div>
          <strong>{def.name}</strong>
          <p className="muted small">{def.description}</p>
        </div>
        {!def.snapshot && (
          <>
            <Segmented options={PERIOD_KINDS} value={choice} onChange={setChoice} />
            {kind === 'shift' && (
              <Field label="Shift" wide>
                <select value={shift?.id ?? ''} onChange={(e) => setShiftId(e.target.value)}>
                  {!shifts.length && <option value="">No shifts yet</option>}
                  {shifts.slice(0, 300).map((s) => <option key={s.id} value={s.id}>{shiftLabel(s)}</option>)}
                </select>
              </Field>
            )}
            {kind === 'day' && (
              <div className="period-row">
                <button type="button" className="btn btn-ghost" onClick={() => setDay(addDays(day, -1))}>‹</button>
                <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" />
                <button type="button" className="btn btn-ghost" onClick={() => setDay(addDays(day, 1))} disabled={day >= today}>›</button>
                <div className="quick">
                  <button type="button" className={day === today ? 'active' : ''} onClick={() => setDay(today)}>Today</button>
                  <button type="button" className={day === addDays(today, -1) ? 'active' : ''} onClick={() => setDay(addDays(today, -1))}>Yesterday</button>
                </div>
              </div>
            )}
            {kind === 'month' && (
              <div className="period-row">
                <button type="button" className="btn btn-ghost" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
                <input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
                <button type="button" className="btn btn-ghost" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= today.slice(0, 7)}>›</button>
              </div>
            )}
            {kind === 'range' && (
              <div className="grid">
                <Field label="From">
                  <input type="date" value={from} max={today} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
                </Field>
                <Field label="To">
                  <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
                </Field>
              </div>
            )}
          </>
        )}
        <p className="muted small">
          {periodText} · Prepared by <strong>{preparedBy}</strong>
        </p>
        <div className="actions">
          {def.id === 'payments' && <button type="button" className="btn" onClick={() => setAdding(!adding)}>+ Cash paid out / added</button>}
          <button type="button" className="btn" onClick={download}>Download (CSV)</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print report</button>
        </div>
        {adding && (
          <CashEntryForm
            defaultDate={kind === 'day' ? day : today}
            onCancel={() => setAdding(false)}
            onSave={async (e) => {
              await saveCashEntry(e);
              await load();
              setAdding(false);
              onChanged(`Cash ${e.direction === 'out' ? 'paid out' : 'added'}: ${rupees(e.amount)}`);
            }}
          />
        )}
      </div>

      <ReportView result={result} />

      {isAdmin() && periodCash.length > 0 && (
        <section className="card no-print">
          <h2 className="card-title">Cash entries in this period</h2>
          <ul className="cash-entries">
            {periodCash.map((e) => (
              <li key={e.id}>
                <span>{formatDate(e.date)} {formatTime(e.time)} · {e.direction === 'out' ? 'Paid out' : 'Added'} {rupees(e.amount)} · {e.narration}{e.by && ` · by ${e.by}`}</span>
                <button
                  type="button"
                  className="link danger-text"
                  onClick={async () => {
                    if (!confirm('Remove this cash entry?')) return;
                    await deleteCashEntry(e.id);
                    await load();
                    onChanged('Cash entry removed');
                  }}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="print-only signatures">
        <span>Prepared by: {preparedBy}</span>
        <span>Checked by</span>
      </div>
    </div>
  );
}

// Cash handed to the owner / banked / petty expense (out), or a float put into the drawer (in)
function CashEntryForm({ defaultDate, onSave, onCancel }: { defaultDate: string; onSave: (e: CashEntry) => void; onCancel: () => void }) {
  const [direction, setDirection] = useState<'Paid out' | 'Added'>('Paid out');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [tried, setTried] = useState(false);
  const amountOk = Number(amount) > 0;

  return (
    <div className="add-charge">
      <div className="grid">
        <Field label="Cash" wide>
          <Segmented options={['Paid out', 'Added'] as const} value={direction} onChange={setDirection} />
        </Field>
        <Field label="Amount (₹)" required error={tried && !amountOk ? 'Enter the amount' : undefined}>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
        </Field>
        <Field label="Date">
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Narration" hint={direction === 'Paid out' ? 'e.g. Handed to owner, deposited in bank, petty expense' : 'e.g. Opening float'} wide>
          <input value={narration} onChange={(e) => setNarration(e.target.value)} />
        </Field>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setTried(true);
            if (!amountOk) return;
            onSave({
              id: newId(),
              date,
              time: date === todayStr() ? nowTime() : '23:59',
              direction: direction === 'Paid out' ? 'out' : 'in',
              amount: Number(amount),
              narration: narration.trim(),
              ...actor(),
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
