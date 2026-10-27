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

// Country -> State -> City. Each list is filtered by the field before it.
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
  const { states, cities } = useRegions(country, state);

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
        hint={cities.length ? `${cities.length} cities — type to search` : state ? 'Type the city name' : 'Select state first'}
      >
        <input
          list={`${id}-cities`}
          value={city}
          placeholder={state ? 'Type to search…' : 'Select state first'}
          autoComplete="off"
          onChange={(e) => onChange({ country, state, city: e.target.value })}
        />
        <datalist id={`${id}-cities`}>
          {cities.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
    </>
  );
}
