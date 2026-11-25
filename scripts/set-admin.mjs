// Sets the admin login that is built into the site: npm run set-admin
// Asks for the admin's name, username and password and writes src/admin-login.json with a salted
// PBKDF2 hash (never the password itself). Commit and push that file to put it live.
// Without a terminal it reads ADMIN_NAME, ADMIN_USERNAME and ADMIN_PASSWORD instead.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import readline from 'node:readline';

const ITERATIONS = 310000;
const OUT = new URL('../src/admin-login.json', import.meta.url);

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    rl._writeToOutput = (s) => {
      if (!hidden) rl.output.write(s);
    };
    rl.question('', (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const interactive = process.stdin.isTTY;
const name = (interactive ? await ask('Admin name (shown on bills and reports): ') : process.env.ADMIN_NAME ?? '').trim();
const username = (interactive ? await ask('Admin username: ') : process.env.ADMIN_USERNAME ?? '').trim().toLowerCase();
const password = interactive ? await ask('Admin password (hidden): ', true) : process.env.ADMIN_PASSWORD ?? '';
const again = interactive ? await ask('Password again (hidden): ', true) : password;

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (!name) fail('Enter the admin name.');
if (!/^[a-z0-9._-]{3,20}$/.test(username)) fail('Username: 3 to 20 letters or digits (a dot, dash or underscore is fine), no spaces.');
// The site's code is public, so the admin password has to be hard to guess
if (password.length < 8) fail('The admin password must be at least 8 characters.');
if (password !== again) fail('The two passwords do not match.');

const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), ITERATIONS, 32, 'sha256').toString('hex');
writeFileSync(OUT, JSON.stringify({ name, username, salt, hash, iterations: ITERATIONS }, null, 2) + '\n');
console.log(`Admin login saved for ${name} (username: ${username}). Commit and push src/admin-login.json to put it live.`);
