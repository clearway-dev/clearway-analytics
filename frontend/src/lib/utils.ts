import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function roadName(name: string | null | undefined, fallback = "Neznámá ulice"): string {
  if (!name || name.trim().toLowerCase() === "nan") return fallback;
  return name;
}
