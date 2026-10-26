import type { Guest } from './types';

export function go(path: string) {
  location.hash = '#/' + path;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return dateStr(new Date());
}

export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00');
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

export function nightsBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const ms = new Date(to + 'T00:00').getTime() - new Date(from + 'T00:00').getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function formatDate(date: string): string {
  if (!date) return '—';
  return new Date(date + 'T00:00').toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function maskId(id: string): string {
  const clean = id.replace(/\s/g, '');
  if (clean.length <= 4) return clean;
  return '•'.repeat(clean.length - 4) + clean.slice(-4);
}

export function formatAadhaar(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function isDueOutToday(g: Guest): boolean {
  return g.status === 'in' && g.checkOutDate <= todayStr();
}

export function guestIdLabel(g: Guest): string {
  return g.nationality === 'Foreign' ? `Passport ${g.passportNumber}` : `${g.idType} ${g.idNumber}`;
}

export function matchesSearch(g: Guest, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = s.replace(/\s/g, '');
  return (
    g.fullName.toLowerCase().includes(s) ||
    g.phone.includes(digits) ||
    g.roomNumber.toLowerCase() === s ||
    g.idNumber.replace(/\s/g, '').toLowerCase().includes(digits) ||
    g.passportNumber.toLowerCase().includes(s)
  );
}

export function toCsv(guests: Guest[]): string {
  const cols: (keyof Guest)[] = [
    'fullName', 'phone', 'email', 'gender', 'dob', 'nationality', 'country',
    'idType', 'idNumber', 'passportNumber', 'passportExpiry', 'visaNumber', 'visaType',
    'visaExpiry', 'arrivalInIndia', 'address', 'city', 'state', 'pincode', 'purpose',
    'arrivingFrom', 'goingTo', 'vehicleNumber', 'roomNumber', 'roomType', 'adults',
    'children', 'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime',
    'ratePerNight', 'advancePaid', 'paymentMode', 'status', 'checkedOutAt', 'invoiceNo', 'remarks',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = guests.map((g) => {
    const b = billFor(g);
    return [
      ...cols.map((c) => esc(g[c])),
      esc(g.companions.map((c) => `${c.name} (${c.idType} ${c.idNumber})`).join('; ')),
      esc(g.charges.map((c) => `#${c.billNo} ${c.category} ₹${c.amount}`).join('; ')),
      b.extras, b.total, b.balance,
    ].join(',');
  });
  return [[...cols, 'companions', 'bills', 'extrasTotal', 'grandTotal', 'balance'].join(','), ...rows].join('\n');
}

export function rupees(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// Running bill for a guest. While in-house, room nights are counted up to today (minimum 1).
export function billFor(g: Guest) {
  const nights = Math.max(1, nightsBetween(g.checkInDate, g.status === 'in' ? todayStr() : g.checkOutDate));
  const roomTotal = nights * (Number(g.ratePerNight) || 0);
  const extras = g.charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const total = roomTotal + extras;
  const advance = Number(g.advancePaid) || 0;
  const settled = g.finalPayment?.amount ?? 0;
  return { nights, roomTotal, extras, total, advance, settled, balance: total - advance - settled };
}

// Shrinks a camera photo to a readable JPEG (max 1600px) so it stays small in storage.
export function compressImage(file: File, maxSize = 1600, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image'));
    };
    img.src = url;
  });
}
