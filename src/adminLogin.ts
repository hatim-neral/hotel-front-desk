// The admin login is built into the site (npm run set-admin writes src/admin-login.json), so it works on
// any device and nobody opening the site can create an admin account of their own.
// Only a salted PBKDF2 hash is stored. The site's code is public, so the admin password must be strong.
export interface BuiltInAdmin {
  name: string;
  username: string;
  salt: string; // hex
  hash: string; // hex, PBKDF2-SHA256 of the password
  iterations: number;
}

const found = import.meta.glob<BuiltInAdmin>('./admin-login.json', { eager: true, import: 'default' });
export const builtInAdmin: BuiltInAdmin | null = Object.values(found)[0] ?? null;

const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function checkBuiltInAdmin(admin: BuiltInAdmin, password: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(admin.salt), iterations: admin.iterations }, key, 256);
  return toHex(bits) === admin.hash;
}
