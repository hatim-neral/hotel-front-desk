// All reports. Each one takes the same period (a shift, a day, a month or any date range) and returns
// tables in one shape, so the screen, print and CSV export work the same for every report.
import type { CashEntry, Guest, PaymentMode, Room, Settings, Shift } from './types';
import { COVER_CHARGE } from './types';
import { billFor, formatDate, formatTime, rateBeforeGst, todayStr, addDays } from './utils';
import { splitGst } from './gst';

// ---------- periods ----------

export type PeriodKind = 'shift' | 'day' | 'month' | 'range';

export interface Period {
  kind: PeriodKind;
  from: string; // YYYY-MM-DD
  to: string;
  shift?: Shift;
  label: string;
}

export const shiftLabel = (s: Shift) =>
  `${s.userName} · ${formatDate(s.startDate)} ${formatTime(s.startTime)} – ${s.endDate ? `${s.endDate !== s.startDate ? formatDate(s.endDate) + ' ' : ''}${formatTime(s.endTime ?? '')}` : 'now (open)'}`;

export function shiftPeriod(s: Shift): Period {
  return { kind: 'shift', from: s.startDate, to: s.endDate ?? todayStr(), shift: s, label: `Shift: ${shiftLabel(s)}` };
}

export function dayPeriod(date: string): Period {
  return { kind: 'day', from: date, to: date, label: formatDate(date) };
}

export function monthPeriod(month: string): Period {
  // month = YYYY-MM
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const name = new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return { kind: 'month', from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, label: name };
}

