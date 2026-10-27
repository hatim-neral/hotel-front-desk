import { useState } from 'react';
import type { Charge } from '../types';
import { CHARGE_CATEGORIES } from '../types';
import { newId } from '../storage';
import { Field, Segmented } from './ui';
import { todayStr } from '../utils';

const blank = (): Charge => ({ id: newId(), billNo: '', category: 'Food', description: '', amount: '', date: todayStr() });

// The bill entry form: bill number, amount, type, details. Used on the guest page and the Add Bill screen.
export function ChargeForm({
  existingBillNos, onAdd, onCancel, submitLabel = 'Add to bill',
}: {
  existingBillNos: string[];
  onAdd: (c: Charge) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [c, setC] = useState<Charge>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!c.billNo.trim()) errs.billNo = 'Enter the bill number';
    else if (existingBillNos.includes(c.billNo.trim().toLowerCase())) errs.billNo = 'This bill is already added';
    if (!(Number(c.amount) > 0)) errs.amount = 'Enter the amount';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onAdd({ ...c, billNo: c.billNo.trim(), description: c.description.trim() });
    setC(blank());
  };

  return (
    <form className="form add-charge no-print" onSubmit={submit} noValidate>
      <div className="grid">
        <Field label="Bill number" required error={errors.billNo}>
          <input value={c.billNo} onChange={(e) => setC({ ...c, billNo: e.target.value.toUpperCase() })} autoFocus autoComplete="off" />
        </Field>
        <Field label="Amount (₹)" required error={errors.amount}>
          <input inputMode="decimal" value={c.amount} onChange={(e) => setC({ ...c, amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </Field>
        <Field label="Date">
          <input type="date" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} />
        </Field>
        <Field label="Type" wide>
          <Segmented options={CHARGE_CATEGORIES} value={c.category} onChange={(v) => setC({ ...c, category: v })} />
        </Field>
        <Field label="Details (optional)" wide>
          <input value={c.description} placeholder="e.g. Dinner — 2 thali" onChange={(e) => setC({ ...c, description: e.target.value })} />
        </Field>
      </div>
      <div className="actions">
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn btn-primary">{submitLabel}</button>
      </div>
    </form>
  );
}

// "+ Add bill" button that opens the form in place.
export function AddCharge({ existingBillNos, onAdd }: { existingBillNos: string[]; onAdd: (c: Charge) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="no-print add-charge-btn">
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Add bill (food, laundry…)</button>
      </div>
    );
  }
  return (
    <ChargeForm
      existingBillNos={existingBillNos}
      onCancel={() => setOpen(false)}
      onAdd={(c) => {
        onAdd(c);
        setOpen(false);
      }}
    />
  );
}
