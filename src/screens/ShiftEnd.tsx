import { useEffect, useState } from 'react';
import type { CashEntry, Guest, Room, Settings, Shift } from '../types';
import { listCashEntries, listShifts } from '../storage';
import { REPORTS, shiftPeriod } from '../reports';
import ReportView, { ReportTable } from '../components/ReportView';
import { endShift } from '../auth';
import { getSession } from '../session';
import { formatDate, formatTime, nowTime, todayStr } from '../utils';

const payments = REPORTS.find((r) => r.id === 'payments')!;
const shiftSummary = REPORTS.find((r) => r.id === 'shifts')!;

// Handover at the end of a shift: what this person collected, then log out so the next person logs in.
export default function ShiftEnd({ guests, rooms, settings, onEnded }: { guests: Guest[]; rooms: Room[]; settings: Settings; onEnded: () => void }) {
  const session = getSession();
  const [cash, setCash] = useState<CashEntry[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  useEffect(() => {
    listCashEntries().then(setCash);
    listShifts().then(setShifts);
  }, []);
  if (!session) return null;

  const period = shiftPeriod(session.shift);
  const ctx = { guests, cash, rooms, settings, shifts, period };
  const money = payments.build(ctx);
  const summary = shiftSummary.build(ctx).sections[0];

  return (
    <div className="stack report-page">
      <div className="print-only print-head">
        <h2>{settings.hotelName}</h2>
        <h3>Shift Report</h3>
        <p className="report-meta">
          <span>{session.user.name}</span>
          <span>{formatDate(session.shift.startDate)} {formatTime(session.shift.startTime)} – {formatDate(todayStr())} {formatTime(nowTime())}</span>
        </p>
      </div>
      <div className="no-print">
        <p className="eyebrow">Shift since {formatDate(session.shift.startDate)}, {formatTime(session.shift.startTime)}</p>
        <h1>End shift — {session.user.name}</h1>
        <p className="muted">Check the cash in the drawer against this summary, print it for the handover, then log out.</p>
      </div>
      <ReportTable section={summary} />
      <ReportView result={money} />
      <div className="print-only signatures">
        <span>Handed over by: {session.user.name}</span>
        <span>Received by</span>
      </div>
      <div className="sticky-actions no-print">
        <a className="btn btn-ghost" href="#/">Back to work</a>
        <button className="btn" onClick={() => window.print()}>Print shift report</button>
        <button
          className="btn btn-danger btn-xl"
          onClick={async () => {
            await endShift(session.shift);
            onEnded();
          }}
        >
          End shift & log out
        </button>
      </div>
    </div>
  );
}
