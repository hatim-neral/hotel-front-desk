import type { ReportResult, Section } from '../reports';

// Plain number for report tables: 14,300.00
const amt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cell(v: string | number, num?: boolean) {
  if (num && typeof v === 'number') return amt(v);
  return v;
}

export function ReportTable({ section }: { section: Section }) {
  const cols = section.columns;
  return (
    <section className="card report-card">
      {section.title && <h2 className="card-title">{section.title}</h2>}
      <div className="report-scroll">
        <table className="report">
          <thead>
            <tr>{cols.map((c, i) => <th key={i} className={c.num ? 'num' : undefined}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {section.rows.map((r, i) => (
              <tr key={i} className={section.rowKinds?.[i] ? `report-${section.rowKinds[i]}` : undefined}>
                {r.map((v, j) => <td key={j} className={cols[j]?.num ? 'num' : undefined}>{cell(v, cols[j]?.num)}</td>)}
              </tr>
            ))}
            {!section.rows.length && (
              <tr><td colSpan={cols.length} className="muted">{section.empty ?? 'Nothing to show.'}</td></tr>
            )}
            {section.totals && section.rows.length > 0 && (
              <tr className="report-total">
                {section.totals.map((v, j) => <td key={j} className={cols[j]?.num ? 'num' : undefined}>{cell(v, cols[j]?.num)}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ReportView({ result }: { result: ReportResult }) {
  return (
    <>
      {result.kpis.length > 0 && (
        <div className="kpis report-kpis">
          {result.kpis.map((k) => (
            <div key={k.label} className="kpi">
              <span className="kpi-num">{k.value}</span>
              <span className="kpi-label">{k.label}</span>
              {k.sub && <span className="kpi-sub">{k.sub}</span>}
            </div>
          ))}
        </div>
      )}
      {result.sections.map((s, i) => <ReportTable key={i} section={s} />)}
    </>
  );
}
