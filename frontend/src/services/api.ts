const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
