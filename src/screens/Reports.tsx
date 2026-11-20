import { useCallback, useEffect, useState } from 'react';
import type { CashEntry, Guest, Settings } from '../types';
import { deleteCashEntry, listCashEntries, newId, saveCashEntry } from '../storage';
import { buildReport, reportCsv } from '../report';
import { Field, Segmented } from '../components/ui';
import { addDays, formatDate, formatTime, nowTime, rupees, todayStr } from '../utils';

const PREPARED_BY_KEY = 'hotel.preparedBy';

function remembered(): string {
  try {
    return localStorage.getItem(PREPARED_BY_KEY) ?? '';
  } catch {
    return '';
  }
}

// Plain number for the report table: 14,300.00
const amt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// All Payment Detail Report: payments for a day (or a date range) in cash / bank / city-ledger columns,
// with cash in hand carried forward, ready to print for the owner or accountant.
export default function Reports({ guests, settings, onChanged }: { guests: Guest[]; settings: Settings; onChanged: (msg: string) => void }) {
  const today = todayStr();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [cash, setCash] = useState<CashEntry[]>([]);
  const [preparedBy, setPreparedBy] = useState(remembered);
  const [adding, setAdding] = useState(false);

  const loadCash = useCallback(async () => setCash(await listCashEntries()), []);
  useEffect(() => {
    loadCash();
  }, [loadCash]);

  const report = buildReport(guests, cash, from, to);
  const oneDay = from === to;
  const shiftDay = (n: number) => {
    const d = addDays(from, n);
    setFrom(d);
    setTo(d);
  };

  const setPrepared = (v: string) => {
    setPreparedBy(v);
    try {
      localStorage.setItem(PREPARED_BY_KEY, v);
    } catch {
      // not remembered; fine
    }
  };

  const download = () => {
    const blob = new Blob([reportCsv(report)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payment-report-${from}${oneDay ? '' : `-to-${to}`}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const removeCash = async (id: string) => {
    if (!confirm('Remove this cash entry?')) return;
    await deleteCashEntry(id);
    await loadCash();
    onChanged('Cash entry removed');
  };

  const t = report.totals;
  const moves = guests
    .flatMap((g) => g.roomMoves.map((m) => ({ ...m, guest: g })))
    .filter((m) => m.date >= from && m.date <= to)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  return (
    <div className="stack report-page">
      <div className="print-only print-head">
        <h2>{settings.hotelName}</h2>
        {settings.hotelAddress && <p>{settings.hotelAddress}</p>}
        {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
        <h3>All Payment Detail Report</h3>
        <p className="report-meta">
          <span>Report date: {oneDay ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`}</span>
          {preparedBy && <span>Prepared by: {preparedBy}</span>}
          <span>Printed: {formatDate(today)}, {formatTime(nowTime())}</span>
        </p>
      </div>

      <div className="no-print">
        <h1>Payment Report</h1>
        <p className="muted">Every payment taken, by cash, online and company credit. Print it at the end of the day or shift.</p>
      </div>

      <div className="card form report-controls no-print">
        <div className="quick">
          <button type="button" onClick={() => shiftDay(-1)} aria-label="Previous day">‹ Prev day</button>
          <button type="button" className={oneDay && from === today ? 'active' : ''} onClick={() => { setFrom(today); setTo(today); }}>Today</button>
          <button type="button" className={oneDay && from === addDays(today, -1) ? 'active' : ''} onClick={() => { const y = addDays(today, -1); setFrom(y); setTo(y); }}>Yesterday</button>
          <button type="button" onClick={() => shiftDay(1)} disabled={from >= today} aria-label="Next day">Next day ›</button>
        </div>
        <div className="grid">
          <Field label="From">
            <input type="date" value={from} max={today} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
          </Field>
          <Field label="To">
            <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Prepared by" hint="Printed on the report">
            <input value={preparedBy} placeholder="Receptionist name" onChange={(e) => setPrepared(e.target.value)} />
          </Field>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setAdding(!adding)}>+ Cash paid out / added</button>
          <button type="button" className="btn" onClick={download} disabled={!report.lines.length}>Download (CSV)</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print report</button>
        </div>
        {adding && (
          <CashEntryForm
            defaultDate={to}
            onCancel={() => setAdding(false)}
            onSave={async (e) => {
              await saveCashEntry(e);
              await loadCash();
              setAdding(false);
              onChanged(`Cash ${e.direction === 'out' ? 'paid out' : 'added'}: ${rupees(e.amount)}`);
            }}
          />
        )}
      </div>

      <div className="kpis report-kpis no-print">
        <div className="kpi"><span className="kpi-num">{rupees(t.receive - t.payment)}</span><span className="kpi-label">Cash (net)</span><span className="kpi-sub">In hand now {rupees(report.closing)}</span></div>
        <div className="kpi"><span className="kpi-num">{rupees(t.bank)}</span><span className="kpi-label">Online</span><span className="kpi-sub">UPI, card, bank transfer</span></div>
        <div className="kpi"><span className="kpi-num">{rupees(t.other)}</span><span className="kpi-label">City ledger</span><span className="kpi-sub">Company / OTA credit</span></div>
        <div className="kpi"><span className="kpi-num">{rupees(t.receive - t.payment + t.bank + t.other)}</span><span className="kpi-label">Total collected</span><span className="kpi-sub">{report.lines.length} entries</span></div>
      </div>

      <section className="card report-card">
        <div className="report-scroll">
          <table className="report">
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Date</th>
                <th>Particulars</th>
                <th>Bill No</th>
                <th className="num">Receive</th>
                <th className="num">Payment</th>
                <th className="num">Bank</th>
                <th className="num">Other</th>
                <th>Narration</th>
              </tr>
            </thead>
            <tbody>
              <tr className="report-balance">
                <td />
                <td>{formatDate(from)}</td>
                <td><strong>Opening Balance</strong></td>
                <td />
                <td className="num">{amt(report.opening)}</td>
                <td colSpan={4} />
              </tr>
              {report.lines.map((l, i) => (
                <tr key={l.key}>
                  <td>{i + 1}</td>
                  <td className="nowrap">{formatDate(l.date)}<span className="muted small"> {formatTime(l.time)}</span></td>
                  <td>{l.particulars}</td>
                  <td className="mono">{l.ref}</td>
                  <td className="num">{amt(l.receive)}</td>
                  <td className="num">{amt(l.payment)}</td>
                  <td className="num">{amt(l.bank)}</td>
                  <td className="num">{amt(l.other)}</td>
                  <td>
                    {l.narration}
                    {l.cashEntryId && (
                      <button type="button" className="link danger-text no-print" onClick={() => removeCash(l.cashEntryId!)}> remove</button>
                    )}
                  </td>
                </tr>
              ))}
              {!report.lines.length && (
                <tr><td colSpan={9} className="muted">No payments in this period.</td></tr>
              )}
              <tr className="report-total">
                <td colSpan={4}>Total</td>
                <td className="num">{amt(t.receive)}</td>
                <td className="num">{amt(t.payment)}</td>
                <td className="num">{amt(t.bank)}</td>
                <td className="num">{amt(t.other)}</td>
                <td />
              </tr>
              <tr className="report-balance">
                <td colSpan={4}><strong>Closing Balance</strong> <span className="muted small">(cash in hand)</span></td>
                <td />
                <td className="num"><strong>{amt(report.closing)}</strong></td>
                <td colSpan={3} />
              </tr>
              <tr className="report-balance">
                <td />
                <td>{formatDate(addDays(to, 1))}</td>
                <td><strong>Opening Balance</strong></td>
                <td />
                <td className="num"><strong>{amt(report.closing)}</strong></td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="report-summaries">
        <section className="card report-card">
          <table className="report">
            <thead>
              <tr><th>Payment mode</th><th className="num">Receive</th><th className="num">Payment</th><th className="num">Bank</th><th className="num">Other</th></tr>
            </thead>
            <tbody>
              {report.groups.map((g) => (
                <tr key={g.column}>
                  <td>{g.label}</td>
                  <td className="num">{amt(g.total.receive)}</td>
                  <td className="num">{amt(g.total.payment)}</td>
                  <td className="num">{amt(g.total.bank)}</td>
                  <td className="num">{amt(g.total.other)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card report-card">
          <table className="report">
            <thead>
              <tr><th>Payment mode</th><th className="num">Receive</th><th className="num">Payment</th><th className="num">Bank</th><th className="num">Other</th></tr>
            </thead>
            <tbody>
              {report.groups.filter((g) => g.accounts.length).map((g) => (
                <GroupRows key={g.column} label={g.label} accounts={g.accounts} />
              ))}
              <tr className="report-total">
                <td>Grand Total</td>
                <td className="num">{amt(t.receive)}</td>
                <td className="num">{amt(t.payment)}</td>
                <td className="num">{amt(t.bank)}</td>
                <td className="num">{amt(t.other)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      {moves.length > 0 && (
        <section className="card report-card">
          <h2 className="card-title">Room movement · {moves.length}</h2>
          <div className="report-scroll">
            <table className="report">
              <thead>
                <tr><th>Date</th><th>Guest</th><th>Bill No</th><th>From</th><th>To</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td className="nowrap">{formatDate(m.date)}<span className="muted small"> {formatTime(m.time)}</span></td>
                    <td><a href={`#/guest/${m.guest.id}`}>{m.guest.fullName}</a></td>
                    <td className="mono">{m.guest.guestNo}</td>
                    <td>{m.from} <span className="muted small">{m.fromType}</span></td>
                    <td><strong>{m.to}</strong> <span className="muted small">{m.toType}</span></td>
                    <td>{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="print-only signatures">
        <span>Prepared by{preparedBy && `: ${preparedBy}`}</span>
        <span>Checked by</span>
      </div>
    </div>
  );
}

function GroupRows({ label, accounts }: { label: string; accounts: [string, { receive: number; payment: number; bank: number; other: number }][] }) {
  return (
    <>
      <tr className="report-group"><td colSpan={5}>{label}</td></tr>
      {accounts.map(([name, a]) => (
        <tr key={name}>
          <td className="report-account">{name}</td>
          <td className="num">{amt(a.receive)}</td>
          <td className="num">{amt(a.payment)}</td>
          <td className="num">{amt(a.bank)}</td>
          <td className="num">{amt(a.other)}</td>
        </tr>
      ))}
    </>
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
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
