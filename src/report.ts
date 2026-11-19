// The "All Payment Detail Report": every payment taken in a date range, in three columns like the
// hotel's paper cash book — cash (Receive / Payment), online (Bank) and company credit (Other).
import type { CashEntry, Guest, PaymentMode } from './types';

export type Column = 'cash' | 'bank' | 'other';

export const COLUMN_LABEL: Record<Column, string> = {
  cash: 'CASH',
  bank: 'ONLINE TRANSFER',
  other: 'B.T.C. (City Ledger)',
};

export function columnFor(mode: PaymentMode): Column {
  if (mode === 'Cash') return 'cash';
  if (mode === 'Company / OTA') return 'other';
  return 'bank'; // UPI, card, bank transfer
}

export interface ReportLine {
  key: string;
  date: string;
  time: string;
  particulars: string;
  ref: string; // bill ID
  receive: number; // cash in
  payment: number; // cash out (refunds, cash handed over)
  bank: number;
  other: number;
  narration: string;
  column: Column;
  account: string; // sub-ledger for the summary: Cash A/C, UPI, company name...
  cashEntryId?: string;
}

const KIND_TEXT = { advance: 'Advance at check-in', payment: 'Payment during stay', checkout: 'Check-out settlement' } as const;

function allLines(guests: Guest[], cash: CashEntry[]): ReportLine[] {
  const lines: ReportLine[] = [];
  for (const g of guests) {
    for (const p of g.payments) {
      const column = columnFor(p.mode);
      const refund = p.amount < 0;
      const line: ReportLine = {
        key: p.id,
        date: p.date,
        time: p.time,
        particulars: `${refund ? 'Refund' : KIND_TEXT[p.kind]} @ Room ${g.roomNumber}`,
        ref: g.guestNo,
        receive: 0, payment: 0, bank: 0, other: 0,
        narration: [g.fullName, column === 'other' && g.billTo?.company].filter(Boolean).join(' · '),
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
      key: e.id,
      date: e.date,
      time: e.time,
      particulars: e.direction === 'out' ? 'Cash paid out' : 'Cash added to drawer',
      ref: '',
      receive: e.direction === 'in' ? e.amount : 0,
      payment: e.direction === 'out' ? e.amount : 0,
      bank: 0, other: 0,
      narration: e.narration,
      column: 'cash',
      account: 'Cash A/C',
      cashEntryId: e.id,
    });
  }
  return lines.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (lines: ReportLine[], f: (l: ReportLine) => number) => r2(lines.reduce((s, l) => s + f(l), 0));

export function buildReport(guests: Guest[], cash: CashEntry[], from: string, to: string) {
  const all = allLines(guests, cash);
  const lines = all.filter((l) => l.date >= from && l.date <= to);
  // Cash in hand carries over from day to day
  const opening = sum(all.filter((l) => l.date < from), (l) => l.receive - l.payment);
  const totals = {
    receive: sum(lines, (l) => l.receive),
    payment: sum(lines, (l) => l.payment),
    bank: sum(lines, (l) => l.bank),
    other: sum(lines, (l) => l.other),
  };
  const closing = r2(opening + totals.receive - totals.payment);

  // Summary by account within each column, e.g. ONLINE TRANSFER -> UPI, Card
  const groups = (['cash', 'bank', 'other'] as Column[]).map((column) => {
    const accounts = new Map<string, { receive: number; payment: number; bank: number; other: number }>();
    for (const l of lines.filter((x) => x.column === column)) {
      const a = accounts.get(l.account) ?? { receive: 0, payment: 0, bank: 0, other: 0 };
      a.receive = r2(a.receive + l.receive);
      a.payment = r2(a.payment + l.payment);
      a.bank = r2(a.bank + l.bank);
      a.other = r2(a.other + l.other);
      accounts.set(l.account, a);
    }
    const inColumn = lines.filter((x) => x.column === column);
    return {
      column,
      label: COLUMN_LABEL[column],
      total: {
        receive: sum(inColumn, (l) => l.receive),
        payment: sum(inColumn, (l) => l.payment),
        bank: sum(inColumn, (l) => l.bank),
        other: sum(inColumn, (l) => l.other),
      },
      accounts: [...accounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    };
  });

  return { lines, opening, totals, closing, groups };
}

export function reportCsv(report: ReturnType<typeof buildReport>): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Sr.No', 'Date', 'Time', 'Particulars', 'Bill No', 'Receive', 'Payment', 'Bank', 'Other', 'Narration'];
  const rows = report.lines.map((l, i) =>
    [i + 1, l.date, l.time, l.particulars, l.ref, l.receive, l.payment, l.bank, l.other, l.narration].map(esc).join(','),
  );
  const t = report.totals;
  return [
    head.join(','),
    ['', '', '', 'Opening Balance', '', report.opening, '', '', '', ''].map(esc).join(','),
    ...rows,
    ['', '', '', 'Total', '', t.receive, t.payment, t.bank, t.other, ''].map(esc).join(','),
    ['', '', '', 'Closing Balance (cash in hand)', '', report.closing, '', '', '', ''].map(esc).join(','),
  ].join('\n');
}
