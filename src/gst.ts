// GST invoice helpers. A hotel room is taxed where the hotel is (place of supply = location of the
// property), so the bill is always split into CGST + SGST (UTGST in a union territory without a
// legislature), even when the paying company is registered in another state.

// The first two digits of a GSTIN are the state code
const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

// Union territories without a legislature charge UTGST instead of SGST
const UTGST_CODES = new Set(['04', '26', '31', '35', '38']);

// SAC (services accounting code) for room accommodation
export const ROOM_SAC = '996311';

export function gstState(gstin: string): { code: string; name: string } | undefined {
  const code = gstin.slice(0, 2);
  return GST_STATES[code] ? { code, name: GST_STATES[code] } : undefined;
}

// Splits the GST on a bill into its two halves, named for the hotel's state
export function splitGst(gst: number, rate: number, hotelGstin: string) {
  const central = Math.round((gst / 2) * 100) / 100;
  return {
    half: rate / 2,
    central,
    state: Math.round((gst - central) * 100) / 100,
    stateLabel: UTGST_CODES.has(hotelGstin.slice(0, 2)) ? 'UTGST' : 'SGST',
  };
}
