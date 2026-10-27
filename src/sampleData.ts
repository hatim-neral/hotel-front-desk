// Demo guests for trying the app. All names, numbers and IDs are made up.
// Dates are relative to today so the dashboard always has something to show.
import type { Charge, Guest } from './types';
import { addDays, todayStr } from './utils';

export const SAMPLE_PREFIX = 'sample-';

export function isSample(g: Guest): boolean {
  return g.id.startsWith(SAMPLE_PREFIX);
}

function base(id: string): Guest {
  return {
    id: SAMPLE_PREFIX + id, status: 'in',
    fullName: '', phone: '', email: '', gender: '', dob: '',
    nationality: 'Indian', country: 'India',
    idType: 'Aadhaar', idNumber: '', idPhotos: [],
    passportNumber: '', passportExpiry: '', visaNumber: '', visaType: '', visaExpiry: '', arrivalInIndia: '',
    address: '', city: '', state: '', pincode: '',
    purpose: 'Tourism', arrivingFrom: '', goingTo: '', vehicleNumber: '',
    roomNumber: '', roomType: 'Standard', adults: 1, children: 0, companions: [],
    checkInDate: todayStr(), checkInTime: '12:00', checkOutDate: addDays(todayStr(), 1), checkOutTime: '11:00',
    ratePerNight: '', advancePaid: '', paymentMode: 'Cash', charges: [],
    remarks: '', createdAt: new Date().toISOString(),
  };
}

function bill(billNo: string, category: string, amount: number, daysAgo: number, description = ''): Charge {
  return { id: SAMPLE_PREFIX + billNo, billNo, category, description, amount: String(amount), date: addDays(todayStr(), -daysAgo) };
}

