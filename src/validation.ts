import type { Guest } from './types';

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
    case 'PAN':
      return /^[A-Z]{5}\d{4}[A-Z]$/.test(v) ? undefined : 'PAN format: ABCDE1234F';
    case 'Passport':
      return /^[A-Z0-9]{6,9}$/.test(v) ? undefined : 'Passport number looks wrong';
    case 'Voter ID':
      return /^[A-Z]{3}\d{7}$/.test(v) ? undefined : 'Voter ID format: ABC1234567';
    default:
      return v.length < 4 ? 'ID number looks too short' : undefined;
  }
}

export type Errors = Partial<Record<string, string>>;

export function validateGuest(g: Guest, occupiedRooms: Map<string, string>): Errors {
  const e: Errors = {};
  const req = (field: keyof Guest, label = 'Required') => {
    if (!String(g[field] ?? '').trim()) e[field] = label;
  };

  req('fullName');
  req('gender', 'Select gender');
  if (g.nationality === 'Indian') {
    if (!/^[6-9]\d{9}$/.test(g.phone)) e.phone = 'Enter a 10-digit mobile number';
    e.idNumber = idNumberError(g.idType, g.idNumber);
    if (g.pincode && !/^\d{6}$/.test(g.pincode)) e.pincode = 'Pincode must be 6 digits';
  } else {
    if (!/^\+?\d{7,15}$/.test(g.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter phone with country code';
    req('country');
    e.passportNumber = idNumberError('Passport', g.passportNumber);
    req('visaNumber');
    req('visaExpiry');
    req('arrivalInIndia');
  }
  if (g.email && !/^\S+@\S+\.\S+$/.test(g.email)) e.email = 'Email looks wrong';
  req('address');
  req('city');

  req('roomNumber');
  const occupant = occupiedRooms.get(g.roomNumber.trim().toLowerCase());
  if (occupant && g.status === 'in') e.roomNumber = `Room is occupied by ${occupant}`;
  if (g.adults < 1) e.adults = 'At least 1 adult';
  req('checkInDate');
  req('checkInTime');
  req('checkOutDate');
  req('checkOutTime');
  if (g.checkOutDate && g.checkInDate &&
      `${g.checkOutDate}T${g.checkOutTime}` <= `${g.checkInDate}T${g.checkInTime}`) {
    e.checkOutDate = 'Check-out must be after check-in';
  }

  g.companions.forEach((c, i) => {
    if (!c.name.trim()) e[`companion${i}`] = 'Companion name required';
  });

  Object.keys(e).forEach((k) => e[k] === undefined && delete e[k]);
  return e;
}
