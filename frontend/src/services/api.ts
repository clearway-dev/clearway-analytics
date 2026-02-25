const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export type ExportMode = "single" | "range" | "all";
export type ExportFormat = "geojson" | "shapefile" | "csv";

export interface ExportPreview {
  segment_count: number;
  date_from: string | null;
  date_to: string | null;
  days_with_data: number;
}

export async function fetchExportPreview(
  mode: ExportMode,
  targetDate?: string,
  fromDate?: string,
  toDate?: string
): Promise<ExportPreview> {
  const params = new URLSearchParams({ mode });
  if (targetDate) params.set("target_date", targetDate);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  const response = await fetch(`${API_URL}/api/export/preview?${params}`);
  if (!response.ok) throw new Error("Failed to fetch export preview");
  return response.json();
}

export function downloadSegmentExport(
  format: ExportFormat,
  mode: ExportMode,
  targetDate?: string,
  fromDate?: string,
  toDate?: string
): void {
  const params = new URLSearchParams({ format, mode });
  if (targetDate) params.set("target_date", targetDate);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  const a = document.createElement("a");
  a.href = `${API_URL}/api/export/segments?${params}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function fetchAvailableDates(): Promise<string[]> {
  try {
    const response = await fetch(`${API_URL}/api/dashboard/available-dates`);
    if (!response.ok) {
      throw new Error(`Error fetching dates: ${response.statusText}`);
    }
    const data = await response.json();
    return data.dates;
  } catch (error) {
    console.error("Failed to fetch available dates:", error);
    return [];
  }
}
