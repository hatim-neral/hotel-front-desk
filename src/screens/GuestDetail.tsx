import { useState } from 'react';
import type { BillTo, Charge, Guest, Payment, Settings } from '../types';
import { deleteGuest, saveGuest, updateRoom } from '../storage';
import { StatusBadge } from '../components/ui';
import { PaymentLines, PaymentRows } from '../components/Payments';
import { draftTotal, emptyBillTo, toPayments, type PaymentDraft } from '../payments';
import CompanyFields from '../components/CompanyFields';
import { billToErrors } from '../validation';
import IdPhotos from '../components/IdPhotos';
import { AddCharge } from '../components/ChargeForm';
import {
  billFor, withCharge, formatAadhaar, formatDate, formatTime, go, isDueOutToday, maskId, nowTime, rupees, todayStr,
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
  // Check-out settlement rows start with the whole balance in cash
  const [payRows, setPayRows] = useState<PaymentDraft[]>(() => [
    { amount: g ? String(Math.abs(billFor(g).balance)) : '', mode: 'Cash' },
  ]);
  const [recording, setRecording] = useState(false);
  const [recordRows, setRecordRows] = useState<PaymentDraft[]>([{ amount: '', mode: 'Cash' }]);
  const [editingCompany, setEditingCompany] = useState(false);
  const [company, setCompany] = useState<BillTo>(() => g?.billTo ?? emptyBillTo());
  const [companyTried, setCompanyTried] = useState(false);

  if (!g) return <p className="muted">Guest not found. <a href="#/">Go home</a></p>;

  const isIndian = g.nationality === 'Indian';
  const inHouse = g.status === 'in';
  const fullId = isIndian ? (g.idType === 'Aadhaar' ? formatAadhaar(g.idNumber) : g.idNumber) : g.passportNumber;
  const bill = billFor(g);

  const saveCharges = async (charges: Charge[], msg: string) => {
    await saveGuest({ ...g, charges });
    onChanged(msg);
  };

  const savePayments = async (payments: Payment[], msg: string) => {
    await saveGuest({ ...g, payments });
    onChanged(msg);
  };

  const recordPayment = async () => {
    const added = toPayments(recordRows, 'payment');
    if (!added.length) return;
    await savePayments([...g.payments, ...added], `Payment of ${rupees(draftTotal(recordRows))} recorded`);
    setRecording(false);
    setRecordRows([{ amount: '', mode: 'Cash' }]);
  };

  // Check-out needs the balance settled exactly; refunds are recorded as negative payments
  const due = Math.abs(bill.balance);
  const entered = draftTotal(payRows);
  const settled = Math.abs(entered - due) < 0.01;

  // A company paying any part of the bill needs its GST details on the bill
  const COMPANY = 'Company / OTA';
  const companyErrs = companyTried ? billToErrors(company) : {};
  const companyValid = !Object.keys(billToErrors(company)).length;
  const companyPays =
    g.payments.some((p) => p.mode === COMPANY) || (due > 0 && payRows.some((r) => r.mode === COMPANY && Number(r.amount) > 0));
  const needsCompany = companyPays && !g.billTo;

  const saveCompany = async () => {
    setCompanyTried(true);
    if (!companyValid) return;
    await saveGuest({ ...g, billTo: { ...company, company: company.company.trim() } });
    setEditingCompany(false);
    onChanged('Company billing details saved');
  };

  const checkOut = async () => {
    await saveGuest({
      ...g,
      status: 'out',
      checkOutDate: todayStr(),
      checkOutTime: nowTime(),
      checkedOutAt: new Date().toISOString(),
      payments: [...g.payments, ...(due ? toPayments(payRows, 'checkout', bill.balance < 0 ? -1 : 1) : [])],
      billTo: g.billTo ?? (needsCompany ? { ...company, company: company.company.trim() } : undefined),
    });
    await updateRoom(g.roomNumber, { housekeeping: 'dirty' }); // room needs cleaning before the next guest
    setConfirmOut(false);
    onChanged(`${g.fullName} checked out of room ${g.roomNumber} — bill ${g.guestNo} closed`);
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
        {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
        <h3>{inHouse ? 'Guest Registration Card' : `Bill ${g.guestNo}`}</h3>
        {g.billTo && (
          <p className="print-billto">
            Billed to: <strong>{g.billTo.company}</strong> · GSTIN {g.billTo.gstin}
            {g.billTo.address && <> · {g.billTo.address}</>}
            <br />Guest: {g.fullName}
          </p>
        )}
      </div>

      <div className="detail-head">
        <div className="room room-lg">{g.roomNumber}</div>
        <div className="grow">
          <h1>{g.fullName}</h1>
          <span className="guest-no">{g.guestNo}</span>
          <StatusBadge status={g.status} dueOut={isDueOutToday(g)} />
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
              <BillSummary bill={bill} payments={g.payments} />
              {due > 0 && (
                <div className="settle">
                  <div className="settle-head">
                    <strong>{bill.balance > 0 ? `Collect ${rupees(due)}` : `Refund ${rupees(due)}`}</strong>
                    <span className={settled ? 'settle-ok' : 'settle-left'}>
                      {settled
                        ? '✓ Matches the balance'
                        : entered < due
                          ? `${rupees(due - entered)} still to enter`
                          : `${rupees(entered - due)} more than the balance`}
                    </span>
                  </div>
                  <PaymentRows rows={payRows} onChange={setPayRows} target={due} />
                </div>
              )}
              {needsCompany && (
                <div className="settle">
                  <strong>Company paying — GST details for the bill</strong>
                  <CompanyFields value={company} onChange={(v) => { setCompany(v); setCompanyTried(true); }} errors={companyErrs} />
                </div>
              )}
              <div className="actions">
                <button className="btn btn-ghost" onClick={() => setConfirmOut(false)}>Cancel</button>
                <button className="btn btn-danger btn-xl" onClick={checkOut} disabled={(due > 0 && !settled) || (needsCompany && !companyValid)}>
                  {due === 0 ? 'Yes, Check Out' : bill.balance > 0 ? `Collected ${rupees(due)} — Check Out` : `Refunded ${rupees(due)} — Check Out`}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                className="btn btn-danger btn-xl"
                onClick={() => {
                  setPayRows([{ amount: String(Math.abs(bill.balance)), mode: 'Cash' }]);
                  setConfirmOut(true);
                }}
              >
                Check Out
              </button>
              <button className="btn btn-xl" onClick={() => setRecording(true)}>Record payment</button>
            </>
          )}
        </div>
      )}

      <section className="card">
        <h2 className="card-title">
          Bill {g.guestNo} <span className={`badge ${inHouse ? 'badge-in' : 'badge-out'}`}>{inHouse ? 'Open' : 'Closed'}</span>
        </h2>
        {editingCompany ? (
          <div className="add-charge no-print">
            <strong>Company paying this bill</strong>
            <CompanyFields value={company} onChange={setCompany} errors={companyErrs} />
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setEditingCompany(false)}>Cancel</button>
              {g.billTo && (
                <button
                  className="btn btn-ghost danger-text"
                  onClick={async () => {
                    await saveGuest({ ...g, billTo: undefined });
                    setEditingCompany(false);
                    onChanged('Bill changed back to the guest');
                  }}
                >
                  Guest pays instead
                </button>
              )}
              <button className="btn btn-primary" onClick={saveCompany}>Save company details</button>
            </div>
          </div>
        ) : g.billTo ? (
          <div className="billto no-print">
            <span className="muted">Billed to</span>
            <strong>{g.billTo.company}</strong>
            <span className="mono">GSTIN {g.billTo.gstin}</span>
            {g.billTo.address && <span className="muted">{g.billTo.address}</span>}
            {inHouse && <button className="link" onClick={() => setEditingCompany(true)}>Edit</button>}
          </div>
        ) : (
          inHouse && (
            <button className="link no-print billto-add" onClick={() => setEditingCompany(true)}>
              + Company paying? Add company GST details
            </button>
          )
        )}
        <table className="bill">
          <thead>
            <tr>
              <th>Date</th>
              <th>Bill ID</th>
              <th>Item</th>
              <th className="num">Amount</th>
              {inHouse && <th className="no-print" />}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{formatDate(g.checkInDate)}</td>
              <td className="mono">{g.guestNo}</td>
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
                <td className="mono">{c.chargeNo}</td>
                <td>
                  {c.category}
                  {c.description && <span className="muted"> — {c.description}</span>}
                  {c.billNo && <span className="muted"> · slip {c.billNo}</span>}
                </td>
                <td className="num">{rupees(Number(c.amount))}</td>
                {inHouse && (
                  <td className="no-print">
                    <button
                      className="link danger-text"
                      onClick={() =>
                        confirm(`Remove bill ${c.chargeNo} (${rupees(Number(c.amount))})?`) &&
                        saveCharges(g.charges.filter((x) => x.id !== c.id), `Bill ${c.chargeNo} removed`)
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
            existingBillNos={g.charges.map((c) => c.billNo.toLowerCase()).filter(Boolean)}
            onAdd={(c) => {
              const updated = withCharge(g, c);
              const added = updated.charges[updated.charges.length - 1];
              saveCharges(updated.charges, `Bill ${added.chargeNo} added — ${rupees(Number(c.amount))}`);
            }}
          />
        )}
        {recording && (
          <div className="add-charge no-print">
            <strong>Record a payment</strong>
            <PaymentRows rows={recordRows} onChange={setRecordRows} />
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setRecording(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={recordPayment} disabled={!(draftTotal(recordRows) > 0)}>
                Save payment {draftTotal(recordRows) > 0 && rupees(draftTotal(recordRows))}
              </button>
            </div>
          </div>
        )}
        <BillSummary
          bill={bill}
          payments={g.payments}
          onRemovePayment={
            inHouse
              ? (p) =>
                  confirm(`Remove the ${p.mode} payment of ${rupees(Math.abs(p.amount))}?`) &&
                  savePayments(g.payments.filter((x) => x.id !== p.id), 'Payment removed')
              : undefined
          }
        />
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
        <button className="btn" onClick={() => window.print()}>{inHouse ? 'Print registration card' : 'Print bill'}</button>
        <button className="btn btn-ghost danger-text" onClick={remove}>Delete record</button>
      </div>
    </div>
  );
}

function BillSummary({
  bill, payments, onRemovePayment,
}: {
  bill: ReturnType<typeof billFor>;
  payments: Payment[];
  onRemovePayment?: (p: Payment) => void;
}) {
  return (
    <dl className="totals">
      <div><dt>Room charges</dt><dd>{rupees(bill.roomTotal)}</dd></div>
      <div><dt>Extra bills</dt><dd>{rupees(bill.extras)}</dd></div>
      <div className="totals-sub"><dt>Subtotal</dt><dd>{rupees(bill.subtotal)}</dd></div>
      <div><dt>GST {bill.gstRate}%</dt><dd>{rupees(bill.gst)}</dd></div>
      <div className="totals-strong"><dt>Total</dt><dd>{rupees(bill.total)}</dd></div>
      <PaymentLines payments={payments} onRemove={onRemovePayment} />
      <div className={`totals-strong ${bill.balance > 0 ? 'due' : ''}`}>
        <dt>{bill.balance < 0 ? 'Refund to guest' : 'Balance due'}</dt>
        <dd>{rupees(Math.abs(bill.balance))}</dd>
      </div>
    </dl>
  );
}
