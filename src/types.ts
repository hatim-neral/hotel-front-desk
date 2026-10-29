export type Gender = 'Male' | 'Female' | 'Other';
export type Nationality = 'Indian' | 'Foreign';
export type IdType = 'Aadhaar' | 'Passport' | 'Driving Licence' | 'Voter ID' | 'Other';
export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Company / OTA';

export const VISA_TYPES = ['e-Tourist', 'Tourist', 'e-Business', 'Business', 'Employment', 'Student', 'Medical', 'Conference', 'Other'];
export const ID_TYPES: IdType[] = ['Aadhaar', 'Passport', 'Driving Licence', 'Voter ID', 'Other'];
export const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Company / OTA'];
export const PURPOSES = ['Tourism', 'Business', 'Family / Personal', 'Medical', 'Pilgrimage', 'Other'];
export const CHARGE_CATEGORIES = ['Food', 'Room Service', 'Laundry', 'Minibar', 'Extra Bed', 'Other'];

// One payment towards a stay's bill. A bill can be paid in several parts and modes.
// A negative amount is a refund to the guest.
export interface Payment {
  id: string;
  amount: number;
  mode: PaymentMode;
  kind: 'advance' | 'payment' | 'checkout'; // at check-in, during the stay, or at check-out
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

// The company paying for a stay; its GST number goes on the bill.
export interface BillTo {
  company: string;
  gstin: string;
  address: string;
  contactPerson: string;
  phone: string;
  email: string;
}

// An extra bill added to the stay's account (food, laundry, etc.)
export interface Charge {
  id: string;
  chargeNo: string; // child of the stay's bill ID, e.g. HSL000001-02
  billNo: string; // optional slip / KOT number from the restaurant or laundry
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
  guestNo: string; // bill ID for this stay, e.g. HSL000001; every check-in gets a new one, retired at check-out
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
  guestPhoto: string; // photo id of the guest's own photo, '' if none

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
  gstRate: number; // % added on room charges and extra bills; fixed for the stay at check-in
  payments: Payment[];
  billTo?: BillTo; // set when a company pays the bill
  charges: Charge[];

  remarks: string;
  createdAt: string; // ISO
  checkedOutAt?: string; // ISO, set on actual check-out
}

export type Housekeeping = 'clean' | 'dirty' | 'out-of-order';

export interface RoomType {
  name: string;
  rate: string; // default price per night, ₹
  ac: boolean;
}

export interface Room {
  number: string;
  type: string; // RoomType name
  housekeeping: Housekeeping;
}

export interface Settings {
  hotelName: string;
  hotelAddress: string;
  defaultCheckOutTime: string;
  roomTypes: RoomType[];
  nextGuestNo: number;
  gstRate: number; // %, applied to new check-ins
  gstin: string; // hotel's GST number, printed on bills
}
