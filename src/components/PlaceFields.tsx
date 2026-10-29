import { useId } from 'react';
import { useCountries, useRegions } from '../places';
import { Field } from './ui';

export const COUNTRY_LIST_ID = 'country-list';

// One shared <datalist> of all countries; render once per screen and point inputs at COUNTRY_LIST_ID.
export function CountryList() {
  const countries = useCountries();
  return (
    <datalist id={COUNTRY_LIST_ID}>
      {countries.map((c) => <option key={c} value={c} />)}
    </datalist>
  );
}

// Country -> State -> City. Each list is filtered by the field before it, but the city can also be
// typed first: picking "Pune, Maharashtra" (or typing a city name found in only one state) fills the state.
// Typing is allowed too, so a small town missing from the list can still be entered.
export default function PlaceFields({
  country, state, city, onChange, errors = {}, cityRequired,
}: {
  country: string;
  state: string;
  city: string;
  onChange: (place: { country: string; state: string; city: string }) => void;
  errors?: { country?: string; state?: string; city?: string };
  cityRequired?: boolean;
}) {
  const id = useId();
  const { states, cities, allCities } = useRegions(country, state);
  const cityFirst = !state.trim() && allCities.length > 0;

  const setCity = (value: string) => {
    if (!cityFirst) return onChange({ country, state, city: value });
    const typed = value.trim().toLowerCase();
    // "City, State" picked from the list
    const pair = allCities.find(([c, s]) => `${c}, ${s}`.toLowerCase() === typed);
    if (pair) return onChange({ country, state: pair[1], city: pair[0] });
    // A city name that exists in just one state
    const same = allCities.filter(([c]) => c.toLowerCase() === typed);
    if (same.length === 1) return onChange({ country, state: same[0][1], city: same[0][0] });
    onChange({ country, state, city: value });
  };

  return (
    <>
      <Field label="Country" required error={errors.country}>
        <input
          list={COUNTRY_LIST_ID}
          value={country}
          placeholder="Type to search…"
          autoComplete="off"
          onChange={(e) => onChange({ country: e.target.value, state: '', city: '' })}
        />
      </Field>
      <Field label="State" error={errors.state} hint={states.length ? `${states.length} states — type to search` : country ? undefined : 'Select country first'}>
        <input
          list={`${id}-states`}
          value={state}
          placeholder={country ? 'Type to search…' : 'Select country first'}
          autoComplete="off"
          onChange={(e) => onChange({ country, state: e.target.value, city: '' })}
        />
        <datalist id={`${id}-states`}>
          {states.map((s) => <option key={s} value={s} />)}
        </datalist>
      </Field>
      <Field
        label="City"
        required={cityRequired}
        error={errors.city}
        hint={
          cities.length
            ? `${cities.length} cities — type to search`
            : cityFirst
              ? 'Type the city — the state fills in by itself'
              : state ? 'Type the city name' : 'Select country first'
        }
      >
        <input
          list={`${id}-cities`}
          value={city}
          placeholder={state || cityFirst ? 'Type to search…' : 'Select country first'}
          autoComplete="off"
          onChange={(e) => setCity(e.target.value)}
        />
        <datalist id={`${id}-cities`}>
          {cityFirst
            ? allCities.map(([c, s]) => <option key={`${c}|${s}`} value={`${c}, ${s}`} />)
            : cities.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
    </>
  );
}