export function buildSampleGuests(): Guest[] {
  const t = todayStr();
  const day = (n: number) => addDays(t, n);
  return [
    {
      ...base('1'), fullName: 'Rahul Sharma', phone: '9000000101', email: 'rahul.sharma@example.com', gender: 'Male', dob: '1988-04-12',
      idNumber: '987654321012', address: '14 Shanti Nagar', city: 'Jaipur', state: 'Rajasthan', pincode: '302001',
      arrivingFrom: 'Jaipur', goingTo: 'Udaipur', vehicleNumber: 'RJ14 CD 4521',
      roomNumber: '101', roomType: 'Deluxe', adults: 2,
      companions: [{ name: 'Priya Sharma', gender: 'Female', age: '34', idType: 'Aadhaar', idNumber: '876543210988' }],
      checkInDate: day(-2), checkInTime: '13:20', checkOutDate: t, checkOutTime: '11:00',
      ratePerNight: '2500', advancePaid: '3000', paymentMode: 'UPI',
      charges: [bill('R-1045', 'Food', 640, 1, 'Dinner — 2 thali'), bill('L-221', 'Laundry', 180, 0)],
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    },
    {
      ...base('2'), fullName: 'Ananya Iyer', phone: '9000000102', email: 'ananya.iyer@example.com', gender: 'Female', dob: '1993-09-03',
      idType: 'Driving Licence', idNumber: 'TN0920190012345', address: '7 Lake View Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600017',
      purpose: 'Business', arrivingFrom: 'Chennai', goingTo: 'Chennai',
      roomNumber: '102', roomType: 'Standard',
      checkInDate: day(-1), checkInTime: '18:45', checkOutDate: day(2), checkOutTime: '11:00',
      ratePerNight: '1800', advancePaid: '1800', paymentMode: 'Cash',
      charges: [bill('R-1052', 'Room Service', 350, 0, 'Breakfast in room')],
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      ...base('3'), fullName: 'Mohammed Arif', phone: '9000000103', gender: 'Male', dob: '1981-01-25',
      idNumber: '765432109878', address: '22 Charminar Road', city: 'Hyderabad', state: 'Telangana', pincode: '500002',
      purpose: 'Family / Personal', arrivingFrom: 'Hyderabad', goingTo: 'Hyderabad',
      roomNumber: '201', roomType: 'Suite', adults: 2, children: 1,
      companions: [
        { name: 'Ayesha Arif', gender: 'Female', age: '38', idType: 'Aadhaar', idNumber: '654321098763' },
        { name: 'Zaid Arif', gender: 'Male', age: '9', idType: 'Other', idNumber: '' },
      ],
      checkInDate: t, checkInTime: '10:05', checkOutDate: day(3), checkOutTime: '11:00',
      ratePerNight: '4500', advancePaid: '10000', paymentMode: 'Card',
    },
    {
      ...base('4'), fullName: 'Emma Wilson', phone: '+447700900123', email: 'emma.wilson@example.com', gender: 'Female', dob: '1990-06-18',
      nationality: 'Foreign', country: 'United Kingdom', idType: 'Passport',
      passportNumber: '533419872', passportExpiry: '2031-03-09', visaNumber: 'ETV7781234', visaType: 'e-Tourist', visaExpiry: day(45),
      arrivalInIndia: day(-6), address: '18 Baker Street', city: 'London', state: '', pincode: 'NW1 6XE',
      arrivingFrom: 'Agra', goingTo: 'Varanasi',
      roomNumber: '202', roomType: 'Deluxe',
      checkInDate: day(-3), checkInTime: '15:30', checkOutDate: day(1), checkOutTime: '10:00',
      ratePerNight: '3200', advancePaid: '5000', paymentMode: 'Card',
      charges: [bill('R-1031', 'Food', 920, 2), bill('M-077', 'Minibar', 260, 1)],
      createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    },
    {
      ...base('5'), fullName: 'Suresh Patel', phone: '9000000105', gender: 'Male', dob: '1975-11-30',
      idType: 'Voter ID', idNumber: 'GJX1234567', address: '3 Station Road', city: 'Surat', state: 'Gujarat', pincode: '395003',
      purpose: 'Business', arrivingFrom: 'Surat', goingTo: 'Mumbai',
      roomNumber: '103', roomType: 'Standard',
      checkInDate: day(-1), checkInTime: '21:10', checkOutDate: t, checkOutTime: '09:00',
      ratePerNight: '1500', advancePaid: '', paymentMode: 'Cash',
      charges: [bill('R-1049', 'Food', 300, 1)],
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      ...base('6'), fullName: 'Arjun Mehta', phone: '9000000106', gender: 'Male', dob: '1997-02-14',
      idNumber: '543210987652', address: '9 Model Town', city: 'Delhi', state: 'Delhi', pincode: '110009',
      arrivingFrom: 'Delhi', goingTo: 'Rishikesh', vehicleNumber: 'DL3C AB 1234',
      roomNumber: '105', roomType: 'Standard',
      checkInDate: t, checkInTime: '11:40', checkOutDate: day(1), checkOutTime: '11:00',
      ratePerNight: '2200', advancePaid: '1000', paymentMode: 'Cash',
    },
    {
      ...base('7'), status: 'out', fullName: 'Kavita Reddy', phone: '9000000107', email: 'kavita.reddy@example.com', gender: 'Female', dob: '1985-08-22',
      idNumber: '432109876548', address: '41 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001',
      purpose: 'Pilgrimage', arrivingFrom: 'Bengaluru', goingTo: 'Bengaluru',
      roomNumber: '104', roomType: 'Deluxe',
      checkInDate: day(-3), checkInTime: '14:00', checkOutDate: day(-1), checkOutTime: '10:30',
      ratePerNight: '2000', advancePaid: '2000', paymentMode: 'UPI',
      charges: [bill('R-1022', 'Food', 450, 2)],
      createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      checkedOutAt: new Date(Date.now() - 86_400_000).toISOString(),
      invoiceNo: 'SAMPLE-0001',
      finalPayment: { amount: 2450, mode: 'UPI' },
    },
  ];
}