export function rangePeriod(from: string, to: string): Period {
  return { kind: 'range', from, to, label: from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}` };
}

// Does something done on `date` (in shift `shiftId`) fall in the period?
function hit(p: Period, date: string, shiftId?: string): boolean {
  return p.kind === 'shift' ? shiftId === p.shift!.id : date >= p.from && date <= p.to;
}

// ---------- report shape ----------

export type Cell = string | number;
export interface Column {
  label: string;
  num?: boolean; // money: right-aligned, two decimals
}
export interface Section {
  title?: string;
  columns: Column[];
  rows: Cell[][];
  rowKinds?: ('balance' | 'total' | 'group' | undefined)[];
  totals?: Cell[];
  empty?: string;
}
export interface Kpi {
  label: string;
  value: string;
  sub?: string;
}
export interface ReportResult {
  kpis: Kpi[];
  sections: Section[];
}

export interface ReportContext {
  guests: Guest[];
  cash: CashEntry[];
  rooms: Room[];
  settings: Settings;
  shifts: Shift[];
  period: Period;
}

export interface ReportDef {
  id: string;
  name: string;
  description: string;
  snapshot?: boolean; // shows the hotel right now; the period is not used
  build: (ctx: ReportContext) => ReportResult;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const when = (date: string, time?: string) => `${formatDate(date)}${time ? ' ' + formatTime(time) : ''}`;

// ---------- money columns ----------

export type Column3 = 'cash' | 'bank' | 'other';
export const COLUMN_LABEL: Record<Column3, string> = { cash: 'CASH', bank: 'ONLINE TRANSFER', other: 'B.T.C. (City Ledger)' };

export function columnFor(mode: PaymentMode): Column3 {
  if (mode === 'Cash') return 'cash';
  if (mode === 'Company / OTA') return 'other';
  return 'bank'; // UPI, card, bank transfer
}

interface MoneyLine {
  key: string;
  date: string;
  time: string;
  shiftId?: string;
  particulars: string;
  ref: string;
  receive: number; // cash in
  payment: number; // cash out
  bank: number;
  other: number;
  narration: string;
  by: string;
  column: Column3;
  account: string; // Cash A/C, UPI, company name...
  cashEntryId?: string;
}

const KIND_TEXT = { advance: 'Advance at check-in', payment: 'Payment during stay', checkout: 'Check-out settlement' } as const;

function moneyLines(guests: Guest[], cash: CashEntry[]): MoneyLine[] {
  const lines: MoneyLine[] = [];
  for (const g of guests) {
    for (const p of g.payments) {
      const column = columnFor(p.mode);
      const refund = p.amount < 0;
      const line: MoneyLine = {
        key: p.id, date: p.date, time: p.time, shiftId: p.shiftId,
        particulars: `${refund ? 'Refund' : KIND_TEXT[p.kind]} @ Room ${g.roomNumber}`,
        ref: g.guestNo,
        receive: 0, payment: 0, bank: 0, other: 0,
        narration: [g.fullName, column === 'other' && g.billTo?.company].filter(Boolean).join(' · '),
        by: p.by ?? '',
        column,
        account: column === 'cash' ? 'Cash A/C' : column === 'bank' ? p.mode : g.billTo?.company || 'Company / OTA (no company on bill)',
      };
      if (column === 'cash') {
        if (refund) line.payment = -p.amount;
        else line.receive = p.amount;
      } else line[column] = p.amount; // a refund shows as a minus
      lines.push(line);
    }
  }
  for (const e of cash) {
    lines.push({
      key: e.id, date: e.date, time: e.time, shiftId: e.shiftId,
      particulars: e.direction === 'out' ? 'Cash paid out' : 'Cash added to drawer',
      ref: '',
      receive: e.direction === 'in' ? e.amount : 0,
      payment: e.direction === 'out' ? e.amount : 0,
      bank: 0, other: 0,
      narration: e.narration,
      by: e.by ?? '',
      column: 'cash',
      account: 'Cash A/C',
      cashEntryId: e.id,
    });
  }
  return lines.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function moneyTotals(lines: MoneyLine[]) {
  return {
    receive: sum(lines.map((l) => l.receive)),
    payment: sum(lines.map((l) => l.payment)),
    bank: sum(lines.map((l) => l.bank)),
    other: sum(lines.map((l) => l.other)),
  };
}

// Cash in hand carries over: everything before the period's start
function openingCash(all: MoneyLine[], p: Period): number {
  const start = p.kind === 'shift' ? `${p.shift!.startDate}T${p.shift!.startTime}` : `${p.from}T00:00`;
  return sum(all.filter((l) => `${l.date}T${l.time}` < start && !hit(p, l.date, l.shiftId)).map((l) => l.receive - l.payment));
}

export function paymentLinesFor(ctx: ReportContext) {
  return moneyLines(ctx.guests, ctx.cash).filter((l) => hit(ctx.period, l.date, l.shiftId));
}

const MONEY_COLS: Column[] = [
  { label: 'Receive', num: true }, { label: 'Payment', num: true }, { label: 'Bank', num: true }, { label: 'Other', num: true },
];

function paymentsReport(ctx: ReportContext): ReportResult {
  const all = moneyLines(ctx.guests, ctx.cash);
  const lines = all.filter((l) => hit(ctx.period, l.date, l.shiftId));
  const t = moneyTotals(lines);
  const opening = openingCash(all, ctx.period);
  const closing = r2(opening + t.receive - t.payment);

  const detail: Section = {
    columns: [
      { label: 'Sr.' }, { label: 'Date' }, { label: 'Particulars' }, { label: 'Bill No' }, ...MONEY_COLS, { label: 'Narration' }, { label: 'By' },
    ],
    rows: [
      ['', formatDate(ctx.period.from), 'Opening Balance', '', opening, '', '', '', '', ''],
      ...lines.map((l, i): Cell[] => [i + 1, when(l.date, l.time), l.particulars, l.ref, l.receive, l.payment, l.bank, l.other, l.narration, l.by]),
      ['', '', 'Total', '', t.receive, t.payment, t.bank, t.other, '', ''],
      ['', '', 'Closing Balance (cash in hand)', '', '', closing, '', '', '', ''],
    ],
    rowKinds: ['balance', ...lines.map(() => undefined), 'total', 'balance'],
  };

  const modeRows = (['cash', 'bank', 'other'] as Column3[]).map((c) => {
    const ct = moneyTotals(lines.filter((l) => l.column === c));
    return [COLUMN_LABEL[c], ct.receive, ct.payment, ct.bank, ct.other];
  });
  const accountRows: Cell[][] = [];
  const kinds: Section['rowKinds'] = [];
  for (const c of ['cash', 'bank', 'other'] as Column3[]) {
    const inCol = lines.filter((l) => l.column === c);
    if (!inCol.length) continue;
    accountRows.push([COLUMN_LABEL[c], '', '', '', '']);
    kinds.push('group');
    for (const account of [...new Set(inCol.map((l) => l.account))].sort()) {
      const at = moneyTotals(inCol.filter((l) => l.account === account));
      accountRows.push([account, at.receive, at.payment, at.bank, at.other]);
      kinds.push(undefined);
    }
  }

  return {
    kpis: [
      { label: 'Cash (net)', value: inr(t.receive - t.payment), sub: `In hand ${inr(closing)}` },
      { label: 'Online', value: inr(t.bank), sub: 'UPI, card, bank transfer' },
      { label: 'City ledger', value: inr(t.other), sub: 'Company / OTA credit' },
      { label: 'Total collected', value: inr(t.receive - t.payment + t.bank + t.other), sub: `${lines.length} ${lines.length === 1 ? "entry" : "entries"}` },
    ],
    sections: [
      detail,
      { title: 'By payment mode', columns: [{ label: 'Payment mode' }, ...MONEY_COLS], rows: modeRows },
      { title: 'By account', columns: [{ label: 'Payment mode' }, ...MONEY_COLS], rows: accountRows, rowKinds: kinds, totals: ['Grand Total', t.receive, t.payment, t.bank, t.other] },
    ],
  };
}

// ---------- shifts ----------

function shiftsReport(ctx: ReportContext): ReportResult {
  const p = ctx.period;
  const shifts = (p.kind === 'shift' ? [p.shift!] : ctx.shifts.filter((s) => s.startDate >= p.from && s.startDate <= p.to))
    .slice()
    .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
  const all = moneyLines(ctx.guests, ctx.cash);
  const row = (s: Shift) => {
    const lines = all.filter((l) => l.shiftId === s.id);
    const t = moneyTotals(lines);
    const ins = ctx.guests.filter((g) => g.checkInShift === s.id).length;
    const outs = ctx.guests.filter((g) => g.checkOutShift === s.id).length;
    const bills = sum(ctx.guests.flatMap((g) => g.charges.filter((c) => c.shiftId === s.id).map((c) => Number(c.amount) || 0)));
    return { s, t, ins, outs, bills };
  };
  const rows = shifts.map(row);
  const totals = {
    ins: rows.reduce((a, r) => a + r.ins, 0),
    outs: rows.reduce((a, r) => a + r.outs, 0),
    receive: sum(rows.map((r) => r.t.receive)),
    payment: sum(rows.map((r) => r.t.payment)),
    bank: sum(rows.map((r) => r.t.bank)),
    other: sum(rows.map((r) => r.t.other)),
    bills: sum(rows.map((r) => r.bills)),
  };

  const byStaff = new Map<string, typeof totals & { shifts: number }>();
  for (const r of rows) {
    const a = byStaff.get(r.s.userName) ?? { shifts: 0, ins: 0, outs: 0, receive: 0, payment: 0, bank: 0, other: 0, bills: 0 };
    byStaff.set(r.s.userName, {
      shifts: a.shifts + 1, ins: a.ins + r.ins, outs: a.outs + r.outs, receive: r2(a.receive + r.t.receive),
      payment: r2(a.payment + r.t.payment), bank: r2(a.bank + r.t.bank), other: r2(a.other + r.t.other), bills: r2(a.bills + r.bills),
    });
  }

  const cols: Column[] = [
    { label: 'Check-ins' }, { label: 'Check-outs' }, { label: 'Cash in', num: true }, { label: 'Cash out', num: true },
    { label: 'Online', num: true }, { label: 'Company credit', num: true }, { label: 'Bills added', num: true },
  ];
  return {
    kpis: [
      { label: 'Shifts', value: String(rows.length) },
      { label: 'Check-ins / outs', value: `${totals.ins} / ${totals.outs}` },
      { label: 'Cash (net)', value: inr(totals.receive - totals.payment) },
      { label: 'Online + credit', value: inr(totals.bank + totals.other) },
    ],
    sections: [
      {
        title: 'Shifts',
        columns: [{ label: 'Staff' }, { label: 'Start' }, { label: 'End' }, ...cols],
        rows: rows.map((r) => [
          r.s.userName, when(r.s.startDate, r.s.startTime), r.s.endDate ? when(r.s.endDate, r.s.endTime) : 'Open',
          r.ins, r.outs, r.t.receive, r.t.payment, r.t.bank, r.t.other, r.bills,
        ]),
        totals: ['Total', '', '', totals.ins, totals.outs, totals.receive, totals.payment, totals.bank, totals.other, totals.bills],
        empty: 'No shifts in this period.',
      },
      {
        title: 'By staff',
        columns: [{ label: 'Staff' }, { label: 'Shifts' }, ...cols],
        rows: [...byStaff.entries()].map(([name, a]) => [name, a.shifts, a.ins, a.outs, a.receive, a.payment, a.bank, a.other, a.bills]),
      },
    ],
  };
}

// ---------- sales & GST ----------

function salesReport(ctx: ReportContext): ReportResult {
  const stays = ctx.guests
    .filter((g) => g.status === 'out' && hit(ctx.period, g.checkOutDate, g.checkOutShift))
    .sort((a, b) => a.guestNo.localeCompare(b.guestNo));
  const lines = stays.map((g) => {
    const b = billFor(g);
    const split = splitGst(b.gst, b.gstRate, ctx.settings.gstin);
    return { g, b, split };
  });
  const byRate = new Map<number, { count: number; taxable: number; central: number; state: number }>();
  for (const { b, split } of lines) {
    const a = byRate.get(b.gstRate) ?? { count: 0, taxable: 0, central: 0, state: 0 };
    byRate.set(b.gstRate, { count: a.count + 1, taxable: r2(a.taxable + b.taxable), central: r2(a.central + split.central), state: r2(a.state + split.state) });
  }
  const T = (f: (x: (typeof lines)[number]) => number) => sum(lines.map(f));
  const stateLabel = splitGst(0, 0, ctx.settings.gstin).stateLabel;
  return {
    kpis: [
      { label: 'Invoices', value: String(lines.length) },
      { label: 'Taxable value', value: inr(T((x) => x.b.taxable)) },
      { label: 'GST', value: inr(T((x) => x.b.gst)) },
      { label: 'Total billed', value: inr(T((x) => x.b.total)) },
    ],
    sections: [
      {
        title: 'Invoices (bills closed at check-out)',
        columns: [
          { label: 'Invoice' }, { label: 'Date' }, { label: 'Guest' }, { label: 'Billed to' }, { label: 'GSTIN' }, { label: 'Nights' },
          { label: 'Taxable', num: true }, { label: 'GST %' }, { label: 'CGST', num: true }, { label: stateLabel, num: true },
          { label: 'Extra bills', num: true }, { label: 'Cover', num: true }, { label: 'Total', num: true }, { label: 'By' },
        ],
        rows: lines.map(({ g, b, split }) => [
          g.guestNo, formatDate(g.checkOutDate), g.fullName, g.billTo?.company ?? '', g.billTo?.gstin ?? '', b.nights,
          b.taxable, `${b.gstRate}%`, split.central, split.state, b.roomOnly ? b.extras : 0, b.roomOnly ? b.cover : 0, b.total, g.checkedOutBy ?? '',
        ]),
        totals: ['Total', '', '', '', '', '', T((x) => x.b.taxable), '', T((x) => x.split.central), T((x) => x.split.state),
          T((x) => (x.b.roomOnly ? x.b.extras : 0)), T((x) => (x.b.roomOnly ? x.b.cover : 0)), T((x) => x.b.total), ''],
        empty: 'No bills closed in this period.',
      },
      {
        title: 'GST summary',
        columns: [{ label: 'GST rate' }, { label: 'Invoices' }, { label: 'Taxable value', num: true }, { label: 'CGST', num: true }, { label: stateLabel, num: true }, { label: 'Total GST', num: true }],
        rows: [...byRate.entries()].sort(([a], [b]) => a - b).map(([rate, a]) => [`${rate}%`, a.count, a.taxable, a.central, a.state, r2(a.central + a.state)]),
      },
    ],
  };
}

// ---------- extra bills ----------

function extrasReport(ctx: ReportContext): ReportResult {
  const items = ctx.guests
    .flatMap((g) => g.charges.map((c) => ({ g, c })))
    .filter(({ c }) => hit(ctx.period, c.date, c.shiftId))
    .sort((a, b) => a.c.date.localeCompare(b.c.date) || a.c.chargeNo.localeCompare(b.c.chargeNo));
  const byType = new Map<string, { count: number; amount: number }>();
  for (const { c } of items) {
    const a = byType.get(c.category) ?? { count: 0, amount: 0 };
    byType.set(c.category, { count: a.count + 1, amount: r2(a.amount + (Number(c.amount) || 0)) });
  }
  const total = sum(items.map(({ c }) => Number(c.amount) || 0));
  const cover = sum(items.filter(({ c }) => c.category === COVER_CHARGE).map(({ c }) => Number(c.amount) || 0));
  return {
    kpis: [
      { label: 'Bills added', value: String(items.length) },
      { label: 'Amount', value: inr(total) },
      { label: 'Cover charges', value: inr(cover) },
    ],
    sections: [
      {
        columns: [{ label: 'Date' }, { label: 'Bill ID' }, { label: 'Guest' }, { label: 'Room' }, { label: 'Type' }, { label: 'Details' }, { label: 'Slip' }, { label: 'Amount', num: true }, { label: 'By' }],
        rows: items.map(({ g, c }) => [formatDate(c.date), c.chargeNo, g.fullName, g.roomNumber, c.category, c.description, c.billNo, Number(c.amount) || 0, c.by ?? '']),
        totals: ['Total', '', '', '', '', '', '', total, ''],
        empty: 'No extra bills in this period.',
      },
      {
        title: 'By type',
        columns: [{ label: 'Type' }, { label: 'Bills' }, { label: 'Amount', num: true }],
        rows: [...byType.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, a]) => [t, a.count, a.amount]),
      },
    ],
  };
}

// ---------- occupancy ----------

// Was the guest in the room on the night of `d`? A same-day check-out counts as one night.
function staysNight(g: Guest, d: string, today: string): boolean {
  if (d < g.checkInDate) return false;
  if (g.status === 'in') return d <= today;
  return d < g.checkOutDate || (g.checkOutDate <= g.checkInDate && d === g.checkInDate);
}

function occupancyReport(ctx: ReportContext): ReportResult {
  const today = todayStr();
  const end = ctx.period.to > today ? today : ctx.period.to;
  const days: string[] = [];
  for (let d = ctx.period.from; d <= end && days.length < 400; d = addDays(d, 1)) days.push(d);
  const total = ctx.rooms.length || 1;
  const rows = days.map((d) => {
    const stays = ctx.guests.filter((g) => staysNight(g, d, today));
    const revenue = sum(stays.map(rateBeforeGst));
    return { d, occupied: stays.length, revenue };
  });
  const nights = rows.reduce((a, r) => a + r.occupied, 0);
  const revenue = sum(rows.map((r) => r.revenue));
  const available = total * rows.length || 1;
  const pct = (n: number, of: number) => `${Math.round((n / of) * 1000) / 10}%`;
  return {
    kpis: [
      { label: 'Occupancy', value: pct(nights, available), sub: `${nights} room nights of ${available}` },
      { label: 'Room revenue', value: inr(revenue), sub: 'Before GST' },
      { label: 'Average room rate', value: inr(nights ? r2(revenue / nights) : 0), sub: 'ARR' },
      { label: 'RevPAR', value: inr(r2(revenue / available)), sub: 'Revenue per available room' },
    ],
    sections: [
      {
        columns: [{ label: 'Date' }, { label: 'Rooms' }, { label: 'Occupied' }, { label: 'Occupancy' }, { label: 'Room revenue', num: true }, { label: 'ARR', num: true }, { label: 'RevPAR', num: true }],
        rows: rows.map((r) => [formatDate(r.d), total, r.occupied, pct(r.occupied, total), r.revenue, r.occupied ? r2(r.revenue / r.occupied) : 0, r2(r.revenue / total)]),
        totals: ['Total', available, nights, pct(nights, available), revenue, nights ? r2(revenue / nights) : 0, r2(revenue / available)],
        empty: 'No days in this period yet.',
      },
    ],
  };
}

// ---------- registers ----------

function idOf(g: Guest): string {
  return g.nationality === 'Foreign' ? `Passport ${g.passportNumber}` : g.idNumber ? `${g.idType} ${g.idNumber}` : '';
}

function checkinsReport(ctx: ReportContext): ReportResult {
  const list = ctx.guests
    .filter((g) => hit(ctx.period, g.checkInDate, g.checkInShift))
    .sort((a, b) => (a.checkInDate + a.checkInTime).localeCompare(b.checkInDate + b.checkInTime));
  return {
    kpis: [
      { label: 'Check-ins', value: String(list.length) },
      { label: 'Guests', value: String(list.reduce((a, g) => a + g.adults + g.children, 0)), sub: 'Adults + children' },
      { label: 'Foreign', value: String(list.filter((g) => g.nationality === 'Foreign').length) },
    ],
    sections: [{
      columns: [{ label: 'Bill' }, { label: 'Check-in' }, { label: 'Name' }, { label: 'Mobile' }, { label: 'Nationality' }, { label: 'ID' }, { label: 'Room' }, { label: 'Pax' }, { label: 'From' }, { label: 'Purpose' }, { label: 'By' }],
      rows: list.map((g) => [
        g.guestNo, when(g.checkInDate, g.checkInTime), g.fullName, g.phone, g.nationality === 'Foreign' ? g.country : 'Indian', idOf(g),
        g.roomNumber, `${g.adults}A ${g.children}C`, [g.city, g.state, g.addressCountry].filter(Boolean).join(', '), g.purpose, g.checkedInBy ?? '',
      ]),
      empty: 'No check-ins in this period.',
    }],
  };
}

function checkoutsReport(ctx: ReportContext): ReportResult {
  const list = ctx.guests
    .filter((g) => g.status === 'out' && hit(ctx.period, g.checkOutDate, g.checkOutShift))
    .sort((a, b) => (a.checkOutDate + a.checkOutTime).localeCompare(b.checkOutDate + b.checkOutTime));
  const bills = list.map((g) => ({ g, b: billFor(g) }));
  return {
    kpis: [
      { label: 'Check-outs', value: String(list.length) },
      { label: 'Billed', value: inr(sum(bills.map((x) => x.b.total))) },
    ],
    sections: [{
      columns: [{ label: 'Bill' }, { label: 'Name' }, { label: 'Room' }, { label: 'Check-in' }, { label: 'Check-out' }, { label: 'Nights' }, { label: 'Total', num: true }, { label: 'Paid by' }, { label: 'By' }],
      rows: bills.map(({ g, b }) => [
        g.guestNo, g.fullName, g.roomNumber, when(g.checkInDate, g.checkInTime), when(g.checkOutDate, g.checkOutTime), b.nights, b.total,
        [...new Set(g.payments.filter((p) => p.amount > 0).map((p) => p.mode))].join(', '), g.checkedOutBy ?? '',
      ]),
      totals: ['Total', '', '', '', '', sum(bills.map((x) => x.b.nights)), sum(bills.map((x) => x.b.total)), '', ''],
      empty: 'No check-outs in this period.',
    }],
  };
}

function foreignReport(ctx: ReportContext): ReportResult {
  const p = ctx.period;
  const today = todayStr();
  const overlaps = (g: Guest) =>
    p.kind === 'shift' ? g.checkInShift === p.shift!.id : g.checkInDate <= p.to && (g.status === 'in' ? today >= p.from : g.checkOutDate >= p.from);
  const rows: Cell[][] = [];
  for (const g of ctx.guests.filter(overlaps).sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))) {
    const stay = [when(g.checkInDate, g.checkInTime), g.status === 'out' ? when(g.checkOutDate, g.checkOutTime) : 'In-house', g.roomNumber];
    if (g.nationality === 'Foreign') {
      rows.push([g.fullName, g.country, g.passportNumber, formatDate(g.passportExpiry), `${g.visaNumber} ${g.visaType}`.trim(), formatDate(g.visaExpiry), formatDate(g.arrivalInIndia), ...stay, g.goingTo]);
    }
    for (const c of g.companions.filter((c) => c.nationality === 'Foreign')) {
      rows.push([`${c.name} (with ${g.fullName})`, c.country, c.idNumber, formatDate(c.passportExpiry), c.visaNumber, formatDate(c.visaExpiry), '', ...stay, g.goingTo]);
    }
  }
  return {
    kpis: [{ label: 'Foreign guests', value: String(rows.length), sub: 'Including other adults in the room' }],
    sections: [{
      title: 'Form C details',
      columns: [{ label: 'Name' }, { label: 'Country' }, { label: 'Passport' }, { label: 'Passport expiry' }, { label: 'Visa' }, { label: 'Visa expiry' }, { label: 'Arrived in India' }, { label: 'Check-in' }, { label: 'Check-out' }, { label: 'Room' }, { label: 'Next destination' }],
      rows,
      empty: 'No foreign guests in this period.',
    }],
  };
}

function inhouseReport(ctx: ReportContext): ReportResult {
  const list = ctx.guests
    .filter((g) => g.status === 'in')
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
  const bills = list.map((g) => ({ g, b: billFor(g) }));
  const T = (f: (x: (typeof bills)[number]) => number) => sum(bills.map(f));
  return {
    kpis: [
      { label: 'In-house', value: String(list.length), sub: `${ctx.rooms.length} rooms` },
      { label: 'Billed so far', value: inr(T((x) => x.b.total)) },
      { label: 'Paid', value: inr(T((x) => x.b.paid)) },
      { label: 'Balance to collect', value: inr(T((x) => x.b.balance)) },
    ],
    sections: [{
      columns: [{ label: 'Room' }, { label: 'Guest' }, { label: 'Bill' }, { label: 'Check-in' }, { label: 'Due out' }, { label: 'Nights' }, { label: 'Total so far', num: true }, { label: 'Paid', num: true }, { label: 'Balance', num: true }, { label: 'Billed to' }],
      rows: bills.map(({ g, b }) => [
        g.roomNumber, g.fullName, g.guestNo, formatDate(g.checkInDate), g.checkOutDate ? formatDate(g.checkOutDate) : 'Not set', b.nights, b.total, b.paid, b.balance, g.billTo?.company ?? 'Guest',
      ]),
      totals: ['Total', '', '', '', '', T((x) => x.b.nights), T((x) => x.b.total), T((x) => x.b.paid), T((x) => x.b.balance), ''],
      empty: 'No guests in-house.',
    }],
  };
}

function ledgerReport(ctx: ReportContext): ReportResult {
  const items = ctx.guests
    .flatMap((g) => g.payments.filter((p) => p.mode === 'Company / OTA').map((p) => ({ g, p })))
    .filter(({ p }) => hit(ctx.period, p.date, p.shiftId))
    .sort((a, b) => a.p.date.localeCompare(b.p.date));
  const company = (g: Guest) => g.billTo?.company || 'Company / OTA (no company on bill)';
  const byCompany = new Map<string, { gstin: string; bills: Set<string>; amount: number }>();
  for (const { g, p } of items) {
    const a = byCompany.get(company(g)) ?? { gstin: g.billTo?.gstin ?? '', bills: new Set<string>(), amount: 0 };
    a.bills.add(g.guestNo);
    a.amount = r2(a.amount + p.amount);
    byCompany.set(company(g), a);
  }
  const total = sum(items.map(({ p }) => p.amount));
  return {
    kpis: [
      { label: 'On company credit', value: inr(total), sub: 'To be collected from companies / OTAs' },
      { label: 'Companies', value: String(byCompany.size) },
    ],
    sections: [
      {
        title: 'By company',
        columns: [{ label: 'Company' }, { label: 'GSTIN' }, { label: 'Bills' }, { label: 'Amount', num: true }],
        rows: [...byCompany.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, a]) => [name, a.gstin, [...a.bills].join(', '), a.amount]),
        totals: ['Total', '', '', total],
        empty: 'Nothing billed to companies in this period.',
      },
      {
        title: 'Entries',
        columns: [{ label: 'Date' }, { label: 'Company' }, { label: 'Bill' }, { label: 'Guest' }, { label: 'Amount', num: true }, { label: 'By' }],
        rows: items.map(({ g, p }) => [formatDate(p.date), company(g), g.guestNo, g.fullName, p.amount, p.by ?? '']),
      },
    ],
  };
}

function movesReport(ctx: ReportContext): ReportResult {
  const moves = ctx.guests
    .flatMap((g) => g.roomMoves.map((m) => ({ g, m })))
    .filter(({ m }) => hit(ctx.period, m.date, m.shiftId))
    .sort((a, b) => (a.m.date + a.m.time).localeCompare(b.m.date + b.m.time));
  return {
    kpis: [{ label: 'Room changes', value: String(moves.length) }],
    sections: [{
      columns: [{ label: 'Date' }, { label: 'Guest' }, { label: 'Bill' }, { label: 'From' }, { label: 'To' }, { label: 'Reason' }, { label: 'By' }],
      rows: moves.map(({ g, m }) => [when(m.date, m.time), g.fullName, g.guestNo, `${m.from} ${m.fromType}`, `${m.to} ${m.toType}`, m.reason, m.by ?? '']),
      empty: 'No room changes in this period.',
    }],
  };
}

export const REPORTS: ReportDef[] = [
  { id: 'payments', name: 'Payment detail', description: 'Cash book: every payment by cash, online and company credit, with cash in hand', build: paymentsReport },
  { id: 'shifts', name: 'Shift summary', description: 'Each shift and each staff member: check-ins, check-outs and money taken', build: shiftsReport },
  { id: 'sales', name: 'Sales & GST', description: 'Tax invoices closed at check-out with CGST / SGST, and the GST summary by rate', build: salesReport },
  { id: 'extras', name: 'Extra bills', description: 'Food, laundry, cover charges and other bills added, by type', build: extrasReport },
  { id: 'occupancy', name: 'Occupancy', description: 'Rooms sold each night, occupancy %, room revenue, ARR and RevPAR', build: occupancyReport },
  { id: 'checkins', name: 'Check-ins', description: 'Arrivals register with ID details', build: checkinsReport },
  { id: 'checkouts', name: 'Check-outs', description: 'Departures with bill totals and payment modes', build: checkoutsReport },
  { id: 'foreign', name: 'Foreign guests (Form C)', description: 'Passport and visa details of foreign guests who stayed in the period', build: foreignReport },
  { id: 'inhouse', name: 'In-house & balances', description: 'Guests in the hotel right now and what they owe', snapshot: true, build: inhouseReport },
  { id: 'ledger', name: 'Company credit', description: 'Amounts billed to companies and OTAs (city ledger), by company', build: ledgerReport },
  { id: 'moves', name: 'Room movement', description: 'Guests who changed rooms, with reasons', build: movesReport },
];

export function reportCsv(def: ReportDef, period: Period, result: ReportResult, preparedBy: string): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const out: string[] = [esc(def.name), esc(def.snapshot ? `As of ${formatDate(todayStr())}` : period.label), esc(`Prepared by ${preparedBy}`), ''];
  for (const s of result.sections) {
    if (s.title) out.push(esc(s.title));
    out.push(s.columns.map((c) => esc(c.label)).join(','));
    for (const r of s.rows) out.push(r.map(esc).join(','));
    if (s.totals) out.push(s.totals.map(esc).join(','));
    out.push('');
  }
  return out.join('\n');
}
