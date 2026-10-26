export type Gender = 'Male' | 'Female' | 'Other';
export type Nationality = 'Indian' | 'Foreign';
export type IdType = 'Aadhaar' | 'Passport' | 'Driving Licence' | 'Voter ID' | 'PAN' | 'Other';
export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Company / OTA';

export const ID_TYPES: IdType[] = ['Aadhaar', 'Passport', 'Driving Licence', 'Voter ID', 'PAN', 'Other'];
export const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Company / OTA'];
export const PURPOSES = ['Tourism', 'Business', 'Family / Personal', 'Medical', 'Pilgrimage', 'Other'];
export const CHARGE_CATEGORIES = ['Food', 'Room Service', 'Laundry', 'Minibar', 'Extra Bed', 'Other'];

// An extra bill added to the guest's account during the stay (food, laundry, etc.)
export interface Charge {
  id: string;
  billNo: string;
  category: string;
  description: string;
  amount: string;
  date: string; // YYYY-MM-DD
}

export interface Companion {
  name: string;
  gender: Gender | '';
  age: string;
  idType: IdType;
  idNumber: string;
}

export interface Guest {
  id: string;
  status: 'in' | 'out';

  // Guest
  fullName: string;
  phone: string;
  email: string;
  gender: Gender | '';
  dob: string;
  nationality: Nationality;
  country: string;

  // Identity (Indian guests)
  idType: IdType;
  idNumber: string;
  idPhotos: string[]; // photo ids; the images live in storage.ts photo store

  // Foreign guests (needed for Form C)
  passportNumber: string;
  passportExpiry: string;
  visaNumber: string;
  visaType: string;
  visaExpiry: string;
  arrivalInIndia: string;

  // Address
  address: string;
  city: string;
  state: string;
  pincode: string;

  // Travel
  purpose: string;
  arrivingFrom: string;
  goingTo: string;
  vehicleNumber: string;

  // Stay
  roomNumber: string;
  roomType: string;
  adults: number;
  children: number;
  companions: Companion[];
  checkInDate: string; // YYYY-MM-DD
  checkInTime: string; // HH:MM
  checkOutDate: string;
  checkOutTime: string;

  // Payment
  ratePerNight: string;
  advancePaid: string;
  paymentMode: PaymentMode;
  charges: Charge[];

  remarks: string;
  createdAt: string; // ISO
  checkedOutAt?: string; // ISO, set on actual check-out
  invoiceNo?: string; // set on check-out
  finalPayment?: { amount: number; mode: PaymentMode }; // collected (+) or refunded (−) at check-out
}

export interface Settings {
  hotelName: string;
  hotelAddress: string;
  defaultCheckOutTime: string;
  roomTypes: string[];
  invoicePrefix: string;
  nextInvoiceNo: number;
}
