import { useEffect, useMemo, useRef, useState } from 'react';
import type { Companion, Guest, IdType, Nationality, Room, Settings } from '../types';
import { ID_TYPES, PURPOSES, VISA_TYPES } from '../types';
import { assignGuestNo, deletePhoto, getPhoto, newId, saveGuest, savePhoto, updateRoom } from '../storage';
import { validateGuest, type Errors } from '../validation';
import { Field, Section, Segmented } from '../components/ui';
import IdPhotos from '../components/IdPhotos';
import { GuestPhotoField } from '../components/GuestPhoto';
import { PaymentRows } from '../components/Payments';
import { draftTotal, emptyBillTo, toPayments, type PaymentDraft } from '../payments';
import CompanyFields from '../components/CompanyFields';
import PlaceFields, { COUNTRY_LIST_ID, CountryList } from '../components/PlaceFields';
import { findRoom, rateFor, ROOM_STATE_LABEL, roomViews, typeLabel } from '../rooms';
import { addDays, formatAadhaar, formatDate, go, nightsBetween, nowTime, rupees, todayStr } from '../utils';

function blankGuest(settings: Settings, room?: Room): Guest {
  return {
    id: newId(), guestNo: '', status: 'in',
    fullName: '', phone: '', email: '', gender: '', dob: '',
    nationality: 'Indian', country: 'India',
    idType: 'Aadhaar', idNumber: '', idPhotos: [], guestPhoto: '',
    passportNumber: '', passportIssueDate: '', passportExpiry: '', passportPlaceOfIssue: '',
    visaNumber: '', visaType: '', visaIssueDate: '', visaPlaceOfIssue: '', visaExpiry: '', arrivalInIndia: '',
    address: '', addressCountry: 'India', city: '', state: '', pincode: '',
    purpose: 'Tourism', arrivingFrom: '', goingTo: '', vehicleNumber: '',
    roomNumber: room?.number ?? '', roomType: room?.type ?? settings.roomTypes[0]?.name ?? '', adults: 1, children: 0, companions: [],
    checkInDate: todayStr(), checkInTime: nowTime(),
    checkOutDate: '', checkOutTime: settings.defaultCheckOutTime,
    ratePerNight: room ? rateFor(settings, room.type) : '', gstRate: settings.gstRate, payments: [], charges: [],
    remarks: '', createdAt: new Date().toISOString(),
  };
}

// A new stay for someone who has stayed before: personal, ID, address and company details carry
// over; the stay, bill and payments start fresh. Same room if it is free, otherwise the room is left blank.
function returningStay(prev: Guest, settings: Settings, rooms: Room[], guests: Guest[]): { guest: Guest; roomNote: string } {
  const room = findRoom(rooms, prev.roomNumber);
  const takenBy = guests.find((x) => x.status === 'in' && x.roomNumber.toLowerCase() === prev.roomNumber.toLowerCase());
  const free = room && !takenBy && room.housekeeping !== 'out-of-order';
  const fresh = blankGuest(settings, free ? room : undefined);
  const guest: Guest = {
    ...prev,
    id: fresh.id, guestNo: '', status: 'in', idPhotos: [], guestPhoto: '',
    roomNumber: fresh.roomNumber, roomType: fresh.roomType, ratePerNight: fresh.ratePerNight, gstRate: fresh.gstRate,
    checkInDate: fresh.checkInDate, checkInTime: fresh.checkInTime, checkOutDate: '', checkOutTime: fresh.checkOutTime,
    payments: [], charges: [], remarks: '', createdAt: fresh.createdAt, checkedOutAt: undefined,
  };
  const roomNote = free
    ? `Same room ${prev.roomNumber} is free${room.housekeeping === 'dirty' ? ' (not cleaned yet)' : ''} — change it below if the guest wants another.`
    : `Last room ${prev.roomNumber} is ${takenBy ? 'occupied' : 'not available'} — pick another room below.`;
  return { guest, roomNote };
}

