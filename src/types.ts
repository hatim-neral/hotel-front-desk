export type Gender = 'Male' | 'Female' | 'Other';
export type Nationality = 'Indian' | 'Foreign';
export type IdType = 'Aadhaar' | 'Passport' | 'Driving Licence' | 'Voter ID' | 'PAN' | 'Other';
export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Company / OTA';

export const VISA_TYPES = ['e-Tourist', 'Tourist', 'e-Business', 'Business', 'Employment', 'Student', 'Medical', 'Conference', 'Other'];
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

// Another adult in the room. For Indian guests only the name is required;
// for foreign guests everything is required (Form C).
export interface Companion {
  name: string;
  gender: Gender | '';
  age: string;
  nationality: Nationality;
  country: string;
  idType: IdType;
  idNumber: string;
  passportExpiry: string;
  visaNumber: string;
  visaExpiry: string;
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

  // Passport (Indian guests using a passport as ID, and all foreign guests)
  passportNumber: string; // foreign guests; Indian guests keep it in idNumber
  passportIssueDate: string;
  passportExpiry: string;
  passportPlaceOfIssue: string;

  // Visa (foreign guests, needed for Form C)
  visaNumber: string;
  visaType: string;
  visaIssueDate: string;
  visaPlaceOfIssue: string;
  visaExpiry: string;
  arrivalInIndia: string;

  // Address
  address: string;
  addressCountry: string;
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
  checkOutDate: string; // optional at check-in; set to the actual date on check-out
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
