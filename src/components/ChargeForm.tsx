import { useState } from 'react';
import type { Charge } from '../types';
import { CHARGE_CATEGORIES, COVER_CHARGE } from '../types';
import { newId } from '../storage';
import { Field, Segmented } from './ui';
import { todayStr } from '../utils';

const blank = (category = 'Food'): Charge => ({ id: newId(), chargeNo: '', billNo: '', category, description: '', amount: '', date: todayStr() });

// The bill entry form: amount, type, optional slip number, details. The bill gets its own ID
// (e.g. HSL000001-02) when it is added to the stay. Used on the guest page and the Add Bill screen.
export function ChargeForm({
  existingBillNos, onAdd, onCancel, submitLabel = 'Add to bill', category,
}: {
  existingBillNos: string[];
  onAdd: (c: Charge) => void;
  onCancel?: () => void;
  submitLabel?: string;
  category?: string; // start on this type, e.g. the cover charge
}) {
  const [c, setC] = useState<Charge>(() => blank(category));
  const cover = c.category === COVER_CHARGE;
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (c.billNo.trim() && existingBillNos.includes(c.billNo.trim().toLowerCase())) errs.billNo = 'A bill with this slip number is already added';
    if (!(Number(c.amount) > 0)) errs.amount = 'Enter the amount';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onAdd({ ...c, billNo: c.billNo.trim(), description: c.description.trim() });
    setC(blank(category));
  };

  return (
    <form className="form add-charge no-print" onSubmit={submit} noValidate>
      <div className="grid">
        <Field label="Amount (₹)" required error={errors.amount}>
          <input inputMode="decimal" value={c.amount} onChange={(e) => setC({ ...c, amount: e.target.value.replace(/[^\d.]/g, '') })} autoFocus />
        </Field>
        <Field label="Slip / KOT no." hint="Optional" error={errors.billNo}>
          <input value={c.billNo} onChange={(e) => setC({ ...c, billNo: e.target.value.toUpperCase() })} autoComplete="off" />
        </Field>
        <Field label="Date">
          <input type="date" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} />
        </Field>
        <Field label="Type" wide>
          <Segmented options={CHARGE_CATEGORIES} value={c.category} onChange={(v) => setC({ ...c, category: v })} />
        </Field>
        <Field label={cover ? 'Reason (optional)' : 'Details (optional)'} wide>
          <input
            value={c.description}
            placeholder={cover ? 'e.g. Broken lamp, stained bedsheet, missing towel' : 'e.g. Dinner — 2 thali'}
            onChange={(e) => setC({ ...c, description: e.target.value })}
          />
        </Field>
      </div>
      <div className="actions">
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn btn-primary">{submitLabel}</button>
      </div>
    </form>
  );
}

// "+ Add bill" and "+ Cover charge" buttons that open the form in place.
export function AddCharge({ existingBillNos, onAdd }: { existingBillNos: string[]; onAdd: (c: Charge) => void }) {
  const [open, setOpen] = useState<'' | 'bill' | 'cover'>('');
  if (!open) {
    return (
      <div className="no-print add-charge-btn">
        <button className="btn btn-primary" onClick={() => setOpen('bill')}>+ Add bill (food, laundry…)</button>
        <button className="btn" onClick={() => setOpen('cover')}>+ Cover charge (damage etc.)</button>
      </div>
    );
  }
  return (
    <ChargeForm
      category={open === 'cover' ? COVER_CHARGE : undefined}
      submitLabel={open === 'cover' ? 'Add cover charge' : undefined}
      existingBillNos={existingBillNos}
      onCancel={() => setOpen('')}
      onAdd={(c) => {
        onAdd(c);
        setOpen('');
      }}
    />
  );
}
