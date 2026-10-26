import type { ReactNode } from 'react';

export function Field({
  label, required, error, hint, wide, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${wide ? ' wide' : ''}${error ? ' has-error' : ''}`}>
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: readonly T[];
  value: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={value === o ? 'active' : ''}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      <div className="grid">{children}</div>
    </section>
  );
}

export function StatusBadge({ status, dueOut }: { status: 'in' | 'out'; dueOut?: boolean }) {
  if (status === 'out') return <span className="badge badge-out">Checked out</span>;
  if (dueOut) return <span className="badge badge-due">Due out</span>;
  return <span className="badge badge-in">In-house</span>;
}
