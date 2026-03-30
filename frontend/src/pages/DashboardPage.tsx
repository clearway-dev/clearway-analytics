import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Activity, Map, Ruler, AlertTriangle, ArrowRight, Loader2, CalendarIcon } from "lucide-react";
import CoverageMap from "../components/CoverageMap";

interface Anomaly {
  id: string;
  name: string;
  min_width: number;
  avg_width: number;
  measurements_count: number;
  lat: number;
  lon: number;
  date: string;
}

interface DashboardStats {
  total_segments: number;
  total_length_km: number;
  // All-time
  total_measurements: number;
  measured_segments_count: number;
  coverage_percentage: number;
  // Date-specific
  measurements_on_date: number;
  measured_segments_on_date: number;
  coverage_on_date: number;
  // Date + width sensitive
  critical_segments_count: number;
  anomalies: Anomaly[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [vehicleWidth, setVehicleWidth] = useState<number>(250);
  const [appliedWidth, setAppliedWidth] = useState<number>(250);
  const [statsMode, setStatsMode] = useState<"alltime" | "date">("alltime");
  const navigate = useNavigate();

  useEffect(() => {
    apiClient.get("/api/dashboard/available-dates").then((res) => {
      const dates: string[] = res.data.dates ?? [];
      setAvailableDates(dates);
      if (dates.length > 0) setSelectedDate(dates[0]);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setAppliedWidth(vehicleWidth), 400);
    return () => clearTimeout(t);
  }, [vehicleWidth]);

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    const params = new URLSearchParams({
      target_date: selectedDate,
      vehicle_width_cm: String(appliedWidth),
    });
    apiClient
      .get(`/api/dashboard/stats?${params}`)
      .then((res) => setStats(res.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [selectedDate, appliedWidth]);

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const widthLabel = (vehicleWidth / 100).toFixed(2) + " m";

  return (
    <div className="h-full w-full overflow-hidden bg-gray-50/50 flex flex-col">
      <div className="flex-none p-6 pb-2">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Přehled</h2>
      </div>

      {/* MAIN: two columns filling remaining height */}
      <div className="flex flex-1 gap-4 px-6 pb-6 min-h-0">

        {/* LEFT COLUMN — controls + KPIs + anomaly table */}
        <div className="flex flex-col gap-4 w-1/3 min-w-0 overflow-y-auto">
          <div className="flex flex-col gap-4">

              {/* CONTROLS */}
              <Card>
                <CardContent className="p-4 flex flex-col gap-4">

                  {/* Date selector */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Datum dat
                    </label>
                    <div className="relative">
                      <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {availableDates.map((d) => (
                          <option key={d} value={d}>{formatDate(d)}</option>
                        ))}
                      </select>
                      <CalendarIcon className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Vehicle width slider */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Šířka vozidla
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <input
                          type="range"
                          min="150"
                          max="500"
                          step="5"
                          value={vehicleWidth}
                          onChange={(e) => setVehicleWidth(Number(e.target.value))}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                          <span>150 cm</span>
                          <span>500 cm</span>
                        </div>
                      </div>
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
                        <span className="w-10 px-2 py-1.5 text-sm text-right text-gray-700">
                          {vehicleWidth}
                        </span>
                        <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 py-1.5 select-none">
                          cm
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Mode toggle */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Měření a pokrytí
                    </label>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      <button
                        onClick={() => setStatsMode("alltime")}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                          statsMode === "alltime"
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        Celkem
                      </button>
                      <button
                        onClick={() => setStatsMode("date")}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                          statsMode === "date"
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        Tento den
                      </button>
                    </div>
                  </div>

                </CardContent>
              </Card>

              {/* KPI ROW 1 */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                    <CardTitle className="text-xs font-semibold text-gray-500">Délka sítě</CardTitle>
                    <Ruler className="h-4 w-4 text-gray-400 shrink-0" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-lg font-bold text-gray-900 leading-tight">
                      {loading ? "—" : `${stats?.total_length_km.toLocaleString()} km`}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                    <CardTitle className="text-xs font-semibold text-gray-500">Pokrytí sítě</CardTitle>
                    <Map className="h-4 w-4 text-gray-400 shrink-0" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-lg font-bold text-gray-900 leading-tight">
                        {loading ? "—" : `${statsMode === "alltime" ? stats?.coverage_percentage : stats?.coverage_on_date} %`}
                      </span>
                      {!loading && stats && (
                        <span className="text-xs text-gray-400">
                          {statsMode === "alltime"
                            ? `${stats.measured_segments_count.toLocaleString()} / ${stats.total_segments.toLocaleString()}`
                            : `${stats.measured_segments_on_date.toLocaleString()} / ${stats.total_segments.toLocaleString()}`}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* KPI ROW 2 */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                    <CardTitle className="text-xs font-semibold text-gray-500">Kritické úseky</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className={`text-lg font-bold leading-tight ${!loading && (stats?.critical_segments_count ?? 0) > 0 ? "text-red-500" : "text-gray-900"}`}>
                        {loading ? "—" : stats?.critical_segments_count.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400">pod {widthLabel}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                    <CardTitle className="text-xs font-semibold text-gray-500">Měření celkem</CardTitle>
                    <Activity className="h-4 w-4 text-gray-400 shrink-0" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-lg font-bold text-gray-900 leading-tight">
                      {loading ? "—" : (statsMode === "alltime" ? stats?.total_measurements : stats?.measurements_on_date)?.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>

            {/* ANOMALY TABLE */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold">Nejužší úseky</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500">
                    <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
                    Načítám…
                  </div>
                ) : !stats || stats.anomalies.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">Žádná data pro vybraný den.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Název ulice</TableHead>
                        <TableHead>Min. šířka</TableHead>
                        <TableHead>Prům. šířka</TableHead>
                        <TableHead className="text-right">Měření</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.anomalies.map((anomaly) => (
                        <TableRow key={anomaly.id}>
                          <TableCell className="font-medium">{anomaly.name}</TableCell>
                          <TableCell className={anomaly.min_width < appliedWidth ? "text-red-500 font-bold" : ""}>
                            {(anomaly.min_width / 100).toFixed(2)} m
                          </TableCell>
                          <TableCell>{(anomaly.avg_width / 100).toFixed(2)} m</TableCell>
                          <TableCell className="text-right">{anomaly.measurements_count}</TableCell>
                          <TableCell>
                            <button
                              onClick={() =>
                                navigate(`/?segmentId=${anomaly.id}&lat=${anomaly.lat}&lon=${anomaly.lon}&date=${anomaly.date}`)
                              }
                              className="p-1 hover:bg-gray-100 rounded-lg"
                            >
                              <ArrowRight className="h-4 w-4 text-gray-400" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* RIGHT COLUMN — CoverageMap, fills full height */}
        <div className="flex-1 min-w-0 min-h-0">
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="p-4 pb-2 flex-none">
              <CardTitle className="text-sm font-semibold">Pokrytí měřením</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative">
              <div className="absolute inset-0">
                <CoverageMap />
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
