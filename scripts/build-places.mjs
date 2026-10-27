// Splits the country-state-city dataset into small files the app fetches on demand:
//   public/places/countries.json  -> [[name, isoCode], ...]
//   public/places/<ISO>.json      -> { "<state name>": ["<city>", ...], ... }
// Runs automatically before `npm run dev` and `npm run build`.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';

const src = 'node_modules/country-state-city/lib/assets';
const out = 'public/places';
if (existsSync(`${out}/countries.json`)) process.exit(0);
const load = (f) => JSON.parse(readFileSync(`${src}/${f}`, 'utf8'));

const countries = load('country.json');
const states = load('state.json');
const cities = load('city.json'); // [name, countryCode, stateCode, lat, lng]

mkdirSync(out, { recursive: true });

const byName = (a, b) => a.localeCompare(b);
writeFileSync(`${out}/countries.json`, JSON.stringify(countries.map((c) => [c.name, c.isoCode])));

const citiesByState = new Map();
for (const [name, country, state] of cities) {
  const key = `${country}/${state}`;
  if (!citiesByState.has(key)) citiesByState.set(key, []);
  citiesByState.get(key).push(name);
}

for (const c of countries) {
  const result = {};
  for (const s of states.filter((s) => s.countryCode === c.isoCode).sort((a, b) => byName(a.name, b.name))) {
    result[s.name] = [...new Set(citiesByState.get(`${c.isoCode}/${s.isoCode}`) ?? [])].sort(byName);
  }
  writeFileSync(`${out}/${c.isoCode}.json`, JSON.stringify(result));
}
console.log(`places: ${countries.length} countries, ${states.length} states, ${cities.length} cities`);
