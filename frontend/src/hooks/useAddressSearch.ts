import { useState, useEffect, useRef } from "react";

export interface NominatimResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export function useAddressSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  // When true, the next query change skips the search (used after selection)
  const suppressRef = useRef(false);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    const timer = setTimeout(async () => {
      if (query.length < 3) { setResults([]); return; }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query, format: "json", limit: "6",
          addressdetails: "1", countrycodes: "cz",
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { "User-Agent": "ClearWayAnalytics/1.0 (thesis project)" } },
        );
        const data: { place_id: string; lat: string; lon: string; display_name: string }[] =
          await res.json();
        setResults(
          data.map((item) => ({
            id: item.place_id,
            name: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
          })),
        );
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Sets query and suppresses the next search trigger (call after user selects a result)
  function setQuerySelected(q: string) {
    suppressRef.current = true;
    setQuery(q);
  }

  return { query, setQuery, setQuerySelected, results, setResults, loading };
}
