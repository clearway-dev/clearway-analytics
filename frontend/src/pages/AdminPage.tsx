import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Activity, Map, Ruler, AlertTriangle, ArrowRight } from "lucide-react";
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
  total_measurements: number;
  total_length_km: number;
  measured_segments_count: number;
  coverage_percentage: number;
  critical_segments_count: number;
  anomalies: Anomaly[];
}

export default function AdminPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [vehicleWidth, setVehicleWidth] = useState<number>(250);
  const [appliedWidth, setAppliedWidth] = useState<number>(250);
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

      <div className="flex-1 p-6 pt-2 overflow-y-auto min-h-0">
        <div className="flex flex-col gap-4 h-full">

          {/* TOP ROW: left 1/3 (controls + KPIs) | right 2/3 (map) */}
          <div className="flex gap-4 flex-1 min-h-0">

            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-4 w-1/3 min-w-0">

              {/* CONTROLS */}
              <Card>
                <CardContent className="p-4 flex flex-col gap-4">
                  {/* Date selector */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Datum dat</span>
                    <select
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                    >
                      {availableDates.map((d) => (
                        <option key={d} value={d}>{formatDate(d)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Vehicle width slider */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Šířka vozidla</span>
                      <span className="text-sm font-semibold text-gray-800">{widthLabel}</span>
                    </div>
                    <input
                      type="range"
                      min="150"
                      max="500"
                      step="5"
                      value={vehicleWidth}
                      onChange={(e) => setVehicleWidth(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* KPI ROW 1 */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
                    <CardTitle className="text-xs font-medium text-gray-500">Délka sítě</CardTitle>
                    <Ruler className="h-4 w-4 text-gray-400 shrink-0" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-lg font-bold text-gray-900 leading-tight">
                      {loading ? "—" : `${stats?.total_length_km.toLocaleString()} km`}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
                    <CardTitle className="text-xs font-medium text-gray-500">Pokrytí sítě</CardTitle>
                    <Map className="h-4 w-4 text-gray-400 shrink-0" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-lg font-bold text-gray-900 leading-tight">
                        {loading ? "—" : `${stats?.coverage_percentage} %`}
                      </span>
                      {!loading && stats && (
                        <span className="text-xs text-gray-400">
                          {stats.measured_segments_count.toLocaleString()} / {stats.total_segments.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* KPI ROW 2 */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
                    <CardTitle className="text-xs font-medium text-gray-500">Kritické úseky</CardTitle>
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
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
                    <CardTitle className="text-xs font-medium text-gray-500">Měření celkem</CardTitle>
                    <Activity className="h-4 w-4 text-gray-400 shrink-0" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-lg font-bold text-gray-900 leading-tight">
                      {loading ? "—" : stats?.total_measurements.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* RIGHT COLUMN — CoverageMap */}
            <div className="flex-1 min-w-0 min-h-0">
              <Card className="h-full flex flex-col overflow-hidden">
                <CardHeader className="p-4 pb-2 flex-none">
                  <CardTitle className="text-sm">Pokrytí měřením</CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 relative">
                  <div className="absolute inset-0">
                    <CoverageMap />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ANOMALY TABLE */}
          <Card className="flex-none pb-4">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Nejužší úseky</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 text-center text-sm text-gray-400">Načítám…</div>
              ) : !stats || stats.anomalies.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">Žádná data pro vybraný den.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Název ulice</TableHead>
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
                            className="p-1 hover:bg-gray-100 rounded"
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
    </div>
  );
}
