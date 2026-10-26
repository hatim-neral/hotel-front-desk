import { useMemo, useState } from 'react';
import type { Companion, Guest, IdType, Settings } from '../types';
import { ID_TYPES, PAYMENT_MODES, PURPOSES } from '../types';
import { deletePhoto, newId, saveGuest, savePhoto } from '../storage';
import { validateGuest, type Errors } from '../validation';
import { Field, Section, Segmented } from '../components/ui';
import IdPhotos from '../components/IdPhotos';
import { addDays, formatAadhaar, go, nightsBetween, nowTime, todayStr } from '../utils';

function blankGuest(settings: Settings): Guest {
  const today = todayStr();
  return {
    id: newId(), status: 'in',
    fullName: '', phone: '', email: '', gender: '', dob: '',
    nationality: 'Indian', country: 'India',
    idType: 'Aadhaar', idNumber: '', idPhotos: [],
    passportNumber: '', passportExpiry: '', visaNumber: '', visaType: '', visaExpiry: '', arrivalInIndia: '',
    address: '', city: '', state: '', pincode: '',
    purpose: 'Tourism', arrivingFrom: '', goingTo: '', vehicleNumber: '',
    roomNumber: '', roomType: settings.roomTypes[0] ?? '', adults: 1, children: 0, companions: [],
    checkInDate: today, checkInTime: nowTime(),
    checkOutDate: addDays(today, 1), checkOutTime: settings.defaultCheckOutTime,
    ratePerNight: '', advancePaid: '', paymentMode: 'Cash', charges: [],
    remarks: '', createdAt: new Date().toISOString(),
  };
}

const blankCompanion = (): Companion => ({ name: '', gender: '', age: '', idType: 'Aadhaar', idNumber: '' });

