import { useState } from 'react';
import type { Charge, Guest, PaymentMode, Settings } from '../types';
import { CHARGE_CATEGORIES, PAYMENT_MODES } from '../types';
import { deleteGuest, newId, saveGuest, takeInvoiceNumber } from '../storage';
import { Field, Segmented, StatusBadge } from '../components/ui';
import IdPhotos from '../components/IdPhotos';
import {
  billFor, formatAadhaar, formatDate, formatTime, go, isDueOutToday, maskId, nowTime, rupees, todayStr,
} from '../utils';

export default function GuestDetail({
  guest: g, settings, onChanged, startCheckout,
}: {
  guest?: Guest;
  settings: Settings;
  onChanged: (msg: string) => void;
  startCheckout?: boolean; // opened from the Check-Out screen: show the confirm step straight away
}) {
  const [showId, setShowId] = useState(false);
  const [confirmOut, setConfirmOut] = useState(!!startCheckout && g?.status === 'in');
  const [payMode, setPayMode] = useState<PaymentMode>('Cash');

  if (!g) return <p className="muted">Guest not found. <a href="#/">Go home</a></p>;

  const isIndian = g.nationality === 'Indian';
  const inHouse = g.status === 'in';
  const fullId = isIndian ? (g.idType === 'Aadhaar' ? formatAadhaar(g.idNumber) : g.idNumber) : g.passportNumber;
  const bill = billFor(g);

  const saveCharges = async (charges: Charge[], msg: string) => {
    await saveGuest({ ...g, charges });
    onChanged(msg);
  };

  const checkOut = async () => {
    await saveGuest({
      ...g,
      status: 'out',
      checkOutDate: todayStr(),
      checkOutTime: nowTime(),
      checkedOutAt: new Date().toISOString(),
      invoiceNo: await takeInvoiceNumber(),
      finalPayment: { amount: bill.balance, mode: payMode },
    });
    setConfirmOut(false);
    onChanged(`${g.fullName} checked out of room ${g.roomNumber}`);
  };

  const remove = async () => {
    if (!confirm(`Delete the record of ${g.fullName}? This cannot be undone.`)) return;
    await deleteGuest(g.id);
    onChanged('Record deleted');
    go('guests/all');
  };

  const rows: [string, string][] = [
    ['Mobile', g.phone],
    ['Email', g.email],
    ['Gender', g.gender],
    ['Date of birth', formatDate(g.dob)],
    ['Citizenship', isIndian ? 'Indian' : `Foreign — ${g.country}`],
    ...(!isIndian || g.idType === 'Passport'
      ? ([
          ['Passport issued', [formatDate(g.passportIssueDate), g.passportPlaceOfIssue].filter((v) => v && v !== '—').join(', ')],
          ['Passport expiry', formatDate(g.passportExpiry)],
        ] as [string, string][])
      : []),
    ...(isIndian
      ? []
      : ([
          ['Visa', `${g.visaNumber}${g.visaType ? ` (${g.visaType})` : ''}`],
          ['Visa issued', [formatDate(g.visaIssueDate), g.visaPlaceOfIssue].filter((v) => v && v !== '—').join(', ')],
          ['Visa expiry', formatDate(g.visaExpiry)],
          ['Arrived in India', formatDate(g.arrivalInIndia)],
        ] as [string, string][])),
    ['Address', [g.address, g.city, g.state, g.pincode, g.addressCountry].filter(Boolean).join(', ')],
    ['Purpose', g.purpose],
    ['Arriving from', g.arrivingFrom],
    ['Next destination', g.goingTo],
    ['Vehicle', g.vehicleNumber],
    ['Room type', g.roomType],
    ['Guests', `${g.adults} adult(s), ${g.children} child(ren)`],
    ['Remarks', g.remarks],
  ];

  return (
    <div className="stack">
      <div className="print-only print-head">
        <h2>{settings.hotelName}</h2>
        {settings.hotelAddress && <p>{settings.hotelAddress}</p>}
        <h3>{g.invoiceNo ? `Invoice ${g.invoiceNo}` : 'Guest Registration Card'}</h3>
      </div>

      <div className="detail-head">
        <div className="room room-lg">{g.roomNumber}</div>
        <div className="grow">
          <h1>{g.fullName}</h1>
          <StatusBadge status={g.status} dueOut={isDueOutToday(g)} />
          {g.invoiceNo && <span className="muted"> · Invoice {g.invoiceNo}</span>}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Check-in</span>
          <span className="stat-val">{formatDate(g.checkInDate)}</span>
          <span className="muted">{formatTime(g.checkInTime)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{inHouse ? 'Check-out' : 'Checked out'}</span>
          <span className="stat-val">{g.checkOutDate ? formatDate(g.checkOutDate) : 'Not set'}</span>
          <span className="muted">{g.checkOutDate && formatTime(g.checkOutTime)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{isIndian ? g.idType : 'Passport'}</span>
          <span className="stat-val mono">
            <span className="no-print">{showId ? fullId : maskId(fullId)}</span>
            <span className="print-only">{fullId}</span>
          </span>
          <button type="button" className="link no-print" onClick={() => setShowId(!showId)}>
            {showId ? 'Hide' : 'Show full number'}
          </button>
        </div>
        <div className={`stat${bill.balance > 0 ? ' stat-warn' : ''}`}>
          <span className="stat-label">{bill.balance < 0 ? 'Refund due' : 'Balance due'}</span>
          <span className="stat-val">{rupees(Math.abs(bill.balance))}</span>
          <span className="muted">Total {rupees(bill.total)}</span>
        </div>
      </div>

      {inHouse && (
        <div className="actions no-print">
          {confirmOut ? (
            <div className="confirm">
              <p>
                Check out <strong>{g.fullName}</strong> from room <strong>{g.roomNumber}</strong> now?
              </p>
              <BillSummary bill={bill} />
              {bill.balance !== 0 && (
                <Field label={bill.balance > 0 ? `Collect ${rupees(bill.balance)} by` : `Refund ${rupees(-bill.balance)} by`}>
                  <Segmented options={PAYMENT_MODES} value={payMode} onChange={setPayMode} />
                </Field>
              )}
              <div className="actions">
                <button className="btn btn-ghost" onClick={() => setConfirmOut(false)}>Cancel</button>
                <button className="btn btn-danger btn-xl" onClick={checkOut}>
                  {bill.balance > 0 ? `Collected ${rupees(bill.balance)} — Check Out` : 'Yes, Check Out'}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-danger btn-xl" onClick={() => setConfirmOut(true)}>Check Out</button>
          )}
        </div>
      )}

      <section className="card">
        <h2 className="card-title">Bill</h2>
        <table className="bill">
          <thead>
            <tr>
              <th>Date</th>
              <th>Bill no.</th>
              <th>Item</th>
              <th className="num">Amount</th>
              {inHouse && <th className="no-print" />}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{formatDate(g.checkInDate)}</td>
              <td>—</td>
              <td>
                Room {g.roomNumber}: {bill.nights} night{bill.nights > 1 && 's'} × {rupees(Number(g.ratePerNight) || 0)}
                {inHouse && <span className="muted"> (so far)</span>}
              </td>
              <td className="num">{rupees(bill.roomTotal)}</td>
              {inHouse && <td className="no-print" />}
            </tr>
            {g.charges.map((c) => (
              <tr key={c.id}>
                <td>{formatDate(c.date)}</td>
                <td className="mono">{c.billNo}</td>
                <td>
                  {c.category}
                  {c.description && <span className="muted"> — {c.description}</span>}
                </td>
                <td className="num">{rupees(Number(c.amount))}</td>
                {inHouse && (
                  <td className="no-print">
                    <button
                      className="link danger-text"
                      onClick={() =>
                        confirm(`Remove bill ${c.billNo} (${rupees(Number(c.amount))})?`) &&
                        saveCharges(g.charges.filter((x) => x.id !== c.id), `Bill ${c.billNo} removed`)
                      }
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {inHouse && (
          <AddCharge
            existingBillNos={g.charges.map((c) => c.billNo.toLowerCase())}
            onAdd={(c) => saveCharges([...g.charges, c], `Bill ${c.billNo} added — ${rupees(Number(c.amount))}`)}
          />
        )}
        <BillSummary bill={bill} paymentMode={g.paymentMode} finalMode={g.finalPayment?.mode} />
      </section>

      <section className="card">
        <h2 className="card-title">ID proof photos</h2>
        <IdPhotos ids={g.idPhotos} />
        {inHouse && !g.idPhotos.length && (
          <a className="btn no-print" href={`#/edit/${g.id}`}>Add ID photo</a>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Details</h2>
        <dl className="details">
          {rows.filter(([, v]) => v && v !== '—').map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {g.companions.length > 0 && (
        <section className="card">
          <h2 className="card-title">Other adults in the room</h2>
          <dl className="details">
            {g.companions.map((c, i) => (
              <div key={i}>
                <dt>{c.name}</dt>
                <dd>
                  {[
                    c.nationality === 'Foreign' ? c.country : 'Indian',
                    c.gender,
                    c.age && `${c.age} yrs`,
                    c.idNumber && `${c.nationality === 'Foreign' ? 'Passport' : c.idType} ${c.idNumber}`,
                    c.passportExpiry && `passport valid till ${formatDate(c.passportExpiry)}`,
                    c.visaNumber && `Visa ${c.visaNumber} till ${formatDate(c.visaExpiry)}`,
                  ].filter(Boolean).join(' · ')}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="print-only signatures">
        <span>Guest signature</span>
        <span>Receptionist signature</span>
      </div>

      <div className="actions no-print">
        <a className="btn" href={`#/edit/${g.id}`}>Edit details</a>
        <button className="btn" onClick={() => window.print()}>{g.invoiceNo ? 'Print invoice' : 'Print registration card'}</button>
        <button className="btn btn-ghost danger-text" onClick={remove}>Delete record</button>
      </div>
    </div>
  );
}

function BillSummary({
  bill, paymentMode, finalMode,
}: {
  bill: ReturnType<typeof billFor>;
  paymentMode?: PaymentMode;
  finalMode?: PaymentMode;
}) {
  return (
    <dl className="totals">
      <div><dt>Room charges</dt><dd>{rupees(bill.roomTotal)}</dd></div>
      <div><dt>Extra bills</dt><dd>{rupees(bill.extras)}</dd></div>
      <div className="totals-strong"><dt>Total</dt><dd>{rupees(bill.total)}</dd></div>
      {bill.advance > 0 && (
        <div><dt>Less advance{paymentMode && ` (${paymentMode})`}</dt><dd>− {rupees(bill.advance)}</dd></div>
      )}
      {bill.settled !== 0 && (
        <div>
          <dt>{bill.settled > 0 ? 'Paid at check-out' : 'Refunded at check-out'}{finalMode && ` (${finalMode})`}</dt>
          <dd>{bill.settled > 0 ? '− ' : '+ '}{rupees(Math.abs(bill.settled))}</dd>
        </div>
      )}
      <div className={`totals-strong ${bill.balance > 0 ? 'due' : ''}`}>
        <dt>{bill.balance < 0 ? 'Refund to guest' : 'Balance due'}</dt>
        <dd>{rupees(Math.abs(bill.balance))}</dd>
      </div>
    </dl>
  );
}

function AddCharge({ existingBillNos, onAdd }: { existingBillNos: string[]; onAdd: (c: Charge) => void }) {
  const blank = () => ({ id: newId(), billNo: '', category: 'Food', description: '', amount: '', date: todayStr() });
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<Charge>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!open) {
    return (
      <div className="no-print add-charge-btn">
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Add bill (food, laundry…)</button>
      </div>
    );
  }

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
    setOpen(false);
  };

  return (
    <form className="form add-charge no-print" onSubmit={submit} noValidate>
      <div className="grid">
        <Field label="Bill number" required error={errors.billNo}>
          <input value={c.billNo} onChange={(e) => setC({ ...c, billNo: e.target.value.toUpperCase() })} autoFocus />
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
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn btn-primary">Add to bill</button>
      </div>
    </form>
  );
}
