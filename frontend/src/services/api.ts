import apiClient from "../lib/api";

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
  const res = await apiClient.get<ExportPreview>(`/api/export/preview?${params}`);
  return res.data;
}

export async function downloadSegmentExport(
  format: ExportFormat,
  mode: ExportMode,
  targetDate?: string,
  fromDate?: string,
  toDate?: string,
  customFilename?: string
): Promise<void> {
  const params = new URLSearchParams({ format, mode });
  if (targetDate) params.set("target_date", targetDate);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);

  const res = await apiClient.get(`/api/export/segments?${params}`, {
    responseType: "blob",
  });

  const ext = format === "shapefile" ? "zip" : format;
  // Prefer the caller-supplied name; fall back to Content-Disposition then a generic default
  const filename = customFilename
    ? `${customFilename}.${ext}`
    : res.headers["content-disposition"]?.match(/filename="?([^"]+)"?/)?.[1] ?? `clearway_export.${ext}`;

  const url = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchObstacles(targetDate: string): Promise<import("../components/ObstacleLayer").ObstacleFeature[]> {
  try {
    const res = await apiClient.get(`/api/analytics/obstacles?target_date=${targetDate}`);
    return res.data?.features ?? [];
  } catch {
    return [];
  }
}

export async function fetchAvailableDates(): Promise<string[]> {
  try {
    const res = await apiClient.get<{ dates: string[] }>("/api/dashboard/available-dates");
    return res.data.dates;
  } catch {
    return [];
  }
}

// Re-export base URL for components that still build URLs manually (e.g. fetch in MapPage)
export { API_URL };
