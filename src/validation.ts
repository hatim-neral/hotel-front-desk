import type { Guest, Room } from './types';
import { todayStr } from './utils';

// Verhoeff checksum — the last digit of every real Aadhaar number is a Verhoeff check digit.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaar(value: string): boolean {
  const n = value.replace(/\s/g, '');
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  n.split('').reverse().forEach((ch, i) => {
    c = D[c][P[i % 8][Number(ch)]];
  });
  return c === 0;
}

export function idNumberError(idType: string, value: string): string | undefined {
  const v = value.replace(/\s/g, '').toUpperCase();
  if (!v) return 'Required';
  switch (idType) {
    case 'Aadhaar':
      if (!/^\d{12}$/.test(v)) return 'Aadhaar must be 12 digits';
      if (!isValidAadhaar(v)) return 'This Aadhaar number is not valid — please re-check';
      return;
    case 'Passport':
      return /^[A-Z0-9]{6,9}$/.test(v) ? undefined : 'Passport number looks wrong';
    case 'Voter ID':
      return /^[A-Z]{3}\d{7}$/.test(v) ? undefined : 'Voter ID format: ABC1234567';
    default:
      return v.length < 4 ? 'ID number looks too short' : undefined;
  }
}

// GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', check character
export function isValidGstin(value: string): boolean {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.trim().toUpperCase());
}

export function billToErrors(b: { company: string; gstin: string }): Errors {
  const e: Errors = {};
  if (!b.company.trim()) e['billTo.company'] = 'Enter the company name';
  if (!b.gstin.trim()) e['billTo.gstin'] = 'Enter the company GST number';
  else if (!isValidGstin(b.gstin)) e['billTo.gstin'] = 'GST number should be 15 characters, e.g. 27ABCDE1234F1Z5';
  return e;
}

export type Errors = Partial<Record<string, string>>;

export function validateGuest(g: Guest, occupiedRooms: Map<string, string>, rooms: Room[] = []): Errors {
  const e: Errors = {};
  const today = todayStr();
  const req = (field: keyof Guest, label = 'Required') => {
    if (!String(g[field] ?? '').trim()) e[field] = label;
  };
  const notExpired = (field: 'passportExpiry' | 'visaExpiry', what: string) => {
    if (!g[field]) e[field] = 'Required';
    else if (g[field] < today) e[field] = `This ${what} has expired`;
  };
  const passportDates = () => {
    if (!g.passportIssueDate) e.passportIssueDate = 'Required';
    else if (g.passportIssueDate > today) e.passportIssueDate = 'Issue date cannot be in the future';
    notExpired('passportExpiry', 'passport');
    req('passportPlaceOfIssue');
  };

  req('fullName');
  req('gender', 'Select gender');
  if (g.nationality === 'Indian') {
    if (!/^[6-9]\d{9}$/.test(g.phone)) e.phone = 'Enter a 10-digit mobile number';
    e.idNumber = idNumberError(g.idType, g.idNumber);
    if (g.idType === 'Passport') passportDates();
    if (g.addressCountry === 'India' && g.pincode && !/^\d{6}$/.test(g.pincode)) e.pincode = 'Pincode must be 6 digits';
  } else {
    if (!/^\+?\d{7,15}$/.test(g.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter phone with country code';
    req('country');
    if (g.country.trim().toLowerCase() === 'india') e.country = 'For Indian citizens choose "Indian" above';
    e.passportNumber = idNumberError('Passport', g.passportNumber);
    passportDates();
    req('visaNumber');
    req('visaType', 'Select visa type');
    if (!g.visaIssueDate) e.visaIssueDate = 'Required';
    else if (g.visaIssueDate > today) e.visaIssueDate = 'Issue date cannot be in the future';
    notExpired('visaExpiry', 'visa');
    req('arrivalInIndia');
  }
  if (g.email && !/^\S+@\S+\.\S+$/.test(g.email)) e.email = 'Email looks wrong';
  req('address');
  req('addressCountry');
  req('city');

  req('roomNumber');
  const occupant = occupiedRooms.get(g.roomNumber.trim().toLowerCase());
  if (occupant && g.status === 'in') e.roomNumber = `Room is occupied by ${occupant}`;
  if (rooms.length && g.status === 'in' && g.roomNumber.trim() && !e.roomNumber) {
    const room = rooms.find((r) => r.number.toLowerCase() === g.roomNumber.trim().toLowerCase());
    if (!room) e.roomNumber = `Room ${g.roomNumber.trim()} is not in your room list (add it in Settings)`;
    else if (room.housekeeping === 'out-of-order') e.roomNumber = 'This room is marked out of order';
  }
  if (g.adults < 1) e.adults = 'At least 1 adult';
  req('checkInDate');
  req('checkInTime');
  // Check-out date is optional at check-in; if given it must be after check-in
  if (g.checkOutDate && `${g.checkOutDate}T${g.checkOutTime || '23:59'}` <= `${g.checkInDate}T${g.checkInTime}`) {
    e.checkOutDate = 'Check-out must be after check-in';
  }

  if (g.billTo) Object.assign(e, billToErrors(g.billTo));

  // Other adults: Indian guests need only a name; foreign guests need everything (Form C)
  g.companions.forEach((c, i) => {
    const k = (f: string) => `c${i}.${f}`;
    if (!c.name.trim()) e[k('name')] = 'Name required';
    if (c.nationality === 'Indian') return;
    if (!c.gender) e[k('gender')] = 'Required';
    if (!c.age.trim()) e[k('age')] = 'Required';
    if (!c.country.trim()) e[k('country')] = 'Required';
    else if (c.country.trim().toLowerCase() === 'india') e[k('country')] = 'Choose "Indian" for Indian citizens';
    e[k('idNumber')] = idNumberError('Passport', c.idNumber);
    if (!c.passportExpiry) e[k('passportExpiry')] = 'Required';
    else if (c.passportExpiry < today) e[k('passportExpiry')] = 'Passport has expired';
    if (!c.visaNumber.trim()) e[k('visaNumber')] = 'Required';
    if (!c.visaExpiry) e[k('visaExpiry')] = 'Required';
    else if (c.visaExpiry < today) e[k('visaExpiry')] = 'Visa has expired';
  });

  Object.keys(e).forEach((k) => e[k] === undefined && delete e[k]);
  return e;
}
