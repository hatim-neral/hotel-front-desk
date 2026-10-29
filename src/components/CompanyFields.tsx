import type { BillTo } from '../types';
import type { Errors } from '../validation';
import { gstState } from '../gst';
import { isValidGstin } from '../validation';
import { Field } from './ui';

// Company details for a bill paid by a company: name and GST number (required), then billing
// address and a contact person, phone and email for sending the invoice.
export default function CompanyFields({
  value, onChange, errors = {},
}: {
  value: BillTo;
  onChange: (v: BillTo) => void;
  errors?: Errors;
}) {
  const set = (patch: Partial<BillTo>) => onChange({ ...value, ...patch });
  const state = isValidGstin(value.gstin) ? gstState(value.gstin) : undefined;
  return (
    <div className="grid wide">
      <Field label="Company name" required error={errors['billTo.company']}>
        <input value={value.company} onChange={(e) => set({ company: e.target.value })} autoComplete="organization" />
      </Field>
      <Field
        label="Company GST number (GSTIN)"
        required
        error={errors['billTo.gstin']}
        hint={state ? `Registered in ${state.name}` : '15 characters, e.g. 27ABCDE1234F1Z5'}
      >
        <input
          className="mono"
          value={value.gstin}
          maxLength={15}
          onChange={(e) => set({ gstin: e.target.value.toUpperCase().replace(/\s/g, '') })}
          autoComplete="off"
        />
      </Field>
      <Field label="Company billing address" hint="Optional" wide>
        <textarea rows={2} value={value.address} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <Field label="Contact person" hint="Optional">
        <input value={value.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} autoComplete="off" />
      </Field>
      <Field label="Company phone" hint="Optional" error={errors['billTo.phone']}>
        <input type="tel" inputMode="tel" value={value.phone} onChange={(e) => set({ phone: e.target.value })} />
      </Field>
      <Field label="Company email (for the invoice)" hint="Optional" error={errors['billTo.email']}>
        <input type="email" value={value.email} onChange={(e) => set({ email: e.target.value.trim() })} />
      </Field>
    </div>
  );
}
