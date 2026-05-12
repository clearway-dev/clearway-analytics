export const CATEGORIES: { value: string; label: string }[] = [
  { value: "fire_truck", label: "Hasičský vůz" },
  { value: "ambulance", label: "Sanitka" },
  { value: "police", label: "Policie" },
  { value: "rescue", label: "Záchranáři" },
  { value: "other", label: "Jiné" },
];

export interface FormState {
  name: string;
  category: string;
  width: string;
  height: string;
  weight: string;
  length: string;
  turning_diameter_track: string;
  turning_diameter_clearance: string;
  stabilization_width: string;
}

export const EMPTY_FORM: FormState = {
  name: "",
  category: "",
  width: "",
  height: "",
  weight: "",
  length: "",
  turning_diameter_track: "",
  turning_diameter_clearance: "",
  stabilization_width: "",
};

/** DB stores cm (integer) → form shows metres (e.g. 250 → "2.5"). */
function cmToMetresStr(cm: number | null): string {
  return cm != null ? String(cm / 100) : "";
}

export function toFormState(v: {
  name: string;
  category: string | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  length: number | null;
  turning_diameter_track: number | null;
  turning_diameter_clearance: number | null;
  stabilization_width: number | null;
}): FormState {
  return {
    name: v.name,
    category: v.category ?? "",
    width: cmToMetresStr(v.width),
    height: cmToMetresStr(v.height),
    weight: v.weight != null ? String(v.weight) : "",
    length: cmToMetresStr(v.length),
    turning_diameter_track: cmToMetresStr(v.turning_diameter_track),
    turning_diameter_clearance: cmToMetresStr(v.turning_diameter_clearance),
    stabilization_width: cmToMetresStr(v.stabilization_width),
  };
}

export function parseOptionalFloat(s: string): number | null {
  const v = parseFloat(s);
  return s.trim() === "" || isNaN(v) ? null : v;
}

/** Parse user-entered metres (e.g. "2.5") → integer centimetres (250). */
export function parseMetresToCm(s: string): number | null {
  const v = parseFloat(s);
  if (s.trim() === "" || isNaN(v)) return null;
  return Math.round(v * 100);
}
