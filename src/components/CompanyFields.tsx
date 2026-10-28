import type { BillTo } from '../types';
import type { Errors } from '../validation';
import { Field } from './ui';

// Company name, GST number and billing address for a bill paid by a company.
export default function CompanyFields({
  value, onChange, errors = {},
}: {
  value: BillTo;
  onChange: (v: BillTo) => void;
  errors?: Errors;
}) {
  return (
    <div className="grid wide">
      <Field label="Company name" required error={errors['billTo.company']}>
        <input value={value.company} onChange={(e) => onChange({ ...value, company: e.target.value })} autoComplete="organization" />
      </Field>
      <Field label="Company GST number (GSTIN)" required error={errors['billTo.gstin']} hint="15 characters, e.g. 27ABCDE1234F1Z5">
        <input
          className="mono"
          value={value.gstin}
          maxLength={15}
          onChange={(e) => onChange({ ...value, gstin: e.target.value.toUpperCase().replace(/\s/g, '') })}
          autoComplete="off"
        />
      </Field>
      <Field label="Company billing address" hint="Optional" wide>
        <textarea rows={2} value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />
      </Field>
    </div>
  );
}
