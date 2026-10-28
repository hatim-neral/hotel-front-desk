import type { Payment } from '../types';
import { PAYMENT_MODES } from '../types';
import { draftTotal, type PaymentDraft } from '../payments';
import { formatDate, rupees } from '../utils';

// Amount + mode rows. "Split payment" adds a row pre-filled with what is still left of `target`.
export function PaymentRows({
  rows, onChange, target,
}: {
  rows: PaymentDraft[];
  onChange: (rows: PaymentDraft[]) => void;
  target?: number;
}) {
  const set = (i: number, patch: Partial<PaymentDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const left = target === undefined ? 0 : Math.max(0, Math.round((target - draftTotal(rows)) * 100) / 100);
  const usedModes = rows.map((r) => r.mode);
  const nextMode = PAYMENT_MODES.find((m) => !usedModes.includes(m)) ?? 'Cash';

  return (
    <div className="pay-rows">
      {rows.map((r, i) => (
        <div key={i} className="pay-row">
          <div className="pay-amount">
            <span className="pay-currency">₹</span>
            <input
              inputMode="decimal"
              value={r.amount}
              placeholder="0"
              aria-label={`Payment ${i + 1} amount`}
              onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d.]/g, '') })}
            />
          </div>
          <div className="pay-modes" role="radiogroup" aria-label={`Payment ${i + 1} mode`}>
            {PAYMENT_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={r.mode === m}
                className={r.mode === m ? 'active' : ''}
                onClick={() => set(i, { mode: m })}
              >
                {m}
              </button>
            ))}
          </div>
          {rows.length > 1 && (
            <button type="button" className="icon-btn" aria-label="Remove this payment" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="link"
        onClick={() => onChange([...rows, { amount: target !== undefined && left > 0 ? String(left) : '', mode: nextMode }])}
      >
        + Split payment (add another mode)
      </button>
    </div>
  );
}

// The payments already made on a bill, for the bill summary.
export function PaymentLines({ payments, onRemove }: { payments: Payment[]; onRemove?: (p: Payment) => void }) {
  const label = { advance: 'advance', payment: 'during stay', checkout: 'at check-out' } as const;
  return (
    <>
      {payments.map((p) => (
        <div key={p.id} className="pay-line">
          <dt>
            {p.amount < 0 ? 'Refunded' : 'Paid'} · <strong>{p.mode}</strong>
            <span className="muted"> · {formatDate(p.date)}, {label[p.kind]}</span>
            {onRemove && (
              <button type="button" className="link danger-text no-print pay-remove" onClick={() => onRemove(p)}>
                remove
              </button>
            )}
          </dt>
          <dd>{p.amount < 0 ? '+ ' : '− '}{rupees(Math.abs(p.amount))}</dd>
        </div>
      ))}
    </>
  );
}
