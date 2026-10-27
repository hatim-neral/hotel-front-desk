// Countries, states and cities. The data is generated at build time by
// scripts/build-places.mjs and fetched one country at a time, so the app stays small.
import { useEffect, useState } from 'react';

type Regions = Record<string, string[]>; // state name -> city names

const base = import.meta.env.BASE_URL;
let countriesReq: Promise<[string, string][]> | undefined;
const regionReqs = new Map<string, Promise<Regions>>();

function loadCountries(): Promise<[string, string][]> {
  countriesReq ??= fetch(`${base}places/countries.json`)
    .then((r) => r.json())
    .catch(() => {
      countriesReq = undefined; // retry next time (e.g. was offline)
      return [];
    });
  return countriesReq;
}

async function loadRegions(countryName: string): Promise<Regions> {
  const iso = (await loadCountries()).find(([name]) => name.toLowerCase() === countryName.trim().toLowerCase())?.[1];
  if (!iso) return {};
  if (!regionReqs.has(iso)) {
    regionReqs.set(
      iso,
      fetch(`${base}places/${iso}.json`)
        .then((r) => r.json())
        .catch(() => {
          regionReqs.delete(iso);
          return {};
        }),
    );
  }
  return regionReqs.get(iso)!;
}

export function useCountries(): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    loadCountries().then((c) => setList(c.map(([name]) => name)));
  }, []);
  return list;
}

// States of the chosen country, and cities of the chosen state.
export function useRegions(country: string, state: string): { states: string[]; cities: string[] } {
  const [regions, setRegions] = useState<Regions>({});
  useEffect(() => {
    let current = true;
    loadRegions(country).then((r) => current && setRegions(r));
    return () => {
      current = false;
    };
  }, [country]);
  const stateKey = Object.keys(regions).find((s) => s.toLowerCase() === state.trim().toLowerCase());
  return { states: Object.keys(regions), cities: stateKey ? regions[stateKey] : [] };
}
