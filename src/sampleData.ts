// Demo guests for trying the app. All names, numbers and IDs are made up.
// Dates are relative to today so the dashboard always has something to show.
import type { Charge, Companion, Guest, IdType, Payment, PaymentMode } from './types';
import { addDays, billFor, todayStr } from './utils';

export const SAMPLE_PREFIX = 'sample-';

export function isSample(g: Guest): boolean {
  return g.id.startsWith(SAMPLE_PREFIX);
}

function base(id: string): Guest {
  return {
    id: SAMPLE_PREFIX + id, guestNo: '', status: 'in',
    fullName: '', phone: '', email: '', gender: '', dob: '',
    nationality: 'Indian', country: 'India',
    idType: 'Aadhaar', idNumber: '', idPhotos: [], guestPhoto: '',
    passportNumber: '', passportIssueDate: '', passportExpiry: '', passportPlaceOfIssue: '',
    visaNumber: '', visaType: '', visaIssueDate: '', visaPlaceOfIssue: '', visaExpiry: '', arrivalInIndia: '',
    address: '', addressCountry: 'India', city: '', state: '', pincode: '',
    purpose: 'Tourism', arrivingFrom: '', goingTo: '', vehicleNumber: '',
    roomNumber: '', roomType: 'Standard', adults: 1, children: 0, companions: [],
    checkInDate: todayStr(), checkInTime: '12:00', checkOutDate: addDays(todayStr(), 1), checkOutTime: '11:00',
    ratePerNight: '', gstRate: 5, payments: [], charges: [],
    remarks: '', createdAt: new Date().toISOString(),
  };
}

function indian(name: string, gender: Companion['gender'], age: string, idType: IdType, idNumber: string): Companion {
  return { name, gender, age, nationality: 'Indian', country: 'India', idType, idNumber, passportExpiry: '', visaNumber: '', visaExpiry: '' };
}

// Advance paid at check-in; the date is filled from the guest's check-in in buildSampleGuests
function advance(amount: string, mode: PaymentMode): Payment[] {
  return Number(amount) > 0 ? [{ id: '', amount: Number(amount), mode, kind: 'advance', date: '', time: '' }] : [];
}

function bill(billNo: string, category: string, amount: number, daysAgo: number, description = ''): Charge {
  return { id: SAMPLE_PREFIX + billNo, chargeNo: '', billNo, category, description, amount: String(amount), date: addDays(todayStr(), -daysAgo) };
}

const FIRST = ['Aarav', 'Vivaan', 'Diya', 'Ishaan', 'Meera', 'Kabir', 'Saanvi', 'Rohan', 'Aditi', 'Vikram', 'Neha', 'Siddharth',
  'Pooja', 'Karan', 'Riya', 'Aniket', 'Sneha', 'Manish', 'Tanvi', 'Harsh', 'Nisha', 'Varun', 'Kavya', 'Deepak', 'Isha',
  'Rajesh', 'Shreya', 'Amit', 'Lakshmi', 'Gaurav', 'Pallavi', 'Nikhil', 'Anjali'];
const LAST = ['Kapoor', 'Nair', 'Joshi', 'Gupta', 'Rao', 'Banerjee', 'Desai', 'Kulkarni', 'Singh', 'Verma', 'Pillai', 'Chopra', 'Bhat'];
const CITIES: [string, string][] = [['Pune', 'Maharashtra'], ['Mumbai', 'Maharashtra'], ['Nagpur', 'Maharashtra'], ['Ahmedabad', 'Gujarat'],
  ['Kolkata', 'West Bengal'], ['Kochi', 'Kerala'], ['Lucknow', 'Uttar Pradesh'], ['Indore', 'Madhya Pradesh'], ['Mysuru', 'Karnataka']];

