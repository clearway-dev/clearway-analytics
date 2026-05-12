export const STATION_TYPES: { value: string; label: string }[] = [
  { value: "fire_station", label: "Hasičská stanice" },
  { value: "police", label: "Policie" },
  { value: "hospital", label: "Nemocnice" },
  { value: "rescue", label: "Záchranná služba" },
  { value: "other", label: "Jiné" },
];

export interface FormState {
  name: string;
  type: string;
  address: string;
  lat: string;
  lon: string;
  notes: string;
}

export const EMPTY_FORM: FormState = {
  name: "",
  type: "",
  address: "",
  lat: "",
  lon: "",
  notes: "",
};

export function toFormState(s: {
  name: string;
  type: string | null;
  address: string | null;
  lat: number;
  lon: number;
  notes: string | null;
}): FormState {
  return {
    name: s.name,
    type: s.type ?? "",
    address: s.address ?? "",
    lat: String(s.lat),
    lon: String(s.lon),
    notes: s.notes ?? "",
  };
}
