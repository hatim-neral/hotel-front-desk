import type { Payment, PaymentMode } from './types';
import { newId } from './storage';
import { nowTime, todayStr } from './utils';

// A payment row being filled in on screen
export interface PaymentDraft {
  id?: string; // set when editing a saved payment
  amount: string;
  mode: PaymentMode;
  date?: string;
  time?: string;
}

export const draftTotal = (rows: PaymentDraft[]) => rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

// Turns filled-in rows into saved payments. `sign` -1 records refunds.
export function toPayments(rows: PaymentDraft[], kind: Payment['kind'], sign = 1): Payment[] {
  return rows
    .filter((r) => Number(r.amount) > 0)
    .map((r) => ({
      id: r.id ?? newId(),
      amount: sign * Number(r.amount),
      mode: r.mode,
      kind,
      date: r.date ?? todayStr(),
      time: r.time ?? nowTime(),
    }));
}