// ~30 more guests spread across the hotel so the room board looks like a normal day.
function fillerGuests(taken: Set<string>): Guest[] {
  const t = todayStr();
  const rooms: string[] = [];
  for (let f = 1; f <= 7; f++) for (let n = 1; n <= 10; n++) rooms.push(String(f * 100 + n));
  const free = rooms.filter((r) => !taken.has(r));
  const out: Guest[] = [];
  free.forEach((room, i) => {
    if (i % 2 === 1 && i % 7 !== 0) return; // leave roughly half the rooms empty
    const n = Number(room) % 100;
    const type = n <= 6 ? 'Standard' : n <= 9 ? 'Deluxe' : 'Suite';
    const rate = type === 'Standard' ? '1800' : type === 'Deluxe' ? '2500' : '4500';
    const k = out.length;
    const [city, state] = CITIES[k % CITIES.length];
    const nights = (k % 4) + 1;
    const inDaysAgo = k % 3;
    const leftToday = k % 11 === 5; // a few guests already checked out today
    out.push({
      ...base(`f${room}`),
      status: leftToday ? 'out' : 'in',
      fullName: `${FIRST[k % FIRST.length]} ${LAST[(k * 7) % LAST.length]}`,
      phone: `90000${String(20000 + k).padStart(5, '0')}`,
      gender: k % 2 ? 'Female' : 'Male',
      idType: 'Driving Licence', idNumber: `MH12${2015 + (k % 9)}00${String(4000 + k * 37).padStart(5, '0')}`,
      address: `${10 + k} Main Road`, city, state, pincode: '',
      roomNumber: room, roomType: type, adults: 1 + (k % 2), ratePerNight: rate,
      payments: advance(k % 3 ? rate : '', k % 2 ? 'UPI' : 'Cash'),
      companions: k % 2 ? [indian(`${FIRST[(k + 5) % FIRST.length]} ${LAST[(k * 7) % LAST.length]}`, '', '', 'Aadhaar', '')] : [],
      checkInDate: addDays(t, -(leftToday ? Math.max(1, inDaysAgo) : inDaysAgo)), checkInTime: '13:00',
      checkOutDate: leftToday ? t : addDays(t, nights - inDaysAgo), checkOutTime: '11:00',
      ...(leftToday ? { checkedOutAt: new Date().toISOString() } : {}),
    });
  });
  return out;
}

export function buildSampleGuests(): Guest[] {
  const main = mainSampleGuests();
  return [...main, ...fillerGuests(new Set(main.map((g) => g.roomNumber)))].map((g) => {
    const payments = g.payments.map((p, i) => ({ ...p, id: `${g.id}-p${i}`, date: g.checkInDate, time: g.checkInTime }));
    // Guests who already left settled the rest of their bill at check-out, half cash, half UPI
    if (g.status === 'out') {
      const due = billFor({ ...g, payments }).balance;
      const half = Math.round(due / 2);
      payments.push(
        { id: `${g.id}-c1`, amount: half, mode: 'Cash', kind: 'checkout', date: g.checkOutDate, time: g.checkOutTime },
        { id: `${g.id}-c2`, amount: Math.round((due - half) * 100) / 100, mode: 'UPI', kind: 'checkout', date: g.checkOutDate, time: g.checkOutTime },
      );
    }
    return { ...g, payments };
  });
}