// Does this stay match a mobile number, bill ID (HSL…, or a child bill ID) or ID / passport number?
function matchesReturning(g: Guest, q: string): boolean {
  const s = q.replace(/\s/g, '').toUpperCase();
  if (s.length < 4) return false;
  const digits = s.replace(/\D/g, '');
  return (
    g.guestNo.toUpperCase() === s.split('-')[0] ||
    (digits.length >= 10 && digits.length === s.replace(/^\+/, '').length && g.phone.replace(/\D/g, '').endsWith(digits.slice(-10))) ||
    g.idNumber.replace(/\s/g, '').toUpperCase() === s ||
    g.passportNumber.toUpperCase() === s
  );
}

const personKey = (g: Guest) => (g.idNumber || g.passportNumber || g.phone).replace(/\s/g, '').toUpperCase();

// Checked-out guests matching the lookup: latest stay per person; people in-house right now are left out.
function findReturning(guests: Guest[], q: string): Guest[] {
  const inHouse = new Set(guests.filter((g) => g.status === 'in').map(personKey));
  const latest = new Map<string, Guest>();
  guests
    .filter((g) => g.status === 'out' && !inHouse.has(personKey(g)) && matchesReturning(g, q))
    .forEach((g) => {
      const cur = latest.get(personKey(g));
      if (!cur || g.createdAt > cur.createdAt) latest.set(personKey(g), g);
    });
  return [...latest.values()].slice(0, 5);
}

function blankCompanion(nationality: Nationality, country: string): Companion {
  const indian = nationality === 'Indian';
  return {
    name: '', gender: '', age: '', nationality, country: indian ? 'India' : country,
    idType: indian ? 'Aadhaar' : 'Passport', idNumber: '', passportExpiry: '', visaNumber: '', visaExpiry: '',
  };
}