export default function CheckInForm({
  guests, settings, existing, onSaved,
}: {
  guests: Guest[];
  settings: Settings;
  existing?: Guest;
  onSaved: (msg: string) => void;
}) {
  const [g, setG] = useState<Guest>(() => existing ?? blankGuest(settings));
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [newPhotos, setNewPhotos] = useState<Record<string, string>>({});

  const occupiedRooms = useMemo(() => {
    const m = new Map<string, string>();
    guests
      .filter((x) => x.status === 'in' && x.id !== g.id)
      .forEach((x) => m.set(x.roomNumber.trim().toLowerCase(), x.fullName));
    return m;
  }, [guests, g.id]);

  const set = <K extends keyof Guest>(key: K, value: Guest[K]) => {
    const next = { ...g, [key]: value };
    setG(next);
    if (submitted) setErrors(validateGuest(next, occupiedRooms));
  };

  const setCompanion = (i: number, patch: Partial<Companion>) =>
    set('companions', g.companions.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const nights = nightsBetween(g.checkInDate, g.checkOutDate);
  const total = nights * (Number(g.ratePerNight) || 0);
  const balance = total - (Number(g.advancePaid) || 0);
  const isIndian = g.nationality === 'Indian';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateGuest(g, occupiedRooms);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const clean: Guest = {
      ...g,
      fullName: g.fullName.trim(),
      roomNumber: g.roomNumber.trim(),
      idNumber: g.idNumber.replace(/\s/g, '').toUpperCase(),
      passportNumber: g.passportNumber.trim().toUpperCase(),
    };
    await Promise.all(Object.entries(newPhotos).filter(([id]) => g.idPhotos.includes(id)).map(([id, url]) => savePhoto(id, url)));
    await Promise.all((existing?.idPhotos ?? []).filter((id) => !g.idPhotos.includes(id)).map(deletePhoto));
    await saveGuest(clean);
    onSaved(existing ? 'Guest details updated' : `${clean.fullName} checked in to room ${clean.roomNumber}`);
    go(`guest/${clean.id}`);
  };

  const photoField = (
    <Field label="Photo of ID proof" hint="Front and back. On a phone or tablet this opens the camera." wide>
      <IdPhotos
        ids={g.idPhotos}
        pending={newPhotos}
        onAdd={(id, url) => {
          setNewPhotos((p) => ({ ...p, [id]: url }));
          setG((cur) => ({ ...cur, idPhotos: [...cur.idPhotos, id] }));
        }}
        onRemove={(id) => set('idPhotos', g.idPhotos.filter((x) => x !== id))}
      />
    </Field>
  );

  return (
    <form className="stack form" onSubmit={submit} noValidate>
      <h1>{existing ? 'Edit Guest' : 'New Check-In'}</h1>

      <Section title="1. Guest details">
        <Field label="Full name (as on ID)" required error={errors.fullName} wide>
          <input value={g.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus={!existing} autoComplete="off" />
        </Field>
        <Field label="Citizenship" required>
          <Segmented
            options={['Indian', 'Foreign'] as const}
            value={g.nationality}
            onChange={(v) => setG({ ...g, nationality: v, country: v === 'Indian' ? 'India' : '' })}
          />
        </Field>
        <Field label="Gender" required error={errors.gender}>
          <Segmented options={['Male', 'Female', 'Other'] as const} value={g.gender} onChange={(v) => set('gender', v)} />
        </Field>
        <Field label="Mobile number" required error={errors.phone} hint={isIndian ? '10 digits' : 'With country code, e.g. +44…'}>
          <input
            type="tel"
            inputMode="tel"
            value={g.phone}
            onChange={(e) => set('phone', isIndian ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value)}
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <input type="email" value={g.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <input type="date" value={g.dob} max={todayStr()} onChange={(e) => set('dob', e.target.value)} />
        </Field>
        {!isIndian && (
          <Field label="Country of citizenship" required error={errors.country}>
            <input value={g.country} onChange={(e) => set('country', e.target.value)} />
          </Field>
        )}
      </Section>

      {isIndian ? (
        <Section title="2. ID proof">
          <Field label="ID type" required wide>
            <Segmented
              options={ID_TYPES}
              value={g.idType}
              onChange={(v: IdType) => set('idType', v)}
            />
          </Field>
          <Field label={`${g.idType} number`} required error={errors.idNumber} wide>
            <input
              value={g.idType === 'Aadhaar' ? formatAadhaar(g.idNumber) : g.idNumber}
              inputMode={g.idType === 'Aadhaar' ? 'numeric' : 'text'}
              placeholder={g.idType === 'Aadhaar' ? '1234 5678 9012' : ''}
              onChange={(e) =>
                set('idNumber', g.idType === 'Aadhaar' ? e.target.value.replace(/\D/g, '').slice(0, 12) : e.target.value.toUpperCase())
              }
              autoComplete="off"
            />
          </Field>
          {photoField}
        </Section>
      ) : (
        <Section title="2. Passport & visa (Form C)">
          <Field label="Passport number" required error={errors.passportNumber}>
            <input value={g.passportNumber} onChange={(e) => set('passportNumber', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Passport expiry">
            <input type="date" value={g.passportExpiry} onChange={(e) => set('passportExpiry', e.target.value)} />
          </Field>
          <Field label="Visa number" required error={errors.visaNumber}>
            <input value={g.visaNumber} onChange={(e) => set('visaNumber', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Visa type">
            <input value={g.visaType} placeholder="e.g. e-Tourist, Business" onChange={(e) => set('visaType', e.target.value)} />
          </Field>
          <Field label="Visa expiry" required error={errors.visaExpiry}>
            <input type="date" value={g.visaExpiry} onChange={(e) => set('visaExpiry', e.target.value)} />
          </Field>
          <Field label="Date of arrival in India" required error={errors.arrivalInIndia}>
            <input type="date" value={g.arrivalInIndia} max={todayStr()} onChange={(e) => set('arrivalInIndia', e.target.value)} />
          </Field>
          {photoField}
        </Section>
      )}

      <Section title="3. Address">
        <Field label={isIndian ? 'Address' : 'Permanent address (home country)'} required error={errors.address} wide>
          <textarea rows={2} value={g.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="City" required error={errors.city}>
          <input value={g.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="State">
          <input value={g.state} onChange={(e) => set('state', e.target.value)} />
        </Field>
        <Field label={isIndian ? 'Pincode' : 'Postal code'} error={errors.pincode}>
          <input inputMode={isIndian ? 'numeric' : 'text'} value={g.pincode} onChange={(e) => set('pincode', e.target.value)} />
        </Field>
      </Section>

      <Section title="4. Stay">
        <Field label="Room number" required error={errors.roomNumber}>
          <input className="input-big" value={g.roomNumber} onChange={(e) => set('roomNumber', e.target.value)} />
        </Field>
        <Field label="Room type">
          <select value={g.roomType} onChange={(e) => set('roomType', e.target.value)}>
            {settings.roomTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Adults" required error={errors.adults}>
          <Stepper value={g.adults} min={1} onChange={(v) => set('adults', v)} />
        </Field>
        <Field label="Children">
          <Stepper value={g.children} min={0} onChange={(v) => set('children', v)} />
        </Field>
        <Field label="Check-in date" required error={errors.checkInDate}>
          <input type="date" value={g.checkInDate} onChange={(e) => set('checkInDate', e.target.value)} />
        </Field>
        <Field label="Check-in time" required error={errors.checkInTime}>
          <input type="time" value={g.checkInTime} onChange={(e) => set('checkInTime', e.target.value)} />
        </Field>
        <Field label="Check-out date" required error={errors.checkOutDate}>
          <input type="date" value={g.checkOutDate} min={g.checkInDate} onChange={(e) => set('checkOutDate', e.target.value)} />
        </Field>
        <Field label="Check-out time" required error={errors.checkOutTime}>
          <input type="time" value={g.checkOutTime} onChange={(e) => set('checkOutTime', e.target.value)} />
        </Field>
        <Field label={`Nights: ${nights}`} wide>
          <div className="quick">
            {[1, 2, 3, 4, 5, 7].map((n) => (
              <button
                key={n}
                type="button"
                className={nights === n ? 'active' : ''}
                onClick={() => set('checkOutDate', addDays(g.checkInDate, n))}
              >
                {n} night{n > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="5. Other guests in the room">
        {g.companions.map((c, i) => (
          <div key={i} className="companion wide">
            <Field label={`Guest ${i + 2} name`} required error={errors[`companion${i}`]}>
              <input value={c.name} onChange={(e) => setCompanion(i, { name: e.target.value })} />
            </Field>
            <Field label="Gender">
              <select value={c.gender} onChange={(e) => setCompanion(i, { gender: e.target.value as Companion['gender'] })}>
                <option value="">—</option>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </Field>
            <Field label="Age">
              <input inputMode="numeric" value={c.age} onChange={(e) => setCompanion(i, { age: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
            </Field>
            <Field label="ID type">
              <select value={c.idType} onChange={(e) => setCompanion(i, { idType: e.target.value as IdType })}>
                {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="ID number">
              <input value={c.idNumber} onChange={(e) => setCompanion(i, { idNumber: e.target.value.toUpperCase() })} />
            </Field>
            <button type="button" className="btn btn-ghost remove" onClick={() => set('companions', g.companions.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <div className="wide">
          <button type="button" className="btn" onClick={() => set('companions', [...g.companions, blankCompanion()])}>
            + Add another guest
          </button>
        </div>
      </Section>

      <Section title="6. Travel">
        <Field label="Purpose of visit">
          <select value={g.purpose} onChange={(e) => set('purpose', e.target.value)}>
            {PURPOSES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Arriving from">
          <input value={g.arrivingFrom} onChange={(e) => set('arrivingFrom', e.target.value)} />
        </Field>
        <Field label="Next destination">
          <input value={g.goingTo} onChange={(e) => set('goingTo', e.target.value)} />
        </Field>
        <Field label="Vehicle number">
          <input value={g.vehicleNumber} onChange={(e) => set('vehicleNumber', e.target.value.toUpperCase())} />
        </Field>
      </Section>

      <Section title="7. Payment">
        <Field label="Rate per night (₹)">
          <input inputMode="decimal" value={g.ratePerNight} onChange={(e) => set('ratePerNight', e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Advance paid (₹)">
          <input inputMode="decimal" value={g.advancePaid} onChange={(e) => set('advancePaid', e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Payment mode" wide>
          <Segmented options={PAYMENT_MODES} value={g.paymentMode} onChange={(v) => set('paymentMode', v)} />
        </Field>
        {total > 0 && (
          <div className="summary wide">
            <span>{nights} night{nights !== 1 && 's'} × ₹{g.ratePerNight} = <strong>₹{total.toLocaleString('en-IN')}</strong></span>
            <span>Balance due: <strong>₹{balance.toLocaleString('en-IN')}</strong></span>
          </div>
        )}
        <Field label="Remarks" wide>
          <textarea rows={2} value={g.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
      </Section>

      <div className="sticky-actions">
        {Object.keys(errors).length > 0 && (
          <span className="error-count">{Object.keys(errors).length} field(s) need attention</span>
        )}
        <a className="btn btn-ghost" href={existing ? `#/guest/${existing.id}` : '#/'}>Cancel</a>
        <button type="submit" className="btn btn-primary btn-xl">
          {existing ? 'Save Changes' : 'Check In Guest'}
        </button>
      </div>
    </form>
  );
}

function Stepper({ value, min, onChange }: { value: number; min: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease">−</button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label="Increase">+</button>
    </div>
  );
}