function mainSampleGuests(): Guest[] {
  const t = todayStr();
  const day = (n: number) => addDays(t, n);
  return [
    {
      ...base('1'), fullName: 'Rahul Sharma', phone: '9000000101', email: 'rahul.sharma@example.com', gender: 'Male', dob: '1988-04-12',
      idNumber: '987654321012', address: '14 Shanti Nagar', city: 'Jaipur', state: 'Rajasthan', pincode: '302001',
      arrivingFrom: 'Jaipur', goingTo: 'Udaipur', vehicleNumber: 'RJ14 CD 4521',
      roomNumber: '107', roomType: 'Deluxe', adults: 2,
      companions: [indian('Priya Sharma', 'Female', '34', 'Aadhaar', '876543210988')],
      checkInDate: day(-2), checkInTime: '13:20', checkOutDate: t, checkOutTime: '11:00',
      ratePerNight: '2500', payments: advance('3000', 'UPI'),
      charges: [bill('R-1045', 'Food', 640, 1, 'Dinner — 2 thali'), bill('L-221', 'Laundry', 180, 0)],
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    },
    {
      ...base('2'), fullName: 'Ananya Iyer', phone: '9000000102', email: 'ananya.iyer@example.com', gender: 'Female', dob: '1993-09-03',
      idType: 'Driving Licence', idNumber: 'TN0920190012345', address: '7 Lake View Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600017',
      purpose: 'Business', arrivingFrom: 'Chennai', goingTo: 'Chennai',
      roomNumber: '102', roomType: 'Standard',
      checkInDate: day(-1), checkInTime: '18:45', checkOutDate: day(2), checkOutTime: '11:00',
      ratePerNight: '1800', payments: advance('1800', 'Cash'),
      charges: [bill('R-1052', 'Room Service', 350, 0, 'Breakfast in room')],
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      ...base('3'), fullName: 'Mohammed Arif', phone: '9000000103', gender: 'Male', dob: '1981-01-25',
      idNumber: '765432109878', address: '22 Charminar Road', city: 'Hyderabad', state: 'Telangana', pincode: '500002',
      purpose: 'Family / Personal', arrivingFrom: 'Hyderabad', goingTo: 'Hyderabad',
      roomNumber: '210', roomType: 'Suite', adults: 2, children: 1,
      companions: [indian('Ayesha Arif', 'Female', '38', 'Aadhaar', '654321098763')],
      checkInDate: t, checkInTime: '10:05', checkOutDate: day(3), checkOutTime: '11:00',
      ratePerNight: '4500', payments: advance('10000', 'Card'),
    },
    {
      ...base('4'), fullName: 'Emma Wilson', phone: '+447700900123', email: 'emma.wilson@example.com', gender: 'Female', dob: '1990-06-18',
      nationality: 'Foreign', country: 'United Kingdom', idType: 'Passport',
      passportNumber: '533419872', passportIssueDate: '2021-03-10', passportExpiry: '2031-03-09', passportPlaceOfIssue: 'London',
      visaNumber: 'ETV7781234', visaType: 'e-Tourist', visaIssueDate: day(-20), visaExpiry: day(45),
      arrivalInIndia: day(-6), address: '18 Baker Street', addressCountry: 'United Kingdom', state: 'England', city: 'London', pincode: 'NW1 6XE',
      arrivingFrom: 'Agra', goingTo: 'Varanasi',
      roomNumber: '207', roomType: 'Deluxe', adults: 2,
      companions: [{
        name: 'James Wilson', gender: 'Male', age: '36', nationality: 'Foreign', country: 'United Kingdom',
        idType: 'Passport', idNumber: '548812093', passportExpiry: '2029-11-30', visaNumber: 'ETV7781235', visaExpiry: day(45),
      }],
      checkInDate: day(-3), checkInTime: '15:30', checkOutDate: day(1), checkOutTime: '10:00',
      ratePerNight: '3200', payments: advance('5000', 'Card'),
      charges: [bill('R-1031', 'Food', 920, 2), bill('M-077', 'Minibar', 260, 1)],
      createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    },
    {
      ...base('5'), fullName: 'Suresh Patel', phone: '9000000105', gender: 'Male', dob: '1975-11-30',
      idType: 'Voter ID', idNumber: 'GJX1234567', address: '3 Station Road', city: 'Surat', state: 'Gujarat', pincode: '395003',
      purpose: 'Business', arrivingFrom: 'Surat', goingTo: 'Mumbai',
      roomNumber: '103', roomType: 'Standard',
      checkInDate: day(-1), checkInTime: '21:10', checkOutDate: t, checkOutTime: '09:00',
      ratePerNight: '1500', payments: advance('', 'Cash'),
      charges: [bill('R-1049', 'Food', 300, 1)],
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      ...base('6'), fullName: 'Arjun Mehta', phone: '9000000106', gender: 'Male', dob: '1997-02-14',
      idType: 'Passport', idNumber: 'T4567891', passportIssueDate: '2019-07-15', passportExpiry: '2029-07-14', passportPlaceOfIssue: 'Delhi',
      address: '9 Model Town', city: 'Delhi', state: 'Delhi', pincode: '110009',
      arrivingFrom: 'Delhi', goingTo: 'Rishikesh', vehicleNumber: 'DL3C AB 1234',
      roomNumber: '305', roomType: 'Standard',
      checkInDate: t, checkInTime: '11:40', checkOutDate: '', checkOutTime: '11:00',
      ratePerNight: '2200', payments: advance('1000', 'Cash'),
    },
    {
      ...base('7'), status: 'out', fullName: 'Kavita Reddy', phone: '9000000107', email: 'kavita.reddy@example.com', gender: 'Female', dob: '1985-08-22',
      idNumber: '432109876548', address: '41 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001',
      purpose: 'Pilgrimage', arrivingFrom: 'Bengaluru', goingTo: 'Bengaluru',
      roomNumber: '308', roomType: 'Deluxe',
      checkInDate: day(-3), checkInTime: '14:00', checkOutDate: day(-1), checkOutTime: '10:30',
      ratePerNight: '2000', payments: advance('2000', 'UPI'),
      charges: [bill('R-1022', 'Food', 450, 2)],
      createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      checkedOutAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
  ];
}