export default function CheckInForm({
  guests, rooms, settings, existing, initialRoom, from, onSaved,
}: {
  guests: Guest[];
  rooms: Room[];
  settings: Settings;
  existing?: Guest;
  initialRoom?: string; // opened from the room chart: pre-select this room
  from?: Guest; // "Check in again": start from this past stay
  onSaved: (msg: string) => void;
}) {
  const [start] = useState(() => (from && !existing ? returningStay(from, settings, rooms, guests) : undefined));
  const [roomNote, setRoomNote] = useState(start?.roomNote ?? '');
  const [returnedFrom, setReturnedFrom] = useState(from && !existing ? from : undefined);
  const [g, setG] = useState<Guest>(() =>
    start
      ? start.guest
      : existing
      ? {
          ...existing,
          // Older records may have a different number of companion forms than adults
          companions: Array.from(
            { length: Math.max(0, existing.adults - 1) },
            (_, i) => existing.companions[i] ?? blankCompanion(existing.nationality, existing.country),
          ),
        }
      : blankGuest(settings, initialRoom ? findRoom(rooms, initialRoom) : undefined),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [newPhotos, setNewPhotos] = useState<Record<string, string>>({});
  // Advance payments taken at check-in (can be split across modes)
  const [advanceRows, setAdvanceRows] = useState<PaymentDraft[]>(() => {
    const saved = (existing?.payments ?? []).filter((p) => p.kind === 'advance');
    return saved.length
      ? saved.map((p) => ({ id: p.id, amount: String(p.amount), mode: p.mode, date: p.date, time: p.time }))
      : [{ amount: '', mode: 'Cash' }];
  });

  // Copy the ID photos of the past stay under new ids, so deleting either record keeps the other's photos
  const copyPhotos = async (prev: Guest) => {
    const face = prev.guestPhoto && (await getPhoto(prev.guestPhoto));
    if (face) {
      const id = newId();
      setNewPhotos((p) => ({ ...p, [id]: face }));
      setG((cur) => ({ ...cur, guestPhoto: id }));
    }
    for (const old of prev.idPhotos) {
      const url = await getPhoto(old);
      if (!url) continue;
      const id = newId();
      setNewPhotos((p) => ({ ...p, [id]: url }));
      setG((cur) => ({ ...cur, idPhotos: [...cur.idPhotos, id] }));
    }
  };
  const copiedStart = useRef(false);
  useEffect(() => {
    if (!start || !from || copiedStart.current) return;
    copiedStart.current = true;
    copyPhotos(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillFrom = (prev: Guest) => {
    const r = returningStay(prev, settings, rooms, guests);
    setG(r.guest);
    setRoomNote(r.roomNote);
    setReturnedFrom(prev);
    setNewPhotos({});
    setErrors({});
    setSubmitted(false);
    setAdvanceRows([{ amount: '', mode: 'Cash' }]);
    copyPhotos(prev);
  };

  const occupiedRooms = useMemo(() => {
    const m = new Map<string, string>();
    guests
      .filter((x) => x.status === 'in' && x.id !== g.id)
      .forEach((x) => m.set(x.roomNumber.trim().toLowerCase(), x.fullName));
    return m;
  }, [guests, g.id]);

  const update = (patch: Partial<Guest>) => {
    const next = { ...g, ...patch };
    setG(next);
    if (submitted) setErrors(validateGuest(next, occupiedRooms, rooms));
  };

  // Typing a known room number fills in its type and that type's price
  const setRoomNumber = (roomNumber: string) => {
    const room = findRoom(rooms, roomNumber);
    update(room ? { roomNumber, roomType: room.type, ratePerNight: rateFor(settings, room.type) || g.ratePerNight } : { roomNumber });
  };
  const setRoomType = (roomType: string) => update({ roomType, ratePerNight: rateFor(settings, roomType) || g.ratePerNight });

  const views = roomViews(rooms, guests);
  const selectedRoom = findRoom(rooms, g.roomNumber);
  const freeRooms = views.filter((v) => !v.guest && v.state !== 'out-of-order');
  const typeNames = settings.roomTypes.map((t) => t.name);
  const set = <K extends keyof Guest>(key: K, value: Guest[K]) => update({ [key]: value } as Partial<Guest>);

  const setCompanion = (i: number, patch: Partial<Companion>) =>
    set('companions', g.companions.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // One details form per extra adult: 2 adults -> 1 extra form, 3 adults -> 2, ...
  const setAdults = (adults: number) =>
    update({
      adults,
      companions: Array.from({ length: adults - 1 }, (_, i) => g.companions[i] ?? blankCompanion(g.nationality, g.country)),
    });

  const setNationality = (nationality: Nationality) => {
    const indian = nationality === 'Indian';
    // Only reset the address country if it's still on the default for the old choice
    const resetAddress = indian ? !g.addressCountry : g.addressCountry === 'India';
    update({
      nationality,
      country: indian ? 'India' : '',
      idType: indian ? 'Aadhaar' : 'Passport',
      ...(resetAddress ? { addressCountry: indian ? 'India' : '', state: '', city: '' } : {}),
      companions: g.companions.map((c) => ({ ...blankCompanion(nationality, ''), name: c.name, gender: c.gender, age: c.age })),
    });
  };

  const nights = nightsBetween(g.checkInDate, g.checkOutDate);
  const roomTotal = nights * (Number(g.ratePerNight) || 0);
  const gst = Math.round(roomTotal * g.gstRate) / 100;
  const total = roomTotal + gst;
  const advance = draftTotal(advanceRows);
  const isIndian = g.nationality === 'Indian';
  const indianPassport = isIndian && g.idType === 'Passport';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateGuest(g, occupiedRooms, rooms);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const clean: Guest = {
      ...g,
      payments: [...g.payments.filter((p) => p.kind !== 'advance'), ...toPayments(advanceRows, 'advance')],
      fullName: g.fullName.trim(),
      billTo: g.billTo && { ...g.billTo, company: g.billTo.company.trim(), gstin: g.billTo.gstin.trim().toUpperCase() },
      roomNumber: g.roomNumber.trim(),
      idNumber: g.idNumber.replace(/\s/g, '').toUpperCase(),
      passportNumber: g.passportNumber.trim().toUpperCase(),
      companions: g.companions.map((c) => ({ ...c, name: c.name.trim(), idNumber: c.idNumber.replace(/\s/g, '').toUpperCase() })),
    };
    if (!clean.guestNo) clean.guestNo = await assignGuestNo();
    const kept = [...g.idPhotos, g.guestPhoto];
    await Promise.all(Object.entries(newPhotos).filter(([id]) => kept.includes(id)).map(([id, url]) => savePhoto(id, url)));
    await Promise.all([...(existing?.idPhotos ?? []), existing?.guestPhoto ?? ''].filter((id) => id && !kept.includes(id)).map(deletePhoto));
    await saveGuest(clean);
    if (existing?.status === 'in' && existing.roomNumber.toLowerCase() !== clean.roomNumber.toLowerCase()) {
      await updateRoom(existing.roomNumber, { housekeeping: 'dirty' }); // guest moved rooms; old room needs cleaning
    }
    onSaved(
      existing
        ? 'Guest details updated'
        : `${clean.fullName} checked in to room ${clean.roomNumber} — bill ${clean.guestNo} opened`,
    );
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

  // Issue date, expiry and place of issue, shown whenever a passport is the ID proof
  const passportDateFields = (
    <>
      <Field label="Passport issue date" required error={errors.passportIssueDate}>
        <input type="date" value={g.passportIssueDate} max={todayStr()} onChange={(e) => set('passportIssueDate', e.target.value)} />
      </Field>
      <Field label="Passport expiry date" required error={errors.passportExpiry}>
        <input type="date" value={g.passportExpiry} min={todayStr()} onChange={(e) => set('passportExpiry', e.target.value)} />
      </Field>
      <Field label="Place of issue" required error={errors.passportPlaceOfIssue}>
        <input value={g.passportPlaceOfIssue} placeholder="City / country" onChange={(e) => set('passportPlaceOfIssue', e.target.value)} />
      </Field>
    </>
  );

  let step = 0;
  const num = () => `${++step}. `;

  return (
    <form className="stack form" onSubmit={submit} noValidate>
      <h1>{existing ? 'Edit Guest' : returnedFrom ? 'Check In Again' : 'New Check-In'}</h1>
      <CountryList />

      {!existing && (
        returnedFrom ? (
          <div className="returning-banner">
            <span>
              Details filled from <strong>{returnedFrom.fullName}</strong>'s last stay ({returnedFrom.guestNo}, room {returnedFrom.roomNumber},{' '}
              {formatDate(returnedFrom.checkInDate)}). A new bill ID is given on check-in.
              {roomNote && <><br />{roomNote}</>}
            </span>
            <button
              type="button"
              className="link"
              onClick={() => {
                setG(blankGuest(settings));
                setReturnedFrom(undefined);
                setRoomNote('');
                setNewPhotos({});
                setErrors({});
                setSubmitted(false);
                if (location.hash !== '#/checkin') go('checkin');
              }}
            >
              Start blank
            </button>
          </div>
        ) : (
          <ReturningLookup guests={guests} onPick={fillFrom} />
        )
      )}

      <Section title={num() + 'Guest details'}>
        <Field label="Full name (as on ID)" required error={errors.fullName} wide>
          <input value={g.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus={!existing} autoComplete="off" />
        </Field>
        <Field label="Citizenship" required>
          <Segmented options={['Indian', 'Foreign'] as const} value={g.nationality} onChange={setNationality} />
        </Field>
        {!isIndian && (
          <Field label="Country of citizenship" required error={errors.country}>
            <input list={COUNTRY_LIST_ID} value={g.country} placeholder="Type to search…" autoComplete="off" onChange={(e) => set('country', e.target.value)} />
          </Field>
        )}
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
        <Field label="Guest photo" hint="Optional. Opens the webcam / front camera." wide>
          <GuestPhotoField
            id={g.guestPhoto}
            pending={newPhotos}
            onChange={(id, url) => {
              if (url) setNewPhotos((p) => ({ ...p, [id]: url }));
              set('guestPhoto', id);
            }}
          />
        </Field>
      </Section>

      {isIndian ? (
        <Section title={num() + 'ID proof'}>
          <Field label="ID type" required wide>
            <Segmented options={ID_TYPES} value={g.idType} onChange={(v: IdType) => set('idType', v)} />
          </Field>
          <Field label={`${g.idType} number`} required error={errors.idNumber} wide={!indianPassport}>
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
          {indianPassport && passportDateFields}
          {photoField}
        </Section>
      ) : (
        <Section title={num() + 'Passport & visa (Form C)'}>
          <Field label="Passport number" required error={errors.passportNumber}>
            <input value={g.passportNumber} onChange={(e) => set('passportNumber', e.target.value.toUpperCase())} autoComplete="off" />
          </Field>
          {passportDateFields}
          <div className="wide subhead">Visa</div>
          <Field label="Visa number" required error={errors.visaNumber}>
            <input value={g.visaNumber} onChange={(e) => set('visaNumber', e.target.value.toUpperCase())} autoComplete="off" />
          </Field>
          <Field label="Visa type" required error={errors.visaType}>
            <select value={g.visaType} onChange={(e) => set('visaType', e.target.value)}>
              <option value="">Select…</option>
              {VISA_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Visa issue date" required error={errors.visaIssueDate}>
            <input type="date" value={g.visaIssueDate} max={todayStr()} onChange={(e) => set('visaIssueDate', e.target.value)} />
          </Field>
          <Field label="Visa expiry date" required error={errors.visaExpiry}>
            <input type="date" value={g.visaExpiry} min={todayStr()} onChange={(e) => set('visaExpiry', e.target.value)} />
          </Field>
          <Field label="Visa place of issue" hint="Leave blank for e-Visa">
            <input value={g.visaPlaceOfIssue} onChange={(e) => set('visaPlaceOfIssue', e.target.value)} />
          </Field>
          <Field label="Date of arrival in India" required error={errors.arrivalInIndia}>
            <input type="date" value={g.arrivalInIndia} max={todayStr()} onChange={(e) => set('arrivalInIndia', e.target.value)} />
          </Field>
          {photoField}
        </Section>
      )}

      <Section title={num() + (isIndian ? 'Address' : 'Permanent address (home country)')}>
        <Field label="House / street / area" required error={errors.address} wide>
          <textarea rows={2} value={g.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <PlaceFields
          country={g.addressCountry}
          state={g.state}
          city={g.city}
          cityRequired
          errors={{ country: errors.addressCountry, city: errors.city }}
          onChange={(p) => update({ addressCountry: p.country, state: p.state, city: p.city })}
        />
        <Field label={g.addressCountry === 'India' ? 'Pincode' : 'Postal code'} error={errors.pincode}>
          <input
            inputMode={g.addressCountry === 'India' ? 'numeric' : 'text'}
            value={g.pincode}
            onChange={(e) => set('pincode', g.addressCountry === 'India' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
          />
        </Field>
      </Section>

      <Section title={num() + 'Stay'}>
        <Field
          label="Room number"
          required
          error={errors.roomNumber}
          hint={
            selectedRoom
              ? `${typeLabel(settings, selectedRoom.type)}${selectedRoom.housekeeping === 'dirty' ? ' · ⚠ not cleaned yet' : ''}`
              : `${freeRooms.length} room(s) free — type or pick`
          }
        >
          <input
            className="input-big"
            list="room-list"
            value={g.roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
            autoComplete="off"
          />
          <datalist id="room-list">
            {freeRooms.map((v) => (
              <option key={v.room.number} value={v.room.number}>
                {`${typeLabel(settings, v.room.type)} · ${ROOM_STATE_LABEL[v.state]}`}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Room type" hint={rateFor(settings, g.roomType) && `Standard price ${rupees(Number(rateFor(settings, g.roomType)))}/night`}>
          <select value={g.roomType} onChange={(e) => setRoomType(e.target.value)}>
            {!typeNames.includes(g.roomType) && <option>{g.roomType}</option>}
            {typeNames.map((t) => <option key={t} value={t}>{typeLabel(settings, t)}</option>)}
          </select>
        </Field>
        <Field label="Adults" required error={errors.adults}>
          <Stepper value={g.adults} min={1} onChange={setAdults} />
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
        <Field label="Check-out date" error={errors.checkOutDate} hint="Optional — leave blank if not decided">
          <input type="date" value={g.checkOutDate} min={g.checkInDate} onChange={(e) => set('checkOutDate', e.target.value)} />
        </Field>
        <Field label="Check-out time">
          <input type="time" value={g.checkOutTime} onChange={(e) => set('checkOutTime', e.target.value)} />
        </Field>
        <Field label={g.checkOutDate ? `Nights: ${nights}` : 'Nights: not decided'} wide>
          <div className="quick">
            {[1, 2, 3, 4, 5, 7].map((n) => (
              <button
                key={n}
                type="button"
                className={g.checkOutDate && nights === n ? 'active' : ''}
                onClick={() => set('checkOutDate', addDays(g.checkInDate, n))}
              >
                {n} night{n > 1 ? 's' : ''}
              </button>
            ))}
            <button type="button" className={g.checkOutDate ? '' : 'active'} onClick={() => set('checkOutDate', '')}>
              Not decided
            </button>
          </div>
        </Field>
      </Section>

      {g.companions.length > 0 && (
        <Section title={`${num()}Other adults (${g.companions.length})`}>
          <p className="wide muted small">
            Indian guests: only the name is required. Foreign guests: all details are required (Form C).
          </p>
          {g.companions.map((c, i) => (
            <CompanionCard key={i} index={i} c={c} errors={errors} onChange={(patch) => setCompanion(i, patch)} />
          ))}
        </Section>
      )}

      <Section title={num() + 'Travel'}>
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

      <Section title={num() + 'Payment'}>
        <Field label="Rate per night (₹)" hint="Filled from the room type — change it for a discount">
          <input inputMode="decimal" value={g.ratePerNight} onChange={(e) => set('ratePerNight', e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="GST" hint={existing ? 'Fixed for this stay' : 'Change the rate in Settings'}>
          <input value={`${g.gstRate}%`} disabled />
        </Field>
        <Field label="Who pays the bill?" wide>
          <Segmented
            options={['Guest', 'Company'] as const}
            value={g.billTo ? 'Company' : 'Guest'}
            onChange={(v) => update({ billTo: v === 'Company' ? (existing?.billTo ?? emptyBillTo()) : undefined })}
          />
        </Field>
        {g.billTo && <CompanyFields value={g.billTo} onChange={(billTo) => update({ billTo })} errors={errors} />}
        <Field label="Advance received" hint="Optional. Split across modes if paid partly in cash, partly UPI, etc." wide>
          <PaymentRows rows={advanceRows} onChange={setAdvanceRows} target={total || undefined} />
        </Field>
        {roomTotal > 0 && (
          <div className="summary wide">
            <span>
              {nights} night{nights !== 1 && 's'} × {rupees(Number(g.ratePerNight))} + GST {g.gstRate}% = <strong>{rupees(total)}</strong>
            </span>
            <span>Balance due: <strong>{rupees(total - advance)}</strong></span>
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

// "Stayed before?" box: type a mobile number, old bill ID or ID number to fill the whole form.
function ReturningLookup({ guests, onPick }: { guests: Guest[]; onPick: (g: Guest) => void }) {
  const [q, setQ] = useState('');
  const matches = findReturning(guests, q);
  // Typed someone who is in-house right now (by any of their stays)?
  const hitKeys = new Set(matches.length ? [] : guests.filter((g) => matchesReturning(g, q)).map(personKey));
  const here = guests.find((g) => g.status === 'in' && hitKeys.has(personKey(g)));
  return (
    <div className="returning no-print">
      <input
        className="search"
        type="search"
        placeholder="Stayed before? Mobile number, old bill ID (HSL…) or Aadhaar / passport no."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (matches[0]) onPick(matches[0]);
          }
        }}
        aria-label="Find returning guest"
      />
      {q.replace(/\s/g, '').length >= 4 && (
        matches.length ? (
          <ul className="returning-list">
            {matches.map((m) => (
              <li key={m.id}>
                <span className="grow">
                  <strong>{m.fullName}</strong>
                  <span className="muted"> · {m.phone} · last stay {formatDate(m.checkInDate)}, room {m.roomNumber} ({m.guestNo})</span>
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onPick(m)}>Fill details</button>
              </li>
            ))}
          </ul>
        ) : here ? (
          <p className="muted small">
            {here.fullName} is already checked in to room {here.roomNumber} (<a href={`#/guest/${here.id}`}>{here.guestNo}</a>).
          </p>
        ) : (
          <p className="muted small">No past guest found — fill the form below. (Full mobile number, bill ID or ID number needed.)</p>
        )
      )}
    </div>
  );
}

function CompanionCard({
  index, c, errors, onChange,
}: {
  index: number;
  c: Companion;
  errors: Errors;
  onChange: (patch: Partial<Companion>) => void;
}) {
  const err = (f: string) => errors[`c${index}.${f}`];
  const foreign = c.nationality === 'Foreign';
  const setNationality = (nationality: Nationality) =>
    onChange({
      nationality,
      country: nationality === 'Indian' ? 'India' : '',
      idType: nationality === 'Indian' ? 'Aadhaar' : 'Passport',
      idNumber: '',
    });

  return (
    <div className="companion-card wide">
      <div className="companion-title">Adult {index + 2}</div>
      <div className="grid">
        <Field label="Full name" required error={err('name')} wide>
          <input value={c.name} onChange={(e) => onChange({ name: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Citizenship" required>
          <Segmented options={['Indian', 'Foreign'] as const} value={c.nationality} onChange={setNationality} />
        </Field>
        {foreign && (
          <Field label="Country of citizenship" required error={err('country')}>
            <input list={COUNTRY_LIST_ID} value={c.country} placeholder="Type to search…" autoComplete="off" onChange={(e) => onChange({ country: e.target.value })} />
          </Field>
        )}
        <Field label="Gender" required={foreign} error={err('gender')}>
          <Segmented options={['Male', 'Female', 'Other'] as const} value={c.gender} onChange={(v) => onChange({ gender: v })} />
        </Field>
        <Field label="Age" required={foreign} error={err('age')}>
          <input inputMode="numeric" value={c.age} onChange={(e) => onChange({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
        </Field>
        {foreign ? (
          <>
            <Field label="Passport number" required error={err('idNumber')}>
              <input value={c.idNumber} onChange={(e) => onChange({ idNumber: e.target.value.toUpperCase() })} autoComplete="off" />
            </Field>
            <Field label="Passport expiry" required error={err('passportExpiry')}>
              <input type="date" value={c.passportExpiry} min={todayStr()} onChange={(e) => onChange({ passportExpiry: e.target.value })} />
            </Field>
            <Field label="Visa number" required error={err('visaNumber')}>
              <input value={c.visaNumber} onChange={(e) => onChange({ visaNumber: e.target.value.toUpperCase() })} autoComplete="off" />
            </Field>
            <Field label="Visa expiry" required error={err('visaExpiry')}>
              <input type="date" value={c.visaExpiry} min={todayStr()} onChange={(e) => onChange({ visaExpiry: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label="ID type">
              <select value={c.idType} onChange={(e) => onChange({ idType: e.target.value as IdType })}>
                {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="ID number">
              <input value={c.idNumber} onChange={(e) => onChange({ idNumber: e.target.value.toUpperCase() })} autoComplete="off" />
            </Field>
          </>
        )}
      </div>
    </div>
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
